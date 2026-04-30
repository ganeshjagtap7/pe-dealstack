import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetRegistryForTests, registerProvider } from '../../src/integrations/_platform/registry.js';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  vi.resetModules();
  _resetRegistryForTests();
});

describe('webhookRouter', () => {
  it('rejects unknown provider with PROVIDER_UNKNOWN', async () => {
    vi.doMock('../../src/supabase.js', () => ({ supabase: { from: vi.fn() } }));
    const { routeWebhook } = await import(
      '../../src/integrations/_platform/webhookRouter.js'
    );
    const result = await routeWebhook('not_a_provider' as any, {}, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROVIDER_UNKNOWN');
  });

  it('dispatches to registered provider.handleWebhook', async () => {
    vi.doMock('../../src/supabase.js', () => ({ supabase: { from: vi.fn() } }));
    const handleWebhook = vi.fn().mockResolvedValue(undefined);
    registerProvider({
      id: '_mock',
      displayName: 'M',
      scopes: [],
      initiateAuth: vi.fn(),
      handleCallback: vi.fn(),
      sync: vi.fn(),
      handleWebhook,
      disconnect: vi.fn(),
    } as any);
    const { routeWebhook } = await import(
      '../../src/integrations/_platform/webhookRouter.js'
    );
    const result = await routeWebhook('_mock', { sig: 'x' }, { type: 'ping' });
    expect(result.ok).toBe(true);
    expect(handleWebhook).toHaveBeenCalledWith({ sig: 'x' }, { type: 'ping' });
  });
});
