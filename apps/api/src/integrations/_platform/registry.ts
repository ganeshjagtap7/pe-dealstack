import type { IntegrationProvider, ProviderId } from './types.js';

// Pin the registry on globalThis so it survives vitest's vi.resetModules()
// (which re-evaluates modules and otherwise creates fresh in-memory state).
const REGISTRY_KEY = Symbol.for('aicrm.integrations.providerRegistry');
type GlobalWithRegistry = typeof globalThis & {
  [REGISTRY_KEY]?: Map<ProviderId, IntegrationProvider>;
};
const g = globalThis as GlobalWithRegistry;
const providers: Map<ProviderId, IntegrationProvider> =
  g[REGISTRY_KEY] ?? (g[REGISTRY_KEY] = new Map<ProviderId, IntegrationProvider>());

export function registerProvider(provider: IntegrationProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: ProviderId): IntegrationProvider {
  const p = providers.get(id);
  if (!p) throw new Error(`Provider not registered: ${id}`);
  return p;
}

export function listProviders(): IntegrationProvider[] {
  return Array.from(providers.values());
}

export function isProviderRegistered(id: ProviderId): boolean {
  return providers.has(id);
}

export function _resetRegistryForTests(): void {
  providers.clear();
}
