import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubSpotClient } from '../src/services/hubspot/client.js';

const mkRes = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('HubSpotClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('validateToken returns true on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(200, { total: 3 })));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toBe(true);
  });

  it('validateToken returns false on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mkRes(401, { message: 'bad' })));
    const c = new HubSpotClient('tok');
    expect(await c.validateToken()).toBe(false);
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
