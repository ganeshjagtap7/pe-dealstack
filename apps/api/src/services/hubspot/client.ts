import type { HubSpotRecord, HubSpotObjectType } from './types.js';
import { log } from '../../utils/logger.js';

const BASE = 'https://api.hubapi.com';
const MAX_RETRIES = 5;

const PROPERTIES: Record<HubSpotObjectType, string[]> = {
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

  async listPage(
    object: HubSpotObjectType,
    opts: { limit?: number; after?: string },
  ): Promise<ListPage> {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 100) });
    params.set('properties', PROPERTIES[object].join(','));
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
