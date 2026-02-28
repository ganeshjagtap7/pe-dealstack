import { openai, isAIEnabled } from '../openai.js';
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
2. Normalize ALL values to MILLIONS USD (see conversion below)
3. Label each period: HISTORICAL (past actuals), PROJECTED (forecasts/estimates), or LTM (last twelve months)
4. Projected periods are identified by: "E", "F", "Est", "Forecast", "Budget", "Proj" suffix, or future years
5. If a value is not present, use null — never guess
6. confidence: 90-100 = explicitly stated, 70-89 = clearly implied, 50-69 = partially inferred, 0-49 = uncertain

UNIT CONVERSION (always convert to millions USD):
- "$50M" or "50,000" (when header says $000s) → 50
- "$1.5B" or "1,500,000" (when header says $000s) → 1500
- "$500K" or "500" (when header says $000s) → 0.5
- "$38,200" (raw dollars) → 0.0382
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
 * Designed so the extraction layer (currently GPT-4o) can be swapped
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

  // Use up to 30,000 chars — more than the fast pass (20k) to catch full financials
  const truncatedText = text.slice(0, 30000);

  log.debug('Financial classifier starting', { textLength: truncatedText.length });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
    }, { timeout: 90000 });

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
      result[key] = isNaN(num) ? null : num;
    }
  }
  return result;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
