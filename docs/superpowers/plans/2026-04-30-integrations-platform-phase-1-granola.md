# Integrations Platform — Phase 1 (Granola) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Spec:** [`docs/superpowers/specs/2026-04-30-integrations-platform-design.md`](../specs/2026-04-30-integrations-platform-design.md)
**Phase 0 plan:** [`docs/superpowers/plans/2026-04-30-integrations-platform-phase-0.md`](2026-04-30-integrations-platform-phase-0.md)

**Goal:** Wire Granola as the first real provider so deal-related meetings auto-populate as Activities on the deal page, with AI summaries and (where applicable) extracted financials.

## Reality check (deviation from the spec)

The design spec assumed Granola exposed OAuth and webhooks. Research against [docs.granola.ai](https://docs.granola.ai/introduction) confirmed otherwise:

| Spec assumption | Reality | Implication |
|---|---|---|
| Third-party OAuth app flow | **Per-user Personal API key** (Bearer `grn_…`) generated in Granola desktop app | Connect UI is a paste-key modal, not an OAuth redirect |
| Webhook on `meeting.transcript.ready` | **No webhooks** ("on roadmap" per docs) | Polling only, via the existing 6h cron; user can also press "Sync now" |
| Available to any plan | **Business/Enterprise plans only** | Connect UI must show a plan-gating warning; failure to use the key surfaces a clear "Upgrade required" message |
| Generic `IntegrationProvider.handleCallback` works | OAuth-shaped — doesn't fit paste-key | Provider interface gains a `connectWithApiKey()` method; OAuth providers leave it unimplemented |

**Endpoints we'll use:**
- `GET /v1/notes?created_after=<ISO>&cursor=<token>` — paginated note list
- `GET /v1/notes/{id}?include=transcript` — full transcript + speakers + metadata
- Auth: `Authorization: Bearer grn_<key>`
- Rate limit: 25-request burst, 5/sec sustained → 429 on overflow

**Deferred to a later phase:** the "review queue" UI for unmatched transcripts (Phase 1 just attaches matched ones; unmatched go to a notification telling the user to manually link), and AI extraction beyond a one-line summary (deeper extraction lands in a future phase if validated useful).

**Architecture:** new `apps/api/src/integrations/granola/` provider module that implements `IntegrationProvider` plus a new optional `connectWithApiKey()` method. Pure HTTP client + sync logic; no DOM, no React. Reuses the Phase 0 platform (`syncEngine`, `tokenStore`, `matcher`, `Activity` insertion). Frontend gets a Granola-specific paste-key modal triggered from the existing Settings → Integrations card.

**Tech stack:** Same as Phase 0 — Node.js + Express + TypeScript + vitest. No new dependencies (uses native `fetch`).

## Hardening already landed (separate from this plan, on the same branch)

These three Phase 0 review follow-ups shipped before the Granola provider work because the provider depends on them:

1. **Raw webhook body capture** (commit `7251526`) — `req.rawBody` is now available to provider webhook handlers. Not used by Granola directly (no webhooks), but required by every other Phase 2+ provider.
2. **Per-integration sync timeout + bounded concurrency** (commit `b0f7976`) — `syncAll` runs at most 5 in parallel, each capped at 60s. Critical now that polling against rate-limited APIs runs every 6h.
3. **`Integration` timestamp fields as strings, not Dates** (commit `f44d779`) — wire format truth. The Phase 1 sync code compares `tokenExpiresAt` against now and would otherwise silently coerce types.

---

## File structure for Phase 1

```
apps/api/src/integrations/granola/
├── types.ts          [NEW]   Granola API response shapes
├── client.ts         [NEW]   HTTP client (paginated notes, transcripts, key validation)
├── mapper.ts         [NEW]   Granola note → Activity row
└── index.ts          [NEW]   Provider implementation (sync, connectWithApiKey, disconnect)

apps/api/src/integrations/_platform/
└── types.ts          [MODIFY] add optional connectWithApiKey to IntegrationProvider

apps/api/src/routes/
└── integrations.ts   [MODIFY] add POST /:provider/api-key endpoint

apps/api/src/
└── app.ts            [MODIFY] register Granola provider on startup

apps/web/js/
└── integrations.js   [MODIFY] paste-key modal for providers in api_key mode

apps/api/tests/integrations/granola/
├── client.test.ts    [NEW]   pagination, rate-limit handling, auth
├── mapper.test.ts    [NEW]   transcript → Activity mapping
└── sync.test.ts      [NEW]   end-to-end sync against mocked client
```

**Conventions to follow** — same as Phase 0. ESM `.js` import suffixes, no comments unless WHY is non-obvious, Banker Blue `#003366` for new UI.

---

## Task 1: Granola API response types

**Files:**
- Create: `apps/api/src/integrations/granola/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// Shapes returned by the Granola public API (https://docs.granola.ai).
// Only the fields we actually consume are typed; the API may include more.

export interface GranolaNoteListResponse {
  data: GranolaNoteSummary[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface GranolaNoteSummary {
  id: string;
  title: string | null;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  meetingStartedAt: string | null;
  meetingEndedAt: string | null;
  attendees: GranolaAttendee[];
}

export interface GranolaNoteWithTranscript extends GranolaNoteSummary {
  summary: string | null;
  transcript: GranolaTranscriptSegment[];
}

export interface GranolaAttendee {
  email: string | null;
  name: string | null;
}

export interface GranolaTranscriptSegment {
  speakerEmail: string | null;
  speakerName: string | null;
  text: string;
  startedAtMs: number;
}

export interface GranolaUserInfo {
  email: string;
  name: string | null;
  plan: 'free' | 'pro' | 'business' | 'enterprise' | string;
}
```

- [ ] **Step 2: Compile check**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/integrations/granola/types.ts
git commit -m "feat(granola): add Granola API response types"
```

---

## Task 2: Extend `IntegrationProvider` with optional `connectWithApiKey`

**Files:**
- Modify: `apps/api/src/integrations/_platform/types.ts`

- [ ] **Step 1: Add the optional method to the interface**

In `apps/api/src/integrations/_platform/types.ts`, change the `IntegrationProvider` interface to add ONE new optional method right after `handleCallback`:

```ts
export interface IntegrationProvider {
  id: ProviderId;
  displayName: string;
  scopes: string[];
  /** OAuth-style mode: returns a URL for the user to visit. */
  initiateAuth(userId: string, organizationId: string): Promise<InitiateAuthResult>;
  /** OAuth-style mode: provider redirected back with code+state. */
  handleCallback(params: { code: string; state: string }): Promise<Integration>;
  /** API-key-paste mode: user submitted a long-lived bearer token directly. */
  connectWithApiKey?(params: {
    userId: string;
    organizationId: string;
    apiKey: string;
  }): Promise<Integration>;
  sync(integration: Integration, options: SyncOptions): Promise<SyncResult>;
  handleWebhook(headers: Record<string, string>, body: unknown, rawBody?: Buffer): Promise<void>;
  disconnect(integration: Integration): Promise<void>;
}
```

Add the corresponding `AuthMode` type just above `IntegrationProvider`:

```ts
export type AuthMode = 'oauth' | 'api_key';
```

And update `InitiateAuthResult` to expose the mode and (for paste-key mode) instructions:

```ts
export interface InitiateAuthResult {
  mode: AuthMode;
  authUrl?: string;                         // present when mode === 'oauth'
  instructions?: {                          // present when mode === 'api_key'
    title: string;                          // e.g. "Paste your Granola API key"
    body: string;                           // human-readable steps
    helpUrl?: string;                       // link to provider docs
    placeholder?: string;                   // hint for the input
  };
}
```

- [ ] **Step 2: Update existing callers to set mode**

`apps/api/src/integrations/_mock/index.ts` — its `initiateAuth` currently returns `{authUrl, state}`. Change to:

```ts
async initiateAuth(): Promise<InitiateAuthResult> {
  return { mode: 'oauth', authUrl: 'https://mock.example.com/auth' };
},
```

(`state` is signed elsewhere when actual OAuth providers wire up.)

- [ ] **Step 3: Update `routes/integrations.ts` connect handler**

In `apps/api/src/routes/integrations.ts`, the current `POST /:provider/connect` returns the result of `initiateAuth` directly. Pass through the new `mode`/`instructions` fields. Find the existing handler and replace its body with:

```ts
router.post('/:provider/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = connectSchema.parse({ provider: req.params.provider });
    if (!isProviderRegistered(provider)) {
      return res.status(404).json({ error: `Provider ${provider} not available yet` });
    }
    const orgId = getOrgId(req);
    const userId = await resolveInternalUserId(req.user!.id);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const result = await getProvider(provider).initiateAuth(userId, orgId);
    res.json(result);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Compile + tests**

```bash
cd apps/api && npx tsc --noEmit && npx vitest run tests/integrations/
```

Expect 18/18 still passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/_platform/types.ts \
  apps/api/src/integrations/_mock/index.ts \
  apps/api/src/routes/integrations.ts
git commit -m "feat(integrations): support api_key auth mode in IntegrationProvider"
```

---

## Task 3: Granola HTTP client

**Files:**
- Create: `apps/api/src/integrations/granola/client.ts`
- Create: `apps/api/tests/integrations/granola/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integrations/granola/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('granola client', () => {
  it('validateKey returns user info on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ email: 'a@b.com', name: 'Alice', plan: 'business' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch;

    const { validateKey } = await import('../../../src/integrations/granola/client.js');
    const info = await validateKey('grn_test123');
    expect(info.email).toBe('a@b.com');
    expect(info.plan).toBe('business');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/me$/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer grn_test123' }),
      })
    );
  });

  it('validateKey throws "Invalid API key" on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 })) as unknown as typeof fetch;
    const { validateKey } = await import('../../../src/integrations/granola/client.js');
    await expect(validateKey('bad')).rejects.toThrow(/invalid api key/i);
  });

  it('validateKey throws "Plan not supported" on 403', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 403 })) as unknown as typeof fetch;
    const { validateKey } = await import('../../../src/integrations/granola/client.js');
    await expect(validateKey('free-plan-key')).rejects.toThrow(/plan/i);
  });

  it('listNotes paginates via cursor', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url);
      if (calls.length === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{ id: 'n1', title: 'Meeting 1', createdAt: '2026-04-29T10:00:00Z',
                   updatedAt: '2026-04-29T11:00:00Z', meetingStartedAt: null,
                   meetingEndedAt: null, attendees: [] }],
          hasMore: true, nextCursor: 'cur-2',
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [{ id: 'n2', title: 'Meeting 2', createdAt: '2026-04-30T09:00:00Z',
                 updatedAt: '2026-04-30T10:00:00Z', meetingStartedAt: null,
                 meetingEndedAt: null, attendees: [] }],
        hasMore: false, nextCursor: null,
      }), { status: 200 }));
    }) as unknown as typeof fetch;

    const { listNotesSince } = await import('../../../src/integrations/granola/client.js');
    const notes = await listNotesSince('grn_x', '2026-04-29T00:00:00Z');
    expect(notes).toHaveLength(2);
    expect(notes.map(n => n.id)).toEqual(['n1', 'n2']);
    expect(calls[0]).toContain('created_after=2026-04-29T00%3A00%3A00Z');
    expect(calls[1]).toContain('cursor=cur-2');
  });

  it('listNotesSince retries on 429 (rate limit) once with backoff', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response('', { status: 429, headers: { 'Retry-After': '0' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [], hasMore: false, nextCursor: null,
      }), { status: 200 }));
    }) as unknown as typeof fetch;

    const { listNotesSince } = await import('../../../src/integrations/granola/client.js');
    const notes = await listNotesSince('grn_x', '2026-04-29T00:00:00Z');
    expect(notes).toHaveLength(0);
    expect(callCount).toBe(2);
  });

  it('getNoteWithTranscript fetches the include=transcript path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'n1', title: 'X', createdAt: '2026-04-30T09:00:00Z',
      updatedAt: '2026-04-30T10:00:00Z', meetingStartedAt: null,
      meetingEndedAt: null, attendees: [], summary: 'Quick chat',
      transcript: [{ speakerName: 'A', speakerEmail: 'a@b.com', text: 'hi', startedAtMs: 0 }],
    }), { status: 200 })) as unknown as typeof fetch;

    const { getNoteWithTranscript } = await import('../../../src/integrations/granola/client.js');
    const note = await getNoteWithTranscript('grn_x', 'n1');
    expect(note.summary).toBe('Quick chat');
    expect(note.transcript).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/notes\/n1\?include=transcript$/),
      expect.anything()
    );
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && npx vitest run tests/integrations/granola/client.test.ts
```

Expect "Cannot find module" failures.

- [ ] **Step 3: Implement the client**

Create `apps/api/src/integrations/granola/client.ts`:

```ts
import { log } from '../../utils/logger.js';
import type {
  GranolaNoteListResponse,
  GranolaNoteSummary,
  GranolaNoteWithTranscript,
  GranolaUserInfo,
} from './types.js';

const BASE_URL = process.env.GRANOLA_API_BASE ?? 'https://public-api.granola.ai';

interface FetchOptions {
  retries?: number;
}

async function granolaFetch(
  apiKey: string,
  path: string,
  options: FetchOptions = {}
): Promise<Response> {
  const retries = options.retries ?? 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.status === 429 && attempt < retries) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
        const waitMs = Math.max(0, retryAfter * 1000);
        log.warn('granola: rate limited, retrying', { path, waitMs });
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) throw err;
    }
  }
  throw lastError ?? new Error('granolaFetch: unknown error');
}

export async function validateKey(apiKey: string): Promise<GranolaUserInfo> {
  const res = await granolaFetch(apiKey, '/v1/me');
  if (res.status === 401) throw new Error('Invalid API key');
  if (res.status === 403) {
    throw new Error('Plan not supported — Granola API requires Business or Enterprise');
  }
  if (!res.ok) {
    throw new Error(`Granola validateKey failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GranolaUserInfo;
}

export async function listNotesSince(
  apiKey: string,
  sinceIso: string
): Promise<GranolaNoteSummary[]> {
  const out: GranolaNoteSummary[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50;
  do {
    const params = new URLSearchParams({ created_after: sinceIso });
    if (cursor) params.set('cursor', cursor);
    const res = await granolaFetch(apiKey, `/v1/notes?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Granola listNotes failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as GranolaNoteListResponse;
    out.push(...page.data);
    cursor = page.hasMore ? page.nextCursor : null;
    pageCount++;
    if (pageCount >= MAX_PAGES) {
      log.warn('granola: listNotesSince hit MAX_PAGES, stopping early', { pageCount });
      break;
    }
  } while (cursor);
  return out;
}

export async function getNoteWithTranscript(
  apiKey: string,
  noteId: string
): Promise<GranolaNoteWithTranscript> {
  const res = await granolaFetch(apiKey, `/v1/notes/${encodeURIComponent(noteId)}?include=transcript`);
  if (!res.ok) {
    throw new Error(`Granola getNote failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GranolaNoteWithTranscript;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
cd apps/api && npx vitest run tests/integrations/granola/client.test.ts
```

Expect 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/granola/client.ts \
  apps/api/tests/integrations/granola/client.test.ts
git commit -m "feat(granola): add HTTP client (validateKey, listNotesSince, getNoteWithTranscript)"
```

---

## Task 4: Granola → Activity mapper

**Files:**
- Create: `apps/api/src/integrations/granola/mapper.ts`
- Create: `apps/api/tests/integrations/granola/mapper.test.ts`

- [ ] **Step 1: Failing test**

Create `apps/api/tests/integrations/granola/mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { granolaNoteToActivityRow } from '../../../src/integrations/granola/mapper.js';
import type { GranolaNoteWithTranscript } from '../../../src/integrations/granola/types.js';

const fixture: GranolaNoteWithTranscript = {
  id: 'note-1',
  title: 'Acme founder check-in',
  createdAt: '2026-04-30T15:00:00Z',
  updatedAt: '2026-04-30T15:48:00Z',
  meetingStartedAt: '2026-04-30T15:00:00Z',
  meetingEndedAt:   '2026-04-30T15:48:00Z',
  attendees: [
    { email: 'john@acme.com', name: 'John' },
    { email: 'self@firm.com', name: 'Me' },
  ],
  summary: 'Discussed Q1 numbers and plans for EU expansion.',
  transcript: [
    { speakerName: 'John', speakerEmail: 'john@acme.com', text: 'Revenue is up 30%.', startedAtMs: 0 },
    { speakerName: 'Me', speakerEmail: 'self@firm.com', text: 'How is churn?', startedAtMs: 5_000 },
  ],
};

describe('granolaNoteToActivityRow', () => {
  it('produces an Activity insert payload with expected shape', () => {
    const row = granolaNoteToActivityRow({
      note: fixture,
      dealId: 'deal-1',
      organizationId: 'org-1',
      userId: 'u-1',
    });
    expect(row.dealId).toBe('deal-1');
    expect(row.organizationId).toBe('org-1');
    expect(row.type).toBe('MEETING');
    expect(row.source).toBe('granola');
    expect(row.externalId).toBe('note-1');
    expect(row.title).toContain('Acme founder check-in');
    expect(row.summary).toContain('Q1 numbers');
    expect(row.occurredAt).toBe('2026-04-30T15:00:00Z');
    expect(row.durationSeconds).toBe(48 * 60);
    expect(row.metadata).toMatchObject({
      attendees: expect.arrayContaining([
        expect.objectContaining({ email: 'john@acme.com' }),
      ]),
      transcriptSegmentCount: 2,
    });
  });

  it('handles missing optional fields gracefully', () => {
    const row = granolaNoteToActivityRow({
      note: { ...fixture, meetingStartedAt: null, meetingEndedAt: null, summary: null },
      dealId: 'deal-1', organizationId: 'org-1', userId: 'u-1',
    });
    expect(row.occurredAt).toBe('2026-04-30T15:00:00Z'); // falls back to createdAt
    expect(row.durationSeconds).toBeNull();
    expect(row.summary).toBe('');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/api && npx vitest run tests/integrations/granola/mapper.test.ts
```

- [ ] **Step 3: Implement the mapper**

Create `apps/api/src/integrations/granola/mapper.ts`:

```ts
import type { GranolaNoteWithTranscript } from './types.js';

export interface ActivityRow {
  dealId: string;
  organizationId: string;
  userId: string;
  type: 'MEETING';
  source: 'granola';
  externalId: string;
  title: string;
  summary: string;
  occurredAt: string;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
}

export function granolaNoteToActivityRow(params: {
  note: GranolaNoteWithTranscript;
  dealId: string;
  organizationId: string;
  userId: string;
}): ActivityRow {
  const { note, dealId, organizationId, userId } = params;
  const occurredAt = note.meetingStartedAt ?? note.createdAt;
  const durationSeconds =
    note.meetingStartedAt && note.meetingEndedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(note.meetingEndedAt) - Date.parse(note.meetingStartedAt)) / 1000
          )
        )
      : null;

  return {
    dealId,
    organizationId,
    userId,
    type: 'MEETING',
    source: 'granola',
    externalId: note.id,
    title: note.title ?? 'Granola meeting',
    summary: note.summary ?? '',
    occurredAt,
    durationSeconds,
    metadata: {
      attendees: note.attendees,
      transcriptSegmentCount: note.transcript.length,
    },
  };
}
```

- [ ] **Step 4: Verify pass**

```bash
cd apps/api && npx vitest run tests/integrations/granola/mapper.test.ts
```

Expect 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/integrations/granola/mapper.ts apps/api/tests/integrations/granola/mapper.test.ts
git commit -m "feat(granola): add note → Activity mapper"
```

---

## Task 5: Granola provider implementation

**Files:**
- Create: `apps/api/src/integrations/granola/index.ts`
- Create: `apps/api/tests/integrations/granola/sync.test.ts`

- [ ] **Step 1: Implement the provider**

Create `apps/api/src/integrations/granola/index.ts`:

```ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import {
  encryptForStorage,
  decryptFromStorage,
} from '../_platform/tokenStore.js';
import { matchEmailAddressesToDeals } from '../_platform/matcher.js';
import type {
  Integration,
  IntegrationProvider,
  InitiateAuthResult,
  SyncOptions,
  SyncResult,
} from '../_platform/types.js';
import { validateKey, listNotesSince, getNoteWithTranscript } from './client.js';
import { granolaNoteToActivityRow } from './mapper.js';

const DEFAULT_BACKFILL_DAYS = 30;

export const granolaProvider: IntegrationProvider = {
  id: 'granola',
  displayName: 'Granola',
  scopes: [],

  async initiateAuth(): Promise<InitiateAuthResult> {
    return {
      mode: 'api_key',
      instructions: {
        title: 'Connect Granola',
        body:
          'Granola requires a Business or Enterprise plan to issue API keys. ' +
          'Generate one in the Granola desktop app under Settings → Connectors → API keys, ' +
          'then paste it below.',
        helpUrl: 'https://docs.granola.ai/help-center/sharing/integrations/personal-api',
        placeholder: 'grn_…',
      },
    };
  },

  async handleCallback(): Promise<Integration> {
    throw new Error('Granola uses api_key auth, not OAuth callback');
  },

  async connectWithApiKey(params): Promise<Integration> {
    const userInfo = await validateKey(params.apiKey);
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('Integration')
      .select('id')
      .eq('userId', params.userId)
      .eq('provider', 'granola')
      .maybeSingle();

    const row = {
      organizationId: params.organizationId,
      userId: params.userId,
      provider: 'granola' as const,
      status: 'connected' as const,
      externalAccountId: userInfo.email,
      externalAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptForStorage(params.apiKey),
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      scopes: [],
      settings: { plan: userInfo.plan, displayName: userInfo.name },
      lastSyncAt: null,
      lastSyncError: null,
      consecutiveFailures: 0,
      createdAt: existing?.id ? undefined : now,
      updatedAt: now,
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('Integration')
        .update(row)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) throw new Error(`Granola connect failed: ${error?.message}`);
      return data as Integration;
    }
    const { data, error } = await supabase
      .from('Integration')
      .insert(row)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Granola connect failed: ${error?.message}`);
    return data as Integration;
  },

  async sync(integration, options): Promise<SyncResult> {
    const apiKey = decryptFromStorage(integration.accessTokenEncrypted);
    if (!apiKey) throw new Error('Granola: no API key stored');

    const since =
      options.since?.toISOString() ??
      integration.lastSyncAt ??
      new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const notes = await listNotesSince(apiKey, since);
    let itemsMatched = 0;
    const errors: string[] = [];

    for (const note of notes) {
      try {
        const attendeeEmails = note.attendees
          .map(a => a.email)
          .filter((e): e is string => !!e);
        const match = await matchEmailAddressesToDeals({
          organizationId: integration.organizationId,
          emails: attendeeEmails,
        });
        if (match.matchedDealIds.length === 0) continue;

        const full = await getNoteWithTranscript(apiKey, note.id);
        for (const dealId of match.matchedDealIds) {
          const row = granolaNoteToActivityRow({
            note: full,
            dealId,
            organizationId: integration.organizationId,
            userId: integration.userId,
          });
          const { error } = await supabase
            .from('Activity')
            .upsert(row, { onConflict: 'dealId,source,externalId' });
          if (error) {
            errors.push(`note ${note.id} → deal ${dealId}: ${error.message}`);
          } else {
            itemsMatched++;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        errors.push(`note ${note.id}: ${message}`);
        log.warn('granola: per-note sync failed (continuing)', { noteId: note.id, message });
      }
    }

    return { itemsSynced: notes.length, itemsMatched, errors };
  },

  async handleWebhook(): Promise<void> {
    // Granola does not send webhooks. This will never be called for granola
    // unless someone POSTs to /api/integrations/webhooks/granola directly,
    // in which case we no-op.
  },

  async disconnect(): Promise<void> {
    // Personal API keys can only be revoked from the Granola desktop app.
    // We just delete the local row; the route layer handles status='revoked'.
  },
};
```

- [ ] **Step 2: Sync test**

Create `apps/api/tests/integrations/granola/sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.DATA_ENCRYPTION_KEY =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
  vi.resetModules();
});

describe('granolaProvider.sync', () => {
  it('lists notes, matches attendees to deals, fetches transcripts, upserts Activity rows', async () => {
    // Stub HTTP
    vi.doMock('../../../src/integrations/granola/client.js', () => ({
      validateKey: vi.fn(),
      listNotesSince: vi.fn().mockResolvedValue([
        {
          id: 'n1', title: 'Founder call', createdAt: '2026-04-30T10:00:00Z',
          updatedAt: '2026-04-30T10:00:00Z',
          meetingStartedAt: '2026-04-30T10:00:00Z',
          meetingEndedAt:   '2026-04-30T10:30:00Z',
          attendees: [{ email: 'john@acme.com', name: 'John' }],
        },
      ]),
      getNoteWithTranscript: vi.fn().mockResolvedValue({
        id: 'n1', title: 'Founder call', createdAt: '2026-04-30T10:00:00Z',
        updatedAt: '2026-04-30T10:00:00Z',
        meetingStartedAt: '2026-04-30T10:00:00Z',
        meetingEndedAt:   '2026-04-30T10:30:00Z',
        attendees: [{ email: 'john@acme.com', name: 'John' }],
        summary: 'Q1 review',
        transcript: [
          { speakerName: 'John', speakerEmail: 'john@acme.com', text: 'hi', startedAtMs: 0 },
        ],
      }),
    }));

    // Stub Supabase + matcher
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn();
    fromMock.mockReturnValueOnce({ // Contact lookup inside matcher
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ id: 'c-1', email: 'john@acme.com' }],
        error: null,
      }),
    });
    fromMock.mockReturnValueOnce({ // ContactDeal lookup inside matcher
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ dealId: 'd-1' }], error: null }),
    });
    fromMock.mockReturnValueOnce({ upsert });
    vi.doMock('../../../src/supabase.js', () => ({
      supabase: { from: fromMock },
    }));

    const { granolaProvider } = await import('../../../src/integrations/granola/index.js');
    const integration = {
      id: 'i-1', organizationId: 'org-1', userId: 'u-1', provider: 'granola',
      status: 'connected',
      accessTokenEncrypted: 'placeholder',  // tokenStore.decryptFromStorage handles non-encrypted
      refreshTokenEncrypted: null, tokenExpiresAt: null, scopes: [],
      settings: {}, lastSyncAt: null, lastSyncError: null, consecutiveFailures: 0,
      externalAccountId: null, externalAccountEmail: null,
      createdAt: '2026-04-30T00:00:00Z', updatedAt: '2026-04-30T00:00:00Z',
    } as any;

    // Override decryptFromStorage to return the placeholder verbatim
    vi.doMock('../../../src/integrations/_platform/tokenStore.js', () => ({
      encryptForStorage: (v: string) => v,
      decryptFromStorage: (v: string) => v,
    }));

    const result = await granolaProvider.sync(integration, {});
    expect(result.itemsSynced).toBe(1);
    expect(result.itemsMatched).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        dealId: 'd-1',
        source: 'granola',
        externalId: 'n1',
        title: 'Founder call',
        type: 'MEETING',
      }),
      { onConflict: 'dealId,source,externalId' }
    );
  });
});
```

- [ ] **Step 3: Verify**

```bash
cd apps/api && npx tsc --noEmit && npx vitest run tests/integrations/
```

All Granola tests pass; existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/integrations/granola/index.ts \
  apps/api/tests/integrations/granola/sync.test.ts
git commit -m "feat(granola): provider implementation with paste-key connect + polling sync"
```

---

## Task 6: API-key submission endpoint + provider registration

**Files:**
- Modify: `apps/api/src/routes/integrations.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add the API-key endpoint**

In `apps/api/src/routes/integrations.ts`, add a Zod schema and endpoint right after the existing `connectSchema`:

```ts
const apiKeySchema = z.object({
  apiKey: z.string().min(8).max(512),
});

router.post('/:provider/api-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = (connectSchema.parse({ provider: req.params.provider })).provider;
    if (!isProviderRegistered(provider)) {
      return res.status(404).json({ error: `Provider ${provider} not available yet` });
    }
    const impl = getProvider(provider);
    if (!impl.connectWithApiKey) {
      return res.status(400).json({ error: `Provider ${provider} does not accept API keys` });
    }
    const { apiKey } = apiKeySchema.parse(req.body);
    const orgId = getOrgId(req);
    const userId = await resolveInternalUserId(req.user!.id);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const integration = await impl.connectWithApiKey({ userId, organizationId: orgId, apiKey });
    res.json({ id: integration.id, provider: integration.provider, status: integration.status });
  } catch (err) {
    if (err instanceof Error && /invalid api key|plan/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});
```

- [ ] **Step 2: Register Granola in app startup**

Open `apps/api/src/app.ts`. Find the imports section and add:

```ts
import { registerProvider } from './integrations/_platform/registry.js';
import { granolaProvider } from './integrations/granola/index.js';
```

Find a place near the bottom of the file (after env validation, before `export default app` if there's such a line, or just at the end before the file's natural end). Add:

```ts
registerProvider(granolaProvider);
```

- [ ] **Step 3: Compile + tests**

```bash
cd apps/api && npx tsc --noEmit && npx vitest run tests/integrations/
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/integrations.ts apps/api/src/app.ts
git commit -m "feat(integrations): POST /:provider/api-key endpoint + register granolaProvider"
```

---

## Task 7: Settings UI — paste-key modal

**Files:**
- Modify: `apps/web/js/integrations.js`

- [ ] **Step 1: Update the connect handler to branch on mode**

The current `onCardClick` branch for `connect` does `POST /api/integrations/${provider}/connect`, expects `{authUrl}`, and redirects. Now the response is `{mode, authUrl?, instructions?}`. If `mode === 'oauth'` redirect; if `mode === 'api_key'` open a modal.

Read the current `apps/web/js/integrations.js`. Replace the inside of the `if (action === 'connect') { ... }` branch with:

```js
  if (action === 'connect') {
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/integrations/${provider}/connect`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.mode === 'oauth' && result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      if (result.mode === 'api_key' && result.instructions) {
        openApiKeyModal(provider, result.instructions);
        btn.disabled = false;
        return;
      }
      throw new Error('Unsupported auth mode');
    } catch (err) {
      btn.disabled = false;
      alert(`Could not start connection: ${err.message}`);
    }
  }
```

- [ ] **Step 2: Add the modal helper at the end of the file**

Add to the bottom of `apps/web/js/integrations.js`, before the final `if (document.readyState === 'loading') {...}` block:

```js
function openApiKeyModal(provider, instructions) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center';
  overlay.style.background = 'rgba(0,0,0,0.45)';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4" role="dialog" aria-modal="true">
      <h3 class="text-base font-bold text-text-main mb-1">${escapeHtml(instructions.title)}</h3>
      <p class="text-sm text-text-secondary mb-4">${escapeHtml(instructions.body)}</p>
      ${instructions.helpUrl
        ? `<a href="${instructions.helpUrl}" target="_blank" rel="noopener" class="text-xs font-semibold" style="color:${NAVY}">How to find your key →</a>`
        : ''}
      <input type="password" id="api-key-input"
        class="mt-4 w-full border border-border-subtle rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style="--tw-ring-color:${NAVY}66"
        placeholder="${escapeHtml(instructions.placeholder ?? '')}" autocomplete="off" />
      <div id="api-key-error" class="mt-2 text-xs" style="color:#991B1B; display:none;"></div>
      <div class="mt-5 flex items-center justify-end gap-2">
        <button id="api-key-cancel" class="px-3 py-1.5 text-sm font-semibold rounded-md border border-border-subtle bg-white">Cancel</button>
        <button id="api-key-submit" class="px-3 py-1.5 text-sm font-semibold rounded-md text-white" style="background:${NAVY}">Connect</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#api-key-input');
  const errEl = overlay.querySelector('#api-key-error');
  const closeModal = () => overlay.remove();
  overlay.querySelector('#api-key-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  input.focus();

  overlay.querySelector('#api-key-submit').addEventListener('click', async () => {
    const apiKey = input.value.trim();
    if (apiKey.length < 8) {
      errEl.textContent = 'Key looks too short';
      errEl.style.display = 'block';
      return;
    }
    try {
      const res = await authFetch(`/api/integrations/${provider}/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        errEl.textContent = j.error ?? `HTTP ${res.status}`;
        errEl.style.display = 'block';
        return;
      }
      closeModal();
      await render();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
```

- [ ] **Step 3: Smoke check**

```bash
node --check apps/web/js/integrations.js && echo "JS OK"
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/js/integrations.js
git commit -m "feat(integrations): paste-key modal for api_key auth providers"
```

---

## Task 8: Env vars + progress entry

**Files:**
- Modify: `apps/api/.env.example`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Add Granola env vars**

Append to `apps/api/.env.example` under the existing "Provider credentials" comment block:

```bash
# Granola API (Phase 1) — base URL only; users paste their own grn_ keys via UI.
GRANOLA_API_BASE=https://public-api.granola.ai
```

(No client secret. No webhook secret. Granola has neither for personal API keys.)

- [ ] **Step 2: PROGRESS.md entry**

Prepend to PROGRESS.md (matching the format of the most recent session entry):

```
### Session 65 — April 30, 2026

#### Goal
Wire Granola as the first real provider in the Integrations Platform.

#### What shipped
- 3 Phase 0 review follow-ups: raw webhook body capture (`req.rawBody`), per-integration sync timeout + bounded concurrency in `syncAll`, `Integration` timestamp fields as ISO strings (matching Supabase wire format).
- `IntegrationProvider` extended with optional `connectWithApiKey()` for paste-key providers; `InitiateAuthResult` now includes a `mode` discriminator (`'oauth' | 'api_key'`).
- New `apps/api/src/integrations/granola/`: types, HTTP client (`validateKey`, `listNotesSince` with cursor pagination + 429 retry, `getNoteWithTranscript`), note→Activity mapper, provider implementation.
- `POST /api/integrations/:provider/api-key` endpoint accepts a key, validates against the provider, encrypts and stores. Granola registered on app boot.
- Settings UI: paste-key modal opens for `mode: 'api_key'` providers (Granola), with help link, plan-gating warning, and inline error display.
- Tests: client (pagination, rate-limit retry, 401/403), mapper (occurredAt/duration edge cases), end-to-end sync (mocked client + matcher + Activity upsert).

#### Reality vs. spec
The original spec assumed Granola had third-party OAuth and `meeting.transcript.ready` webhooks. Neither exists. Granola offers Personal API keys (Business/Enterprise plan only), no webhooks. Phase 1 ships the paste-key + polling architecture; webhook code path remains intact for Phase 2+ providers (Gmail, Calendar).

#### Caveats
- Connecting Granola requires a Business or Enterprise plan; Free/Pro users will see a clear "plan not supported" error from the validation step.
- Sync runs every 6 hours via Vercel cron + on-demand via the existing `POST /api/integrations/:id/sync` button. No real-time push (no webhooks available).
- AI extraction on transcripts (running runFinancialAgent etc.) is deferred to a follow-up. Phase 1 attaches transcripts and Granola's own `summary` field as Activities; deeper extraction lands when the value is validated with users.
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env.example PROGRESS.md
git commit -m "docs(granola): document env vars + Session 65 progress entry"
```

---

## Self-review checklist

Before final review, verify:

1. **Test count:** 18 (Phase 0 + hardening) + 6 (client) + 2 (mapper) + 1 (sync) = **27 tests in `tests/integrations/`** — all passing.
2. **Type honesty:** `Integration.tokenExpiresAt`/`lastSyncAt`/`createdAt`/`updatedAt` are `string | null`/`string` post-hardening.
3. **Granola endpoint coverage:** `validateKey`, `listNotesSince`, `getNoteWithTranscript` all hit the real paths (`/v1/me`, `/v1/notes`, `/v1/notes/{id}?include=transcript`).
4. **Activity dedupe:** the `upsert` uses `onConflict: 'dealId,source,externalId'`. **Verify this unique constraint actually exists on the Activity table** — if it doesn't, dedupe won't work and re-syncing the same meeting creates duplicates.
5. **Plan-gating:** `validateKey` translates 403 to a "plan not supported" error message that surfaces in the UI.
6. **Org isolation:** `connectWithApiKey` writes `organizationId`; `sync` reads `integration.organizationId` for the matcher; Activity rows include `organizationId`.
7. **Encryption:** the API key is encrypted via `encryptForStorage` and never logged.

Open question to confirm before merging:

- Does the `Activity` table have a unique index on `(dealId, source, externalId)`? If not, add it via a migration as part of this phase or change the mapper's dedupe strategy.

---

## Next phase preview

Phase 2 (Gmail) inherits everything: the `IntegrationProvider` interface (now with both auth modes), the encrypted token store, the matcher, the syncEngine timeout/concurrency, the raw body capture (Gmail Pub/Sub will use it), the Settings UI shell, and the cron schedule. Gmail uses real OAuth, so Phase 2's first task is wiring `mode: 'oauth'` and the `state` token round-trip — both already exist on the platform.
