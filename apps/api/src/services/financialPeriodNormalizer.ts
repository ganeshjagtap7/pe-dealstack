/**
 * Financial Period Normalizer & Deduper
 * ======================================
 *
 * Spreadsheet column headers in CIMs are not normalised. The same logical
 * period often appears under multiple labels because rows are typed in by
 * hand:
 *
 *   "FY26 Est"  ↔  "FY26 Est."  ↔  "FY26 Estimated"  ↔  "2026 FY Est"
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
 *   "2026 FY Est" / "2026 FY Est." / "2026 FY Estimated"  →  "FY26 Est"
 *   "2026 YTD"  / "YTD Total (Jan-Apr…)"                  →  "YTD 2026"
 *   "YTD Total" with sibling rows all on same year         →  "YTD <year>"
 *   "YTD Total" with mixed/no sibling years                →  "YTD Total"
 *   monthly labels ("Jan-26", "Feb 2026") are passed through untouched
 *   quarterly labels ("Q1 2026") are passed through untouched
 *
 * Dedup runs per (statementType, periodType) bucket. Within each bucket,
 * rows that normalise to the same key are merged: line-item values from
 * the row with higher `confidence` win, ties go to the row with more
 * non-null fields, then to the first occurrence.
 *
 * Edge cases handled:
 *   - "FY26 Est." vs "FY26 Est" vs "2026 FY Est"
 *   - "YTD 2026" / "2026 YTD" / "YTD Total" / "YTD Total (Jan-Apr 20, 2026)"
 *   - Whitespace and trailing-punctuation variants
 *   - Case differences ("ytd 2026" vs "YTD 2026")
 *   - Bare "YTD Total" inferred from sibling-row years (when unambiguous)
 *
 * NOT canonicalised (intentionally — too many false positives):
 *   - "Q1 2026" vs "Q1-2026" vs "Q1'26" — preserved as-is. Mostly the LLM
 *     already emits one of these consistently per document.
 *   - "H1 2026" vs "1H 2026" vs "H1'26" — preserved as-is.
 *   - "Jan-26" vs "Jan 2026" vs "January 2026" — preserved as-is.
 *   - Rolling-period labels like "L3M", "LTM", "TTM" — preserved as-is.
 *   - Bare "YTD Total" with mixed-year siblings — left as-is to avoid
 *     cross-year false-merges.
 */
import { log } from '../utils/logger.js';
import type {
  ClassifiedStatement,
  FinancialPeriod,
  PeriodType,
  StatementType,
} from './financialClassifier.js';

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

  // 4a-bis. Year-first FY Est ordering — "<YEAR> FY Est" / "<YEAR> FY Est."
  //         / "<YEAR> FY Estimate" / "<YEAR> FY Estimated"   →   "FY<YY> Est"
  //
  //   YEAR can be 4-digit (2026) or 2-digit (26).
  //   4-digit years are folded down to 2-digit so the output collapses with
  //   the canonical "FY26 Est" label (the existing form most LLM extractions
  //   already emit). Trailing "." was stripped in step 2 already, but we
  //   tolerate it here too in case a caller bypasses the prelude.
  const yearFirstFyEst = s.match(/^(\d{2,4})\s+FY\s+Est(?:imated?)?\.?$/i);
  if (yearFirstFyEst) {
    const yr = yearFirstFyEst[1];
    const yy = yr.length === 4 ? yr.slice(2) : yr;
    s = `FY${yy} Est`;
  }

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

// ─── inferYearFromSiblings ───────────────────────────────────

/**
 * Look at every period OTHER than `target` in the same bucket and decide
 * whether they unambiguously identify a single calendar year. If so, that
 * year is returned and the caller can rewrite a bare "YTD Total" label to
 * "YTD <year>" so the downstream merge collapses it.
 *
 * Returns `null` when:
 *   - There are no other siblings (no inference possible).
 *   - Sibling labels reference a mix of distinct years (ambiguous — could
 *     be a multi-year statement, do not collapse).
 *   - No sibling label exposes any 4-digit or 2-digit year.
 *
 * Year hunting:
 *   - Scans the raw `period` string of each sibling for tokens that look
 *     like a year. We accept 4-digit (2024-2099) and 2-digit (00-99) forms.
 *   - 2-digit years are folded to a 4-digit equivalent (`26` → `2026`)
 *     using a 20XX assumption — the same convention used elsewhere in the
 *     codebase. This is intentional: financial spreadsheets rarely span
 *     before 1999 or after 2099 in practice.
 *   - All distinct years across all siblings are collected. If the set has
 *     exactly one element, that's the inferred year.
 */
export function inferYearFromSiblings(
  periods: FinancialPeriod[],
  target: FinancialPeriod,
): number | null {
  const years = new Set<number>();
  for (const p of periods) {
    if (p === target) continue;
    const label = String(p.period ?? '');
    if (!label) continue;
    // Match 4-digit years first (2024-2099 range).
    const fourDigit = label.match(/\b(20\d{2})\b/g);
    if (fourDigit) {
      for (const y of fourDigit) years.add(parseInt(y, 10));
    }
    // Then 2-digit years embedded in tokens like "FY26", "Jan-26", "26 YTD".
    // Avoid double-counting when a 4-digit year has already been pulled out
    // (e.g. "2026 YTD" should not contribute year 20 from the leading "20").
    const stripped = label.replace(/\b20\d{2}\b/g, '');
    const twoDigit = stripped.match(/(?:FY|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|YTD|H1|H2|Q[1-4])[\s\-']?(\d{2})\b/gi);
    if (twoDigit) {
      for (const m of twoDigit) {
        const yyMatch = m.match(/(\d{2})$/);
        if (!yyMatch) continue;
        const yy = parseInt(yyMatch[1], 10);
        years.add(2000 + yy);
      }
    }
    // Also pick up trailing "<year> YTD" / "<year> FY" forms (already
    // covered by 4-digit branch above, but 2-digit could appear like
    // "26 YTD" as a sibling). The regex above handles those too.
  }
  if (years.size === 1) {
    const [only] = Array.from(years);
    return only;
  }
  return null;
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
 * Pre-pass:
 *   - Bare "YTD Total" labels (no year) are rewritten to "YTD <year>" when
 *     all sibling rows in the same bucket reference one and only one year.
 *     See `inferYearFromSiblings`.
 *
 * The function operates on a single bucket. Callers should bucket inputs
 * by (statementType, periodType) before calling — see `dedupeStatement`.
 */
export function dedupePeriods(periods: FinancialPeriod[]): FinancialPeriod[] {
  if (periods.length <= 1) return periods;

  // ─── Pre-pass: infer year for bare "YTD Total" rows ───────────
  //
  // We need a copy of the bucket so the pre-pass is non-destructive on the
  // input; downstream we work on this rewritten array.
  const prepass: FinancialPeriod[] = periods.map(p => ({ ...p }));
  for (const p of prepass) {
    const norm = normalizePeriodLabel(p.period);
    if (norm.toLowerCase() !== 'ytd total') continue;
    const inferred = inferYearFromSiblings(prepass, p);
    if (inferred == null) continue;
    const newLabel = `YTD ${inferred}`;
    log.info(
      `Period dedup: inferred year for 'YTD Total' from siblings → '${newLabel}'`,
    );
    p.period = newLabel;
  }

  // ─── Main pass: collide on normalised label ──────────────────
  //
  // Group by case-insensitive normalised label. We also track every label
  // that fell into each bucket so we can emit a per-merge log line that
  // names the originals the user might recognise from their CIM.
  const byKey = new Map<string, FinancialPeriod>();
  const firstLabel = new Map<string, string>();
  const originals = new Map<string, string[]>();

  for (const p of prepass) {
    const norm = normalizePeriodLabel(p.period);
    const key = norm.toLowerCase();
    if (!key) continue;

    const seen = originals.get(key) ?? [];
    seen.push(p.period);
    originals.set(key, seen);

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

  // ─── Post-pass: per-merge log lines ──────────────────────────
  for (const [key, labels] of originals.entries()) {
    if (labels.length <= 1) continue;
    const canonical = firstLabel.get(key) ?? key;
    const distinct = Array.from(new Set(labels.map(l => `'${l}'`)));
    log.info(
      `Period dedup: merged ${distinct.join(' + ')} into '${canonical}' ` +
        `(${labels.length} → 1, kept highest-confidence values)`,
    );
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

// ─── Statement-level dedup (merges same statementType siblings) ────────────

/**
 * Collapse multiple `ClassifiedStatement` entries of the same `statementType`
 * into one merged statement. The classifier sometimes emits a separate
 * statement object per source section (e.g. one `BALANCE_SHEET` for working
 * capital, another for AR/AP, another for fixed assets). Each section may
 * carry overlapping period labels (e.g. all four reference "2026-03-31").
 *
 * If we hand that raw list to the upserter, every period whose
 * `(dealId, statementType, period, documentId)` key collides with a sibling
 * statement's period will overwrite the previously-stored row's `lineItems`
 * column wholesale — we end up with N upserts mapping to the same DB row, so
 * only the LAST-iterated section's keys survive. Bug observed in production
 * (LangSmith trace 2026-05-07 11:16:10): four BALANCE_SHEET sections all
 * referencing "2026-03-31" upserted to the same UUID; the final row only
 * carried `other_current_liabilities` because the deferred-revenue section
 * was processed last.
 *
 * Strategy:
 *   1. Bucket statements by `statementType`.
 *   2. Within a bucket, concatenate all `periods` arrays.
 *   3. Run the existing per-period dedup (`dedupeStatementPeriods`) which
 *      already knows how to merge two `FinancialPeriod` values whose labels
 *      collide — line-item KEYS from each side are unioned, with higher-
 *      confidence values winning per key. That's exactly the behaviour we
 *      want when two sibling statements describe different facets of the
 *      same period.
 *   4. Merge `unitScale` / `currency` from the first occurrence — these are
 *      already deterministic per file (the LLM doesn't switch units mid-
 *      document) so first-wins is fine.
 *
 * Logs a per-merge info line when a `statementType` had >1 source statement.
 */
export function mergeStatementsBySameType(
  statements: ClassifiedStatement[],
): ClassifiedStatement[] {
  if (statements.length <= 1) return statements;

  const byType = new Map<StatementType, ClassifiedStatement[]>();
  for (const s of statements) {
    const arr = byType.get(s.statementType) ?? [];
    arr.push(s);
    byType.set(s.statementType, arr);
  }

  const merged: ClassifiedStatement[] = [];
  for (const [statementType, group] of byType.entries()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Multiple statements of the same type — concatenate periods then dedup.
    const allPeriods: FinancialPeriod[] = [];
    for (const s of group) {
      for (const p of s.periods) allPeriods.push(p);
    }
    const dedupedPeriods = dedupeStatementPeriods(statementType, allPeriods);

    log.info(
      `Statement merge: ${group.length} ${statementType} statements → 1 ` +
        `(${allPeriods.length} input periods → ${dedupedPeriods.length} after dedup)`,
      {
        statementType,
        sourceCount: group.length,
        inputPeriods: allPeriods.length,
        outputPeriods: dedupedPeriods.length,
      },
    );

    // First-wins for unitScale/currency — see header comment.
    merged.push({
      statementType,
      unitScale: group[0].unitScale,
      currency: group[0].currency,
      periods: dedupedPeriods,
    });
  }

  return merged;
}
