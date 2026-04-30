import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  vi.resetModules();
});

describe('syncEngine.syncIntegration', () => {
  it('returns success result and resets failures on a healthy sync', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn(() => ({ update, insert })) },
    }));

    const { _resetRegistryForTests, registerProvider } = await import(
      '../../src/integrations/_platform/registry.js'
    );
    _resetRegistryForTests();
    const sync = vi.fn().mockResolvedValue({ itemsSynced: 3, itemsMatched: 1, errors: [] });
    registerProvider({
      id: '_mock', displayName: 'M', scopes: [],
      initiateAuth: vi.fn(), handleCallback: vi.fn(), sync,
      handleWebhook: vi.fn(), disconnect: vi.fn(),
    } as any);

    const { syncIntegration } = await import('../../src/integrations/_platform/syncEngine.js');
    const integration = {
      id: 'int-1', provider: '_mock', status: 'connected', consecutiveFailures: 0,
    } as any;
    const result = await syncIntegration(integration);
    expect(result.itemsSynced).toBe(3);
    expect(sync).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('increments consecutiveFailures and emits notification at 3 failures', async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn(() => ({ update, insert })) },
    }));

    const { _resetRegistryForTests, registerProvider } = await import(
      '../../src/integrations/_platform/registry.js'
    );
    _resetRegistryForTests();
    const sync = vi.fn().mockRejectedValue(new Error('boom'));
    registerProvider({
      id: '_mock', displayName: 'M', scopes: [],
      initiateAuth: vi.fn(), handleCallback: vi.fn(), sync,
      handleWebhook: vi.fn(), disconnect: vi.fn(),
    } as any);

    const { syncIntegration } = await import('../../src/integrations/_platform/syncEngine.js');
    const integration = {
      id: 'int-1', provider: '_mock', status: 'connected',
      consecutiveFailures: 2, userId: 'u-1',
    } as any;
    await expect(syncIntegration(integration)).rejects.toThrow('boom');
    expect(insert).toHaveBeenCalled();  // 3rd failure inserts notification
  });
});
