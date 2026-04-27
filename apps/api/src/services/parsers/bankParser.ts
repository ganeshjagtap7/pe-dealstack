/**
 * bankParser.ts — Bank statement CSV parser.
 * Categorizes transactions as inflows (deposits) vs outflows (debits).
 * Aggregates by month. No AI needed for basic categorization.
 */

import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

interface ParseResult {
  periodsStored: number;
  statementIds: string[];
  warnings: string[];
  steps: Array<{ timestamp: string; node: string; message: string; detail?: string }>;
  monthlyData: MonthlyAggregate[];
}

interface MonthlyAggregate {
  period: string;       // "Jan-26"
  periodSort: string;   // "2026-01"
  totalInflows: number;
  totalOutflows: number;
  net: number;
  endingBalance: number | null;
  expenseBreakdown: Record<string, number>;
  transactionCount: number;
}

function step(message: string, detail?: string) {
  return { timestamp: new Date().toISOString(), node: 'bank_parser', message, detail };
}

/**
 * Detect if a CSV is a bank statement by checking headers.
 */
export function isBankCSV(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const hasDate = normalized.some(h => h.includes('date'));
  const hasAmount = normalized.some(h =>
    h.includes('amount') || h.includes('debit') || h.includes('credit')
  );
  const hasDesc = normalized.some(h =>
    h.includes('description') || h.includes('memo') || h.includes('details')
  );
  // Reject Stripe and PayPal-specific column signatures
  const isNotStripe = !normalized.includes('customer email') && !normalized.includes('customer id');
  const isNotPayPal = !(normalized.includes('gross') && normalized.includes('fee'));
  return hasDate && hasAmount && hasDesc && isNotStripe && isNotPayPal;
}

// Known expense category patterns
const EXPENSE_CATEGORIES: Record<string, RegExp> = {
  payroll:   /payroll|salary|wages|adp|gusto|paychex/i,
  rent:      /rent|lease|landlord|property/i,
  utilities: /electric|gas|water|utility|power|internet|comcast|att/i,
  insurance: /insurance|geico|allstate|policy/i,
  software:  /saas|software|aws|google cloud|azure|heroku|vercel|stripe fee/i,
  marketing: /advertising|google ads|facebook ads|marketing|hubspot/i,
  supplies:  /office|supplies|amazon|staples/i,
  travel:    /airline|hotel|uber|lyft|travel/i,
};

function categorize(description: string): string {
  for (const [category, pattern] of Object.entries(EXPENSE_CATEGORIES)) {
    if (pattern.test(description)) return category;
  }
  return 'other';
}

/**
 * Parse a CSV string into rows. Handles quoted fields with commas.
 */
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }

  return rows;
}

/**
 * Parse a numeric string — strips currency symbols, commas, parentheses for negatives.
 * e.g. "$1,234.56" → 1234.56, "(500.00)" → -500
 */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  const str = raw.trim();
  const isNegative = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned) || 0;
  return isNegative ? -Math.abs(value) : value;
}

/**
 * Parse bank statement CSV buffer into monthly aggregates and store as FinancialStatements.
 */
export async function parseBankCSV(
  fileBuffer: Buffer,
  fileName: string,
  dealId: string,
  documentId: string,
): Promise<ParseResult> {
  const steps_log: ParseResult['steps'] = [];
  const warnings: string[] = [];

  // 1. Parse CSV
  const text = fileBuffer.toString('utf-8');
  const rows = parseCSVRows(text);

  if (rows.length < 2) {
    return {
      periodsStored: 0,
      statementIds: [],
      warnings: ['CSV file is empty or has no data rows'],
      steps: [step('CSV is empty')],
      monthlyData: [],
    };
  }

  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[()]/g, ''));
  steps_log.push(step(`Parsed CSV: ${rows.length - 1} rows, ${headers.length} columns`));

  // 2. Detect column layout
  const colDate = headers.findIndex(h => h.includes('date'));
  const colDesc = headers.findIndex(h =>
    h.includes('description') || h.includes('memo') || h.includes('details')
  );
  const colAmount   = headers.findIndex(h => h === 'amount');
  const colDebit    = headers.findIndex(h => h === 'debit' || h === 'debit amount');
  const colCredit   = headers.findIndex(h => h === 'credit' || h === 'credit amount');
  const colBalance  = headers.findIndex(h => h.includes('balance'));

  if (colDate === -1) {
    return {
      periodsStored: 0,
      statementIds: [],
      warnings: ['Could not find Date column in CSV'],
      steps: [step('Missing required Date column')],
      monthlyData: [],
    };
  }

  const useSplitColumns = colDebit !== -1 || colCredit !== -1;
  if (!useSplitColumns && colAmount === -1) {
    return {
      periodsStored: 0,
      statementIds: [],
      warnings: ['Could not find Amount or Debit/Credit columns in CSV'],
      steps: [step('Missing required amount columns')],
      monthlyData: [],
    };
  }

  const layout = useSplitColumns ? 'debit/credit columns' : 'single amount column';
  steps_log.push(step(`Detected bank CSV format: ${layout}`, `date=${colDate}, desc=${colDesc}, debit=${colDebit}, credit=${colCredit}, amount=${colAmount}, balance=${colBalance}`));

  // 3. Parse rows
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  interface MonthAccumulator {
    inflows: number;
    outflows: number;
    expenseBreakdown: Record<string, number>;
    count: number;
    lastBalance: number | null;
  }

  const monthMap = new Map<string, MonthAccumulator>();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) { skipped++; continue; }

    const dateStr = colDate >= 0 ? (row[colDate] || '') : '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) { skipped++; continue; }

    const description = colDesc >= 0 ? (row[colDesc] || '') : '';
    const balance = colBalance >= 0 ? parseAmount(row[colBalance] || '') : null;

    let inflow = 0;
    let outflow = 0;

    if (useSplitColumns) {
      // Separate Debit / Credit columns
      const debitRaw  = colDebit  >= 0 ? (row[colDebit]  || '') : '';
      const creditRaw = colCredit >= 0 ? (row[colCredit] || '') : '';
      const debitVal  = parseAmount(debitRaw);
      const creditVal = parseAmount(creditRaw);
      // Debit = money leaving account (outflow), Credit = money arriving (inflow)
      if (creditVal > 0) inflow  = creditVal;
      if (debitVal  > 0) outflow = debitVal;
    } else {
      // Single Amount column: positive = deposit/inflow, negative = debit/outflow
      const amount = parseAmount(row[colAmount] || '');
      if (amount > 0) {
        inflow = amount;
      } else if (amount < 0) {
        outflow = Math.abs(amount);
      }
    }

    const year  = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    const key   = `${monthNames[month]}-${String(year).slice(2)}`;

    if (!monthMap.has(key)) {
      monthMap.set(key, { inflows: 0, outflows: 0, expenseBreakdown: {}, count: 0, lastBalance: null });
    }
    const m = monthMap.get(key)!;
    m.inflows  += inflow;
    m.outflows += outflow;
    m.count++;
    if (balance !== null) m.lastBalance = balance;

    // Categorize outflows (expenses)
    if (outflow > 0) {
      const category = categorize(description);
      m.expenseBreakdown[category] = (m.expenseBreakdown[category] || 0) + outflow;
    }
  }

  steps_log.push(step(`Parsed transactions from ${monthMap.size} months, skipped ${skipped} invalid rows`));

  // 4. Build sorted monthly aggregates
  const monthlyData: MonthlyAggregate[] = [];

  for (const [period, data] of monthMap) {
    const parts     = period.split('-');
    const monthName = parts[0];
    const yearShort = parts[1];
    const monthIdx  = monthNames.indexOf(monthName);
    const sortKey   = `20${yearShort}-${String(monthIdx + 1).padStart(2, '0')}`;

    const inflows  = Math.round(data.inflows  * 100) / 100;
    const outflows = Math.round(data.outflows * 100) / 100;

    // Round expense breakdown values
    const breakdown: Record<string, number> = {};
    for (const [cat, val] of Object.entries(data.expenseBreakdown)) {
      breakdown[cat] = Math.round(val * 100) / 100;
    }

    monthlyData.push({
      period,
      periodSort: sortKey,
      totalInflows: inflows,
      totalOutflows: outflows,
      net: Math.round((inflows - outflows) * 100) / 100,
      endingBalance: data.lastBalance !== null ? Math.round(data.lastBalance * 100) / 100 : null,
      expenseBreakdown: breakdown,
      transactionCount: data.count,
    });
  }

  monthlyData.sort((a, b) => a.periodSort.localeCompare(b.periodSort));
  steps_log.push(step(`Aggregated into ${monthlyData.length} monthly periods`));

  // 5. Store as FinancialStatement rows
  const statementIds: string[] = [];
  const now = new Date().toISOString();

  for (const m of monthlyData) {
    const lineItems: Record<string, number | null> = {
      revenue:       m.totalInflows,
      total_opex:    m.totalOutflows,
      net_income:    m.net,
      ending_balance: m.endingBalance,
      transaction_count: m.transactionCount,
      // Spread expense category breakdown
      ...Object.fromEntries(
        Object.entries(m.expenseBreakdown).map(([k, v]) => [k, v])
      ),
    };

    const { data, error } = await supabase
      .from('FinancialStatement')
      .upsert({
        dealId,
        documentId,
        statementType: 'INCOME_STATEMENT',
        period: m.period,
        periodType: 'HISTORICAL',
        lineItems,
        unitScale: 'ACTUALS',
        extractionConfidence: 100,
        extractionSource: 'manual',  // DB CHECK constraint: gpt4o/azure/vision/manual
        extractedAt: now,
        isActive: true,
        mergeStatus: 'auto',
      }, { onConflict: 'dealId,statementType,period,documentId' })
      .select('id')
      .single();

    if (error) {
      log.error('Bank parser: failed to upsert period', { dealId, period: m.period, error });
      warnings.push(`Failed to store ${m.period}: ${error.message}`);
    } else if (data?.id) {
      statementIds.push(data.id);
    }
  }

  steps_log.push(step(`Stored ${statementIds.length} periods to database`));

  // 6. Add missing data warning
  warnings.push(
    'This is bank transaction data. Missing: detailed P&L, Balance Sheet, Cash Flow. ' +
    'Deposits are treated as revenue; debits as operating expenses. Upload a formal financial statement for full analysis.'
  );

  return {
    periodsStored: statementIds.length,
    statementIds,
    warnings,
    steps: steps_log,
    monthlyData,
  };
}
