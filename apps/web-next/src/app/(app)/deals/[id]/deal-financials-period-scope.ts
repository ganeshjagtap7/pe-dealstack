// ---------------------------------------------------------------------------
// Period-scope inference for the Financial Analysis charts
// ---------------------------------------------------------------------------
//
// `FinancialStatement.periodType` (server) only captures ACTUAL / PROJECTED —
// it does NOT distinguish Annual / Quarterly / Monthly / YTD-cumulative /
// MTD-single / FY-Estimate scopes. Those distinctions live entirely in the
// period-label string (e.g. "2026 YTD", "Apr-26 MTD", "Feb-26", "FY26 Est").
//
// Mixing scopes on a single growth chart and computing pairwise deltas is
// mathematically meaningless (e.g. cumulative-YTD vs single-month MTD =
// +14079%). This module classifies labels into scope buckets and groups
// periods so growth deltas only compare like-for-like.

import type { FinancialStatement } from "./deal-financials-charts";

export type PeriodScope =
  | "annual"
  | "estimate"
  | "ltm"
  | "ytd"
  | "quarterly"
  | "mtd"
  | "monthly"
  | "other";

export const PERIOD_SCOPE_LABEL: Record<PeriodScope, string> = {
  annual: "Annual",
  estimate: "FY Estimate",
  ltm: "LTM / TTM",
  ytd: "YTD (cumulative)",
  quarterly: "Quarterly",
  mtd: "MTD (single month)",
  monthly: "Monthly",
  other: "Other",
};

/**
 * Classify a period label into one of our scope buckets. Order of checks
 * matters — more specific tokens (YTD, MTD, EST, LTM) are checked before the
 * generic month/quarter shape match.
 *
 * Guards: missing/empty labels fall through to `"other"` so they end up in
 * their own group rather than corrupting another.
 */
export function inferPeriodScope(period: string | null | undefined): PeriodScope {
  if (!period) return "other";
  const p = period.trim();
  if (!p) return "other";
  const upper = p.toUpperCase();

  // YTD cumulative: "2026 YTD", "YTD 2026", "YTD Total", "YTD Total (Jan-Apr 20, 2026)"
  if (/\bYTD\b/.test(upper)) return "ytd";
  // MTD single month: "Apr-26 MTD", "MTD"
  if (/\bMTD\b/.test(upper)) return "mtd";
  // LTM / TTM
  if (/\bLTM\b/.test(upper) || /\bTTM\b/.test(upper)) return "ltm";
  // FY Estimate / Forecast / Budget / Projected — "FY26 Est", "FY26 Est."
  if (/\b(EST|ESTIMATE|FORECAST|BUDGET|PROJ|PROJECTED)\b/.test(upper)) return "estimate";
  // Annual: bare "2025", "FY2025", "FY25" (no other qualifiers)
  if (/^FY\s?\d{2,4}$/.test(upper) || /^\d{4}$/.test(p)) return "annual";
  // Quarterly: "Q1 2025", "Q4-24", "1Q25"
  if (/\bQ[1-4]\b/.test(upper) || /^[1-4]Q\d{2,4}$/.test(upper)) return "quarterly";
  // Monthly single-month: "Jan-25", "Feb 2026", "Mar-26", "March 2026"
  const monthRe =
    /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b/;
  if (monthRe.test(upper)) return "monthly";

  return "other";
}

/**
 * Group rows by inferred scope, preserving the original date order within each
 * group (caller is expected to have sorted `rows` already). Returns groups in
 * a stable display order (long-horizon scopes first, then drilldowns) so the
 * rendered X-axis reads naturally. Each group is yielded only if non-empty.
 */
export function groupRowsByScope(
  rows: FinancialStatement[],
): { scope: PeriodScope; rows: FinancialStatement[] }[] {
  const buckets = new Map<PeriodScope, FinancialStatement[]>();
  for (const r of rows) {
    const scope = inferPeriodScope(r.period);
    const arr = buckets.get(scope) ?? [];
    arr.push(r);
    buckets.set(scope, arr);
  }
  const order: PeriodScope[] = [
    "annual",
    "estimate",
    "ltm",
    "ytd",
    "quarterly",
    "monthly",
    "mtd",
    "other",
  ];
  return order
    .filter((s) => buckets.has(s))
    .map((scope) => ({ scope, rows: buckets.get(scope)! }));
}
