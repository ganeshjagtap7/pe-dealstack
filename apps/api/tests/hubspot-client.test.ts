import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubSpotClient, MAX_PROPERTIES } from '../src/services/hubspot/client.js';

const mkRes = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('HubSpotClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('validateToken returns ok with status on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(200, { total: 3 })));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toEqual({ ok: true, status: 200, category: null });
  });

  it('validateToken surfaces status and category on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(401, { status: 'error', message: 'bad', category: 'INVALID_AUTHENTICATION' })));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toEqual({ ok: false, status: 401, category: 'INVALID_AUTHENTICATION' });
  });

  it('validateToken surfaces MISSING_SCOPES on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(403, { status: 'error', message: 'no scopes', category: 'MISSING_SCOPES' })));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toEqual({ ok: false, status: 403, category: 'MISSING_SCOPES' });
  });

  it('validateToken tolerates a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      headers: { get: () => null },
      json: async () => { throw new Error('not json'); },
      text: async () => 'Internal Server Error',
    }));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toEqual({ ok: false, status: 500, category: null });
  });

  it('listPage returns results and next cursor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mkRes(200, { results: [{ id: '1', properties: {} }], paging: { next: { after: '20' } } }),
    ));
    const c = new HubSpotClient('tok');
    const page = await c.listPage('companies', { limit: 20 });
    expect(page.results).toHaveLength(1);
    expect(page.nextCursor).toBe('20');
  });

  it('retries once after a 429 with Retry-After, then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mkRes(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(mkRes(200, { results: [], paging: undefined }));
    vi.stubGlobal('fetch', fetchMock);
    const c = new HubSpotClient('tok');
    const page = await c.listPage('contacts', { limit: 20 });
    expect(page.results).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HubSpotClient.listPropertyNames', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps custom (hubspotDefined=false) + standard, drops system hs_* / hubspotDefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(200, { results: [
      { name: 'name', hubspotDefined: true },
      { name: 'fund_vintage', hubspotDefined: false },
      { name: 'sector_focus', hubspotDefined: false },
      { name: 'hs_object_id', hubspotDefined: true },
      { name: 'hubspot_owner_id', hubspotDefined: true },
    ] })));
    const names = await new HubSpotClient('tok').listPropertyNames('companies');
    expect(names).toContain('fund_vintage');
    expect(names).toContain('sector_focus');
    expect(names).toContain('name');
    expect(names).not.toContain('hs_object_id');
    expect(names).not.toContain('hubspot_owner_id');
  });

  it('falls back to the standard set when discovery fails (non-200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(403, { message: 'no scope' })));
    const names = await new HubSpotClient('tok').listPropertyNames('deals');
    expect(names).toEqual(expect.arrayContaining(['dealname', 'amount']));
  });

  it('caps the list at MAX_PROPERTIES (custom prioritized) without throwing', async () => {
    const many = Array.from({ length: MAX_PROPERTIES + 50 }, (_, i) => ({ name: `custom_${i}`, hubspotDefined: false }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(200, { results: many })));
    const names = await new HubSpotClient('tok').listPropertyNames('contacts');
    expect(names.length).toBe(MAX_PROPERTIES);
  });
});

describe('HubSpotClient.listPage properties override', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('sends the supplied properties list in the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mkRes(200, { results: [], paging: undefined }));
    vi.stubGlobal('fetch', fetchMock);
    await new HubSpotClient('tok').listPage('companies', { limit: 20, properties: ['name', 'fund_vintage'] });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('properties=name%2Cfund_vintage');
  });
  it('falls back to the standard list when no properties supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mkRes(200, { results: [], paging: undefined }));
    vi.stubGlobal('fetch', fetchMock);
    await new HubSpotClient('tok').listPage('companies', { limit: 20 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('properties=name');
  });
});
