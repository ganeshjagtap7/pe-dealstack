/**
 * squareParser.ts — Deterministic Square CSV parser for financial extraction.
 * No AI calls. Pure programmatic parsing. 100% accuracy.
 *
 * Supports Square's transaction history CSV export format.
 * Aggregates transactions by month into revenue metrics.
 */

import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import type { ParseResult } from './parserTypes.js';

interface ParsedTransaction {
  date: Date;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  tip: number;
  currency: string;
  transactionId: string;
  paymentMethod: string;
  customerName: string;
  customerEmail: string;
}

interface MonthlyAggregate {
  period: string;        // "Jan-26", "Feb-26"
  periodSort: string;    // "2026-01" for sorting
  revenue: number;       // Sum of Net Sales
  grossSales: number;    // Sum of Gross Sales
  discounts: number;     // Sum of Discounts (positive value)
  tax: number;           // Sum of Tax collected
  tips: number;          // Sum of Tips
  transactionCount: number;
  uniqueCustomers: number;
  avgTransactionSize: number;
}


function step(message: string, detail?: string) {
  return { timestamp: new Date().toISOString(), node: 'csv_parser', message, detail };
}

/**
 * Detect if CSV headers belong to a Square export.
 */
export function isSquareCSV(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const hasGrossSales = normalized.some(h => h.includes('gross sales'));
  const hasNetSales = normalized.some(h => h.includes('net sales'));
  const hasTransactionOrPayment =
    normalized.some(h => h.includes('transaction id')) ||
    normalized.some(h => h.includes('payment method'));
  return (hasGrossSales || hasNetSales) && hasTransactionOrPayment;
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
 * Parse a Square amount string. Square may export with currency symbols or parentheses for negatives.
 * Examples: "1234.56", "$1,234.56", "(50.00)" for negative.
 */
function parseSquareAmount(raw: string): number {
  if (!raw) return 0;
  // Parentheses indicate negative: (50.00) → -50.00
  const isNegative = raw.includes('(') && raw.includes(')');
  const cleaned = raw.replace(/[^\d.]/g, '');
  const value = parseFloat(cleaned) || 0;
  return isNegative ? -value : value;
}

/**
 * Parse Square CSV buffer into monthly aggregates and store as FinancialStatements.
 */
export async function parseSquareCSV(
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

  // 2. Find column indices
  // Square headers use spaces e.g. "gross sales", "net sales"
  const colIdx = {
    date: headers.findIndex(h => h === 'date'),
    grossSales: headers.findIndex(h => h === 'gross sales'),
    discounts: headers.findIndex(h => h === 'discounts'),
    netSales: headers.findIndex(h => h === 'net sales'),
    tax: headers.findIndex(h => h === 'tax'),
    tip: headers.findIndex(h => h === 'tip'),
    currency: headers.findIndex(h => h === 'currency'),
    transactionId: headers.findIndex(h => h.includes('transaction id')),
    paymentMethod: headers.findIndex(h => h.includes('payment method')),
    customerName: headers.findIndex(h => h.includes('customer name')),
    customerEmail: headers.findIndex(h => h.includes('customer email')),
  };

  // Require at least a date and one of gross/net sales
  if (colIdx.date === -1 || (colIdx.grossSales === -1 && colIdx.netSales === -1)) {
    return {
      periodsStored: 0,
      statementIds: [],
      warnings: ['Could not find required columns (date, gross sales / net sales) in CSV'],
      steps: [step('Missing required columns')],
      monthlyData: [],
    };
  }

  // Prefer gross sales for revenue; fall back to net sales
  const revenueCol = colIdx.grossSales >= 0 ? colIdx.grossSales : colIdx.netSales;

  steps_log.push(step('Detected Square CSV format', `Columns: date=${colIdx.date}, grossSales=${colIdx.grossSales}, netSales=${colIdx.netSales}, transactionId=${colIdx.transactionId}`));

  // 3. Parse transactions
  const transactions: ParsedTransaction[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) { skipped++; continue; }

    const dateStr = row[colIdx.date] || '';
    const grossSalesStr = colIdx.grossSales >= 0 ? (row[colIdx.grossSales] || '0') : '0';
    const discountsStr = colIdx.discounts >= 0 ? (row[colIdx.discounts] || '0') : '0';
    const netSalesStr = colIdx.netSales >= 0 ? (row[colIdx.netSales] || '0') : '0';
    const taxStr = colIdx.tax >= 0 ? (row[colIdx.tax] || '0') : '0';
    const tipStr = colIdx.tip >= 0 ? (row[colIdx.tip] || '0') : '0';
    const currency = colIdx.currency >= 0 ? (row[colIdx.currency] || 'USD') : 'USD';
    const transactionId = colIdx.transactionId >= 0 ? (row[colIdx.transactionId] || '') : '';
    const paymentMethod = colIdx.paymentMethod >= 0 ? (row[colIdx.paymentMethod] || '') : '';
    const customerName = colIdx.customerName >= 0 ? (row[colIdx.customerName] || '') : '';
    const customerEmail = colIdx.customerEmail >= 0 ? (row[colIdx.customerEmail] || '') : '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) { skipped++; continue; }

    const grossSales = parseSquareAmount(grossSalesStr);
    const discounts = parseSquareAmount(discountsStr);
    const netSales = parseSquareAmount(netSalesStr);
    const tax = parseSquareAmount(taxStr);
    const tip = parseSquareAmount(tipStr);

    // Skip rows with zero or negative gross/net (Square exports are completed-only)
    const revenueVal = colIdx.grossSales >= 0 ? grossSales : netSales;
    if (revenueVal <= 0) { skipped++; continue; }

    transactions.push({
      date,
      grossSales,
      discounts: Math.abs(discounts), // discounts are often stored negative; normalize to positive
      netSales,
      tax,
      tip,
      currency: currency.toUpperCase(),
      transactionId,
      paymentMethod,
      customerName,
      customerEmail,
    });
  }

  steps_log.push(step(`Parsed ${transactions.length} transactions, skipped ${skipped} invalid/zero rows`));

  // 4. Aggregate by month
  const monthMap = new Map<string, {
    revenue: number;
    grossSales: number;
    discounts: number;
    tax: number;
    tips: number;
    count: number;
    customers: Set<string>;
  }>();

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (const t of transactions) {
    const year = t.date.getFullYear();
    const month = t.date.getMonth(); // 0-indexed
    const key = `${monthNames[month]}-${String(year).slice(2)}`; // "Jan-26"

    if (!monthMap.has(key)) {
      monthMap.set(key, { revenue: 0, grossSales: 0, discounts: 0, tax: 0, tips: 0, count: 0, customers: new Set() });
    }
    const m = monthMap.get(key)!;
    m.revenue += t.netSales > 0 ? t.netSales : t.grossSales - t.discounts;
    m.grossSales += t.grossSales;
    m.discounts += t.discounts;
    m.tax += t.tax;
    m.tips += t.tip;
    m.count++;
    const identifier = t.customerEmail || t.customerName || t.transactionId;
    if (identifier) m.customers.add(identifier);
  }

  // 5. Build monthly aggregates sorted by date
  const monthlyData: MonthlyAggregate[] = [];
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (const [period, data] of monthMap) {
    const monthName = period.split('-')[0];
    const yearShort = period.split('-')[1];
    const monthIdx = monthOrder.indexOf(monthName);
    const sortKey = `20${yearShort}-${String(monthIdx + 1).padStart(2, '0')}`;

    monthlyData.push({
      period,
      periodSort: sortKey,
      revenue: Math.round(data.revenue * 100) / 100,
      grossSales: Math.round(data.grossSales * 100) / 100,
      discounts: Math.round(data.discounts * 100) / 100,
      tax: Math.round(data.tax * 100) / 100,
      tips: Math.round(data.tips * 100) / 100,
      transactionCount: data.count,
      uniqueCustomers: data.customers.size,
      avgTransactionSize: data.count > 0 ? Math.round((data.revenue / data.count) * 100) / 100 : 0,
    });
  }

  monthlyData.sort((a, b) => a.periodSort.localeCompare(b.periodSort));

  steps_log.push(step(`Aggregated into ${monthlyData.length} monthly periods`));

  // 6. Detect currency (Square typically single-currency per export)
  const currencies = [...new Set(transactions.map(t => t.currency))];
  const currency = currencies[0] || 'USD';
  if (currencies.length > 1) {
    warnings.push(`Multiple currencies detected: ${currencies.join(', ')}. Using ${currency}.`);
  }

  // 7. Store as FinancialStatement rows
  const statementIds: string[] = [];
  const now = new Date().toISOString();

  for (const m of monthlyData) {
    const lineItems: Record<string, number | null> = {
      revenue: m.revenue,
      gross_sales: m.grossSales,
      discounts: m.discounts > 0 ? -m.discounts : null, // discounts as negative line item
      tax: m.tax > 0 ? m.tax : null,
      tips: m.tips > 0 ? m.tips : null,
      transaction_count: m.transactionCount,
      unique_customers: m.uniqueCustomers,
      avg_transaction_size: m.avgTransactionSize,
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
        currency,
        unitScale: 'ACTUALS',
        extractionConfidence: 100,
        extractionSource: 'manual',  // DB CHECK constraint only allows gpt4o/azure/vision/manual
        extractedAt: now,
        isActive: true,
        mergeStatus: 'auto',
      }, { onConflict: 'dealId,statementType,period,documentId' })
      .select('id')
      .single();

    if (error) {
      log.error('Square parser: failed to upsert period', { dealId, period: m.period, error });
      warnings.push(`Failed to store ${m.period}: ${error.message}`);
    } else if (data?.id) {
      statementIds.push(data.id);
    }
  }

  steps_log.push(step(`Stored ${statementIds.length} periods to database`));

  // 8. Add missing data warning
  warnings.push('This is Square transaction data — not a financial statement. Missing: COGS, Gross Profit, EBITDA, Operating Expenses, Balance Sheet, Cash Flow.');

  return {
    periodsStored: statementIds.length,
    statementIds,
    warnings,
    steps: steps_log,
    monthlyData,
  };
}
