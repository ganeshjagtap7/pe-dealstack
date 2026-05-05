# AI Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user AI usage tracking (LLM tokens + cost) and an internal-only admin page so the Pocket Fund team can see who consumes what during beta, without imposing quotas on users.

**Architecture:** Single chokepoint. All LLM calls go through `trackedLLM` wrappers that read user/org from `AsyncLocalStorage` request context, run the call, then insert a `UsageEvent` row with computed cost. A separate internal-admin gate (`User.isInternal` boolean) protects a new `/internal/usage.html` page with three tabs: live feed, leaderboard, cost breakdown.

**Tech Stack:** Node.js + Express (apps/api), Supabase (Postgres), Vanilla JS + Vite (apps/web), LangChain/`@langchain/openai`, Vitest for tests, Resend for alerts, Chart.js for cost charts.

**Spec:** `docs/superpowers/specs/2026-05-05-ai-usage-tracking-design.md`

**Phases (each phase = one PR):**
1. Foundation (Tasks 1–5) — DB ready + middleware + wrapper, no callsite changes yet
2. Wire up tracking (Tasks 6–9) — migrate all LLM/Apify/Azure callsites
3. Internal admin page (Tasks 10–13)
4. User-facing meter (Task 14)
5. Safety net + rollout (Tasks 15–16)

---

## Phase 1 — Foundation

### Task 1: Run migration + verify DB shape

**Files:**
- Read: `apps/api/usage-tracking-migration.sql`

- [ ] **Step 1: Confirm migration was run by user**

User has already been given the SQL. Confirm before continuing — ask the user if `usage-tracking-migration.sql` has been run against Supabase. Do NOT proceed if unconfirmed.

- [ ] **Step 2: Verify table existence with a Supabase query**

Run this from a TS file or Supabase SQL editor (the engineer can use either):

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('UsageEvent','ModelPrice','OperationCredits','UsageAlert');
```

Expected: 4 rows.

- [ ] **Step 3: Verify User columns exist**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'User'
  AND column_name IN ('isInternal','isThrottled','isBlocked');
```

Expected: 3 rows.

- [ ] **Step 4: Verify seeded data**

```sql
SELECT COUNT(*) FROM public."ModelPrice";        -- expect ≥ 14
SELECT COUNT(*) FROM public."OperationCredits";  -- expect ≥ 13
SELECT email FROM public."User" WHERE "isInternal" = true;  -- expect 1-3 rows depending on which emails exist
```

If any check fails, stop and re-run the migration before continuing.

---

### Task 2: ModelPrice cache service

**Files:**
- Create: `apps/api/src/services/usage/modelPrices.ts`
- Test: `apps/api/tests/usage/modelPrices.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/modelPrices.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getModelPrice, computeCostUsd, _resetModelPriceCache } from '../../src/services/usage/modelPrices.js';

vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({
        data: [
          { model: 'gpt-4o', provider: 'openai', inputPricePer1M: 2.5, outputPricePer1M: 10.0 },
          { model: 'gpt-4o-mini', provider: 'openai', inputPricePer1M: 0.15, outputPricePer1M: 0.6 },
        ],
        error: null,
      })),
    })),
  },
}));

describe('modelPrices', () => {
  beforeEach(() => _resetModelPriceCache());

  it('returns prices for a known model', async () => {
    const price = await getModelPrice('gpt-4o');
    expect(price).toEqual({ inputPricePer1M: 2.5, outputPricePer1M: 10.0 });
  });

  it('returns null for unknown model', async () => {
    const price = await getModelPrice('does-not-exist');
    expect(price).toBeNull();
  });

  it('computes cost correctly', () => {
    const price = { inputPricePer1M: 2.5, outputPricePer1M: 10.0 };
    // 1000 prompt tokens at $2.5/1M = $0.0025
    // 500 completion tokens at $10/1M = $0.005
    // Total = $0.0075
    expect(computeCostUsd(price, 1000, 500)).toBeCloseTo(0.0075, 6);
  });

  it('returns 0 cost when price is null', () => {
    expect(computeCostUsd(null, 1000, 500)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run tests/usage/modelPrices.test.ts
```
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/services/usage/modelPrices.ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

export interface ModelPriceRow {
  inputPricePer1M: number;
  outputPricePer1M: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cache: Map<string, ModelPriceRow> | null = null;
let cacheLoadedAt = 0;

async function loadCache(): Promise<void> {
  const { data, error } = await supabase
    .from('ModelPrice')
    .select('model, provider, "inputPricePer1M", "outputPricePer1M"');

  if (error) {
    log.error('modelPrices: failed to load', error);
    return;
  }
  cache = new Map();
  for (const row of data ?? []) {
    cache.set(row.model, {
      inputPricePer1M: Number(row.inputPricePer1M),
      outputPricePer1M: Number(row.outputPricePer1M),
    });
  }
  cacheLoadedAt = Date.now();
}

export async function getModelPrice(model: string): Promise<ModelPriceRow | null> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
  return cache?.get(model) ?? null;
}

export function computeCostUsd(
  price: ModelPriceRow | null,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!price) return 0;
  return (
    (promptTokens / 1_000_000) * price.inputPricePer1M +
    (completionTokens / 1_000_000) * price.outputPricePer1M
  );
}

/** Test-only: reset the in-memory cache so tests don't leak state. */
export function _resetModelPriceCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run tests/usage/modelPrices.test.ts
```
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/usage/modelPrices.ts apps/api/tests/usage/modelPrices.test.ts
git commit -m "feat(usage): add ModelPrice cache + cost computation"
```

---

### Task 3: OperationCredits cache service

**Files:**
- Create: `apps/api/src/services/usage/operationCredits.ts`
- Test: `apps/api/tests/usage/operationCredits.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/operationCredits.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreditsForOperation, _resetOperationCreditsCache } from '../../src/services/usage/operationCredits.js';

vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({
        data: [
          { operation: 'deal_chat', credits: 1, description: 'chat' },
          { operation: 'firm_research', credits: 40, description: 'research' },
        ],
        error: null,
      })),
    })),
  },
}));

describe('operationCredits', () => {
  beforeEach(() => _resetOperationCreditsCache());

  it('returns credits for a known operation', async () => {
    expect(await getCreditsForOperation('deal_chat')).toBe(1);
    expect(await getCreditsForOperation('firm_research')).toBe(40);
  });

  it('returns default 1 credit for unknown operation and warns', async () => {
    expect(await getCreditsForOperation('unknown_op')).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd apps/api && npx vitest run tests/usage/operationCredits.test.ts
```

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/services/usage/operationCredits.ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: Map<string, number> | null = null;
let cacheLoadedAt = 0;

async function loadCache(): Promise<void> {
  const { data, error } = await supabase.from('OperationCredits').select('operation, credits');
  if (error) {
    log.error('operationCredits: failed to load', error);
    return;
  }
  cache = new Map();
  for (const row of data ?? []) {
    cache.set(row.operation, Number(row.credits));
  }
  cacheLoadedAt = Date.now();
}

export async function getCreditsForOperation(operation: string): Promise<number> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
  const credits = cache?.get(operation);
  if (credits == null) {
    log.warn('operationCredits: unknown operation, defaulting to 1', { operation });
    return 1;
  }
  return credits;
}

export function _resetOperationCreditsCache(): void {
  cache = null;
  cacheLoadedAt = 0;
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/usage/operationCredits.ts apps/api/tests/usage/operationCredits.test.ts
git commit -m "feat(usage): add OperationCredits cache service"
```

---

### Task 4: usageContext middleware (AsyncLocalStorage)

**Files:**
- Create: `apps/api/src/middleware/usageContext.ts`
- Test: `apps/api/tests/usage/usageContext.test.ts`
- Modify: `apps/api/src/app.ts` — register middleware after `orgMiddleware`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/usageContext.test.ts
import { describe, it, expect } from 'vitest';
import { runWithUsageContext, getUsageContext } from '../../src/middleware/usageContext.js';

describe('usageContext', () => {
  it('returns undefined outside any context', () => {
    expect(getUsageContext()).toBeUndefined();
  });

  it('binds context inside runWithUsageContext', () => {
    const ctx = { userId: 'u1', organizationId: 'o1', source: 'test' as const };
    runWithUsageContext(ctx, () => {
      expect(getUsageContext()).toEqual(ctx);
    });
  });

  it('isolates parallel contexts', async () => {
    const results: Array<string | undefined> = [];
    await Promise.all([
      runWithUsageContext({ userId: 'u1', organizationId: 'o1', source: 'test' as const }, async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(getUsageContext()?.userId);
      }),
      runWithUsageContext({ userId: 'u2', organizationId: 'o2', source: 'test' as const }, async () => {
        results.push(getUsageContext()?.userId);
      }),
    ]);
    expect(results.sort()).toEqual(['u1', 'u2']);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/middleware/usageContext.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

export interface UsageContext {
  userId: string;
  organizationId: string;
  requestId?: string;
  source: 'http' | 'background' | 'test';
}

const storage = new AsyncLocalStorage<UsageContext>();

export function getUsageContext(): UsageContext | undefined {
  return storage.getStore();
}

export function runWithUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Express middleware. Must run AFTER authMiddleware + orgMiddleware so req.user
 * has both id and organizationId populated.
 */
export function usageContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = req.user?.id;
  const organizationId = req.user?.organizationId;
  if (!userId || !organizationId) {
    return next();
  }
  const requestId = (req.headers['x-request-id'] as string) || undefined;
  storage.run({ userId, organizationId, requestId, source: 'http' }, () => next());
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Wire middleware in `app.ts`**

Find where `orgMiddleware` is registered in `apps/api/src/app.ts` and add this line directly after it:

```typescript
import { usageContextMiddleware } from './middleware/usageContext.js';
// ...
app.use(authMiddleware);
app.use(orgMiddleware);
app.use(usageContextMiddleware);   // <-- ADD
```

- [ ] **Step 6: Smoke-build**

```bash
cd apps/api && npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/usageContext.ts apps/api/tests/usage/usageContext.test.ts apps/api/src/app.ts
git commit -m "feat(usage): add AsyncLocalStorage-based usage context middleware"
```

---

### Task 5: trackedLLM wrapper + UsageEvent insertion

**Files:**
- Create: `apps/api/src/services/usage/trackedLLM.ts`
- Test: `apps/api/tests/usage/trackedLLM.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/trackedLLM.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: insertSpy,
      select: vi.fn(() => Promise.resolve({
        data: [
          { model: 'gpt-4o', provider: 'openai', inputPricePer1M: 2.5, outputPricePer1M: 10 },
        ],
        error: null,
      })),
    })),
  },
}));
vi.mock('../../src/services/usage/operationCredits.js', () => ({
  getCreditsForOperation: vi.fn(async () => 5),
}));

import { recordUsageEvent } from '../../src/services/usage/trackedLLM.js';
import { runWithUsageContext } from '../../src/middleware/usageContext.js';

describe('recordUsageEvent', () => {
  beforeEach(() => insertSpy.mockClear());

  it('inserts a UsageEvent with computed cost and credits', async () => {
    await runWithUsageContext(
      { userId: 'u1', organizationId: 'o1', source: 'test' },
      async () => {
        await recordUsageEvent({
          operation: 'deal_chat',
          model: 'gpt-4o',
          provider: 'openai',
          promptTokens: 1000,
          completionTokens: 500,
          status: 'success',
          durationMs: 250,
        });
      },
    );
    expect(insertSpy).toHaveBeenCalledOnce();
    const row = insertSpy.mock.calls[0][0];
    expect(row.userId).toBe('u1');
    expect(row.organizationId).toBe('o1');
    expect(row.operation).toBe('deal_chat');
    expect(row.totalTokens).toBe(1500);
    expect(row.credits).toBe(5);
    // 1000 input × $2.5/1M + 500 output × $10/1M = $0.0025 + $0.005 = $0.0075
    expect(Number(row.costUsd)).toBeCloseTo(0.0075, 6);
  });

  it('skips insert when no usage context is bound', async () => {
    await recordUsageEvent({
      operation: 'deal_chat',
      model: 'gpt-4o',
      provider: 'openai',
      promptTokens: 100,
      completionTokens: 50,
      status: 'success',
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/services/usage/trackedLLM.ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { getUsageContext } from '../../middleware/usageContext.js';
import { getModelPrice, computeCostUsd } from './modelPrices.js';
import { getCreditsForOperation } from './operationCredits.js';

export type UsageProvider = 'openai' | 'openrouter' | 'gemini' | 'anthropic' | 'apify' | 'azure_doc_intelligence';
export type UsageStatus = 'success' | 'error' | 'rate_limited' | 'blocked';

export interface RecordUsageEventInput {
  operation: string;
  model?: string;
  provider: UsageProvider;
  promptTokens?: number;
  completionTokens?: number;
  units?: number;            // for non-LLM providers (searches, pages)
  unitCostUsd?: number;      // pre-computed cost for non-LLM providers
  status: UsageStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export async function recordUsageEvent(input: RecordUsageEventInput): Promise<void> {
  const ctx = getUsageContext();
  if (!ctx) {
    log.warn('recordUsageEvent called outside usage context, skipping', { operation: input.operation });
    return;
  }

  const promptTokens = input.promptTokens ?? 0;
  const completionTokens = input.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;

  let costUsd = input.unitCostUsd ?? 0;
  if (!input.unitCostUsd && input.model) {
    const price = await getModelPrice(input.model);
    costUsd = computeCostUsd(price, promptTokens, completionTokens);
    if (!price) {
      log.warn('recordUsageEvent: unknown model, costUsd=0', { model: input.model });
    }
  }

  const credits = await getCreditsForOperation(input.operation);

  const row = {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    operation: input.operation,
    model: input.model ?? null,
    provider: input.provider,
    promptTokens,
    completionTokens,
    totalTokens,
    units: input.units ?? 0,
    costUsd,
    credits,
    status: input.status,
    durationMs: input.durationMs ?? null,
    metadata: { ...(input.metadata ?? {}), requestId: ctx.requestId },
  };

  // Fire-and-forget; never block the caller on the ledger insert.
  // We log on failure but never throw.
  try {
    const { error } = await supabase.from('UsageEvent').insert(row);
    if (error) log.error('recordUsageEvent: insert failed', { error, operation: input.operation });
  } catch (err) {
    log.error('recordUsageEvent: unexpected error', err);
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/usage/trackedLLM.ts apps/api/tests/usage/trackedLLM.test.ts
git commit -m "feat(usage): add recordUsageEvent for UsageEvent ledger writes"
```

---

### Task 6: requireInternalAdmin middleware

**Files:**
- Create: `apps/api/src/middleware/internalAdmin.ts`
- Test: `apps/api/tests/usage/internalAdmin.test.ts`
- Modify: `apps/api/src/routes/users.ts` — return `isInternal` in `/api/users/me`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/internalAdmin.test.ts
import { describe, it, expect, vi } from 'vitest';

const fromSpy = vi.fn();
vi.mock('../../src/supabase.js', () => ({
  supabase: { from: fromSpy },
}));

import { requireInternalAdmin } from '../../src/middleware/internalAdmin.js';

function makeReq(authId: string | undefined): any {
  return { user: authId ? { id: authId } : undefined };
}
function makeRes(): any {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe('requireInternalAdmin', () => {
  it('returns 404 when no user on request', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when isInternal is false', async () => {
    fromSpy.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { isInternal: false }, error: null }) }) }),
    });
    const req = makeReq('auth-123');
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when isInternal is true', async () => {
    fromSpy.mockReturnValueOnce({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { isInternal: true }, error: null }) }) }),
    });
    const req = makeReq('auth-123');
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/middleware/internalAdmin.ts
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Gate for /api/internal/* routes. Looks up User.isInternal by authId.
 * Returns 404 (not 403) on failure to prevent enumeration of internal routes.
 */
export async function requireInternalAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authId = req.user?.id;
  if (!authId) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  const { data, error } = await supabase
    .from('User')
    .select('isInternal')
    .eq('authId', authId)
    .single();
  if (error || !data?.isInternal) {
    log.info('requireInternalAdmin: denied', { authId });
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Modify `apps/api/src/routes/users.ts` to return `isInternal` from `/me`**

Find the `/me` handler (it returns the User record). Add `isInternal` to the `.select()` list and to the response payload. Example diff target:

```typescript
// In the handler that returns user info:
const { data: user } = await supabase
  .from('User')
  .select('id, email, name, role, organizationId, isInternal, /* ...existing... */')
  .eq('authId', req.user.id)
  .single();
// ensure response includes isInternal: user?.isInternal ?? false
```

If the existing handler doesn't `.select()` (uses `*`), nothing to change — the column will be returned automatically. Just confirm the response shape includes it by reading the file.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/internalAdmin.ts apps/api/tests/usage/internalAdmin.test.ts apps/api/src/routes/users.ts
git commit -m "feat(usage): add requireInternalAdmin middleware + expose isInternal on /api/users/me"
```

---

## Phase 2 — Wire up tracking

### Task 7: Migrate raw OpenAI client callsites

**Files (modify, all import `openai` from `'../openai.js'` and call `openai.chat.completions.create`):**
- `apps/api/src/services/financialClassifier.ts`
- `apps/api/src/services/folderInsightsGenerator.ts`
- `apps/api/src/services/multiDocAnalyzer.ts`
- `apps/api/src/services/narrativeInsights.ts`
- `apps/api/src/services/agents/financialAgent/nodes/verifyNode.ts`
- `apps/api/src/services/agents/financialAgent/nodes/selfCorrectNode.ts`
- `apps/api/src/routes/chat.ts`
- `apps/api/src/routes/ai-ingest.ts`
- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/memos-chat.ts`
- `apps/api/src/services/visionExtractor.ts` (uses `openaiDirect`)

- [ ] **Step 1: Add a thin helper to `apps/api/src/openai.ts` for tracked completions**

Append this to `apps/api/src/openai.ts` (do NOT remove existing `openai` and `openaiDirect` exports):

```typescript
import { recordUsageEvent } from './services/usage/trackedLLM.js';

/**
 * Wrapped chat.completions.create that records a UsageEvent.
 * Drop-in replacement: same signature plus a required `operation` label.
 */
export async function trackedChatCompletion(
  operation: string,
  params: Parameters<NonNullable<typeof openai>['chat']['completions']['create']>[0],
  options?: Parameters<NonNullable<typeof openai>['chat']['completions']['create']>[1],
) {
  if (!openai) throw new Error('LLM client not configured');
  const start = Date.now();
  try {
    const response: any = await openai.chat.completions.create(params as any, options);
    const promptTokens = response?.usage?.prompt_tokens ?? 0;
    const completionTokens = response?.usage?.completion_tokens ?? 0;
    void recordUsageEvent({
      operation,
      model: (params as any).model,
      provider: useOpenRouter ? 'openrouter' : 'openai',
      promptTokens,
      completionTokens,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return response;
  } catch (err) {
    void recordUsageEvent({
      operation,
      model: (params as any).model,
      provider: useOpenRouter ? 'openrouter' : 'openai',
      status: 'error',
      durationMs: Date.now() - start,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
```

Add corresponding `trackedDirectChatCompletion` for `openaiDirect` (same body, different client + always `provider: 'openai'`).

- [ ] **Step 2: Build to verify the new helpers compile**

```bash
cd apps/api && npm run build
```
Expected: PASS.

- [ ] **Step 3: Migrate callsite — financialClassifier.ts**

Replace `await openai.chat.completions.create(...)` with `await trackedChatCompletion('financial_extraction', ...)`. Update the import at top.

Example diff:
```typescript
// before
import { openai, isAIEnabled } from '../openai.js';
// after
import { isAIEnabled, trackedChatCompletion } from '../openai.js';

// before
const response = await openai.chat.completions.create({ model: ... }, { timeout: 120000 });
// after
const response = await trackedChatCompletion('financial_extraction', { model: ... }, { timeout: 120000 });
```

- [ ] **Step 4: Migrate `folderInsightsGenerator.ts` → operation `'folder_insights'`**

- [ ] **Step 5: Migrate `multiDocAnalyzer.ts` → operation `'multi_doc_analysis'`**

- [ ] **Step 6: Migrate `narrativeInsights.ts` → operation `'narrative_insights'`**

- [ ] **Step 7: Migrate `agents/financialAgent/nodes/verifyNode.ts` → operation `'financial_extraction'` (verify is part of the financial extraction flow)**

- [ ] **Step 8: Migrate `agents/financialAgent/nodes/selfCorrectNode.ts` → operation `'financial_extraction'`**

- [ ] **Step 9: Migrate `routes/chat.ts` → operation `'deal_chat'`**

- [ ] **Step 10: Migrate `routes/ai-ingest.ts` → operation `'multi_doc_analysis'`** (or whichever fits — verify by reading the route)

- [ ] **Step 11: Migrate `routes/ai.ts` → operation `'deal_analysis'`**

- [ ] **Step 12: Migrate `routes/memos-chat.ts` → operation `'memo_generation'`**

- [ ] **Step 13: Migrate `services/visionExtractor.ts` → use `trackedDirectChatCompletion('financial_extraction', ...)`**

- [ ] **Step 14: Build + run all tests**

```bash
cd apps/api && npm run build && npx vitest run
```
Expected: build PASS, all tests PASS.

- [ ] **Step 15: Manual smoke test**

Start API + web: `cd apps/api && npm run dev` and `cd apps/web && npm run dev`. Log in as `dev@pocket-fund.com`, open any deal, send a chat message. Then in Supabase SQL editor:

```sql
SELECT operation, model, "promptTokens", "completionTokens", "costUsd", credits, "createdAt"
FROM public."UsageEvent"
ORDER BY "createdAt" DESC LIMIT 5;
```
Expected: at least one row for `deal_chat` with non-zero tokens and a small positive `costUsd`.

- [ ] **Step 16: Commit**

```bash
git add apps/api/src/openai.ts apps/api/src/routes apps/api/src/services
git commit -m "feat(usage): track all raw OpenAI client callsites with operation labels"
```

---

### Task 8: Migrate LangChain factory callsites

**Files:**
- Modify: `apps/api/src/services/llm.ts` — wrap `getChatModel`/`getFastModel`/`getExtractionModel`
- Modify: callers of those factories (financialAgent extract/store nodes, firmResearchAgent, dealChatAgent, memoAgent, dealImportMapper, etc.)

- [ ] **Step 1: Add a tracking adapter inside `services/llm.ts`**

```typescript
import { recordUsageEvent } from './usage/trackedLLM.js';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';

/** Wrap a BaseChatModel to record UsageEvent on every invoke/call. */
export function trackModel(model: BaseChatModel, operation: string, modelName: string): BaseChatModel {
  const original = model.invoke.bind(model);
  model.invoke = async (input: any, options?: any) => {
    const start = Date.now();
    try {
      const result = await original(input, options);
      const usage = (result as AIMessage)?.usage_metadata;
      void recordUsageEvent({
        operation,
        model: modelName,
        provider: useOpenRouter ? 'openrouter' : 'openai',
        promptTokens: usage?.input_tokens ?? 0,
        completionTokens: usage?.output_tokens ?? 0,
        status: 'success',
        durationMs: Date.now() - start,
      });
      return result;
    } catch (err) {
      void recordUsageEvent({
        operation,
        model: modelName,
        provider: useOpenRouter ? 'openrouter' : 'openai',
        status: 'error',
        durationMs: Date.now() - start,
        metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  };
  return model;
}
```

- [ ] **Step 2: Add overloads to existing factory functions**

Modify `getChatModel`/`getFastModel`/`getExtractionModel` so they accept an optional `operation` label. If provided, return `trackModel(model, operation, modelName)`. If not provided, log a warning and return the unwrapped model.

```typescript
export function getChatModel(temperature = 0.7, maxTokens = 1500, operation?: string): BaseChatModel {
  const provider = config.chatProvider;
  const modelName = MODELS[provider].chat;
  const model = createModel(provider, modelName, temperature, maxTokens);
  if (operation) return trackModel(model, operation, modelName);
  log.warn('getChatModel called without operation label, usage will not be tracked');
  return model;
}
// repeat for getFastModel + getExtractionModel
```

- [ ] **Step 3: Update every caller of these factories to pass `operation`**

Use grep to find them: `grep -rn "getChatModel\|getFastModel\|getExtractionModel" apps/api/src --include="*.ts"`. Add the operation label. Example:

```typescript
// before
const model = getChatModel(0.5, 1000);
// after
const model = getChatModel(0.5, 1000, 'firm_research');
```

Map operations:
- firmResearchAgent nodes → `'firm_research'`
- dealChatAgent → `'deal_chat'`
- memoAgent → `'memo_generation'`
- dealImportMapper → `'deal_import_mapping'`
- meetingPrep → `'meeting_prep'`
- signalMonitor → `'signal_monitor'`
- followUpQuestions, chatHelpers → match by use, defaulting to `'deal_chat'`
- financialAgent extract node → `'financial_extraction'`

- [ ] **Step 4: Build + test**

```bash
cd apps/api && npm run build && npx vitest run
```
Expected: PASS. Also expect zero `getChatModel called without operation label` warnings during a smoke run.

- [ ] **Step 5: Smoke test**

Trigger a firm-research run (settings → firm profile → refresh) and confirm `UsageEvent` rows appear with `operation='firm_research'`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services
git commit -m "feat(usage): track all LangChain factory callsites with operation labels"
```

---

### Task 9: trackedApify wrapper

**Files:**
- Create: `apps/api/src/services/usage/trackedApify.ts`
- Modify: `apps/api/src/services/webSearch.ts` — route through tracked wrapper

- [ ] **Step 1: Look at the existing webSearch entry point to understand its signature**

```bash
grep -n "export " apps/api/src/services/webSearch.ts
```

- [ ] **Step 2: Add `trackedApify.ts`**

```typescript
// apps/api/src/services/usage/trackedApify.ts
import { recordUsageEvent } from './trackedLLM.js';

const APIFY_PRICE_PER_SEARCH_USD = Number(process.env.APIFY_PRICE_PER_SEARCH_USD ?? 0.005);

export async function trackedApifySearch<T>(
  operation: string,
  searchCount: number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void recordUsageEvent({
      operation,
      provider: 'apify',
      units: searchCount,
      unitCostUsd: searchCount * APIFY_PRICE_PER_SEARCH_USD,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    void recordUsageEvent({
      operation,
      provider: 'apify',
      units: searchCount,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
```

- [ ] **Step 3: Wrap each Apify call in `webSearch.ts`**

Inside `webSearch.ts`, wherever it invokes the Apify Actor, replace the bare call with `trackedApifySearch('web_search', queriesCount, () => /* existing call */)`.

- [ ] **Step 4: Build + test**

```bash
cd apps/api && npm run build && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/usage/trackedApify.ts apps/api/src/services/webSearch.ts
git commit -m "feat(usage): track Apify web search costs"
```

---

### Task 10: trackedAzureDocIntel wrapper

**Files:**
- Create: `apps/api/src/services/usage/trackedAzureDocIntel.ts`
- Modify: `apps/api/src/services/azureDocIntelligence.ts` — route through tracked wrapper

- [ ] **Step 1: Add wrapper**

```typescript
// apps/api/src/services/usage/trackedAzureDocIntel.ts
import { recordUsageEvent } from './trackedLLM.js';

const AZURE_DOC_PRICE_PER_PAGE_USD = Number(process.env.AZURE_DOC_PRICE_PER_PAGE_USD ?? 0.0015);

export async function trackedAzureDocIntel<T extends { pages?: number }>(
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const pages = result?.pages ?? 1;
    void recordUsageEvent({
      operation: 'pdf_ocr',
      provider: 'azure_doc_intelligence',
      units: pages,
      unitCostUsd: pages * AZURE_DOC_PRICE_PER_PAGE_USD,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    void recordUsageEvent({
      operation: 'pdf_ocr',
      provider: 'azure_doc_intelligence',
      units: 0,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
```

- [ ] **Step 2: Wrap calls in `azureDocIntelligence.ts`** so the callers receive a `pages` field on the result.

If the existing return type doesn't include page count, expose it (the Azure SDK provides `result.pages.length`). Update callers to ignore the new field if not needed.

- [ ] **Step 3: Build + test**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/usage/trackedAzureDocIntel.ts apps/api/src/services/azureDocIntelligence.ts
git commit -m "feat(usage): track Azure Document Intelligence per-page costs"
```

---

## Phase 3 — Internal Admin Page

### Task 11: Internal admin API routes

**Files:**
- Create: `apps/api/src/routes/internal-usage.ts`
- Modify: `apps/api/src/app.ts` — mount `/api/internal/usage` router

- [ ] **Step 1: Add the routes file**

```typescript
// apps/api/src/routes/internal-usage.ts
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireInternalAdmin } from '../middleware/internalAdmin.js';

const router = Router();
router.use(requireInternalAdmin);

// GET /api/internal/usage/events?org=&user=&operation=&from=&to=&errorsOnly=&limit=200
router.get('/usage/events', async (req, res) => {
  const { org, user, operation, from, to, errorsOnly, limit } = req.query;
  let q = supabase
    .from('UsageEvent')
    .select('*, User:userId (email), Organization:organizationId (name)')
    .order('createdAt', { ascending: false })
    .limit(Math.min(Number(limit ?? 200), 1000));
  if (org) q = q.eq('organizationId', String(org));
  if (user) q = q.eq('userId', String(user));
  if (operation) q = q.eq('operation', String(operation));
  if (from) q = q.gte('createdAt', String(from));
  if (to) q = q.lte('createdAt', String(to));
  if (errorsOnly === 'true') q = q.neq('status', 'success');
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data ?? [] });
});

// GET /api/internal/usage/leaderboard?window=24h|7d|30d
router.get('/usage/leaderboard', async (req, res) => {
  const window = String(req.query.window ?? '30d');
  const since = new Date();
  if (window === '24h') since.setHours(since.getHours() - 24);
  else if (window === '7d') since.setDate(since.getDate() - 7);
  else since.setDate(since.getDate() - 30);

  // Fetch all events in window — for v1 a simple in-memory aggregate is fine.
  // Switch to a SQL view if perf becomes an issue (hundreds of users × thousands of events).
  const { data, error } = await supabase
    .from('UsageEvent')
    .select('userId, organizationId, operation, totalTokens, costUsd, credits')
    .gte('createdAt', since.toISOString());
  if (error) return res.status(500).json({ error: error.message });

  type Row = { userId: string; organizationId: string; calls: number; tokens: number; costUsd: number; credits: number; topOperation: string };
  const byUser = new Map<string, Row & { ops: Map<string, number> }>();
  for (const e of data ?? []) {
    const key = e.userId;
    let row = byUser.get(key);
    if (!row) {
      row = { userId: e.userId, organizationId: e.organizationId, calls: 0, tokens: 0, costUsd: 0, credits: 0, topOperation: '', ops: new Map() };
      byUser.set(key, row);
    }
    row.calls += 1;
    row.tokens += Number(e.totalTokens ?? 0);
    row.costUsd += Number(e.costUsd ?? 0);
    row.credits += Number(e.credits ?? 0);
    row.ops.set(e.operation, (row.ops.get(e.operation) ?? 0) + 1);
  }
  const rows = [...byUser.values()].map(r => ({
    ...r,
    topOperation: [...r.ops.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    ops: undefined,
  }));

  // Hydrate user emails + org names + role + flags
  const userIds = rows.map(r => r.userId);
  const { data: users } = await supabase
    .from('User').select('id, email, role, isInternal, isThrottled, isBlocked, organizationId')
    .in('id', userIds);
  const orgIds = [...new Set(rows.map(r => r.organizationId))];
  const { data: orgs } = await supabase
    .from('Organization').select('id, name')
    .in('id', orgIds);
  const userMap = new Map((users ?? []).map(u => [u.id, u]));
  const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name]));

  const hydrated = rows
    .map(r => ({
      ...r,
      email: userMap.get(r.userId)?.email,
      role: userMap.get(r.userId)?.role,
      isThrottled: userMap.get(r.userId)?.isThrottled,
      isBlocked: userMap.get(r.userId)?.isBlocked,
      orgName: orgMap.get(r.organizationId),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  res.json({ rows: hydrated, window });
});

// GET /api/internal/usage/cost-breakdown?days=30
router.get('/usage/cost-breakdown', async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('UsageEvent')
    .select('createdAt, operation, costUsd, credits')
    .gte('createdAt', since.toISOString());
  if (error) return res.status(500).json({ error: error.message });

  // Aggregate: { day: { operation: cost } }
  const byDay = new Map<string, Map<string, number>>();
  const opTotals = new Map<string, { costUsd: number; credits: number }>();
  for (const e of data ?? []) {
    const day = String(e.createdAt).slice(0, 10);
    let m = byDay.get(day);
    if (!m) { m = new Map(); byDay.set(day, m); }
    m.set(e.operation, (m.get(e.operation) ?? 0) + Number(e.costUsd ?? 0));
    const cur = opTotals.get(e.operation) ?? { costUsd: 0, credits: 0 };
    cur.costUsd += Number(e.costUsd ?? 0);
    cur.credits += Number(e.credits ?? 0);
    opTotals.set(e.operation, cur);
  }
  const series = [...byDay.entries()].sort().map(([day, m]) => ({
    day, byOperation: Object.fromEntries(m),
  }));
  const reconciliation = [...opTotals.entries()].map(([operation, totals]) => ({
    operation, ...totals,
  })).sort((a, b) => b.costUsd - a.costUsd);
  res.json({ series, reconciliation });
});

// POST /api/internal/users/:userId/throttle  body: { value: boolean }
router.post('/users/:userId/throttle', async (req, res) => {
  const { value } = req.body;
  const { error } = await supabase
    .from('User').update({ isThrottled: !!value }).eq('id', req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/internal/users/:userId/block  body: { value: boolean }
router.post('/users/:userId/block', async (req, res) => {
  const { value } = req.body;
  const { error } = await supabase
    .from('User').update({ isBlocked: !!value }).eq('id', req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Mount in `app.ts`**

Add near other route mounts (after auth/org middleware lines):

```typescript
import internalRouter from './routes/internal-usage.js';
// ...
app.use('/api/internal', internalRouter);
```

The router defines `/usage/events`, `/usage/leaderboard`, `/usage/cost-breakdown`, `/users/:userId/throttle`, and `/users/:userId/block` — mounting at `/api/internal` produces the correct URLs.

- [ ] **Step 3: Build + test**

```bash
cd apps/api && npm run build && npx vitest run
```

- [ ] **Step 4: Manual smoke test**

```bash
# As an internal user (dev@pocket-fund.com), get a session token from your local app
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/internal/usage/leaderboard?window=24h
```
Expected: JSON with `rows` array.

```bash
# As a non-internal user
curl -H "Authorization: Bearer $TOKEN_NORMAL" http://localhost:3001/api/internal/usage/leaderboard
```
Expected: 404.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/internal-usage.ts apps/api/src/app.ts
git commit -m "feat(usage): add /api/internal/usage routes (events, leaderboard, breakdown, throttle/block)"
```

---

### Task 12: Internal admin page scaffold + Live Feed tab

**Files:**
- Create: `apps/web/internal/usage.html`
- Create: `apps/web/internal/usage.js`

- [ ] **Step 1: Create the HTML scaffold**

```html
<!-- apps/web/internal/usage.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Internal — AI Usage</title>
  <link rel="stylesheet" href="/css/skeleton.css">
  <style>
    body { font-family: 'Inter', sans-serif; background: #F8F9FA; margin: 0; padding: 24px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .tab { padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; }
    .tab.active { border-bottom-color: #003366; color: #003366; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    .anomaly { background: #fef3c7; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .filters input, .filters select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; }
    button { padding: 6px 12px; border: 1px solid #003366; background: white; color: #003366; border-radius: 4px; cursor: pointer; }
    button.danger { color: #991b1b; border-color: #991b1b; }
    button:hover { background: #f8fafc; }
  </style>
</head>
<body>
  <h1 style="color: #003366;">Internal — AI Usage</h1>
  <div class="tabs">
    <div class="tab active" data-tab="feed">Live Feed</div>
    <div class="tab" data-tab="leaderboard">User Leaderboard</div>
    <div class="tab" data-tab="breakdown">Cost Breakdown</div>
  </div>
  <div id="tab-feed" class="tab-panel"></div>
  <div id="tab-leaderboard" class="tab-panel" hidden></div>
  <div id="tab-breakdown" class="tab-panel" hidden></div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="/js/PEAuth.js"></script>
  <script src="/internal/usage.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the JS controller (gate + Live Feed)**

```javascript
// apps/web/internal/usage.js
(async function() {
  // Gate: only render if user is internal
  const me = await PEAuth.authFetch('/api/users/me').then(r => r.json()).catch(() => null);
  if (!me?.user?.isInternal) {
    window.location.href = '/dashboard.html';
    return;
  }

  // Tab switching
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      document.getElementById('tab-' + t.dataset.tab).hidden = false;
      window['render_' + t.dataset.tab]?.();
    });
  });

  // Live Feed
  window.render_feed = async function() {
    const panel = document.getElementById('tab-feed');
    panel.innerHTML = `
      <div class="filters">
        <select id="f-operation"><option value="">All operations</option></select>
        <input id="f-from" type="date" />
        <input id="f-to" type="date" />
        <label><input id="f-errors" type="checkbox" /> Errors only</label>
        <button id="f-refresh">Refresh</button>
      </div>
      <div id="feed-table">Loading...</div>
    `;
    document.getElementById('f-refresh').addEventListener('click', loadFeed);
    await loadFeed();
  };

  async function loadFeed() {
    const params = new URLSearchParams();
    const op = document.getElementById('f-operation')?.value;
    const from = document.getElementById('f-from')?.value;
    const to = document.getElementById('f-to')?.value;
    const errs = document.getElementById('f-errors')?.checked;
    if (op) params.set('operation', op);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (errs) params.set('errorsOnly', 'true');
    const { events } = await PEAuth.authFetch('/api/internal/usage/events?' + params).then(r => r.json());
    document.getElementById('feed-table').innerHTML = renderEventsTable(events);
  }

  function renderEventsTable(events) {
    if (!events?.length) return '<p>No events.</p>';
    return `<table>
      <thead><tr>
        <th>Time</th><th>Org</th><th>User</th><th>Operation</th><th>Model</th>
        <th>Tokens In/Out</th><th>$ Cost</th><th>Credits</th><th>Status</th>
      </tr></thead>
      <tbody>${events.map(e => `
        <tr>
          <td>${new Date(e.createdAt).toLocaleString()}</td>
          <td>${e.Organization?.name ?? ''}</td>
          <td>${e.User?.email ?? ''}</td>
          <td>${e.operation}</td>
          <td>${e.model ?? '—'}</td>
          <td>${e.promptTokens} / ${e.completionTokens}</td>
          <td>$${Number(e.costUsd ?? 0).toFixed(4)}</td>
          <td>${e.credits}</td>
          <td><span class="badge badge-${e.status === 'success' ? 'success' : 'error'}">${e.status}</span></td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  }

  // Initial render
  window.render_feed();
})();
```

- [ ] **Step 3: Manual test**

Visit `http://localhost:3000/internal/usage.html` while logged in as `dev@pocket-fund.com`. Expected: Live Feed renders with recent events.

Visit as a non-internal user. Expected: redirect to `/dashboard.html`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/internal/usage.html apps/web/internal/usage.js
git commit -m "feat(usage): add internal admin page with Live Feed tab"
```

---

### Task 13: Leaderboard tab with throttle/block actions

**Files:**
- Modify: `apps/web/internal/usage.js` — add `render_leaderboard`

- [ ] **Step 1: Append leaderboard renderer**

Append to `apps/web/internal/usage.js`:

```javascript
window.render_leaderboard = async function() {
  const panel = document.getElementById('tab-leaderboard');
  panel.innerHTML = `
    <div class="filters">
      <select id="lb-window">
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7d</option>
        <option value="30d" selected>Last 30d</option>
      </select>
      <button id="lb-refresh">Refresh</button>
    </div>
    <div id="lb-table">Loading...</div>
  `;
  document.getElementById('lb-window').addEventListener('change', loadLeaderboard);
  document.getElementById('lb-refresh').addEventListener('click', loadLeaderboard);
  await loadLeaderboard();
};

async function loadLeaderboard() {
  const window_ = document.getElementById('lb-window').value;
  const { rows } = await PEAuth.authFetch(`/api/internal/usage/leaderboard?window=${window_}`).then(r => r.json());

  // Compute anomaly: today vs 30-day avg requires another query in a future iteration.
  // For v1 we just sort by cost.

  document.getElementById('lb-table').innerHTML = `<table>
    <thead><tr>
      <th>Org</th><th>User</th><th>Role</th>
      <th>Calls</th><th>Tokens</th><th>$ Cost</th><th>Credits</th>
      <th>Top Op</th><th>Status</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows.map(r => `
      <tr ${r.isBlocked ? 'class="anomaly"' : ''}>
        <td>${r.orgName ?? ''}</td>
        <td>${r.email ?? ''}</td>
        <td>${r.role ?? ''}</td>
        <td>${r.calls}</td>
        <td>${r.tokens.toLocaleString()}</td>
        <td>$${r.costUsd.toFixed(4)}</td>
        <td>${r.credits}</td>
        <td>${r.topOperation}</td>
        <td>
          ${r.isBlocked ? '<span class="badge badge-error">BLOCKED</span>' : ''}
          ${r.isThrottled ? '<span class="badge badge-error">THROTTLED</span>' : ''}
          ${!r.isBlocked && !r.isThrottled ? '<span class="badge badge-success">OK</span>' : ''}
        </td>
        <td>
          <button data-action="throttle" data-id="${r.userId}" data-value="${!r.isThrottled}">${r.isThrottled ? 'Unthrottle' : 'Throttle'}</button>
          <button class="danger" data-action="block" data-id="${r.userId}" data-value="${!r.isBlocked}">${r.isBlocked ? 'Unblock' : 'Block'}</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;

  document.querySelectorAll('#lb-table button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, id, value } = btn.dataset;
      if (!confirm(`${action} user ${id}?`)) return;
      await PEAuth.authFetch(`/api/internal/users/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: value === 'true' }),
      });
      loadLeaderboard();
    });
  });
}
```

- [ ] **Step 2: Manual test**

Switch to Leaderboard tab. Expected: rows for users with usage. Click "Throttle" on a test user, then refresh — status should flip to THROTTLED. Click "Unthrottle" and verify it reverts.

- [ ] **Step 3: Commit**

```bash
git add apps/web/internal/usage.js
git commit -m "feat(usage): add Leaderboard tab with throttle/block actions"
```

---

### Task 14: Cost Breakdown tab (Chart.js)

**Files:**
- Modify: `apps/web/internal/usage.js` — add `render_breakdown`

- [ ] **Step 1: Append breakdown renderer**

```javascript
window.render_breakdown = async function() {
  const panel = document.getElementById('tab-breakdown');
  panel.innerHTML = `
    <canvas id="cost-chart" style="max-height: 320px;"></canvas>
    <h3>Operation totals (last 30d)</h3>
    <div id="reconciliation"></div>
  `;
  const { series, reconciliation } = await PEAuth.authFetch('/api/internal/usage/cost-breakdown?days=30').then(r => r.json());

  // Build dataset for stacked bar
  const allOps = [...new Set(series.flatMap(s => Object.keys(s.byOperation)))];
  const palette = ['#003366', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];
  const datasets = allOps.map((op, i) => ({
    label: op,
    data: series.map(s => Number(s.byOperation[op] ?? 0)),
    backgroundColor: palette[i % palette.length],
  }));

  new Chart(document.getElementById('cost-chart'), {
    type: 'bar',
    data: { labels: series.map(s => s.day), datasets },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => '$' + v } } },
      plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(4)}` } } },
    },
  });

  document.getElementById('reconciliation').innerHTML = `<table>
    <thead><tr><th>Operation</th><th>Total $ spent</th><th>Credits awarded</th><th>$ per credit</th></tr></thead>
    <tbody>${reconciliation.map(r => `
      <tr>
        <td>${r.operation}</td>
        <td>$${Number(r.costUsd).toFixed(4)}</td>
        <td>${r.credits}</td>
        <td>$${(r.credits > 0 ? Number(r.costUsd) / r.credits : 0).toFixed(6)}</td>
      </tr>
    `).join('')}</tbody>
  </table>`;
};
```

- [ ] **Step 2: Manual test**

Switch to Cost Breakdown tab. Expected: stacked bar chart for last 30 days + reconciliation table.

- [ ] **Step 3: Commit**

```bash
git add apps/web/internal/usage.js
git commit -m "feat(usage): add Cost Breakdown tab with stacked chart and reconciliation"
```

---

## Phase 4 — User-facing meter

### Task 15: /api/usage/me + Settings AI Usage panel

**Files:**
- Create: `apps/api/src/routes/usage.ts`
- Modify: `apps/api/src/app.ts` — mount `/api/usage`
- Modify: `apps/web/settings.html` (or whatever the Settings page is) — add AI Usage section

- [ ] **Step 1: Add the user-facing route**

```typescript
// apps/api/src/routes/usage.ts
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireOrg, getOrgId } from '../middleware/orgScope.js';

const router = Router();

router.get('/me', requireOrg, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  // Look up internal User.id from authId
  const { data: userRow } = await supabase
    .from('User').select('id').eq('authId', userId).single();
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  // Current calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('UsageEvent')
    .select('operation, credits')
    .eq('userId', userRow.id)
    .gte('createdAt', monthStart.toISOString());
  if (error) return res.status(500).json({ error: error.message });

  const byOp = new Map<string, { count: number; credits: number }>();
  let totalCredits = 0;
  for (const e of data ?? []) {
    const cur = byOp.get(e.operation) ?? { count: 0, credits: 0 };
    cur.count += 1;
    cur.credits += Number(e.credits ?? 0);
    byOp.set(e.operation, cur);
    totalCredits += Number(e.credits ?? 0);
  }
  const breakdown = [...byOp.entries()].map(([operation, v]) => ({ operation, ...v })).sort((a, b) => b.credits - a.credits);
  res.json({ totalCredits, breakdown, monthStart: monthStart.toISOString() });
});

export default router;
```

- [ ] **Step 2: Mount in `app.ts`**

```typescript
import usageRouter from './routes/usage.js';
// ...
app.use('/api/usage', usageRouter);
```

- [ ] **Step 3: Add Settings UI section**

Open `apps/web/settings.html`. Add a new section (collapsed by default to match existing patterns). Use this HTML:

```html
<!-- AI Usage panel — append within the main settings container -->
<details class="settings-card" id="ai-usage-card">
  <summary style="font-weight:600; cursor:pointer; padding:12px 16px;">AI Usage</summary>
  <div style="padding:16px;">
    <div id="ai-usage-total" style="font-size:32px; color:#003366; font-weight:700;">—</div>
    <div style="color:#64748b; font-size:13px; margin-bottom:12px;">credits used this month</div>
    <div id="ai-usage-bar" style="background:#e5e7eb; border-radius:4px; height:6px; overflow:hidden; margin-bottom:16px;">
      <div id="ai-usage-bar-fill" style="background:#003366; height:100%; width:0%; transition:width 0.3s;"></div>
    </div>
    <table style="width:100%; font-size:13px;" id="ai-usage-breakdown"></table>
    <p style="color:#94a3b8; font-size:11px; margin-top:16px;">
      Free during beta. Tracking helps us understand how Pocket Fund is used.
    </p>
  </div>
</details>
<script>
(async function() {
  const res = await PEAuth.authFetch('/api/usage/me').then(r => r.json()).catch(() => null);
  if (!res) return;
  document.getElementById('ai-usage-total').textContent = res.totalCredits.toLocaleString();
  // Bar fills based on a soft reference of 1000 credits — purely visual
  const fillPct = Math.min(100, (res.totalCredits / 1000) * 100);
  document.getElementById('ai-usage-bar-fill').style.width = fillPct + '%';
  document.getElementById('ai-usage-breakdown').innerHTML = `
    <thead><tr><th align="left">Operation</th><th align="right">Count</th><th align="right">Credits</th></tr></thead>
    <tbody>${res.breakdown.map(b => `
      <tr><td>${b.operation.replace(/_/g,' ')}</td><td align="right">${b.count}</td><td align="right">${b.credits}</td></tr>
    `).join('')}</tbody>
  `;
})();
</script>
```

- [ ] **Step 4: Build + smoke test**

```bash
cd apps/api && npm run build && npm run dev
# In another terminal:
cd apps/web && npm run dev
```

Open `/settings.html`. Expand "AI Usage". Expected: total credits displayed, breakdown table populated.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/usage.ts apps/api/src/app.ts apps/web/settings.html
git commit -m "feat(usage): add /api/usage/me and Settings AI Usage panel"
```

---

## Phase 5 — Safety net + rollout

### Task 16: Runaway monitor + alert email

**Files:**
- Create: `apps/api/src/services/usage/runawayMonitor.ts`
- Test: `apps/api/tests/usage/runawayMonitor.test.ts`
- Modify: `apps/api/src/services/usage/trackedLLM.ts` — call monitor after each insert
- Modify: env — `INTERNAL_ALERT_EMAIL`, `USAGE_DAILY_COST_ALERT_USD`, `USAGE_DAILY_TOKEN_ALERT`, `USAGE_AUTO_THROTTLE`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/usage/runawayMonitor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sumSpy = vi.fn();
const insertAlertSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
const updateUserSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
const sendEmailSpy = vi.fn(() => Promise.resolve());

vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'UsageEvent') {
        return { select: sumSpy };
      }
      if (table === 'UsageAlert') {
        return { insert: insertAlertSpy };
      }
      if (table === 'User') {
        return { update: () => ({ eq: updateUserSpy }) };
      }
      return {};
    }),
  },
}));
vi.mock('../../src/services/email.js', () => ({ sendEmail: sendEmailSpy }));

import { checkRunawayThreshold } from '../../src/services/usage/runawayMonitor.js';

describe('runawayMonitor', () => {
  beforeEach(() => {
    sumSpy.mockReset();
    insertAlertSpy.mockClear();
    updateUserSpy.mockClear();
    sendEmailSpy.mockClear();
    process.env.USAGE_DAILY_COST_ALERT_USD = '20';
    process.env.USAGE_DAILY_TOKEN_ALERT = '500000';
    process.env.USAGE_AUTO_THROTTLE = 'true';
    process.env.INTERNAL_ALERT_EMAIL = 'alerts@pocket-fund.com';
  });

  it('does nothing when below thresholds', async () => {
    sumSpy.mockReturnValueOnce({ eq: () => ({ gte: () => Promise.resolve({ data: [{ costUsd: 5, totalTokens: 10000 }], error: null }) }) });
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).not.toHaveBeenCalled();
    expect(updateUserSpy).not.toHaveBeenCalled();
  });

  it('alerts and throttles when cost crosses', async () => {
    sumSpy.mockReturnValueOnce({ eq: () => ({ gte: () => Promise.resolve({ data: [{ costUsd: 25, totalTokens: 10000 }], error: null }) }) });
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).toHaveBeenCalled();
    expect(updateUserSpy).toHaveBeenCalledWith('id', 'user-1');
    expect(insertAlertSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/services/usage/runawayMonitor.ts
import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { sendEmail } from '../email.js';

export async function checkRunawayThreshold(userId: string): Promise<void> {
  const costThreshold = Number(process.env.USAGE_DAILY_COST_ALERT_USD ?? 20);
  const tokenThreshold = Number(process.env.USAGE_DAILY_TOKEN_ALERT ?? 500_000);
  const autoThrottle = process.env.USAGE_AUTO_THROTTLE === 'true';
  const alertEmail = process.env.INTERNAL_ALERT_EMAIL;
  if (!alertEmail) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('UsageEvent')
    .select('costUsd, totalTokens')
    .eq('userId', userId)
    .gte('createdAt', dayStart.toISOString());
  if (error) {
    log.error('runawayMonitor: query failed', error);
    return;
  }
  const totalCost = (data ?? []).reduce((acc, r) => acc + Number(r.costUsd ?? 0), 0);
  const totalTokens = (data ?? []).reduce((acc, r) => acc + Number(r.totalTokens ?? 0), 0);

  const triggers: Array<{ kind: 'cost' | 'tokens'; value: number; threshold: number }> = [];
  if (totalCost >= costThreshold) triggers.push({ kind: 'cost', value: totalCost, threshold: costThreshold });
  if (totalTokens >= tokenThreshold) triggers.push({ kind: 'tokens', value: totalTokens, threshold: tokenThreshold });
  if (!triggers.length) return;

  const today = new Date().toISOString().slice(0, 10);
  for (const t of triggers) {
    // Dedup via PK conflict — silently skip on duplicate
    const { error: alertErr } = await supabase.from('UsageAlert').insert({
      userId, alertDate: today, kind: t.kind,
    });
    if (alertErr && !String(alertErr.message).includes('duplicate')) {
      log.error('runawayMonitor: alert insert failed', alertErr);
      continue;
    }
    if (alertErr) continue; // duplicate — already alerted today

    await sendEmail({
      to: alertEmail,
      subject: `[Pocket Fund] Runaway usage: user ${userId} crossed ${t.kind} threshold`,
      text: `User ${userId} crossed today's ${t.kind} threshold.\n` +
            `Value: ${t.value}\n` +
            `Threshold: ${t.threshold}\n` +
            `Total cost today: $${totalCost.toFixed(4)}\n` +
            `Total tokens today: ${totalTokens}`,
    });

    if (autoThrottle) {
      await supabase.from('User').update({ isThrottled: true }).eq('id', userId);
    }
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Wire monitor call into `recordUsageEvent`**

In `apps/api/src/services/usage/trackedLLM.ts`, after the successful insert, fire-and-forget:

```typescript
import { checkRunawayThreshold } from './runawayMonitor.js';
// ... after insert:
void checkRunawayThreshold(ctx.userId);
```

- [ ] **Step 6: Build + run all tests**

```bash
cd apps/api && npm run build && npx vitest run
```
Expected: PASS.

- [ ] **Step 7: Set env vars (in `apps/api/.env`)**

```
INTERNAL_ALERT_EMAIL=alerts@pocket-fund.com
USAGE_DAILY_COST_ALERT_USD=20
USAGE_DAILY_TOKEN_ALERT=500000
USAGE_AUTO_THROTTLE=false
APIFY_PRICE_PER_SEARCH_USD=0.005
AZURE_DOC_PRICE_PER_PAGE_USD=0.0015
```

(Start with `USAGE_AUTO_THROTTLE=false` for a week of data; flip to `true` once thresholds are tuned.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/usage apps/api/tests/usage apps/api/.env.example
git commit -m "feat(usage): add runaway monitor with alert email + dedup"
```

---

### Task 17: Pre-call throttle/block enforcement

**Files:**
- Modify: `apps/api/src/openai.ts` — `trackedChatCompletion` checks `User.isBlocked`/`isThrottled` before calling
- Modify: `apps/api/src/services/llm.ts` — same for LangChain factories

- [ ] **Step 1: Add a small per-user flag cache**

```typescript
// apps/api/src/services/usage/userFlags.ts
import { supabase } from '../../supabase.js';

const TTL_MS = 30_000;
const cache = new Map<string, { isBlocked: boolean; isThrottled: boolean; loadedAt: number }>();

export async function getUserFlags(userId: string): Promise<{ isBlocked: boolean; isThrottled: boolean }> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached;
  const { data } = await supabase
    .from('User').select('isBlocked, isThrottled').eq('id', userId).single();
  const flags = { isBlocked: !!data?.isBlocked, isThrottled: !!data?.isThrottled, loadedAt: Date.now() };
  cache.set(userId, flags);
  return flags;
}

export function _resetUserFlagsCache() { cache.clear(); }
```

- [ ] **Step 2: Add throttle helper**

```typescript
// apps/api/src/services/usage/throttle.ts
const lastCall = new Map<string, number>();
const THROTTLE_INTERVAL_MS = 2000;

export async function throttleIfNeeded(userId: string): Promise<void> {
  const last = lastCall.get(userId) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < THROTTLE_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, THROTTLE_INTERVAL_MS - elapsed));
  }
  lastCall.set(userId, Date.now());
}
```

- [ ] **Step 3: Apply gate in `trackedChatCompletion` (in `apps/api/src/openai.ts`)**

Add at the top of the function body, **before** `const start = Date.now()`:

```typescript
import { getUserFlags } from './services/usage/userFlags.js';
import { throttleIfNeeded } from './services/usage/throttle.js';
import { getUsageContext } from './middleware/usageContext.js';

// inside trackedChatCompletion:
const ctx = getUsageContext();
const modelName = (params as any).model;
const providerForGate: 'openai' | 'openrouter' = useOpenRouter ? 'openrouter' : 'openai';
if (ctx) {
  const flags = await getUserFlags(ctx.userId);
  if (flags.isBlocked) {
    void recordUsageEvent({ operation, model: modelName, provider: providerForGate, status: 'blocked' });
    throw new Error('User is blocked from AI features. Contact support.');
  }
  if (flags.isThrottled) {
    await throttleIfNeeded(ctx.userId);
  }
}
```

Apply the equivalent block at the top of `trackModel` in `apps/api/src/services/llm.ts` (use the `modelName` argument already passed in, and `providerForGate = useOpenRouter ? 'openrouter' : 'openai'`).

- [ ] **Step 4: Build + smoke test**

Toggle `isBlocked=true` for a test user via the admin Leaderboard UI. Try sending a chat message as that user. Expected: error response, plus a `UsageEvent` with `status='blocked'`. Toggle back to `false` and verify chat resumes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/usage apps/api/src/openai.ts apps/api/src/services/llm.ts
git commit -m "feat(usage): enforce isBlocked + isThrottled in tracked LLM wrappers"
```

---

### Task 18: Production rollout checklist

**Files:**
- (no code changes — verification only)

- [ ] **Step 1: Sanity-check the full stack locally**

```bash
cd apps/api && npm run build
cd apps/web && npm run build
cd apps/api && npx vitest run
```
Expected: all green.

- [ ] **Step 2: Deploy to staging Vercel**

```bash
git push origin <branch>
# Vercel auto-deploys; verify in dashboard
```

- [ ] **Step 3: Run migration against staging Supabase**

If not already done. Use the Supabase SQL editor with `apps/api/usage-tracking-migration.sql`.

- [ ] **Step 4: Bootstrap internal admins on staging**

If `dev@pocket-fund.com` exists in staging:
```sql
UPDATE public."User" SET "isInternal" = true WHERE email = 'dev@pocket-fund.com';
```

- [ ] **Step 5: Smoke test on staging**

- Log in as internal admin, visit `/internal/usage.html`. Expected: page renders, three tabs work.
- Log in as a regular user, attempt to visit `/internal/usage.html`. Expected: redirect to dashboard.
- Trigger a deal chat message. Expected: `UsageEvent` row in Supabase + entry visible in Live Feed within seconds.
- Trigger a financial extraction. Expected: `UsageEvent` row with `operation='financial_extraction'`.
- Open Settings on the user side. Expected: AI Usage panel renders with non-zero credits.

- [ ] **Step 6: Deploy to production**

Once staging is clean:
```bash
git checkout main
git merge <feature-branch>
git push origin main
```

- [ ] **Step 7: Run migration against production Supabase**

Same SQL file. Idempotent — safe to re-run.

- [ ] **Step 8: Bootstrap production internal admins**

```sql
UPDATE public."User" SET "isInternal" = true
WHERE email IN ('dev@pocket-fund.com', 'ganeshjagtap006@gmail.com', 'hello@pocket-fund.com');
```

- [ ] **Step 9: Set production env vars**

In Vercel project settings:
- `INTERNAL_ALERT_EMAIL`
- `USAGE_DAILY_COST_ALERT_USD=20`
- `USAGE_DAILY_TOKEN_ALERT=500000`
- `USAGE_AUTO_THROTTLE=false` (flip to `true` after first week of data)
- `APIFY_PRICE_PER_SEARCH_USD=0.005`
- `AZURE_DOC_PRICE_PER_PAGE_USD=0.0015`

- [ ] **Step 10: 24-hour observation**

Watch the Live Feed and Leaderboard for a day. Confirm:
- All operations show up (no callsites missed)
- $ totals in the admin Leaderboard roughly match the OpenRouter dashboard for the same window (within ~2%)
- No spurious alert emails
- No user complaints about errors / latency

- [ ] **Step 11: Update `progress.md`**

Add a dated entry summarizing the rollout (per the project convention).

- [ ] **Step 12: Final commit**

```bash
git add progress.md
git commit -m "docs(progress): AI usage tracking rolled out to production"
```

---

## Estimated Sequencing

| Phase | Tasks | Approx. effort |
|---|---|---|
| 1. Foundation | 1–6 | 1 day |
| 2. Wire up tracking | 7–10 | 1–1.5 days |
| 3. Internal admin page | 11–14 | 1 day |
| 4. User meter | 15 | 0.25 day |
| 5. Safety net + rollout | 16–18 | 0.75 day |
| **Total** | | **~4 days** |
