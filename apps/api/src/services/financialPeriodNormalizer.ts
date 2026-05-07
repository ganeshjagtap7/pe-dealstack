/**
 * Financial Period Normalizer & Deduper
 * ======================================
 *
 * Spreadsheet column headers in CIMs are not normalised. The same logical
 * period often appears under multiple labels because rows are typed in by
 * hand:
 *
 *   "FY26 Est"  ↔  "FY26 Est."  ↔  "FY26 Estimated"
 *   "YTD 2026"  ↔  "2026 YTD"  ↔  "YTD Total"  ↔  "YTD Total (Jan-Apr 20, 2026)"
 *
 * The LLM (financialClassifier.ts) reads these labels verbatim, so the same
 * period ends up as two-to-six rows in `FinancialStatement` and the chart
 * X-axis goes from 4 points to 10 points of duplicates.
 *
 * Canonicalisation map applied here (case-insensitive matching, casing of
 * the FIRST occurrence is kept on output):
 *
 *   trim + collapse whitespace + strip trailing  . , :
 *   "FY26 Est." / "FY26 Estimated" / "FY26 estimate"      →  "FY26 Est"
 *   "2026 YTD"  / "YTD Total" / "YTD Total (Jan-Apr…)"    →  "YTD 2026"
 *   monthly labels ("Jan-26", "Feb 2026") are passed through untouched
 *   quarterly labels ("Q1 2026") are passed through untouched
 *
 * Dedup runs per (statementType, periodType) bucket. Within each bucket,
 * rows that normalise to the same key are merged: line-item values from
 * the row with higher `confidence` win, ties go to the row with more
 * non-null fields, then to the first occurrence.
 *
 * Edge cases handled:
 *   - "FY26 Est." vs "FY26 Est"
 *   - "YTD 2026" / "2026 YTD" / "YTD Total" / "YTD Total (Jan-Apr 20, 2026)"
 *   - Whitespace and trailing-punctuation variants
 *   - Case differences ("ytd 2026" vs "YTD 2026")
 *
 * NOT canonicalised (intentionally — too many false positives):
 *   - "Q1 2026" vs "Q1-2026" vs "Q1'26" — preserved as-is. Mostly the LLM
 *     already emits one of these consistently per document.
 *   - "Jan-26" vs "Jan 2026" vs "January 2026" — preserved as-is.
 *   - Rolling-period labels like "L3M", "LTM", "TTM" — preserved as-is.
 */
import { log } from '../utils/logger.js';
import type { FinancialPeriod, PeriodType, StatementType } from './financialClassifier.js';

// ─── Public types ────────────────────────────────────────────

/** A period with a key for grouping by (statementType, periodType). */
export interface BucketedPeriod extends FinancialPeriod {
  statementType: StatementType;
}

// ─── normalizePeriodLabel ────────────────────────────────────

/**
 * Canonicalise a period label so equivalent headers compare equal.
 *
 * Pure / synchronous. Does not need access to the surrounding bucket —
 * the canonicalisation rules are deterministic on the label alone.
 *
 * @example
 *   normalizePeriodLabel("FY26 Est.")                          // "FY26 Est"
 *   normalizePeriodLabel("FY26 Estimated")                     // "FY26 Est"
 *   normalizePeriodLabel("2026 YTD")                           // "YTD 2026"
 *   normalizePeriodLabel("YTD Total")                          // "YTD Total"
 *   normalizePeriodLabel("YTD Total (Jan-Apr 20, 2026)")       // "YTD Total"
 *   normalizePeriodLabel(" Q1   2026 ")                        // "Q1 2026"
 */
export function normalizePeriodLabel(label: string): string {
  if (!label) return '';

  // 1. Trim leading/trailing whitespace
  let s = String(label).trim();

  // 2. Strip trailing punctuation (. , : ;)  — repeat in case of ".."  etc
  s = s.replace(/[.,:;]+$/g, '').trim();

  // 3. Collapse internal whitespace runs to single space
  s = s.replace(/\s+/g, ' ');

  // 4. Synonym normalisation — applied in priority order.
  //    All matches are case-insensitive; output uses canonical casing.

  // 4a. "FY<NN> Estimated"  →  "FY<NN> Est"   (also handles "estimate")
  //     Only matches when "Estimated"/"estimate" is the trailing word.
  s = s.replace(/^(FY\d{2,4})\s+Estimated?$/i, (_m, fy) => `${fy.toUpperCase()} Est`);

  // 4b. "FY<NN> Est"  (any case)  →  canonical casing "FY<NN> Est"
  const fyEstMatch = s.match(/^(FY\d{2,4})\s+Est$/i);
  if (fyEstMatch) {
    s = `${fyEstMatch[1].toUpperCase()} Est`;
  }

  // 4c. "FY<NN> Forecast" / "FY<NN> Budget" / "FY<NN> Proj" — leave as
  //     individual labels but uppercase the FY prefix for consistency.
  const fyOtherMatch = s.match(/^(FY\d{2,4})\s+(Forecast|Budget|Proj(?:ected)?|Plan)$/i);
  if (fyOtherMatch) {
    s = `${fyOtherMatch[1].toUpperCase()} ${capitalize(fyOtherMatch[2])}`;
  }

  // 4d. YTD synonyms.  Order matters — try the most specific first.
  //
  //   "YTD Total (Jan-Apr 20, 2026)"  →  "YTD 2026"   (year extracted)
  //   "YTD Total ("…anything…")"      →  "YTD Total"  (no year)
  //   "<year> YTD"                    →  "YTD <year>"
  //   "YTD <year>"                    →  "YTD <year>"  (canonical casing)
  //   "YTD Total"                     →  "YTD Total"   (kept distinct)
  //
  // We deliberately fold "YTD Total (…dates…)" into "YTD <year>" only when
  // a 4-digit year is in the parens; otherwise we keep "YTD Total" so we
  // do not confuse two years' YTD figures.

  // "YTD Total (…)" with year in parens → YTD <year>
  const ytdTotalWithDates = s.match(/^YTD\s+Total\s*\(.*?(\d{4}).*?\)$/i);
  if (ytdTotalWithDates) {
    s = `YTD ${ytdTotalWithDates[1]}`;
  } else {
    // Bare "YTD Total" or "YTD Total ()" → "YTD Total"
    if (/^YTD\s+Total(\s*\(\s*\))?$/i.test(s)) {
      s = 'YTD Total';
    }
  }

  // "<year> YTD" → "YTD <year>"
  const yearYtdMatch = s.match(/^(\d{4})\s+YTD$/i);
  if (yearYtdMatch) {
    s = `YTD ${yearYtdMatch[1]}`;
  }

  // "YTD <year>" → canonical casing
  const ytdYearMatch = s.match(/^YTD\s+(\d{4})$/i);
  if (ytdYearMatch) {
    s = `YTD ${ytdYearMatch[1]}`;
  }

  return s;
}

function capitalize(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// ─── dedupePeriods ────────────────────────────────────────────

/**
 * Within a single (statementType, periodType) bucket, merge periods whose
 * normalised labels collide.
 *
 * Merge strategy when two rows collide:
 *   1. Higher `confidence` wins: that row's lineItems become the base.
 *   2. Tie on confidence → row with more non-null fields wins.
 *   3. Final tie → first occurrence wins.
 *   4. Whichever side did NOT win contributes line-item KEYS the winner is
 *      missing (i.e. fill nulls / fill new keys from loser).
 *   5. Output `period` label preserves the casing of the first occurrence
 *      whose normalised form == the canonical key.
 *   6. Output `confidence` is the MAX of the two.
 *
 * The function operates on a single bucket. Callers should bucket inputs
 * by (statementType, periodType) before calling — see `dedupeStatement`.
 */
export function dedupePeriods(periods: FinancialPeriod[]): FinancialPeriod[] {
  if (periods.length <= 1) return periods;

  // Group by case-insensitive normalised label.
  const byKey = new Map<string, FinancialPeriod>();
  // Track first-seen casing per key so we can preserve it in output.
  const firstLabel = new Map<string, string>();

  for (const p of periods) {
    const norm = normalizePeriodLabel(p.period);
    const key = norm.toLowerCase();
    if (!key) continue;

    if (!byKey.has(key)) {
      byKey.set(key, { ...p, period: norm, lineItems: { ...p.lineItems } });
      firstLabel.set(key, norm);
      continue;
    }

    // Collision — merge.
    const existing = byKey.get(key)!;
    const merged = mergeTwoPeriods(existing, p);
    // Preserve first-seen normalised label.
    merged.period = firstLabel.get(key)!;
    byKey.set(key, merged);
  }

  return Array.from(byKey.values());
}

/** Pick a winner between two periods using the documented strategy. */
function mergeTwoPeriods(a: FinancialPeriod, b: FinancialPeriod): FinancialPeriod {
  const aConf = a.confidence ?? 0;
  const bConf = b.confidence ?? 0;
  const aNonNull = countNonNull(a.lineItems);
  const bNonNull = countNonNull(b.lineItems);

  let winner: FinancialPeriod;
  let loser: FinancialPeriod;
  if (bConf > aConf) {
    winner = b; loser = a;
  } else if (aConf > bConf) {
    winner = a; loser = b;
  } else if (bNonNull > aNonNull) {
    winner = b; loser = a;
  } else {
    // ties → first occurrence wins (a was added first in caller)
    winner = a; loser = b;
  }

  // Union of keys: winner's values dominate, loser fills holes/missing keys.
  const items: Record<string, number | null> = { ...loser.lineItems };
  for (const [k, v] of Object.entries(winner.lineItems)) {
    if (v !== null && v !== undefined) {
      items[k] = v;
    } else if (!(k in items)) {
      items[k] = v;
    }
  }
  // Preserve _source citation strings on either side without overwriting
  // truthy strings with null.
  for (const [k, v] of Object.entries(loser.lineItems)) {
    if (k.endsWith('_source') && typeof v === 'string' && !items[k]) {
      (items as any)[k] = v;
    }
  }

  return {
    period: winner.period,
    periodType: winner.periodType,
    lineItems: items,
    confidence: Math.max(aConf, bConf),
  };
}

function countNonNull(items: Record<string, number | null>): number {
  let n = 0;
  for (const v of Object.values(items)) {
    if (v !== null && v !== undefined) n++;
  }
  return n;
}

// ─── Statement-level helper ──────────────────────────────────

/**
 * Dedup all periods within one statement, bucketing by `periodType` so we
 * never collapse e.g. "FY26 Est" (PROJECTED) with a "FY26" HISTORICAL.
 * Logs a single info line per statement summarising the reduction.
 */
export function dedupeStatementPeriods(
  statementType: StatementType,
  periods: FinancialPeriod[],
): FinancialPeriod[] {
  if (periods.length <= 1) return periods;

  const buckets = new Map<PeriodType, FinancialPeriod[]>();
  for (const p of periods) {
    const arr = buckets.get(p.periodType) ?? [];
    arr.push(p);
    buckets.set(p.periodType, arr);
  }

  const out: FinancialPeriod[] = [];
  let droppedTotal = 0;
  for (const [, group] of buckets) {
    const before = group.length;
    const deduped = dedupePeriods(group);
    droppedTotal += (before - deduped.length);
    out.push(...deduped);
  }

  if (droppedTotal > 0) {
    log.info(
      `Period dedup: ${periods.length} input → ${out.length} output (dropped ${droppedTotal} duplicates)`,
      { statementType },
    );
  }

  return out;
}
