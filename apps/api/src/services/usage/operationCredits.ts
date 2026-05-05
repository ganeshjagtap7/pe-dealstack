import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: Map<string, number> | null = null;
let cacheLoadedAt = 0;

async function loadCache(): Promise<void> {
  const { data, error } = await supabase.from('OperationCredits').select('operation, credits');
  if (error) {
    log.error('operationCredits: failed to load', error);
    return;
  }
  cache = new Map();
  for (const row of data ?? []) {
    cache.set(row.operation, Number(row.credits));
  }
  cacheLoadedAt = Date.now();
}

export async function getCreditsForOperation(operation: string): Promise<number> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
  const credits = cache?.get(operation);
  if (credits == null) {
    log.warn('operationCredits: unknown operation, defaulting to 1', { operation });
    return 1;
  }
  return credits;
}

export function _resetOperationCreditsCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
