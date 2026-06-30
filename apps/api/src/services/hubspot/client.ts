import type { HubSpotRecord, HubSpotObjectType } from './types.js';
import { log } from '../../utils/logger.js';

const BASE = 'https://api.hubapi.com';
const MAX_RETRIES = 5;

export const MAX_PROPERTIES = 250;

export const STANDARD_PROPERTIES: Record<HubSpotObjectType, string[]> = {
  companies: ['name', 'industry', 'domain', 'description'],
  contacts: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'associatedcompanyid'],
  deals: ['dealname', 'amount', 'dealstage', 'pipeline', 'description'],
};

export interface ListPage {
  results: HubSpotRecord[];
  nextCursor: string | null;
}

export class HubSpotClient {
  constructor(private token: string) {}

  private async requestWithBackoff(url: string): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      });
      if (res.status !== 429) return res as unknown as Response;
      const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
      const waitMs = Math.max(0, retryAfter) * 1000 || 2 ** attempt * 250;
      log.warn(`[hubspot] 429 rate-limited, retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    throw new Error('HubSpot rate limit: exceeded max retries');
  }

  async validateToken(): Promise<boolean> {
    const res = await this.requestWithBackoff(`${BASE}/crm/v3/objects/companies?limit=1`);
    return res.ok;
  }

  async listPropertyNames(object: HubSpotObjectType): Promise<string[]> {
    const res = await this.requestWithBackoff(`${BASE}/crm/v3/properties/${object}`);
    if (!res.ok) {
      log.warn(`[hubspot] property discovery failed for ${object}: ${res.status}`);
      return [...STANDARD_PROPERTIES[object]];
    }
    const data = (await res.json()) as { results?: Array<{ name: string; hubspotDefined?: boolean }> };
    const std = new Set(STANDARD_PROPERTIES[object]);
    const kept = (data.results ?? []).filter((p) => p.hubspotDefined === false || std.has(p.name)).map((p) => p.name);
    for (const s of STANDARD_PROPERTIES[object]) if (!kept.includes(s)) kept.push(s);
    if (kept.length > MAX_PROPERTIES) {
      const custom = kept.filter((n) => !std.has(n));
      const standard = kept.filter((n) => std.has(n));
      const ordered = [...custom, ...standard];
      const capped = ordered.slice(0, MAX_PROPERTIES);
      const dropped = ordered.slice(MAX_PROPERTIES);
      log.warn(`[hubspot] ${object} has ${kept.length} kept properties; capping at ${MAX_PROPERTIES}. Dropped: ${dropped.join(', ')}`);
      return capped;
    }
    return kept;
  }

  async listPage(
    object: HubSpotObjectType,
    opts: { limit?: number; after?: string; properties?: string[] },
  ): Promise<ListPage> {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 100) });
    const props = opts.properties && opts.properties.length ? opts.properties : STANDARD_PROPERTIES[object];
    params.set('properties', props.join(','));
    if (object === 'deals') params.set('associations', 'companies');
    if (opts.after) params.set('after', opts.after);
    const res = await this.requestWithBackoff(`${BASE}/crm/v3/objects/${object}?${params.toString()}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HubSpot ${object} list failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { results?: HubSpotRecord[]; paging?: { next?: { after?: string } } };
    return {
      results: data.results ?? [],
      nextCursor: data.paging?.next?.after ?? null,
    };
  }
}
