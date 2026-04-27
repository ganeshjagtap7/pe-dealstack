/**
 * accountingParser.ts — QuickBooks/Xero P&L export parser.
 * Most accurate source — data is already categorized by humans.
 * Maps standard category names to canonical lineItems keys.
 */

import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

interface ParseResult {
  periodsStored: number;
  statementIds: string[];
  warnings: string[];
  steps: Array<{ timestamp: string; node: string; message: string; detail?: string }>;
  periods: string[];
}

function step(message: string, detail?: string) {
  return { timestamp: new Date().toISOString(), node: 'accounting_parser', message, detail };
}

/**
 * Map common QuickBooks/Xero category labels to canonical lineItems keys.
 */
const CATEGORY_MAP: Record<string, string> = {
  'total income':          'revenue',
  'revenue':               'revenue',
  'sales':                 'revenue',
  'income':                'revenue',
  'total revenue':         'revenue',
  'cost of goods sold':    'cogs',
  'cogs':                  'cogs',
  'cost of sales':         'cogs',
  'total cost of goods sold': 'cogs',
  'gross profit':          'gross_profit',
  'gross margin':          'gross_profit',
  'total expenses':        'total_opex',
  'operating expenses':    'total_opex',
  'total operating expenses': 'total_opex',
  'expenses':              'total_opex',
  'net income':            'net_income',
  'net profit':            'net_income',
  'net operating income':  'net_income',
  'net earnings':          'net_income',
  'net loss':              'net_income',
  'rent':                  'rent',
  'rent expense':          'rent',
  'payroll':               'payroll',
  'salaries':              'payroll',
  'wages':                 'payroll',
  'salaries and wages':    'payroll',
  'payroll expenses':      'payroll',
  'utilities':             'utilities',
  'utility expense':       'utilities',
  'insurance':             'insurance',
  'insurance expense':     'insurance',
  'depreciation':          'da',
  'depreciation and amortization': 'da',
  'amortization':          'da',
  'interest expense':      'interest_expense',
  'interest':              'interest_expense',
  'tax':                   'tax',
  'income tax':            'tax',
  'taxes':                 'tax',
  'ebitda':                'ebitda',
  'operating income':      'ebit',
  'ebit':                  'ebit',
};

/**
 * Normalise a category label: lowercase, collapse whitespace, strip leading spaces/dashes.
 */
function normalizeLabel(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').replace(/^[-\s]+/, '').trim();
}

/**
 * Detect if a CSV is a QuickBooks/Xero P&L export.
 * These files have month/period names as column headers and a TOTAL column.
 */
export function isAccountingCSV(headers: string[]): boolean {
  const normalized = headers.map(h => h.trim().toLowerCase());
  const hasTotal = normalized.some(h => h === 'total');
  const hasMonthName = normalized.some(h =>
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(h)
  );
  return hasMonthName || hasTotal;
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
 */
function parseAmount(raw: string): number | null {
  if (!raw || raw.trim() === '' || raw.trim() === '-') return null;
  const str = raw.trim();
  const isNegative = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  if (isNaN(value)) return null;
  return isNegative ? -Math.abs(value) : value;
}

/**
 * Detect period columns from the header row.
 * Returns array of { colIndex, periodLabel } for all non-category, non-TOTAL columns.
 */
function detectPeriodColumns(headers: string[]): Array<{ colIndex: number; period: string; sortKey: string }> {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result: Array<{ colIndex: number; period: string; sortKey: string }> = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    if (!h || h.toLowerCase() === 'total') continue;
    if (i === 0) continue; // First column is always the category label column

    // Match "Jan 2026", "Jan-26", "January 2026", "2026-01", "Q1 2026", etc.
    const monthMatch = h.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]?(\d{2,4})/i);
    if (monthMatch) {
      const monthAbbr = monthMatch[1].slice(0, 3);
      const yearRaw   = monthMatch[2];
      const year      = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const monthIdx  = monthNames.findIndex(m => m.toLowerCase() === monthAbbr.toLowerCase());
      const period    = `${monthNames[monthIdx]}-${year.slice(2)}`;
      const sortKey   = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      result.push({ colIndex: i, period, sortKey });
      continue;
    }

    // Match ISO "2026-01", "2026/01"
    const isoMatch = h.match(/^(\d{4})[-/](\d{1,2})$/);
    if (isoMatch) {
      const year     = isoMatch[1];
      const monthNum = parseInt(isoMatch[2], 10);
      const period   = `${monthNames[monthNum - 1]}-${year.slice(2)}`;
      const sortKey  = `${year}-${String(monthNum).padStart(2, '0')}`;
      result.push({ colIndex: i, period, sortKey });
      continue;
    }

    // Match quarter labels "Q1 2026", "Q1-26"
    const quarterMatch = h.match(/^Q([1-4])[\s-]?(\d{2,4})/i);
    if (quarterMatch) {
      const q       = parseInt(quarterMatch[1], 10);
      const yearRaw = quarterMatch[2];
      const year    = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
      const period  = `Q${q}-${year.slice(2)}`;
      const sortKey = `${year}-Q${q}`;
      result.push({ colIndex: i, period, sortKey });
      continue;
    }
  }

  return result.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/**
 * Parse QuickBooks/Xero P&L CSV buffer and store as FinancialStatements.
 */
export async function parseAccountingCSV(
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
      periods: [],
    };
  }

  // 2. Find the header row — first row with recognizable period/month column names
  let headerRowIndex = 0;
  let periodCols: Array<{ colIndex: number; period: string; sortKey: string }> = [];

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const candidates = detectPeriodColumns(rows[i]);
    if (candidates.length > 0) {
      headerRowIndex = i;
      periodCols = candidates;
      break;
    }
  }

  if (periodCols.length === 0) {
    return {
      periodsStored: 0,
      statementIds: [],
      warnings: ['Could not detect period columns in CSV (expected month names or year-month format)'],
      steps: [step('No period columns found')],
      periods: [],
    };
  }

  const headers = rows[headerRowIndex];
  const periodLabels = periodCols.map(p => p.period);
  steps_log.push(step(`Detected ${periodCols.length} period columns`, periodLabels.join(', ')));

  // 3. Build per-period lineItem maps
  const periodData = new Map<string, Record<string, number>>();
  for (const p of periodCols) {
    periodData.set(p.period, {});
  }

  // Section-header rows to skip (no numeric values, just labels)
  const SECTION_HEADERS = new Set([
    'income', 'expenses', 'cost of goods sold', 'cost of sales', 'operating expenses', 'other income', 'other expenses',
  ]);

  let dataRowCount = 0;
  let skippedRows = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) { skippedRows++; continue; }

    const rawLabel = row[0] || '';
    const label    = normalizeLabel(rawLabel);

    if (!label) { skippedRows++; continue; }
    if (SECTION_HEADERS.has(label)) { skippedRows++; continue; }

    // Map label to canonical key — exact match first, then prefix match
    let canonicalKey: string | undefined = CATEGORY_MAP[label];
    if (!canonicalKey) {
      // Try prefix: "total income" matches "income" etc.
      for (const [pattern, key] of Object.entries(CATEGORY_MAP)) {
        if (label.startsWith(pattern) || pattern.startsWith(label)) {
          canonicalKey = key;
          break;
        }
      }
    }
    // Fallback: use the label itself as key (snake_case)
    if (!canonicalKey) {
      canonicalKey = label.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }

    let hasAnyValue = false;
    for (const p of periodCols) {
      const raw   = p.colIndex < row.length ? row[p.colIndex] : '';
      const value = parseAmount(raw);
      if (value !== null) {
        const periodItems = periodData.get(p.period)!;
        // If same canonical key already exists (e.g., both "Income" and "Total Income" map to revenue),
        // prefer the "Total" version — skip if value already set and this row is NOT a Total row
        if (!(canonicalKey in periodItems) || rawLabel.trim().toLowerCase().startsWith('total')) {
          periodItems[canonicalKey] = value;
        }
        hasAnyValue = true;
      }
    }

    if (hasAnyValue) dataRowCount++;
  }

  steps_log.push(step(`Parsed ${dataRowCount} data rows, skipped ${skippedRows} blank/header rows`));

  // 4. Derive missing aggregates for each period
  for (const [, items] of periodData) {
    // Derive gross_profit if missing
    if (!('gross_profit' in items) && 'revenue' in items && 'cogs' in items) {
      items['gross_profit'] = (items['revenue'] ?? 0) - (items['cogs'] ?? 0);
    }
    // Derive net_income if missing
    if (!('net_income' in items) && 'revenue' in items && 'total_opex' in items) {
      const cogs = items['cogs'] ?? 0;
      items['net_income'] = (items['revenue'] ?? 0) - cogs - (items['total_opex'] ?? 0);
    }
    // Derive ebitda if missing but we have net_income, da, interest, tax
    if (!('ebitda' in items) && 'net_income' in items) {
      const da       = items['da'] ?? 0;
      const interest = items['interest_expense'] ?? 0;
      const tax      = items['tax'] ?? 0;
      if (da > 0 || interest > 0 || tax > 0) {
        items['ebitda'] = (items['net_income'] ?? 0) + da + interest + tax;
      }
    }
  }

  // 5. Store as FinancialStatement rows
  const statementIds: string[] = [];
  const now = new Date().toISOString();

  for (const p of periodCols) {
    const lineItems = periodData.get(p.period);
    if (!lineItems || Object.keys(lineItems).length === 0) continue;

    const { data, error } = await supabase
      .from('FinancialStatement')
      .upsert({
        dealId,
        documentId,
        statementType: 'INCOME_STATEMENT',
        period: p.period,
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
      log.error('Accounting parser: failed to upsert period', { dealId, period: p.period, error });
      warnings.push(`Failed to store ${p.period}: ${error.message}`);
    } else if (data?.id) {
      statementIds.push(data.id);
    }
  }

  steps_log.push(step(`Stored ${statementIds.length} periods to database`));

  // 6. Add missing data warning
  warnings.push(
    'Accounting export parsed. Missing: Balance Sheet, Cash Flow. Upload those separately for full PE analysis.'
  );

  return {
    periodsStored: statementIds.length,
    statementIds,
    warnings,
    steps: steps_log,
    periods: periodLabels,
  };
}
