import { supabase } from '../../supabase.js';

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** Returns a copy of `existing` with only its blank fields filled from `incoming`. */
export function mergeBlankOnly<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>): T {
  const out: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (isBlank(v)) continue;            // never overwrite with a blank incoming value
    if (isBlank(out[k])) out[k] = v;     // fill only when existing is blank
  }
  return out as T;
}

export type UpsertResult = 'created' | 'updated';

/**
 * Upsert a mapped row into `table`, scoped to org.
 * Match priority: hubspotId, then a natural key column (`matchColumn`).
 * `row` must include hubspotProperties; organizationId + hubspotId are applied here.
 */
export async function upsertByHubspotId(
  table: 'Company' | 'Contact' | 'Deal',
  orgId: string,
  hubspotId: string,
  row: Record<string, unknown>,
  match?: { column: string; value: string | null },
): Promise<UpsertResult> {
  // 1. Match by hubspotId first.
  let { data: existing } = await supabase
    .from(table).select('*')
    .eq('organizationId', orgId).eq('hubspotId', hubspotId).maybeSingle();

  // 2. Fall back to natural key (case-insensitive) when provided.
  if (!existing && match?.value) {
    const res = await supabase
      .from(table).select('*')
      .eq('organizationId', orgId).ilike(match.column, match.value).maybeSingle();
    existing = res.data ?? null;
  }

  if (existing) {
    const merged = mergeBlankOnly(existing as Record<string, unknown>, row);
    merged.hubspotId = hubspotId;
    merged.hubspotProperties = row.hubspotProperties;
    await supabase.from(table).update(merged).eq('id', (existing as { id: string }).id);
    return 'updated';
  }

  await supabase.from(table).insert({ ...row, organizationId: orgId, hubspotId });
  return 'created';
}
