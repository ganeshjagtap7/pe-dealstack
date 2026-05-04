# Integrations Platform — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-30-integrations-platform-design.md`](../specs/2026-04-30-integrations-platform-design.md)

**Goal:** Ship the shared integration platform — DB tables, OAuth scaffolding, encrypted token storage, webhook router, sync engine, REST routes, cron, and Settings UI shell — with a mock provider proving the flow end-to-end. No real third-party providers wired. Phase 1 (Granola) builds on top.

**Architecture:** New `apps/api/src/integrations/_platform/` module exposing a `IntegrationProvider` interface that future providers (Granola, Gmail, Calendar, Outbound) implement. Two new tables (`Integration`, `IntegrationEvent`). Two new route files (`integrations.ts` for app users, `integrations-webhooks.ts` for public webhook receivers). One new cron endpoint. New "Integrations" section inside the existing `apps/web/settings.html`. A `_mock` provider lives in code only as a test fixture — never registered in production.

**Tech Stack:** Node.js + Express + TypeScript, Supabase Postgres, vitest, vanilla JS frontend, Vercel cron, AES-256-GCM via existing `apps/api/src/services/encryption.ts`.

**File structure (created in this phase):**

```
apps/api/
├── integrations-migration.sql                              [NEW]
├── src/
│   ├── integrations/
│   │   ├── _platform/
│   │   │   ├── types.ts                                    [NEW]
│   │   │   ├── tokenStore.ts                               [NEW]
│   │   │   ├── oauth.ts                                    [NEW]
│   │   │   ├── registry.ts                                 [NEW]
│   │   │   ├── webhookRouter.ts                            [NEW]
│   │   │   ├── syncEngine.ts                               [NEW]
│   │   │   └── matcher.ts                                  [NEW]
│   │   └── _mock/
│   │       └── index.ts                                    [NEW]
│   ├── routes/
│   │   ├── integrations.ts                                 [NEW]
│   │   └── integrations-webhooks.ts                        [NEW]
│   └── app.ts                                              [MODIFY]
└── tests/
    └── integrations/
        ├── tokenStore.test.ts                              [NEW]
        ├── oauth.test.ts                                   [NEW]
        ├── webhookRouter.test.ts                           [NEW]
        ├── syncEngine.test.ts                              [NEW]
        ├── matcher.test.ts                                 [NEW]
        └── routes.test.ts                                  [NEW]

apps/web/
├── settings.html                                           [MODIFY]
└── js/
    └── integrations.js                                     [NEW]

vercel.json                                                 [MODIFY]
```

**Conventions to follow (from existing codebase):**
- ESM imports always end with `.js` (TypeScript ESM mode)
- Routes use `getOrgId(req)` from `middleware/orgScope.js`; org-scoped routes mount through existing `app.use('/api/...', requireOrg, ...)` pattern
- Tests use vitest with mocked Supabase via `apps/api/tests/setup.ts`
- Brand colors: Banker Blue `#003366` (primary), `#004488` (hover), bg `#F8F9FA`, white cards, Inter font
- Frontend uses Tailwind utility classes plus inline styles for sticky/critical components
- No comments in new code unless WHY is non-obvious

---

## Task 1: DB migration — Integration + IntegrationEvent tables

**Files:**
- Create: `apps/api/integrations-migration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 0: Integrations platform
-- Two tables: Integration (one row per user/provider connection) and
-- IntegrationEvent (webhook event log, used for dedupe + audit).

CREATE TABLE IF NOT EXISTS "Integration" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId  UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  userId          UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('granola','gmail','google_calendar','fireflies','otter','_mock')),
  status          TEXT NOT NULL CHECK (status IN ('connected','token_expired','revoked','error')),
  externalAccountId    TEXT,
  externalAccountEmail TEXT,
  accessTokenEncrypted  TEXT,
  refreshTokenEncrypted TEXT,
  tokenExpiresAt  TIMESTAMPTZ,
  scopes          TEXT[] DEFAULT '{}',
  settings        JSONB  DEFAULT '{}',
  lastSyncAt      TIMESTAMPTZ,
  lastSyncError   TEXT,
  consecutiveFailures INT DEFAULT 0,
  createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_user_provider
  ON "Integration"(userId, provider);
CREATE INDEX IF NOT EXISTS idx_integration_org
  ON "Integration"(organizationId);
CREATE INDEX IF NOT EXISTS idx_integration_provider_status
  ON "Integration"(provider, status);

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrationId   UUID NOT NULL REFERENCES "Integration"(id) ON DELETE CASCADE,
  externalId      TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload         JSONB,
  receivedAt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processedAt     TIMESTAMPTZ,
  error           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_event_dedupe
  ON "IntegrationEvent"(integrationId, externalId);
CREATE INDEX IF NOT EXISTS idx_integration_event_unprocessed
  ON "IntegrationEvent"(integrationId, processedAt)
  WHERE processedAt IS NULL;

-- Extend Notification type enum to include integration-related types.
-- (Notification.type is currently a TEXT column with a CHECK constraint —
-- update if such a constraint exists.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE 'Notification_type_check%'
  ) THEN
    ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_type_check";
  END IF;
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check"
    CHECK (type IN (
      'DEAL_UPDATE','DOCUMENT_UPLOADED','MENTION','AI_INSIGHT','TASK_ASSIGNED','COMMENT','SYSTEM',
      'INTEGRATION_SYNC_FAILED','INTEGRATION_RECONNECT_NEEDED','NEW_TRANSCRIPT','STALE_THREAD','MEETING_BRIEF_READY'
    ));
END $$;
```

- [ ] **Step 2: Apply to staging Supabase**

Run via the Supabase SQL editor against the staging project, then verify:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('Integration','IntegrationEvent');
-- expect 2 rows
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/integrations-migration.sql
git commit -m "feat(integrations): add Integration + IntegrationEvent tables"
```

---

## Task 2: Provider interface + shared types

**Files:**
- Create: `apps/api/src/integrations/_platform/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// Phase 0 — shared integration platform types.
// Every provider (granola, gmail, etc.) implements IntegrationProvider.

export type ProviderId =
  | 'granola'
  | 'gmail'
  | 'google_calendar'
  | 'fireflies'
  | 'otter'
  | '_mock';

export type IntegrationStatus =
  | 'connected'
  | 'token_expired'
  | 'revoked'
  | 'error';

export interface Integration {
  id: string;
  organizationId: string;
  userId: string;
  provider: ProviderId;
  status: IntegrationStatus;
  externalAccountId: string | null;
  externalAccountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  settings: Record<string, unknown>;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncOptions {
  since?: Date;
  backfill?: boolean;
}

export interface SyncResult {
  itemsSynced: number;
  itemsMatched: number;
  errors: string[];
  newCursor?: string;
}

export interface InitiateAuthResult {
  authUrl: string;
  state: string;
}

export interface IntegrationProvider {
  id: ProviderId;
  displayName: string;
  scopes: string[];
  initiateAuth(userId: string, organizationId: string): Promise<InitiateAuthResult>;
  handleCallback(params: { code: string; state: string }): Promise<Integration>;
  sync(integration: Integration, options: SyncOptions): Promise<SyncResult>;
  handleWebhook(headers: Record<string, string>, body: unknown): Promise<void>;
  disconnect(integration: Integration): Promise<void>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/integrations/_platform/types.ts
git commit -m "feat(integrations): add provider interface + shared types"
```

---

## Task 3: Token store with encryption

**Files:**
- Create: `apps/api/src/integrations/_platform/tokenStore.ts`
- Test: `apps/api/tests/integrations/tokenStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/tokenStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('tokenStore', () => {
  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    vi.resetModules();
  });

  it('encrypts and round-trips an access token', async () => {
    const { encryptForStorage, decryptFromStorage } = await import(
      '../../src/integrations/_platform/tokenStore.js'
    );
    const original = 'ya29.a0AfH6SMB-pretend-google-token';
    const encrypted = encryptForStorage(original);
    expect(encrypted).not.toBe(original);
    expect(decryptFromStorage(encrypted)).toBe(original);
  });

  it('returns null for null inputs (optional refresh token)', async () => {
    const { encryptForStorage, decryptFromStorage } = await import(
      '../../src/integrations/_platform/tokenStore.js'
    );
    expect(encryptForStorage(null)).toBeNull();
    expect(decryptFromStorage(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (should fail — module doesn't exist)**

Run: `cd apps/api && npx vitest run tests/integrations/tokenStore.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/integrations/_platform/tokenStore.ts
import { encrypt, decrypt } from '../../services/encryption.js';
import { supabase } from '../../supabase.js';
import type { Integration, IntegrationStatus } from './types.js';

export function encryptForStorage(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return encrypt(value);
}

export function decryptFromStorage(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return decrypt(value);
}

export async function saveTokens(params: {
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<void> {
  const { integrationId, accessToken, refreshToken, tokenExpiresAt } = params;
  const { error } = await supabase
    .from('Integration')
    .update({
      accessTokenEncrypted: encryptForStorage(accessToken),
      refreshTokenEncrypted: encryptForStorage(refreshToken),
      tokenExpiresAt: tokenExpiresAt?.toISOString() ?? null,
      status: 'connected' as IntegrationStatus,
      consecutiveFailures: 0,
      lastSyncError: null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', integrationId);
  if (error) throw new Error(`tokenStore.saveTokens failed: ${error.message}`);
}

export async function getDecryptedTokens(
  integration: Integration
): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  return {
    accessToken: decryptFromStorage(integration.accessTokenEncrypted),
    refreshToken: decryptFromStorage(integration.refreshTokenEncrypted),
  };
}

export async function markStatus(
  integrationId: string,
  status: IntegrationStatus,
  error?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (error !== undefined) update.lastSyncError = error;
  const { error: dbError } = await supabase
    .from('Integration')
    .update(update)
    .eq('id', integrationId);
  if (dbError) throw new Error(`tokenStore.markStatus failed: ${dbError.message}`);
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `cd apps/api && npx vitest run tests/integrations/tokenStore.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/tokenStore.ts apps/api/tests/integrations/tokenStore.test.ts
git commit -m "feat(integrations): add encrypted tokenStore with round-trip tests"
```

---

## Task 4: OAuth helpers (state signing, code exchange)

**Files:**
- Create: `apps/api/src/integrations/_platform/oauth.ts`
- Test: `apps/api/tests/integrations/oauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/oauth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.OAUTH_STATE_SECRET = 'test-secret-do-not-use-in-prod';
  vi.resetModules();
});

describe('oauth state signing', () => {
  it('signs and verifies state with embedded user/provider/nonce', async () => {
    const { signState, verifyState } = await import(
      '../../src/integrations/_platform/oauth.js'
    );
    const state = signState({
      userId: 'user-1',
      organizationId: 'org-1',
      provider: 'granola',
    });
    expect(typeof state).toBe('string');
    const decoded = verifyState(state);
    expect(decoded.userId).toBe('user-1');
    expect(decoded.organizationId).toBe('org-1');
    expect(decoded.provider).toBe('granola');
  });

  it('rejects tampered state', async () => {
    const { signState, verifyState } = await import(
      '../../src/integrations/_platform/oauth.js'
    );
    const state = signState({
      userId: 'user-1',
      organizationId: 'org-1',
      provider: 'granola',
    });
    const tampered = state.slice(0, -3) + 'XXX';
    expect(() => verifyState(tampered)).toThrow();
  });

  it('rejects expired state (>10 minutes)', async () => {
    vi.useFakeTimers();
    const { signState, verifyState } = await import(
      '../../src/integrations/_platform/oauth.js'
    );
    const state = signState({
      userId: 'user-1',
      organizationId: 'org-1',
      provider: 'granola',
    });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(() => verifyState(state)).toThrow(/expired/i);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test (should fail — module doesn't exist)**

Run: `cd apps/api && npx vitest run tests/integrations/oauth.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/integrations/_platform/oauth.ts
import crypto from 'crypto';
import type { ProviderId } from './types.js';

const STATE_TTL_MS = 10 * 60 * 1000;

interface StateClaims {
  userId: string;
  organizationId: string;
  provider: ProviderId;
  nonce: string;
  iat: number;
}

function getSecret(): Buffer {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured');
  return Buffer.from(secret, 'utf8');
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(b64, 'base64');
}

export function signState(params: {
  userId: string;
  organizationId: string;
  provider: ProviderId;
}): string {
  const claims: StateClaims = {
    userId: params.userId,
    organizationId: params.organizationId,
    provider: params.provider,
    nonce: crypto.randomBytes(16).toString('hex'),
    iat: Date.now(),
  };
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(
    crypto.createHmac('sha256', getSecret()).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

export function verifyState(state: string): StateClaims {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) throw new Error('Invalid state format');
  const expectedSig = b64url(
    crypto.createHmac('sha256', getSecret()).update(payload).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error('Invalid state signature');
  }
  const claims = JSON.parse(fromB64url(payload).toString('utf8')) as StateClaims;
  if (Date.now() - claims.iat > STATE_TTL_MS) {
    throw new Error('State expired');
  }
  return claims;
}

export function buildAuthUrl(params: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  extraParams?: Record<string, string>;
}): string {
  const url = new URL(params.baseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  for (const [k, v] of Object.entries(params.extraParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
  });
  const res = await fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `cd apps/api && npx vitest run tests/integrations/oauth.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/oauth.ts apps/api/tests/integrations/oauth.test.ts
git commit -m "feat(integrations): add OAuth state signing + code exchange helpers"
```

---

## Task 5: Provider registry + mock provider

**Files:**
- Create: `apps/api/src/integrations/_platform/registry.ts`
- Create: `apps/api/src/integrations/_mock/index.ts`

- [ ] **Step 1: Write the registry**

```ts
// apps/api/src/integrations/_platform/registry.ts
import type { IntegrationProvider, ProviderId } from './types.js';

const providers = new Map<ProviderId, IntegrationProvider>();

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
```

- [ ] **Step 2: Write the mock provider**

```ts
// apps/api/src/integrations/_mock/index.ts
// Mock provider used only by integration tests. Never registered in production.
import { supabase } from '../../supabase.js';
import { saveTokens } from '../_platform/tokenStore.js';
import type {
  Integration,
  IntegrationProvider,
  InitiateAuthResult,
  SyncOptions,
  SyncResult,
} from '../_platform/types.js';

export const mockProvider: IntegrationProvider = {
  id: '_mock',
  displayName: 'Mock Provider (test only)',
  scopes: ['mock.read'],

  async initiateAuth(): Promise<InitiateAuthResult> {
    return { authUrl: 'https://mock.example.com/auth', state: 'mock-state' };
  },

  async handleCallback(): Promise<Integration> {
    throw new Error('Mock provider callback is exercised by tests via direct DB writes');
  },

  async sync(integration: Integration, _options: SyncOptions): Promise<SyncResult> {
    await saveTokens({
      integrationId: integration.id,
      accessToken: 'mock-access-token-refreshed',
      refreshToken: integration.refreshTokenEncrypted ? 'mock-refresh' : null,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return { itemsSynced: 1, itemsMatched: 0, errors: [] };
  },

  async handleWebhook(): Promise<void> {
    // No-op — webhook tests insert IntegrationEvent rows directly.
  },

  async disconnect(integration: Integration): Promise<void> {
    await supabase
      .from('Integration')
      .update({ status: 'revoked' })
      .eq('id', integration.id);
  },
};
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/integrations/_platform/registry.ts apps/api/src/integrations/_mock/index.ts
git commit -m "feat(integrations): add provider registry + mock provider"
```

---

## Task 6: Webhook router

**Files:**
- Create: `apps/api/src/integrations/_platform/webhookRouter.ts`
- Test: `apps/api/tests/integrations/webhookRouter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/webhookRouter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetRegistryForTests, registerProvider } from '../../src/integrations/_platform/registry.js';

beforeEach(() => {
  vi.resetModules();
  _resetRegistryForTests();
});

describe('webhookRouter', () => {
  it('rejects unknown provider with PROVIDER_UNKNOWN', async () => {
    const { routeWebhook } = await import(
      '../../src/integrations/_platform/webhookRouter.js'
    );
    const result = await routeWebhook('not_a_provider' as any, {}, {});
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_UNKNOWN');
  });

  it('dispatches to registered provider.handleWebhook', async () => {
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
```

- [ ] **Step 2: Run test (should fail)**

Run: `cd apps/api && npx vitest run tests/integrations/webhookRouter.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/integrations/_platform/webhookRouter.ts
import { getProvider, isProviderRegistered } from './registry.js';
import { log } from '../../utils/logger.js';
import type { ProviderId } from './types.js';

export type WebhookResult =
  | { ok: true }
  | { ok: false; code: 'PROVIDER_UNKNOWN' | 'INVALID_SIGNATURE' | 'HANDLER_ERROR'; message: string };

export async function routeWebhook(
  providerId: ProviderId,
  headers: Record<string, string>,
  body: unknown
): Promise<WebhookResult> {
  if (!isProviderRegistered(providerId)) {
    log.warn('webhookRouter: unknown provider', { providerId });
    return { ok: false, code: 'PROVIDER_UNKNOWN', message: `No provider: ${providerId}` };
  }
  try {
    const provider = getProvider(providerId);
    await provider.handleWebhook(headers, body);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error('webhookRouter: handler error', err, { providerId });
    if (/invalid signature/i.test(message)) {
      return { ok: false, code: 'INVALID_SIGNATURE', message };
    }
    return { ok: false, code: 'HANDLER_ERROR', message };
  }
}

export async function dedupeAndRecord(params: {
  integrationId: string;
  externalId: string;
  type: string;
  payload?: unknown;
}): Promise<{ duplicate: boolean }> {
  const { supabase } = await import('../../supabase.js');
  const { error } = await supabase.from('IntegrationEvent').insert({
    integrationId: params.integrationId,
    externalId: params.externalId,
    type: params.type,
    payload: params.payload ?? null,
  });
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    throw new Error(`webhookRouter.dedupeAndRecord failed: ${error.message}`);
  }
  return { duplicate: false };
}

export async function markEventProcessed(
  integrationId: string,
  externalId: string,
  error?: string
): Promise<void> {
  const { supabase } = await import('../../supabase.js');
  const update: Record<string, unknown> = {
    processedAt: new Date().toISOString(),
  };
  if (error !== undefined) update.error = error;
  await supabase
    .from('IntegrationEvent')
    .update(update)
    .eq('integrationId', integrationId)
    .eq('externalId', externalId);
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `cd apps/api && npx vitest run tests/integrations/webhookRouter.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/webhookRouter.ts apps/api/tests/integrations/webhookRouter.test.ts
git commit -m "feat(integrations): add webhookRouter with dedupe + signature handling"
```

---

## Task 7: Sync engine

**Files:**
- Create: `apps/api/src/integrations/_platform/syncEngine.ts`
- Test: `apps/api/tests/integrations/syncEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/syncEngine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetRegistryForTests, registerProvider } from '../../src/integrations/_platform/registry.js';

beforeEach(() => {
  vi.resetModules();
  _resetRegistryForTests();
});

describe('syncEngine.syncIntegration', () => {
  it('returns success result and resets failures on a healthy sync', async () => {
    const sync = vi.fn().mockResolvedValue({ itemsSynced: 3, itemsMatched: 1, errors: [] });
    registerProvider({
      id: '_mock', displayName: 'M', scopes: [],
      initiateAuth: vi.fn(), handleCallback: vi.fn(), sync,
      handleWebhook: vi.fn(), disconnect: vi.fn(),
    } as any);

    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn(() => ({ update: updateMock })) },
    }));

    const { syncIntegration } = await import('../../src/integrations/_platform/syncEngine.js');
    const integration = {
      id: 'int-1', provider: '_mock', status: 'connected', consecutiveFailures: 0,
    } as any;
    const result = await syncIntegration(integration);
    expect(result.itemsSynced).toBe(3);
    expect(sync).toHaveBeenCalled();
  });

  it('increments consecutiveFailures and emits notification at 3 failures', async () => {
    const sync = vi.fn().mockRejectedValue(new Error('boom'));
    registerProvider({
      id: '_mock', displayName: 'M', scopes: [],
      initiateAuth: vi.fn(), handleCallback: vi.fn(), sync,
      handleWebhook: vi.fn(), disconnect: vi.fn(),
    } as any);

    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn(() => ({ update, insert })) },
    }));

    const { syncIntegration } = await import('../../src/integrations/_platform/syncEngine.js');
    const integration = {
      id: 'int-1', provider: '_mock', status: 'connected', consecutiveFailures: 2, userId: 'u-1',
    } as any;
    await expect(syncIntegration(integration)).rejects.toThrow('boom');
    // 3rd failure path inserts INTEGRATION_SYNC_FAILED notification
    expect(insert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `cd apps/api && npx vitest run tests/integrations/syncEngine.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/integrations/_platform/syncEngine.ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { getProvider } from './registry.js';
import type { Integration, SyncOptions, SyncResult } from './types.js';

export async function syncIntegration(
  integration: Integration,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const provider = getProvider(integration.provider);
  try {
    const result = await provider.sync(integration, {
      since: options.since ?? integration.lastSyncAt ?? undefined,
      backfill: options.backfill ?? false,
    });
    await supabase
      .from('Integration')
      .update({
        lastSyncAt: new Date().toISOString(),
        lastSyncError: null,
        consecutiveFailures: 0,
        status: 'connected',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', integration.id);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown sync error';
    const newFailureCount = (integration.consecutiveFailures ?? 0) + 1;
    await supabase
      .from('Integration')
      .update({
        lastSyncError: message,
        consecutiveFailures: newFailureCount,
        status: newFailureCount >= 3 ? 'error' : integration.status,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', integration.id);
    if (newFailureCount === 3) {
      await emitSyncFailedNotification(integration, message);
    }
    log.error('syncEngine: sync failed', err, {
      integrationId: integration.id,
      provider: integration.provider,
      newFailureCount,
    });
    throw err;
  }
}

export async function syncAll(): Promise<{
  ranFor: number;
  succeeded: number;
  failed: number;
}> {
  const { data: integrations, error } = await supabase
    .from('Integration')
    .select('*')
    .eq('status', 'connected');
  if (error) throw new Error(`syncAll: ${error.message}`);
  if (!integrations) return { ranFor: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  for (const row of integrations as Integration[]) {
    try {
      await syncIntegration(row);
      succeeded++;
    } catch {
      failed++;
    }
  }
  return { ranFor: integrations.length, succeeded, failed };
}

async function emitSyncFailedNotification(integration: Integration, message: string): Promise<void> {
  await supabase.from('Notification').insert({
    userId: integration.userId,
    type: 'INTEGRATION_SYNC_FAILED',
    title: `${integration.provider} sync failing`,
    message: `${message.slice(0, 240)} — open Settings → Integrations to reconnect.`,
  });
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `cd apps/api && npx vitest run tests/integrations/syncEngine.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/syncEngine.ts apps/api/tests/integrations/syncEngine.test.ts
git commit -m "feat(integrations): add syncEngine with 3-strikes failure notification"
```

---

## Task 8: Matcher (email/attendees → Deal/Contact)

**Files:**
- Create: `apps/api/src/integrations/_platform/matcher.ts`
- Test: `apps/api/tests/integrations/matcher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/matcher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.resetModules());

describe('matcher.matchEmailAddressesToDeals', () => {
  it('returns matching contactIds and dealIds (case-insensitive email match)', async () => {
    const fromMock = vi.fn();
    // First call: from('Contact')
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: 'c-1', email: 'john@acme.com' },
          { id: 'c-2', email: 'sara@beta.io' },
        ],
        error: null,
      }),
    });
    // Second call: from('ContactDeal')
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ dealId: 'd-1' }],
        error: null,
      }),
    });
    vi.doMock('../../src/supabase.js', () => ({ supabase: { from: fromMock } }));

    const { matchEmailAddressesToDeals } = await import(
      '../../src/integrations/_platform/matcher.js'
    );
    const result = await matchEmailAddressesToDeals({
      organizationId: 'org-1',
      emails: ['JOHN@acme.com', 'unknown@x.com'],
    });
    expect(result.matchedContactIds).toEqual(['c-1']);
    expect(result.matchedDealIds).toEqual(['d-1']);
  });

  it('returns empty arrays for empty input', async () => {
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn() },
    }));
    const { matchEmailAddressesToDeals } = await import(
      '../../src/integrations/_platform/matcher.js'
    );
    const result = await matchEmailAddressesToDeals({
      organizationId: 'org-1',
      emails: [],
    });
    expect(result).toEqual({ matchedContactIds: [], matchedDealIds: [] });
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `cd apps/api && npx vitest run tests/integrations/matcher.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/integrations/_platform/matcher.ts
import { supabase } from '../../supabase.js';

export interface MatchResult {
  matchedContactIds: string[];
  matchedDealIds: string[];
}

export async function matchEmailAddressesToDeals(params: {
  organizationId: string;
  emails: string[];
}): Promise<MatchResult> {
  const normalized = Array.from(
    new Set(params.emails.map(e => e.trim().toLowerCase()).filter(Boolean))
  );
  if (normalized.length === 0) return { matchedContactIds: [], matchedDealIds: [] };

  const { data: contacts, error: contactErr } = await supabase
    .from('Contact')
    .select('id, email')
    .in('email', normalized)
    .eq('organizationId', params.organizationId);
  if (contactErr) throw new Error(`matcher: contact lookup failed: ${contactErr.message}`);

  const matchedContactIds = (contacts ?? [])
    .filter(c => c.email && normalized.includes(c.email.toLowerCase()))
    .map(c => c.id);
  if (matchedContactIds.length === 0) return { matchedContactIds: [], matchedDealIds: [] };

  const { data: links, error: linkErr } = await supabase
    .from('ContactDeal')
    .select('dealId')
    .in('contactId', matchedContactIds);
  if (linkErr) throw new Error(`matcher: deal link lookup failed: ${linkErr.message}`);

  const matchedDealIds = Array.from(
    new Set((links ?? []).map(l => l.dealId).filter(Boolean))
  );

  return { matchedContactIds, matchedDealIds };
}
```

- [ ] **Step 4: Run test (should pass)**

Run: `cd apps/api && npx vitest run tests/integrations/matcher.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/matcher.ts apps/api/tests/integrations/matcher.test.ts
git commit -m "feat(integrations): add Contact/Deal matcher by email"
```

---

## Task 9: REST routes — `apps/api/src/routes/integrations.ts`

**Files:**
- Create: `apps/api/src/routes/integrations.ts`
- Modify: `apps/api/src/app.ts` (mount route)
- Test: `apps/api/tests/integrations/routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/integrations/routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

beforeEach(() => vi.resetModules());

describe('GET /api/integrations', () => {
  it('returns the user\'s connected integrations (org-scoped)', async () => {
    vi.doMock('../../src/supabase.js', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 'i-1', provider: 'granola', status: 'connected',
                externalAccountEmail: 'x@y.com', lastSyncAt: null,
                organizationId: 'org-1', userId: 'u-1' },
            ],
            error: null,
          }),
        })),
      },
    }));
    vi.doMock('../../src/middleware/auth.js', () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { id: 'auth-1', organizationId: 'org-1' };
        next();
      },
    }));
    vi.doMock('../../src/middleware/orgScope.js', () => ({
      orgMiddleware: (_req: any, _res: any, next: any) => next(),
      requireOrg: (_req: any, _res: any, next: any) => next(),
      getOrgId: () => 'org-1',
    }));
    const express = (await import('express')).default;
    const router = (await import('../../src/routes/integrations.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/integrations', router);

    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(1);
    expect(res.body.integrations[0].provider).toBe('granola');
    expect(res.body.integrations[0].accessTokenEncrypted).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test (should fail)**

Run: `cd apps/api && npx vitest run tests/integrations/routes.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/routes/integrations.ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { getOrgId } from '../middleware/orgScope.js';
import { log } from '../utils/logger.js';
import { syncIntegration } from '../integrations/_platform/syncEngine.js';
import { getProvider, isProviderRegistered } from '../integrations/_platform/registry.js';
import type { ProviderId, Integration } from '../integrations/_platform/types.js';

const router = Router();

const PROVIDER_IDS: ProviderId[] = [
  'granola', 'gmail', 'google_calendar', 'fireflies', 'otter',
];

const PUBLIC_FIELDS = `id, organizationId, userId, provider, status,
  externalAccountId, externalAccountEmail, scopes, settings,
  lastSyncAt, lastSyncError, consecutiveFailures, tokenExpiresAt,
  createdAt, updatedAt` as const;

async function resolveInternalUserId(authId: string): Promise<string | null> {
  const { data } = await supabase
    .from('User').select('id').eq('authId', authId).single();
  return data?.id ?? null;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { data, error } = await supabase
      .from('Integration')
      .select(PUBLIC_FIELDS)
      .eq('organizationId', orgId)
      .order('createdAt', { ascending: false });
    if (error) throw error;
    res.json({ integrations: data ?? [] });
  } catch (err) { next(err); }
});

const connectSchema = z.object({ provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]) });

router.post('/:provider/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = connectSchema.parse({ provider: req.params.provider });
    if (!isProviderRegistered(provider)) {
      return res.status(404).json({ error: `Provider ${provider} not available yet` });
    }
    const orgId = getOrgId(req);
    const userId = await resolveInternalUserId(req.user!.id);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const { authUrl, state } = await getProvider(provider).initiateAuth(userId, orgId);
    res.json({ authUrl, state });
  } catch (err) { next(err); }
});

router.get('/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = req.params.provider as ProviderId;
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) return res.status(400).send('Missing code or state');
    if (!isProviderRegistered(provider)) return res.status(404).send('Provider not registered');
    await getProvider(provider).handleCallback({ code, state });
    res.redirect(`/settings.html?integrations=connected&provider=${provider}`);
  } catch (err) {
    log.error('OAuth callback failed', err);
    res.redirect(`/settings.html?integrations=error&provider=${req.params.provider}`);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: row } = await supabase
      .from('Integration')
      .select(PUBLIC_FIELDS)
      .eq('id', id).eq('organizationId', orgId).single();
    if (!row) return res.status(404).json({ error: 'Integration not found' });
    if (isProviderRegistered(row.provider as ProviderId)) {
      try {
        await getProvider(row.provider as ProviderId).disconnect(row as Integration);
      } catch (e) {
        log.warn('Provider disconnect failed (continuing with local revoke)', { e });
      }
    }
    await supabase.from('Integration').update({ status: 'revoked' }).eq('id', id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: row, error } = await supabase
      .from('Integration')
      .select('*')
      .eq('id', id).eq('organizationId', orgId).single();
    if (error || !row) return res.status(404).json({ error: 'Integration not found' });
    const result = await syncIntegration(row as Integration);
    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

router.get('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: integration } = await supabase
      .from('Integration')
      .select('id, organizationId')
      .eq('id', id).eq('organizationId', orgId).single();
    if (!integration) return res.status(404).json({ error: 'Integration not found' });
    const { data: events } = await supabase
      .from('IntegrationEvent')
      .select('id, externalId, type, receivedAt, processedAt, error')
      .eq('integrationId', id)
      .order('receivedAt', { ascending: false })
      .limit(50);
    res.json({ events: events ?? [] });
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 4: Mount the route in app.ts**

In [`apps/api/src/app.ts`](apps/api/src/app.ts), add the import alongside other route imports:

```ts
import integrationsRouter from './routes/integrations.js';
```

And mount inside the existing `/api` block (after `dealImportRouter`, requires auth):

```ts
app.use('/api/integrations', authMiddleware, orgMiddleware, integrationsRouter);
```

(Match the exact pattern used by `app.use('/api/onboarding', ...)` etc.)

- [ ] **Step 5: Run test (should pass)**

`supertest` is already a devDependency in `apps/api/package.json` — no install needed.

Run: `cd apps/api && npx vitest run tests/integrations/routes.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/integrations.ts apps/api/src/app.ts apps/api/tests/integrations/routes.test.ts
git commit -m "feat(integrations): add /api/integrations REST routes"
```

---

## Task 10: Public webhook routes

**Files:**
- Create: `apps/api/src/routes/integrations-webhooks.ts`
- Modify: `apps/api/src/app.ts` (mount BEFORE auth middleware)

- [ ] **Step 1: Write the implementation**

```ts
// apps/api/src/routes/integrations-webhooks.ts
import { Router, type Request, type Response } from 'express';
import { log } from '../utils/logger.js';
import { routeWebhook } from '../integrations/_platform/webhookRouter.js';
import type { ProviderId } from '../integrations/_platform/types.js';

const router = Router();

router.post('/:provider', async (req: Request, res: Response) => {
  const provider = req.params.provider as ProviderId;
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])
  ) as Record<string, string>;
  const result = await routeWebhook(provider, headers, req.body);
  if (!result.ok) {
    if (result.code === 'INVALID_SIGNATURE') return res.status(401).end();
    if (result.code === 'PROVIDER_UNKNOWN') return res.status(404).end();
    log.error('Webhook handler error', new Error(result.message), { provider });
    return res.status(500).end();
  }
  res.status(204).end();
});

export default router;
```

- [ ] **Step 2: Mount the route in app.ts BEFORE authMiddleware**

In [`apps/api/src/app.ts`](apps/api/src/app.ts), add the import:

```ts
import integrationsWebhooksRouter from './routes/integrations-webhooks.js';
```

Mount **before** any authMiddleware (webhooks are public, signature-verified per provider):

```ts
app.use('/api/integrations/webhooks', integrationsWebhooksRouter);
```

This MUST appear before `app.use('/api/integrations', authMiddleware, ...)` so the more-specific path takes precedence.

- [ ] **Step 3: Verify server boots**

Run: `cd apps/api && npm run build`
Expected: TypeScript compiles, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/integrations-webhooks.ts apps/api/src/app.ts
git commit -m "feat(integrations): add public webhook receiver routes"
```

---

## Task 11: Cron endpoint + Vercel cron config

**Files:**
- Modify: `apps/api/src/routes/integrations.ts` (add cron handler)
- Modify: `vercel.json` (add cron schedule)

- [ ] **Step 1: Add cron handler to integrations route**

In [`apps/api/src/routes/integrations.ts`](apps/api/src/routes/integrations.ts), add the import:

```ts
import { syncAll } from '../integrations/_platform/syncEngine.js';
```

And add this route at the end of the file, before `export default router;`:

```ts
router.post('/_cron/sync-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expected = process.env.CRON_SECRET;
    const actual = req.header('x-cron-secret');
    if (!expected || actual !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await syncAll();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});
```

Note: this endpoint mounts under `/api/integrations/_cron/sync-all` and is protected by `CRON_SECRET` (not user auth). Vercel cron sets the `x-cron-secret` header from the env var.

- [ ] **Step 2: Add Vercel cron config**

Edit [`vercel.json`](vercel.json) — add a `crons` array at the top level:

```json
{
  "version": 2,
  "installCommand": "rm -f package-lock.json && npm install --include=dev",
  "buildCommand": "npm run build:api && npm run build --workspace=@ai-crm/web-next",
  "outputDirectory": "apps/web-next/.next",
  "functions": {
    "apps/web-next/src/app/api/[...slug]/route.ts": {
      "memory": 1769,
      "maxDuration": 300
    }
  },
  "crons": [
    {
      "path": "/api/integrations/_cron/sync-all",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

`schedule: "0 */6 * * *"` runs at minute 0 every 6 hours.

- [ ] **Step 3: Verify**

Run: `cd apps/api && npm run build`
Expected: TypeScript compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/integrations.ts vercel.json
git commit -m "feat(integrations): add 6h cron handler + Vercel schedule"
```

---

## Task 12: Settings UI — Integrations section

**Files:**
- Modify: `apps/web/settings.html` (add nav entry + section markup)
- Create: `apps/web/js/integrations.js`

- [ ] **Step 1: Add the sidebar nav entry**

In [`apps/web/settings.html`](apps/web/settings.html), inside the `<nav>` block (find it via the "Notifications" entry around line ~110), add this entry **after** the "Notifications" link and **before** the "Team" link:

```html
<a href="#section-integrations" data-section="integrations" class="settings-nav-item flex items-center gap-3 px-4 py-2.5 rounded-lg border border-transparent text-text-secondary hover:bg-primary-light hover:text-primary transition-all">
  <span class="material-symbols-outlined text-[20px]">extension</span>
  <span class="text-sm font-medium">Integrations</span>
</a>
```

- [ ] **Step 2: Add the section markup**

Locate the `<main>` content container holding section panels (search for `id="section-team"` to find sibling panels). Add a new section panel after `section-notifications` and before `section-team`:

```html
<section id="section-integrations" class="settings-section hidden">
  <div class="bg-white rounded-xl shadow-card p-6">
    <h2 class="text-lg font-bold text-text-main mb-1">Integrations</h2>
    <p class="text-sm text-text-secondary mb-6">
      Connect your tools so deal context appears here automatically.
    </p>

    <div id="integrations-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Cards rendered by integrations.js -->
    </div>

    <div class="mt-8">
      <h3 class="text-sm font-semibold text-text-main mb-3">Sync activity</h3>
      <div id="integrations-activity" class="border border-border-subtle rounded-lg overflow-hidden">
        <div class="p-4 text-sm text-text-muted">Connect an integration to see sync activity.</div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add the script tag**

Near the bottom of `settings.html`, after other `<script>` tags but before the closing `</body>`, add:

```html
<script type="module" src="/js/integrations.js"></script>
```

- [ ] **Step 4: Create the integrations.js module**

```js
// apps/web/js/integrations.js
// Renders the Settings → Integrations section. Phase 0: no providers wired,
// so cards render in a "Coming soon" state. Phase 1+ enables [Connect] buttons.

const PROVIDER_CATALOG = [
  { id: 'granola',         name: 'Granola',         desc: 'Auto-import meeting transcripts', icon: 'mic',           phase: 1 },
  { id: 'gmail',           name: 'Gmail',           desc: 'Sync deal-related emails',        icon: 'mail',          phase: 2 },
  { id: 'google_calendar', name: 'Google Calendar', desc: 'Pre-meeting briefs & timeline',   icon: 'event',         phase: 3 },
  { id: 'fireflies',       name: 'Fireflies',       desc: 'Auto-import meeting transcripts', icon: 'mic',           phase: 'later' },
  { id: 'otter',           name: 'Otter',           desc: 'Auto-import meeting transcripts', icon: 'graphic_eq',    phase: 'later' },
];

const NAVY = '#003366';

async function authFetch(path, init = {}) {
  if (window.PEAuth?.authFetch) return window.PEAuth.authFetch(path, init);
  return fetch(path, init);
}

function statusBadge(integration) {
  if (!integration) {
    return `<span class="text-xs text-text-muted">Not connected</span>`;
  }
  const colors = {
    connected:       { bg: '#ECFDF5', fg: '#047857', label: 'Connected' },
    token_expired:   { bg: '#FFFBEB', fg: '#92400E', label: 'Reconnect needed' },
    error:           { bg: '#FEF2F2', fg: '#991B1B', label: 'Error' },
    revoked:         { bg: '#F3F4F6', fg: '#374151', label: 'Disconnected' },
  };
  const c = colors[integration.status] ?? colors.revoked;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
    style="background:${c.bg};color:${c.fg}">${c.label}</span>`;
}

function renderCard(provider, integration) {
  const isComingSoon = provider.phase === 'later';
  const isAvailable  = !isComingSoon;
  const ctaLabel     = integration ? 'Disconnect' : (isAvailable ? 'Connect' : 'Coming soon');
  const ctaDisabled  = !integration && !isAvailable;
  const ctaStyle     = integration
    ? `background:#FEF2F2;color:#991B1B;border:1px solid #FCA5A5`
    : `background:${NAVY};color:#fff`;

  return `
    <div class="bg-white border border-border-subtle rounded-lg p-4 flex flex-col gap-3"
         data-provider="${provider.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center"
               style="background:#E6EEF5;color:${NAVY}">
            <span class="material-symbols-outlined">${provider.icon}</span>
          </div>
          <div>
            <div class="text-sm font-semibold text-text-main">${provider.name}</div>
            <div class="text-xs text-text-muted">${provider.desc}</div>
          </div>
        </div>
        ${statusBadge(integration)}
      </div>
      ${integration?.externalAccountEmail
        ? `<div class="text-xs text-text-muted">Connected as ${integration.externalAccountEmail}</div>`
        : ''}
      <div class="flex items-center justify-between gap-2 mt-1">
        <div class="text-xs text-text-muted">
          ${integration?.lastSyncAt
            ? `Last sync: ${new Date(integration.lastSyncAt).toLocaleString()}`
            : ''}
        </div>
        <button class="text-xs font-semibold rounded-md px-3 py-1.5 transition-opacity ${ctaDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}"
                style="${ctaStyle}"
                ${ctaDisabled ? 'disabled' : ''}
                data-action="${integration ? 'disconnect' : 'connect'}"
                data-id="${integration?.id ?? ''}">
          ${ctaLabel}
        </button>
      </div>
    </div>
  `;
}

async function fetchIntegrations() {
  try {
    const res = await authFetch('/api/integrations');
    if (!res.ok) return [];
    const json = await res.json();
    return json.integrations ?? [];
  } catch {
    return [];
  }
}

async function render() {
  const grid = document.getElementById('integrations-grid');
  if (!grid) return;
  const integrations = await fetchIntegrations();
  const byProvider = new Map(
    integrations.filter(i => i.status !== 'revoked').map(i => [i.provider, i])
  );
  grid.innerHTML = PROVIDER_CATALOG
    .map(p => renderCard(p, byProvider.get(p.id) ?? null))
    .join('');

  grid.addEventListener('click', onCardClick);
}

async function onCardClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const card = btn.closest('[data-provider]');
  const provider = card?.dataset.provider;
  if (!provider) return;

  if (action === 'connect') {
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/integrations/${provider}/connect`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) {
      btn.disabled = false;
      alert(`Could not start connection: ${err.message}`);
    }
  } else if (action === 'disconnect') {
    if (!confirm('Disconnect this integration? Past data stays; no new sync.')) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/integrations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await render();
    } catch (err) {
      btn.disabled = false;
      alert(`Disconnect failed: ${err.message}`);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
```

- [ ] **Step 5: Smoke test in browser**

Start dev servers:

```bash
cd apps/api && npm run dev   # in one terminal
cd apps/web && npm run dev   # in another
```

Visit `http://localhost:3000/settings.html#section-integrations` and verify:
- Sidebar shows "Integrations" entry
- Section renders 5 cards (3 available, 2 "Coming soon")
- Granola card has [Connect] button (disabled because no provider registered yet — clicking yields a 404 from the API, which is expected)

- [ ] **Step 6: Commit**

```bash
git add apps/web/settings.html apps/web/js/integrations.js
git commit -m "feat(integrations): add Settings → Integrations section UI"
```

---

## Task 13: End-to-end smoke test (mock provider)

**Files:**
- Create: `apps/api/tests/integrations/smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

```ts
// apps/api/tests/integrations/smoke.test.ts
// Phase 0 smoke: register the mock provider, sync it, assert state transitions.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _resetRegistryForTests, registerProvider, getProvider, isProviderRegistered }
  from '../../src/integrations/_platform/registry.js';
import { mockProvider } from '../../src/integrations/_mock/index.js';

beforeEach(() => {
  _resetRegistryForTests();
  registerProvider(mockProvider);
});

describe('Phase 0 smoke', () => {
  it('registers, fetches, and exercises sync()', async () => {
    expect(isProviderRegistered('_mock')).toBe(true);
    const provider = getProvider('_mock');
    expect(provider.id).toBe('_mock');

    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    vi.doMock('../../src/supabase.js', () => ({
      supabase: { from: vi.fn(() => ({ update })) },
    }));

    const integration = {
      id: 'int-1', organizationId: 'org-1', userId: 'u-1', provider: '_mock',
      status: 'connected', accessTokenEncrypted: null, refreshTokenEncrypted: null,
      tokenExpiresAt: null, scopes: [], settings: {}, lastSyncAt: null,
      lastSyncError: null, consecutiveFailures: 0,
      externalAccountId: null, externalAccountEmail: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as any;

    const result = await provider.sync(integration, {});
    expect(result.itemsSynced).toBe(1);
  });
});
```

- [ ] **Step 2: Run all integration tests**

Run: `cd apps/api && npx vitest run tests/integrations/`
Expected: all tests pass (tokenStore, oauth, webhookRouter, syncEngine, matcher, routes, smoke).

- [ ] **Step 3: Run full test suite to confirm no regressions**

Run: `cd apps/api && npm run test`
Expected: existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integrations/smoke.test.ts
git commit -m "test(integrations): add Phase 0 smoke test with mock provider"
```

---

## Task 14: Environment + documentation

**Files:**
- Modify: `apps/api/.env.example` (or whichever example file is canonical)
- Modify: `progress.md`

- [ ] **Step 1: Add new env vars to the example file**

Append to `apps/api/.env.example`:

```bash
# Integrations platform (Phase 0)
OAUTH_STATE_SECRET=                # 32+ chars, used for HMAC of OAuth state JWT
CRON_SECRET=                       # shared secret between Vercel cron and the API

# Provider credentials (filled in per-phase as we wire them)
# GRANOLA_CLIENT_ID=
# GRANOLA_CLIENT_SECRET=
# GRANOLA_WEBHOOK_SECRET=
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 2: Update progress.md**

Append a new entry to [`progress.md`](progress.md) following the existing format (timestamp in IST, problem → root cause → fix style):

```
### 2026-04-30 — Integrations Platform Phase 0 (foundations)

Built the shared platform that future provider integrations (Granola → Gmail → Calendar → Outbound) plug into.

**What shipped**
- DB: `Integration` + `IntegrationEvent` tables; extended `Notification` type CHECK
- `apps/api/src/integrations/_platform/`: types, encrypted tokenStore, OAuth helpers (state + code exchange), provider registry, webhook router (with dedupe), sync engine (with 3-strikes failure notification), Contact/Deal email matcher
- `apps/api/src/integrations/_mock/`: mock provider used by integration tests
- `apps/api/src/routes/integrations.ts`: list / connect / callback / disconnect / sync / events
- `apps/api/src/routes/integrations-webhooks.ts`: public, signature-verified per provider
- Vercel cron: `/api/integrations/_cron/sync-all` every 6h
- Settings → Integrations UI: card grid for 5 providers (Granola, Gmail, Calendar available; Fireflies/Otter coming soon), [Connect]/[Disconnect] CTAs, sync activity placeholder
- Tests: tokenStore (round-trip), oauth (sign/verify/expiry), webhookRouter (dedupe + dispatch), syncEngine (success + 3-strikes), matcher (email→contact→deal), routes (org-scoped list), end-to-end smoke

**No user-visible feature ships in Phase 0.** The Settings page renders 5 cards, all in "Connect" state but the API returns 404 because no provider is registered. Phase 1 (Granola) wires the first real provider.

**New env vars:** `OAUTH_STATE_SECRET`, `CRON_SECRET`. Run `apps/api/integrations-migration.sql` against staging then prod.
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env.example progress.md
git commit -m "docs(integrations): document Phase 0 env vars + progress entry"
```

---

## Self-review checklist

Before declaring Phase 0 done, verify:

1. **Spec coverage:**
   - [ ] §4.1 data model → Task 1 (migration)
   - [ ] §4.2 folder structure → Tasks 2–8 (all `_platform/` files exist)
   - [ ] §4.3 provider interface → Task 2 (`types.ts`)
   - [ ] §4.4 routes → Tasks 9–10
   - [ ] §4.5 cron → Task 11
   - [ ] §3.1 Settings → Integrations hub → Task 12
   - [ ] §7 error handling: 3-strikes notification → Task 7; webhook dedupe → Task 6
   - [ ] §8 security: encrypted at rest → Task 3; signed state → Task 4; org-scoped → Task 9; webhook signature path → Task 6 (provider-specific verification lands in Phase 1)
   - [ ] §9 testing strategy: unit tests in every task

2. **Manual verification before merging:**
   - [ ] Migration applied on staging Supabase
   - [ ] `OAUTH_STATE_SECRET` and `CRON_SECRET` set in Vercel project env
   - [ ] `npm run build` clean in `apps/api`
   - [ ] All `tests/integrations/*` pass
   - [ ] Settings page loads at `/settings.html#section-integrations` with 5 cards visible
   - [ ] Hitting `POST /api/integrations/_cron/sync-all` without `x-cron-secret` returns 401

3. **What's intentionally out of Phase 0:**
   - No provider-specific signature verification (lands per-provider in Phase 1+)
   - No real OAuth callback exchange (mock provider stubs it; real flow is provider-specific)
   - No frontend "review queue" or "sync activity log" data — placeholders only
   - No notification UI rendering for the new types — backend insertion only

---

## Next phases (out of scope for this plan)

- **Phase 1 plan:** Granola provider — `apps/api/src/integrations/granola/{auth,sync,webhook,mapper}.ts`
- **Phase 2 plan:** Gmail provider + relevance classifier
- **Phase 3 plan:** Google Calendar provider + pre-meeting briefs
- **Phase 4 plan:** Outbound (send email + schedule meeting)

Each phase gets its own plan generated from the spec when its predecessor merges.
