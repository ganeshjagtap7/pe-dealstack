/**
 * visionExtractor.ts — GPT-4o Vision fallback for scanned / image-only PDFs.
 *
 * When pdf-parse returns < 200 meaningful characters (scanned PDFs, image PDFs),
 * this service uploads the raw PDF buffer to OpenAI and sends it to GPT-4o
 * using the Responses API, which natively supports PDF file inputs.
 *
 * Returns the same ClassificationResult format as classifyFinancials()
 * so the rest of the pipeline is unchanged.
 */

import { openai, isAIEnabled } from '../openai.js';
import { log } from '../utils/logger.js';
import type { ClassificationResult, ClassifiedStatement, FinancialPeriod, StatementType, PeriodType, UnitScale } from './financialClassifier.js';

// ─── System prompt (same intent as classifyFinancials, optimised for vision) ──

const VISION_SYSTEM_PROMPT = `You are a senior private equity analyst extracting structured financial data from deal documents (CIMs, teasers, standalone financials).

Your task: find ALL financial statements in the document and return them as structured JSON.

RULES:
1. Extract EVERY year/period column you find — do not skip any
2. Normalize ALL values to MILLIONS USD
3. Label each period: HISTORICAL (past actuals), PROJECTED (forecasts/estimates), or LTM (last twelve months)
4. Projected periods are identified by: "E", "F", "Est", "Forecast", "Budget", "Proj" suffix, or future years
5. If a value is not present, use null — never guess
6. confidence: 90-100 = explicitly stated, 70-89 = clearly implied, 50-69 = partially inferred, 0-49 = uncertain

UNIT CONVERSION (always convert to millions USD):
- "$50M" or "50,000" (when header says $000s) → 50
- "$1.5B" or "1,500,000" (when header says $000s) → 1500
- "$500K" or "500" (when header says $000s) → 0.5
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

IMPORTANT: margins/percentages as numbers (e.g. 25.5 means 25.5%), NOT decimals.

Return ONLY valid JSON:
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
          "lineItems": { "revenue": 12.5, "ebitda": 3.1, "ebitda_margin_pct": 24.8 }
        }
      ]
    }
  ],
  "overallConfidence": 88,
  "warnings": []
}

If no financial data exists, return:
{ "statements": [], "overallConfidence": 0, "warnings": ["No financial data found"] }`;

// ─── Main export ───────────────────────────────────────────────

/**
 * Attempt to extract financial statements from a PDF buffer using
 * GPT-4o's native PDF reading (via Responses API).
 *
 * Use this when pdf-parse yields fewer than ~200 meaningful characters
 * (scanned PDFs, image-based PDFs).
 */
export async function classifyFinancialsVision(
  pdfBuffer: Buffer,
  filename: string = 'document.pdf',
): Promise<ClassificationResult | null> {
  if (!isAIEnabled() || !openai) {
    log.warn('Vision extractor: OpenAI not configured, skipping');
    return null;
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    log.warn('Vision extractor: empty PDF buffer');
    return null;
  }

  log.info('Vision extractor: starting GPT-4o vision extraction', {
    filename,
    bufferSizeKB: Math.round(pdfBuffer.length / 1024),
  });

  try {
    // Encode PDF as base64 data URL — Responses API accepts this directly
    const base64 = pdfBuffer.toString('base64');
    const fileDataUrl = `data:application/pdf;base64,${base64}`;

    // Use the Responses API which natively supports PDF file inputs
    const response = await (openai as any).responses.create({
      model: 'gpt-4o',
      instructions: VISION_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename,
              file_data: fileDataUrl,
            },
            {
              type: 'input_text',
              text: 'Extract all financial statements from this document and return JSON.',
            },
          ],
        },
      ],
      text: { format: { type: 'json_object' } },
    });

    const content: string | null = response.output_text ?? null;

    if (!content) {
      log.error('Vision extractor: empty response from GPT-4o');
      return null;
    }

    const raw = JSON.parse(content) as ClassificationResult;
    const result = normalizeVisionResult(raw);

    log.info('Vision extractor: completed', {
      filename,
      statementsFound: result.statements.length,
      overallConfidence: result.overallConfidence,
    });

    return result;
  } catch (err: any) {
    // If Responses API is not available, log clearly and return null
    if (err?.status === 404 || err?.message?.includes('responses')) {
      log.error('Vision extractor: Responses API not available on this OpenAI account/key', err.message);
    } else {
      log.error('Vision extractor: unexpected error', err);
    }
    return null;
  }
}

// ─── Normalization (mirrors financialClassifier.ts) ───────────

function normalizeVisionResult(raw: any): ClassificationResult {
  const warnings: string[] = Array.isArray(raw.warnings) ? raw.warnings : [];
  const statements: ClassifiedStatement[] = [];

  if (!Array.isArray(raw.statements)) {
    return { statements: [], overallConfidence: 0, warnings: ['Vision: unexpected response format'] };
  }

  for (const stmt of raw.statements) {
    const statementType = normalizeStatementType(stmt.statementType);
    if (!statementType) {
      warnings.push(`Vision: unknown statement type: ${stmt.statementType}`);
      continue;
    }

    const periods: FinancialPeriod[] = [];

    if (Array.isArray(stmt.periods)) {
      for (const p of stmt.periods) {
        if (!p.period) continue;
        periods.push({
          period: String(p.period).trim(),
          periodType: normalizePeriodType(p.periodType),
          lineItems: normalizeLineItems(p.lineItems ?? {}),
          confidence: clamp(Number(p.confidence) || 0, 0, 100),
        });
      }
    }

    if (periods.length === 0) {
      warnings.push(`Vision: no periods for ${statementType}`);
      continue;
    }

    statements.push({
      statementType,
      unitScale: normalizeUnitScale(stmt.unitScale),
      currency: stmt.currency || 'USD',
      periods,
    });
  }

  return {
    statements,
    overallConfidence: clamp(Number(raw.overallConfidence) || 0, 0, 100),
    warnings,
  };
}

function normalizeStatementType(raw: string): StatementType | null {
  const map: Record<string, StatementType> = {
    INCOME_STATEMENT: 'INCOME_STATEMENT',
    BALANCE_SHEET: 'BALANCE_SHEET',
    CASH_FLOW: 'CASH_FLOW',
  };
  return map[String(raw ?? '').toUpperCase().trim()] ?? null;
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
