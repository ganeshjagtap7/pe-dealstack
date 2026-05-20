/**
 * financialFormat.ts — Backend shared currency/scale formatter.
 *
 * Single source of truth for rendering stored financial values when the
 * server needs to embed them in LLM prompts (deal chat, memo chat, agent
 * tools, etc.). Keeps the backend in lock-step with the frontend's
 * `formatFinancialValue` / `formatCurrency` in apps/web-next/src/lib/formatters.ts.
 *
 * Why it lives here:
 *   - Multiple chat/memo routes were hardcoding "$X M" suffixes on values
 *     that were NOT necessarily in millions. The LLM then echoed that
 *     wrong unit back to the user.
 *   - `Deal.cachedRevenue/cachedEbitda` are guaranteed to be ACTUAL
 *     DOLLARS by dealCacheWriteback.ts — formatting them via this helper
 *     auto-picks B/M/K based on magnitude, so a $6,900 deal renders as
 *     "$6.9K" instead of "$6,900M".
 *   - `Deal.revenue/Deal.ebitda/Deal.dealSize` are legacy fields with
 *     undeclared scale. The agreed convention in this codebase is
 *     MILLIONS (see apps/web-next/src/lib/formatters.ts:317-326), but
 *     mis-extractions sometimes wrote ACTUALS into these columns. We
 *     deliberately use the cached fields when present and fall back to
 *     legacy-as-MILLIONS only when no cache exists.
 *
 * Currency support mirrors `formatFinancialValue` — USD/EUR/GBP/etc use
 * B/M/K; INR uses Cr/L.
 */

export type UnitScale = 'MILLIONS' | 'THOUSANDS' | 'ACTUALS' | 'BILLIONS';

/** ISO 4217 → display symbol. Port of frontend CURRENCY_SYMBOLS. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
  CAD: 'C$', AUD: 'A$', CHF: 'CHF ', SGD: 'S$', HKD: 'HK$',
  AED: 'AED ', SAR: 'SAR ', BRL: 'R$', KRW: '₩', ZAR: 'R',
  MXN: 'MX$', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł',
  THB: '฿', MYR: 'RM', IDR: 'Rp', PHP: '₱', VND: '₫',
};

const UNIT_SCALE_MULTIPLIER: Record<UnitScale, number> = {
  ACTUALS: 1,
  THOUSANDS: 1_000,
  MILLIONS: 1_000_000,
  BILLIONS: 1_000_000_000,
};

const EM_DASH = '—';

/** Lookup a currency symbol, falling back to the bare code + space. */
export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return '$';
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase() + ' ';
}

/**
 * Convert a stored value at the given `unitScale` to actual dollars.
 * Returns null for null/undefined/non-finite input so callers can pass
 * downstream without re-checking.
 */
export function toActualDollars(
  value: number | null | undefined,
  unitScale?: UnitScale | string | null,
): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = (unitScale ?? 'ACTUALS') as UnitScale;
  return n * (UNIT_SCALE_MULTIPLIER[scale] ?? 1);
}

/**
 * Render a stored financial value at the most-appropriate magnitude,
 * given its `unitScale` and `currency`. Mirrors the frontend
 * `formatFinancialValue` so prompt-embedded numbers match what the user
 * sees in the UI.
 *
 *   formatFinancialValue(0.0067, 'MILLIONS')   -> '$6.7K'
 *   formatFinancialValue(6700,   'ACTUALS')    -> '$6.7K'
 *   formatFinancialValue(53.7,   'THOUSANDS')  -> '$53.7K'
 *   formatFinancialValue(1.5,    'BILLIONS')   -> '$1.5B'
 *   formatFinancialValue(null)                 -> '—'
 *
 * For INR, B/M/K become Cr/L per the local convention.
 */
export function formatFinancialValue(
  value: number | null | undefined,
  unitScale?: UnitScale | string | null,
  options?: { currency?: string | null; precision?: number },
): string {
  if (value === null || value === undefined) return EM_DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return EM_DASH;

  const scale = (unitScale ?? 'ACTUALS') as UnitScale;
  const mult = UNIT_SCALE_MULTIPLIER[scale] ?? 1;
  const actual = n * mult;
  const sign = actual < 0 ? '-' : '';
  const absActual = Math.abs(actual);

  const sym = getCurrencySymbol(options?.currency);
  const code = (options?.currency || 'USD').toUpperCase();
  const p = options?.precision ?? 1;

  if (code === 'INR') {
    if (absActual >= 10_000_000) return sign + sym + (absActual / 10_000_000).toFixed(p) + 'Cr';
    if (absActual >= 100_000)    return sign + sym + (absActual / 100_000).toFixed(p) + 'L';
    if (absActual >= 1_000)      return sign + sym + (absActual / 1_000).toFixed(p) + 'K';
    return sign + sym + absActual.toLocaleString('en-IN', { maximumFractionDigits: options?.precision ?? 0 });
  }

  if (absActual >= 1_000_000_000) return sign + sym + (absActual / 1_000_000_000).toFixed(p) + 'B';
  if (absActual >= 1_000_000)     return sign + sym + (absActual / 1_000_000).toFixed(p) + 'M';
  if (absActual >= 1_000)         return sign + sym + (absActual / 1_000).toFixed(p) + 'K';
  return sign + sym + absActual.toLocaleString('en-US', { maximumFractionDigits: options?.precision ?? 0 });
}

/**
 * Pick the canonical revenue/EBITDA/dealSize for an LLM context block.
 * Prefers `cachedRevenue/cachedEbitda` (guaranteed ACTUALS by
 * dealCacheWriteback) over the legacy `revenue/ebitda` columns. When the
 * cache is empty, falls back to legacy with `unitScale: 'MILLIONS'`
 * (the established convention for those fields).
 *
 * Returns formatted strings ready to drop into a prompt — never raw
 * numbers + hardcoded "M".
 */
export interface DealHeadlineFields {
  revenue?: number | null;
  ebitda?: number | null;
  dealSize?: number | null;
  currency?: string | null;
  cachedRevenue?: number | null;
  cachedEbitda?: number | null;
  cachedEbitdaMargin?: number | null;
  cachedCurrency?: string | null;
  cachedPeriod?: string | null;
}

export interface FormattedHeadline {
  revenue: string | null;
  ebitda: string | null;
  dealSize: string | null;
  ebitdaMargin: string | null;
  /** Which source populated revenue/EBITDA — useful for prompt provenance. */
  source: 'cached' | 'legacy' | 'none';
  cachedPeriod: string | null;
}

export function formatDealHeadline(deal: DealHeadlineFields | null | undefined): FormattedHeadline {
  if (!deal) {
    return { revenue: null, ebitda: null, dealSize: null, ebitdaMargin: null, source: 'none', cachedPeriod: null };
  }

  const currency = deal.cachedCurrency ?? deal.currency ?? 'USD';

  const cacheHit =
    deal.cachedRevenue != null ||
    deal.cachedEbitda != null ||
    deal.cachedEbitdaMargin != null;

  // Deal-level `dealSize` is, by convention, MILLIONS — there is no cached
  // counterpart. Format separately so we don't pollute the cache/legacy split.
  const dealSize = deal.dealSize != null
    ? formatFinancialValue(deal.dealSize, 'MILLIONS', { currency })
    : null;

  if (cacheHit) {
    return {
      revenue: deal.cachedRevenue != null
        ? formatFinancialValue(deal.cachedRevenue, 'ACTUALS', { currency })
        : null,
      ebitda: deal.cachedEbitda != null
        ? formatFinancialValue(deal.cachedEbitda, 'ACTUALS', { currency })
        : null,
      dealSize,
      ebitdaMargin: deal.cachedEbitdaMargin != null
        ? deal.cachedEbitdaMargin.toFixed(1) + '%'
        : null,
      source: 'cached',
      cachedPeriod: deal.cachedPeriod ?? null,
    };
  }

  // Legacy fallback — these columns are MILLIONS by convention.
  if (deal.revenue != null || deal.ebitda != null) {
    return {
      revenue: deal.revenue != null
        ? formatFinancialValue(deal.revenue, 'MILLIONS', { currency })
        : null,
      ebitda: deal.ebitda != null
        ? formatFinancialValue(deal.ebitda, 'MILLIONS', { currency })
        : null,
      dealSize,
      ebitdaMargin: null,
      source: 'legacy',
      cachedPeriod: null,
    };
  }

  return {
    revenue: null,
    ebitda: null,
    dealSize,
    ebitdaMargin: null,
    source: 'none',
    cachedPeriod: null,
  };
}
