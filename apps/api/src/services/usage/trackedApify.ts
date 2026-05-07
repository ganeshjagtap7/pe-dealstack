import { recordUsageEvent } from './trackedLLM.js';

const APIFY_PRICE_PER_SEARCH_USD = Number(process.env.APIFY_PRICE_PER_SEARCH_USD ?? 0.005);
const APIFY_PRICE_PER_LINKEDIN_PROFILE_USD = Number(
  process.env.APIFY_PRICE_PER_LINKEDIN_PROFILE_USD ?? 0.02,
);

/**
 * Wrap an Apify Actor call so a UsageEvent is recorded with the per-unit
 * cost. `units` is whatever the call charges per — searches, profiles, etc.
 * `unitPriceUsd` is the env-driven price per unit.
 */
export async function trackedApifyCall<T>(
  operation: string,
  units: number,
  unitPriceUsd: number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await recordUsageEvent({
      operation,
      provider: 'apify',
      units,
      unitCostUsd: units * unitPriceUsd,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    await recordUsageEvent({
      operation,
      provider: 'apify',
      units,
      unitCostUsd: 0,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

export const APIFY_PRICES = {
  searchUsd: APIFY_PRICE_PER_SEARCH_USD,
  linkedInProfileUsd: APIFY_PRICE_PER_LINKEDIN_PROFILE_USD,
};
