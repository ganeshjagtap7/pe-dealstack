import { openai, isAIEnabled } from '../openai.js';
import { MODEL_CLASSIFICATION } from '../utils/aiModels.js';
import { log } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────

export type StatementType = 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW';
export type PeriodType = 'HISTORICAL' | 'PROJECTED' | 'LTM';
export type UnitScale = 'MILLIONS' | 'THOUSANDS' | 'ACTUALS';

/** One period's worth of line items — maps directly to a FinancialStatement DB row */
export interface FinancialPeriod {
  period: string;       // "2021", "2022", "LTM", "2025E"
  periodType: PeriodType;
  lineItems: Record<string, number | null>; // { revenue: 12.5, ebitda: 3.2, ... }
  confidence: number;   // 0-100
}

/** One statement type (e.g. Income Statement) with all its periods */
export interface ClassifiedStatement {
  statementType: StatementType;
  unitScale: UnitScale;
  currency: string;
  periods: FinancialPeriod[];
}

/** Full result from classifyFinancials() */
export interface ClassificationResult {
  statements: ClassifiedStatement[];
  overallConfidence: number;
  warnings: string[];   // e.g. "No balance sheet found", "Units unclear"
}

// ─── Prompt ──────────────────────────────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `You are a senior private equity analyst extracting structured financial data from deal documents (CIMs, teasers, standalone financials).

Your task: find ALL financial statements in the document text and return them as structured JSON.

RULES:
1. Extract EVERY year/period column you find — do not skip any
2. Normalize ALL values to MILLIONS in the ORIGINAL currency of the document (see conversion below)
3. Detect the currency from the document (look for symbols like $, ₹, €, £, ¥, or text like USD, INR, EUR, GBP, JPY, etc.)
4. Set the "currency" field to the ISO 4217 code (e.g. "USD", "INR", "EUR", "GBP", "JPY"). If no currency is detected, default to "USD"
5. Label each period: HISTORICAL (past actuals), PROJECTED (forecasts/estimates), or LTM (last twelve months)
6. Projected periods are identified by: "E", "F", "Est", "Forecast", "Budget", "Proj" suffix, or future years
7. If a value is not present, use null — never guess
8. confidence: 90-100 = explicitly stated, 70-89 = clearly implied, 50-69 = partially inferred, 0-49 = uncertain

UNIT CONVERSION (always convert to millions in the original currency — do NOT convert between currencies):
- "50M" or "50,000" (when header says 000s) → 50
- "1.5B" or "1,500,000" (when header says 000s) → 1500
- "500K" or "500" (when header says 000s) → 0.5
- "38,200" (raw units) → 0.0382
- "₹50 Cr" (crore = 10M) → 500
- "₹50 Lakh" (lakh = 0.1M) → 5
- If units are unclear, pick the most likely based on company size context

INCOME STATEMENT line item keys (use exactly these keys):
revenue, cogs, gross_profit, gross_margin_pct,
sga, rd, other_opex, total_opex,
ebitda, ebitda_margin_pct, da, ebit,
interest_expense, ebt, tax, net_income, sde

BALANCE SHEET line item keys:
cash, accounts_receivable, inventory, other_current_assets, total_current_assets,
ppe_net, goodwill, intangibles, total_assets,
accounts_payable, short_term_debt, other_current_liabilities, total_current_liabilities,
long_term_debt, total_liabilities, total_equity

CASH FLOW line item keys:
operating_cf, capex, fcf, acquisitions, debt_repayment, dividends, net_change_cash

IMPORTANT: margins/percentages should be stored as a number (e.g. 25.5 means 25.5%), NOT as a decimal.

Return ONLY valid JSON in this exact structure:
{
  "statements": [
    {
      "statementType": "INCOME_STATEMENT",
      "unitScale": "MILLIONS",
      "currency": "USD",
      "periods": [
        {
          "period": "2022",
          "periodType": "HISTORICAL",
          "confidence": 90,
          "lineItems": {
            "revenue": 12.5,
            "ebitda": 3.1,
            "ebitda_margin_pct": 24.8,
            "net_income": 1.8
          }
        },
        {
          "period": "2023",
          "periodType": "HISTORICAL",
          "confidence": 92,
          "lineItems": {
            "revenue": 14.2,
            "ebitda": 3.7,
            "ebitda_margin_pct": 26.1,
            "net_income": 2.1
          }
        }
      ]
    }
  ],
  "overallConfidence": 88,
  "warnings": ["No balance sheet found in document"]
}

If no financial data exists in the document, return:
{ "statements": [], "overallConfidence": 0, "warnings": ["No financial data found"] }`;

// ─── Main Function ────────────────────────────────────────────

/**
 * Extract full 3-statement financial model from raw document text.
 * Returns one ClassifiedStatement per statement type found,
 * each containing all periods (years) as separate FinancialPeriod entries.
 *
 * Designed so the extraction layer (currently AI classifier) can be swapped
 * for Azure Document Intelligence later without changing the output interface.
 */
export async function classifyFinancials(
  text: string,
): Promise<ClassificationResult | null> {
  if (!isAIEnabled() || !openai) {
    log.warn('Financial classifier skipped: OpenAI not configured');
    return null;
  }

  if (!text || text.trim().length < 100) {
    log.warn('Financial classifier skipped: text too short');
    return null;
  }

  // Use up to 60,000 chars — model supports large context, so we can safely send more
  // This catches financial data buried deep in 50+ page CIMs that were previously cut off
  const truncatedText = text.slice(0, 60000);

  log.debug('Financial classifier starting', { textLength: truncatedText.length });

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_CLASSIFICATION,
      messages: [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract all financial statements from this document:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 16000,
    }, { timeout: 120000 });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.error('Financial classifier: no response content');
      return null;
    }

    const raw = JSON.parse(content) as ClassificationResult;

    // Normalize and validate the response
    const result = normalizeClassificationResult(raw);

    log.debug('Financial classifier completed', {
      statementsFound: result.statements.length,
      overallConfidence: result.overallConfidence,
      warnings: result.warnings,
    });

    return result;
  } catch (error) {
    log.error('Financial classifier error', error);
    return null;
  }
}

// ─── Normalization Helpers ────────────────────────────────────

function normalizeClassificationResult(raw: any): ClassificationResult {
  const warnings: string[] = Array.isArray(raw.warnings) ? raw.warnings : [];

  const statements: ClassifiedStatement[] = [];

  if (!Array.isArray(raw.statements)) {
    return { statements: [], overallConfidence: 0, warnings: ['Unexpected response format'] };
  }

  for (const stmt of raw.statements) {
    const statementType = normalizeStatementType(stmt.statementType);
    if (!statementType) {
      warnings.push(`Unknown statement type: ${stmt.statementType}`);
      continue;
    }

    const periods: FinancialPeriod[] = [];

    if (Array.isArray(stmt.periods)) {
      for (const p of stmt.periods) {
        const periodType = normalizePeriodType(p.periodType);
        const lineItems = normalizeLineItems(p.lineItems ?? {});
        // Auto-calculate derived fields if missing
        if (statementType === 'INCOME_STATEMENT') {
          computeDerivedFields(lineItems);
        }
        const confidence = clamp(Number(p.confidence) || 0, 0, 100);

        if (!p.period) continue;

        periods.push({
          period: String(p.period).trim(),
          periodType,
          lineItems,
          confidence,
        });
      }
    }

    if (periods.length === 0) {
      warnings.push(`No periods found for ${statementType}`);
      continue;
    }

    // Post-process: correct periodType based on year
    correctPeriodTypes(periods);

    statements.push({
      statementType,
      unitScale: normalizeUnitScale(stmt.unitScale),
      currency: stmt.currency || 'USD',
      periods,
    });
  }

  const overallConfidence = clamp(Number(raw.overallConfidence) || 0, 0, 100);

  return { statements, overallConfidence, warnings };
}

function normalizeStatementType(raw: string): StatementType | null {
  const map: Record<string, StatementType> = {
    INCOME_STATEMENT: 'INCOME_STATEMENT',
    INCOME: 'INCOME_STATEMENT',
    P_AND_L: 'INCOME_STATEMENT',
    PNL: 'INCOME_STATEMENT',
    PROFIT_AND_LOSS: 'INCOME_STATEMENT',
    BALANCE_SHEET: 'BALANCE_SHEET',
    CASH_FLOW: 'CASH_FLOW',
    CASH_FLOW_STATEMENT: 'CASH_FLOW',
    CASHFLOW: 'CASH_FLOW',
  };
  return map[String(raw ?? '').toUpperCase().trim().replace(/\s+/g, '_')] ?? null;
}

function normalizePeriodType(raw: string): PeriodType {
  const map: Record<string, PeriodType> = {
    HISTORICAL: 'HISTORICAL',
    PROJECTED: 'PROJECTED',
    LTM: 'LTM',
  };
  return map[String(raw ?? '').toUpperCase().trim()] ?? 'HISTORICAL';
}

function normalizeUnitScale(raw: string): UnitScale {
  const map: Record<string, UnitScale> = {
    MILLIONS: 'MILLIONS',
    THOUSANDS: 'THOUSANDS',
    ACTUALS: 'ACTUALS',
  };
  return map[String(raw ?? '').toUpperCase().trim()] ?? 'MILLIONS';
}

function normalizeLineItems(raw: Record<string, any>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val === null || val === undefined) {
      result[key] = null;
    } else {
      const num = Number(val);
      if (isNaN(num)) {
        result[key] = null;
      } else if (key.endsWith('_pct')) {
        // Percentages: round to 2 decimal places (e.g. 25.55%)
        result[key] = Math.round(num * 100) / 100;
      } else {
        // Financial values in millions: round to 4 decimals ($100 precision)
        result[key] = Math.round(num * 10000) / 10000;
      }
    }
  }
  return result;
}

/**
 * Auto-calculate derived income statement fields when missing.
 * E.g., EBITDA = revenue - cogs - total_opex (or = ebit + da),
 * gross_profit = revenue - cogs, margins from base values.
 */
function computeDerivedFields(li: Record<string, number | null>): void {
  const v = (k: string) => (li[k] !== null && li[k] !== undefined ? li[k]! : null);

  // gross_profit = revenue - cogs
  if (v('gross_profit') === null && v('revenue') !== null && v('cogs') !== null) {
    li.gross_profit = Math.round((v('revenue')! - v('cogs')!) * 10000) / 10000;
  }

  // ebitda = ebit + da  OR  revenue - cogs - total_opex
  if (v('ebitda') === null) {
    if (v('ebit') !== null && v('da') !== null) {
      li.ebitda = Math.round((v('ebit')! + v('da')!) * 10000) / 10000;
    } else if (v('revenue') !== null && v('cogs') !== null && v('total_opex') !== null) {
      li.ebitda = Math.round((v('revenue')! - v('cogs')! - v('total_opex')!) * 10000) / 10000;
    } else if (v('gross_profit') !== null && v('total_opex') !== null) {
      li.ebitda = Math.round((v('gross_profit')! - v('total_opex')!) * 10000) / 10000;
    }
  }

  // ebit = ebitda - da
  if (v('ebit') === null && v('ebitda') !== null && v('da') !== null) {
    li.ebit = Math.round((v('ebitda')! - v('da')!) * 10000) / 10000;
  }

  // gross_margin_pct = gross_profit / revenue * 100
  if (v('gross_margin_pct') === null && v('gross_profit') !== null && v('revenue') !== null && v('revenue')! !== 0) {
    li.gross_margin_pct = Math.round((v('gross_profit')! / v('revenue')!) * 10000) / 100;
  }

  // ebitda_margin_pct = ebitda / revenue * 100
  if (v('ebitda_margin_pct') === null && v('ebitda') !== null && v('revenue') !== null && v('revenue')! !== 0) {
    li.ebitda_margin_pct = Math.round((v('ebitda')! / v('revenue')!) * 10000) / 100;
  }
}

/**
 * Post-process period types: future years should be PROJECTED, not HISTORICAL.
 * Also handles suffixed periods like "2025E", "2026F", "FY2025P".
 */
function correctPeriodTypes(periods: FinancialPeriod[]): void {
  const currentYear = new Date().getFullYear();

  for (const p of periods) {
    // Extract the 4-digit year from the period string (handles "FY2025", "2025E", "Q3 2025", etc.)
    const yearMatch = p.period.match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = parseInt(yearMatch[1], 10);

    // Check for explicit projected suffixes in the original period string
    const projectedSuffix = /[EFP]$/i.test(p.period.replace(/\d/g, '').trim()) ||
      /\b(est|forecast|budget|proj)\b/i.test(p.period);

    if (projectedSuffix && p.periodType === 'HISTORICAL') {
      p.periodType = 'PROJECTED';
    } else if (year > currentYear && p.periodType === 'HISTORICAL') {
      // Future year marked as HISTORICAL → correct to PROJECTED
      p.periodType = 'PROJECTED';
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
