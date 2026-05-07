import { openai, isAIEnabled, trackedChatCompletion } from '../openai.js';
import { MODEL_CLASSIFICATION } from '../utils/aiModels.js';
import { log } from '../utils/logger.js';
import { buildExtractionPrompt } from './extractionPrompt.js';
import { MAX_TEXT_LENGTH } from './agents/financialAgent/config.js';
import { validateLineItems } from './financialSchema.js';

// ─── Types ────────────────────────────────────────────────────

export type StatementType = 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW';
export type PeriodType = 'HISTORICAL' | 'PROJECTED' | 'LTM';
export type UnitScale = 'MILLIONS' | 'THOUSANDS' | 'ACTUALS' | 'BILLIONS';

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
// Prompt is built via shared extractionPrompt.ts — single source of truth.

// ─── Explicit-Unit Detection (deterministic post-classifier guard) ────────
//
// Scans source text for explicit scale markers. If none are present and the
// LLM tags a statement MILLIONS/THOUSANDS/BILLIONS, that's almost always a
// magnitude-based hallucination — we override to ACTUALS as a safety net.
//
// Markers we accept (case-insensitive):
//   $M, $K, $B, $000s
//   ($M), ($K), ($B), ($000s)
//   in millions, in thousands, in billions
// "All figures in USD" alone is intentionally NOT a marker — it only declares
// currency, not scale. The earlier prompt fix already covers that case.
const EXPLICIT_UNIT_PATTERNS: Array<{ pattern: RegExp; scale: UnitScale }> = [
  // BILLIONS — strongest signal first
  { pattern: /\$B\b/i,                       scale: 'BILLIONS' },
  { pattern: /\(\s*\$B\s*\)/i,               scale: 'BILLIONS' },
  { pattern: /\bin\s+billions\b/i,           scale: 'BILLIONS' },
  // MILLIONS
  { pattern: /\$M\b/i,                       scale: 'MILLIONS' },
  { pattern: /\(\s*\$M\s*\)/i,               scale: 'MILLIONS' },
  { pattern: /\bin\s+millions\b/i,           scale: 'MILLIONS' },
  // THOUSANDS — includes $000s and $K
  { pattern: /\$000s\b/i,                    scale: 'THOUSANDS' },
  { pattern: /\(\s*\$000s\s*\)/i,            scale: 'THOUSANDS' },
  { pattern: /\$K\b/i,                       scale: 'THOUSANDS' },
  { pattern: /\(\s*\$K\s*\)/i,               scale: 'THOUSANDS' },
  { pattern: /\bin\s+thousands\b/i,          scale: 'THOUSANDS' },
];

/**
 * Scan source text for an explicit unit-scale marker.
 * Returns the strongest signal found (BILLIONS > MILLIONS > THOUSANDS) or null.
 *
 * Used as a deterministic override: if the source has NO marker, the LLM
 * has no factual basis to tag MILLIONS/THOUSANDS — those classifications
 * must be magnitude-based guesses and should fall back to ACTUALS.
 */
export function detectExplicitUnitInText(text: string): UnitScale | null {
  if (!text) return null;
  // Order in EXPLICIT_UNIT_PATTERNS already encodes priority (BILLIONS first),
  // but we rank explicitly to make the strongest-signal contract obvious.
  const priority: Record<UnitScale, number> = {
    BILLIONS: 3,
    MILLIONS: 2,
    THOUSANDS: 1,
    ACTUALS: 0,
  };
  let strongest: UnitScale | null = null;
  for (const { pattern, scale } of EXPLICIT_UNIT_PATTERNS) {
    if (pattern.test(text)) {
      if (strongest === null || priority[scale] > priority[strongest]) {
        strongest = scale;
      }
    }
  }
  return strongest;
}

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

  // Use up to MAX_TEXT_LENGTH chars — model supports large context, so we can safely send more
  // This catches financial data buried deep in 50+ page CIMs that were previously cut off
  const truncatedText = text.slice(0, MAX_TEXT_LENGTH);

  // Pre-scan source for explicit unit markers. If none, we deterministically
  // override LLM-emitted MILLIONS/THOUSANDS/BILLIONS to ACTUALS post-call.
  const explicitUnitFromText = detectExplicitUnitInText(truncatedText);

  log.debug('Financial classifier starting', {
    textLength: truncatedText.length,
    explicitUnitFromText,
  });

  try {
    const response = await trackedChatCompletion('financial_extraction', {
      model: MODEL_CLASSIFICATION,
      messages: [
        { role: 'system', content: buildExtractionPrompt({ includeSourceCitations: true }) },
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

    // Belt-and-suspenders: if the source has NO explicit unit marker but the
    // LLM still emitted MILLIONS/THOUSANDS/BILLIONS, override to ACTUALS.
    // The prompt should already produce ACTUALS in this case — this catches
    // regressions where the LLM second-guesses based on number magnitude.
    applyExplicitUnitOverride(result, explicitUnitFromText);

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
        // Validate and normalize line item keys
        const { normalized: validatedItems, warnings: itemWarnings } = validateLineItems(statementType, lineItems);
        if (itemWarnings.length > 0) {
          warnings.push(...itemWarnings.map(w => `${statementType} ${p.period}: ${w}`));
        }
        // Auto-calculate derived fields if missing
        if (statementType === 'INCOME_STATEMENT') {
          computeDerivedFields(validatedItems);
        }
        const confidence = clamp(Number(p.confidence) || 0, 0, 100);

        if (!p.period) continue;

        periods.push({
          period: String(p.period).trim(),
          periodType,
          lineItems: validatedItems,
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
    BILLIONS: 'BILLIONS',
  };
  const key = String(raw ?? '').toUpperCase().trim();
  const matched = map[key];
  if (matched) return matched;
  // Unknown / missing unit string. Default to ACTUALS — the safest fallback
  // because it means "do not multiply", so values are stored as-written instead
  // of being silently inflated 1,000,000× (the old MILLIONS default).
  if (key !== '') {
    log.warn('Financial classifier: unknown unitScale from LLM, defaulting to ACTUALS', { raw });
  }
  return 'ACTUALS';
}

/**
 * Override LLM-inferred unit scales to ACTUALS when the source text contains
 * no explicit unit marker. The prompt already pushes the LLM toward ACTUALS
 * in this case, but the model has a tendency to over-guess MILLIONS for
 * values > 1000. This is the deterministic safety net.
 *
 * Rules:
 *   - If `explicitUnitFromText` is non-null, the source DOES declare a scale.
 *     We trust the LLM's choice (it should match the explicit marker; if not,
 *     that's a separate downstream concern, but we don't override).
 *   - If `explicitUnitFromText` is null, the source has NO marker. Any
 *     LLM-emitted MILLIONS/THOUSANDS/BILLIONS is a magnitude-based guess —
 *     override to ACTUALS.
 *   - If the LLM already emitted ACTUALS, leave it alone.
 *
 * Mutates `result.statements` in-place.
 */
function applyExplicitUnitOverride(
  result: ClassificationResult,
  explicitUnitFromText: UnitScale | null,
): void {
  if (explicitUnitFromText !== null) {
    // Source declared a scale — trust the LLM (it had a fact to anchor on).
    return;
  }

  for (const stmt of result.statements) {
    if (stmt.unitScale === 'ACTUALS') continue; // LLM already agrees with us
    const originalScale = stmt.unitScale;
    // Capture a sample value for logging diagnostics
    let valueSample: number | null = null;
    for (const period of stmt.periods) {
      for (const [k, v] of Object.entries(period.lineItems)) {
        if (k.endsWith('_source')) continue;
        if (typeof v === 'number' && !isNaN(v)) {
          valueSample = v;
          break;
        }
      }
      if (valueSample !== null) break;
    }
    stmt.unitScale = 'ACTUALS';
    log.warn(
      `Financial classifier: source has no explicit unit marker — overriding LLM-inferred ${originalScale} to ACTUALS`,
      {
        statementType: stmt.statementType,
        originalScale,
        valueSample,
      },
    );
  }
}

function normalizeLineItems(raw: Record<string, any>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, val] of Object.entries(raw)) {
    // Preserve _source citation fields as strings (stored alongside numeric values in JSONB)
    if (key.endsWith('_source')) {
      if (typeof val === 'string') (result as any)[key] = val;
      continue;
    }
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
