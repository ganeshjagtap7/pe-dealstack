import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

export interface ModelPriceRow {
  inputPricePer1M: number;
  outputPricePer1M: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: Map<string, ModelPriceRow> | null = null;
let cacheLoadedAt = 0;
let loadingPromise: Promise<void> | null = null;

async function loadCache(): Promise<void> {
  const { data, error } = await supabase
    .from('ModelPrice')
    .select('model, provider, "inputPricePer1M", "outputPricePer1M"');

  if (error) {
    log.error('modelPrices: failed to load', error);
    return;
  }
  cache = new Map();
  for (const row of data ?? []) {
    cache.set(row.model, {
      inputPricePer1M: Number(row.inputPricePer1M),
      outputPricePer1M: Number(row.outputPricePer1M),
    });
  }
  cacheLoadedAt = Date.now();
}

export async function getModelPrice(model: string): Promise<ModelPriceRow | null> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    if (!loadingPromise) {
      loadingPromise = loadCache().finally(() => { loadingPromise = null; });
    }
    await loadingPromise;
  }
  return cache?.get(model) ?? null;
}

export function computeCostUsd(
  price: ModelPriceRow | null,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!price) return 0;
  return (
    (promptTokens / 1_000_000) * price.inputPricePer1M +
    (completionTokens / 1_000_000) * price.outputPricePer1M
  );
}

/** Test-only: reset the in-memory cache so tests don't leak state. */
export function _resetModelPriceCache(): void {
  cache = null;
  cacheLoadedAt = 0;
  loadingPromise = null;
}
