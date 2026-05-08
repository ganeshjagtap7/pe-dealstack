/**
 * Backfill Deal.cached* columns for every existing deal.
 *
 * Phase 2 of the unitScale fix. The deal-cache-migration.sql adds
 * cachedRevenue / cachedEbitda / cachedEbitdaMargin / cachedPeriod /
 * cachedCurrency / cachedAt to the Deal table. The live extraction
 * pipeline (runDeepPass) refreshes them on every upsert, but existing
 * deals whose financials were extracted before this change went out
 * still have NULLs. This script walks every Deal in every org, pulls
 * the latest active INCOME_STATEMENT, and writes the canonical cache.
 *
 * Idempotent — safe to re-run. Each deal's cache is overwritten with
 * the freshly-computed value, so running this twice yields the same
 * end state. (It's a derived view; we never read the previous cache
 * value to make decisions.)
 *
 * Usage:
 *   npx tsx scripts/backfill-deal-cache.ts
 *
 *   # Optional: only backfill deals missing a cache (faster on
 *   # already-populated DBs).
 *   npx tsx scripts/backfill-deal-cache.ts --only-missing
 *
 *   # Optional: limit to one organization (for staged rollouts).
 *   npx tsx scripts/backfill-deal-cache.ts --org=<orgId>
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (mirrors
 * the live API process). Bypasses RLS via the service role key.
 */

import { supabase } from '../src/supabase.js';
import { refreshDealCache } from '../src/services/dealCacheWriteback.js';

interface DealRow {
  id: string;
  organizationId: string | null;
  name: string | null;
  cachedAt: string | null;
}

function parseArgs(argv: string[]): { onlyMissing: boolean; orgId: string | null } {
  let onlyMissing = false;
  let orgId: string | null = null;
  for (const arg of argv) {
    if (arg === '--only-missing') onlyMissing = true;
    else if (arg.startsWith('--org=')) orgId = arg.slice('--org='.length);
  }
  return { onlyMissing, orgId };
}

async function main(): Promise<void> {
  const { onlyMissing, orgId } = parseArgs(process.argv.slice(2));

  console.log('[backfill-deal-cache] starting');
  if (onlyMissing) console.log('[backfill-deal-cache] --only-missing: skipping deals with cachedAt set');
  if (orgId) console.log(`[backfill-deal-cache] --org=${orgId}: scoped to one org`);

  let query = supabase
    .from('Deal')
    .select('id, organizationId, name, cachedAt');

  if (orgId) query = query.eq('organizationId', orgId);
  if (onlyMissing) query = query.is('cachedAt', null);

  const { data: deals, error } = await query;
  if (error) {
    console.error('[backfill-deal-cache] failed to list deals', error);
    process.exit(1);
  }

  const list = (deals ?? []) as DealRow[];
  console.log(`[backfill-deal-cache] found ${list.length} deal(s) to process`);

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();

  for (const deal of list) {
    try {
      const record = await refreshDealCache(deal.id, nowIso);
      if (record === null) {
        // refreshDealCache caught an error internally and logged it.
        failed++;
      } else if (record.cachedRevenue == null && record.cachedEbitda == null) {
        // No income statement → cache cleared. Count as "skipped" so the
        // success number reflects deals that ended up with real data.
        skipped++;
      } else {
        refreshed++;
      }
    } catch (err) {
      console.error(`[backfill-deal-cache] deal ${deal.id} (${deal.name ?? '?'}) threw`, err);
      failed++;
    }
  }

  console.log(
    `[backfill-deal-cache] done: refreshed=${refreshed} skipped=${skipped} failed=${failed}`,
  );

  // Non-zero exit when anything errored so CI-style invocations don't
  // silently pass on partial failure.
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error('[backfill-deal-cache] unhandled error', err);
  process.exit(1);
});
