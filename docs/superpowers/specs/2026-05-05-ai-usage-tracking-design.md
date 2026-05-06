# AI Usage Tracking & Internal Admin — Design Spec

**Date:** 2026-05-05
**Status:** Draft — pending user review
**Author:** Brainstormed with Claude

---

## 1. Problem

Pocket Fund is in beta. All beta users share a single OpenAI / OpenRouter API key. There is no per-user attribution of AI consumption. If a user (intentionally or accidentally) burns through tokens — runaway loops, scripted abuse, or a leaked auth token — we have no way to identify them, no way to quantify their impact, and no way to act before the bill arrives.

Concretely:
- ~20 server files make LLM calls. None of them know which user made the call.
- The OpenAI/OpenRouter dashboard is a single bucket — we cannot answer "who used the most yesterday?"
- Beta users are not being charged and we don't want to introduce friction. But we need internal visibility *now* so we can:
  - See per-user consumption (tokens, $, operations)
  - Detect abuse early
  - Have the data foundation to introduce paid tiers later without rebuilding

## 2. Goals

- **Per-user, per-operation accuracy.** Every LLM call is attributed to a specific User and Organization, with exact prompt/completion tokens, model, provider, and computed dollar cost.
- **Internal admin visibility.** A page accessible only to Pocket Fund team members (not customer firm admins) showing live feed, user leaderboard, and cost breakdown across all organizations.
- **Passive user-facing meter.** A small "AI Usage" section in user Settings that shows credits used this month — no quotas, no enforcement, no dollar figures shown to users.
- **Runaway safety net.** Configurable daily thresholds that alert internal staff and optionally auto-throttle (not block) abusive users.
- **Non-LLM cost coverage.** Same tracking applies to Apify (web search) and Azure Document Intelligence (PDF extraction).

## 3. Non-Goals

- **No paid plans or quota enforcement** for v1. Beta users use freely.
- **No user-facing dollar amounts.** Only credits.
- **No retroactive backfill.** Tracking starts from migration day.
- **No CSV/PDF export of admin data** in v1.
- **No editing of operation→credits mapping through UI.** Lives in code-seeded reference table; changes via PR.

## 4. Architecture

### 4.1 Request-scoped user context

A new middleware `apps/api/src/middleware/usageContext.ts` runs after `authMiddleware` + `orgMiddleware`. It uses Node's `AsyncLocalStorage` to bind `{ userId, organizationId, requestId }` to the request lifecycle. Any code path running inside that request can read the context without it being passed explicitly.

Background jobs (financial agent, firm research, signal monitor, scheduled tasks) explicitly enter the context with `runWithUsageContext({ userId, organizationId, source: 'background' }, fn)` when they kick off.

### 4.2 Central LLM wrapper

A new module `apps/api/src/services/usage/trackedLLM.ts` wraps:

- The raw `openai` and `openaiDirect` clients exported from `apps/api/src/openai.ts`
- The LangChain factories `getChatModel`, `getFastModel`, `getExtractionModel` exported from `apps/api/src/services/llm.ts`

The wrapper:
1. Reads context (userId, orgId, operation label).
2. **Pre-call check:** if `User.isThrottled === true`, applies a per-user rate limit (1 req / 2s). If `User.isBlocked === true`, refuses with structured error. (No quota check for v1 — beta is free.)
3. Runs the call.
4. **Post-call record:** inserts a `UsageEvent` row with `promptTokens`, `completionTokens`, `model`, `provider`, computed `costUsd` from `ModelPrice`, mapped `credits` from `OperationCredits`, `durationMs`, `status`.
5. Async checks the runaway threshold; fires an alert if crossed.

### 4.3 Callsite migration

Every existing LLM callsite gets one new argument: an `operation` label (string from a small enum, e.g. `'deal_chat'`, `'financial_extraction'`, `'firm_research'`, `'memo_generation'`).

This is ~20 mechanical edits across the files identified in §11. No logic changes.

### 4.4 Non-LLM coverage

Two more wrappers, same pattern:

- `apps/api/src/services/usage/trackedApify.ts` — wraps `apps/api/src/services/webSearch.ts`. Provider = `'apify'`. Cost computed from per-search rate.
- `apps/api/src/services/usage/trackedAzureDocIntel.ts` — wraps `apps/api/src/services/azureDocIntelligence.ts`. Provider = `'azure_doc_intelligence'`. Cost computed from per-page rate.

Fewer callsites, same data shape ends up in `UsageEvent`.

## 5. Data Model

### 5.1 `UsageEvent` (the truth ledger)

One row per AI call. Indexed for fast per-user and per-org rollups.

```sql
CREATE TABLE public."UsageEvent" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES public."Organization"(id) ON DELETE CASCADE,
  operation text NOT NULL,
  model text,
  provider text NOT NULL,           -- 'openai' | 'openrouter' | 'gemini' | 'anthropic' | 'apify' | 'azure_doc_intelligence'
  "promptTokens" integer DEFAULT 0,
  "completionTokens" integer DEFAULT 0,
  "totalTokens" integer DEFAULT 0,
  units integer DEFAULT 0,           -- non-LLM: searches, pages, etc.
  "costUsd" numeric(12,6) NOT NULL DEFAULT 0,
  credits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',  -- 'success' | 'error' | 'rate_limited' | 'blocked'
  "durationMs" integer,
  metadata jsonb DEFAULT '{}',       -- dealId, documentId, errorCode, requestId, etc.
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_event_user_created ON public."UsageEvent" ("userId", "createdAt" DESC);
CREATE INDEX idx_usage_event_org_created  ON public."UsageEvent" ("organizationId", "createdAt" DESC);
CREATE INDEX idx_usage_event_operation    ON public."UsageEvent" (operation, "createdAt" DESC);
CREATE INDEX idx_usage_event_status       ON public."UsageEvent" (status) WHERE status <> 'success';
```

### 5.2 `ModelPrice` (per-1M-token pricing reference)

```sql
CREATE TABLE public."ModelPrice" (
  model text PRIMARY KEY,
  provider text NOT NULL,
  "inputPricePer1M" numeric(10,4) NOT NULL,
  "outputPricePer1M" numeric(10,4) NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
```

Seeded with current GPT-4o, GPT-4o-mini, Claude Sonnet 4.5, Claude Haiku, Gemini 1.5 Pro/Flash. Lookup-only; updated via PR when prices change.

For non-LLM providers (Apify, Azure DocIntel), pricing is stored in code constants since they price per unit (search, page) not per token.

### 5.3 `OperationCredits` (operation → user-facing credits)

```sql
CREATE TABLE public."OperationCredits" (
  operation text PRIMARY KEY,
  credits integer NOT NULL,
  description text
);
```

Initial seed:

| operation | credits | description |
|---|---|---|
| `deal_chat` | 1 | One chat message in the deal chat agent |
| `financial_extraction` | 20 | Extract financial statements from a CIM/Excel |
| `firm_research` | 40 | Run firm research agent (scrape + search + synthesize) |
| `memo_generation` | 15 | Generate a memo or memo section |
| `deal_import_mapping` | 5 | GPT-4o column mapping for deal import |
| `folder_insights` | 8 | Generate folder-level insights |
| `multi_doc_analysis` | 10 | Cross-document synthesis |
| `narrative_insights` | 6 | Narrative summary of deal/folder |
| `deal_analysis` | 5 | LBO / red flags / ratios analysis triggered by user |
| `meeting_prep` | 10 | Meeting prep agent |
| `signal_monitor` | 3 | Background signal/news monitor |
| `web_search` | 1 | One Apify search call |
| `pdf_ocr` | 2 | One page of Azure DocIntel extraction |

Editable via PR. The wrapper's behavior is: if `operation` is not in the table, default to 1 credit and log a warning (so we don't silently miss new callsites).

### 5.4 `User` table additions

```sql
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "isInternal" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isThrottled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isBlocked" boolean NOT NULL DEFAULT false;

CREATE INDEX idx_user_internal  ON public."User" ("isInternal") WHERE "isInternal" = true;
CREATE INDEX idx_user_throttled ON public."User" ("isThrottled") WHERE "isThrottled" = true;
CREATE INDEX idx_user_blocked   ON public."User" ("isBlocked") WHERE "isBlocked" = true;
```

- `isInternal` — Pocket Fund team flag. Grants access to `/api/internal/*` and `/internal/usage.html`.
- `isThrottled` — set by runaway safety net. Wrapper applies 1 req / 2s rate limit. Does not block.
- `isBlocked` — manual emergency switch. Wrapper refuses calls. No auto-set; only set via internal admin action.

## 6. Internal Admin Access Model

### 6.1 New middleware

`apps/api/src/middleware/internalAdmin.ts`:

```ts
export async function requireInternalAdmin(req, res, next) {
  // Looks up User.isInternal by req.user.id (auth UUID via authId)
  // 404 (not 403) if missing — prevents enumeration of routes
}
```

Mounted on all `/api/internal/*` routes. Bypasses `orgMiddleware` so cross-org queries are allowed.

### 6.2 Why a flag, not a role

The existing RBAC (`apps/api/src/middleware/rbac.ts`) treats `admin`, `partner`, `principal` etc. as *firm-scoped* roles — they describe what a user can do *within their own firm*. Adding a `PLATFORM_ADMIN` role to the same hierarchy mixes two different concepts and risks accidental cross-org data exposure if someone misuses `isRoleAtLeast(role, 'admin')`.

A separate `isInternal` boolean is orthogonal: a user can be both `role=admin` of their firm *and* `isInternal=true` for platform access, with neither overlapping the other.

### 6.3 Bootstrap

Seed `dev@pocket-fund.com` (and any other internal emails passed as a comma-separated `INTERNAL_ADMIN_EMAILS` env var) as `isInternal=true` during migration. After that, internal admins can flip the flag for new teammates via an internal-only endpoint.

## 7. Internal Admin Page (`/internal/usage.html`)

A single static page mounted in `apps/web/internal/usage.html`. Loaded only after the frontend confirms `isInternal=true` from `/api/users/me`. Otherwise redirects to `/dashboard.html`.

Three tabs:

### 7.1 Live Feed
- Reverse-chronological table of recent `UsageEvent`s (last 200, paginated).
- Columns: time, org name, user email, operation, model, tokensIn / tokensOut, $ cost, credits, deal name (resolved from `metadata.dealId` if present), status.
- Filters: org dropdown, user dropdown, operation dropdown, date range, "errors only" toggle.
- Row expand → full JSON of `metadata`.

### 7.2 User Leaderboard
- One row per user. Sorted by 30-day spend descending.
- Columns: org, user (email + role), calls (24h / 7d / 30d), tokens (24h / 7d / 30d), **$ cost (24h / 7d / 30d)**, credits used, top operation.
- Anomaly flag (⚠️) if today's `$ cost` > 3× the user's 30-day daily average (computed at query time).
- Per-row actions: toggle `isThrottled`, toggle `isBlocked`, "view recent calls" (deep links to Live Feed pre-filtered).

### 7.3 Cost Breakdown
- Stacked bar chart: $ spent per day, last 30 days, segmented by `operation`.
- Side panel: top 10 most expensive operations by total $ all-time.
- Side panel: top 10 most expensive single calls (with link to event detail).
- Reconciliation table: for each operation, total credits awarded across all users vs total actual `$ spent` for that operation — shows whether the `OperationCredits` mapping is mispriced relative to real cost. Read-only; informs PR-based price adjustments.

### 7.4 API surface

New routes under `apps/api/src/routes/internal-usage.ts`, all behind `requireInternalAdmin`:

- `GET /api/internal/usage/events` — paginated, with filter query params
- `GET /api/internal/usage/leaderboard` — aggregated per user, with `?window=24h|7d|30d`
- `GET /api/internal/usage/cost-breakdown` — daily totals grouped by operation
- `POST /api/internal/users/:userId/throttle` — set `isThrottled` (true/false)
- `POST /api/internal/users/:userId/block` — set `isBlocked` (true/false)

## 8. User-Facing Passive View

Tiny addition to `apps/web/settings.html`: a new "AI Usage" section, collapsed by default.

- Big number: **"X credits used this month"**
- Progress bar: filled blue, **no cap line**. Shows usage shape, not consumption against a limit.
- Breakdown table: by operation (display-friendly name from `OperationCredits.description`), count, credits used.
- Footer: small grey line — *"Free during beta. Tracking helps us understand how Pocket Fund is used."*
- No `$` shown.
- No quota.

Backed by one new endpoint:
- `GET /api/usage/me` — returns the current user's usage rollup. Org-scoped via existing middleware.

## 9. Runaway Safety Net

**Configurable via env vars:**
- `USAGE_DAILY_COST_ALERT_USD` (default `20`) — per-user daily $ threshold for alert
- `USAGE_DAILY_TOKEN_ALERT` (default `500000`) — per-user daily token threshold for alert
- `USAGE_AUTO_THROTTLE` (default `false`) — if `true`, automatically set `isThrottled=true` on threshold cross
- `INTERNAL_ALERT_EMAIL` — recipient for alert emails (Resend, same provider as existing notifications)

**Behavior:**
After each `UsageEvent` insert, an async check runs. If the user's last-24h totals just crossed either threshold:
1. Fire an email (via Resend) with: user email, org, last 24h cost/tokens, last 10 calls.
2. If `USAGE_AUTO_THROTTLE=true`, set `User.isThrottled=true` (idempotent — already-throttled users skip).
3. Insert a row into a tiny dedup table `UsageAlert (userId, alertDate, kind)` so we don't re-alert for the same user-day-kind.

```sql
CREATE TABLE public."UsageAlert" (
  "userId" uuid NOT NULL,
  "alertDate" date NOT NULL,
  kind text NOT NULL,                -- 'cost' | 'tokens'
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("userId", "alertDate", kind)
);
```

## 10. Cost Computation

Inside `trackedLLM`, after the LLM call returns:

```ts
const price = await getModelPrice(model);  // cached in memory, refreshed every 10min
const costUsd =
  (promptTokens / 1_000_000) * price.inputPricePer1M
  + (completionTokens / 1_000_000) * price.outputPricePer1M;
```

For OpenRouter, the `model` recorded is the OpenRouter model ID (`anthropic/claude-sonnet-4.5`), and `ModelPrice` is keyed accordingly. If a model is missing from `ModelPrice`, we record `costUsd=0` and log a warning so the seed list stays current.

## 11. Files Touched (inventory)

**New files:**
- `apps/api/usage-tracking-migration.sql` — migration delivered to the user separately
- `apps/api/src/middleware/usageContext.ts`
- `apps/api/src/middleware/internalAdmin.ts`
- `apps/api/src/services/usage/trackedLLM.ts`
- `apps/api/src/services/usage/trackedApify.ts`
- `apps/api/src/services/usage/trackedAzureDocIntel.ts`
- `apps/api/src/services/usage/modelPrices.ts` — in-memory cache wrapper around `ModelPrice` table
- `apps/api/src/services/usage/operationCredits.ts` — same for `OperationCredits`
- `apps/api/src/services/usage/runawayMonitor.ts` — async post-event check + alert
- `apps/api/src/routes/internal-usage.ts`
- `apps/api/src/routes/usage.ts` — for `/api/usage/me`
- `apps/web/internal/usage.html`
- `apps/web/internal/usage.js`

**Modified files (mechanical, ~20):**
- `apps/api/src/openai.ts` — re-export wrapped clients
- `apps/api/src/services/llm.ts` — wrap factory functions
- All callsites of LLM clients in services and routes — add `operation` label argument
- `apps/api/src/services/webSearch.ts` — route through `trackedApify`
- `apps/api/src/services/azureDocIntelligence.ts` — route through `trackedAzureDocIntel`
- `apps/api/src/app.ts` — mount `/api/internal/*` and `/api/usage/*` routes; register `usageContext` middleware
- `apps/api/src/routes/users.ts` — `/api/users/me` returns `isInternal` so frontend can gate `/internal/usage.html`
- `apps/web/settings.html` + `apps/web/js/settings.js` — add AI Usage section

## 12. Rollout Plan

1. **Phase 0** — Run migration SQL in staging Supabase, verify tables.
2. **Phase 1** — Land `usageContext` middleware, `trackedLLM` wrapper, and `UsageEvent` write path. **Migrate 3 high-traffic callsites first** (deal chat, financial extraction, firm research) to validate the data shape before touching all 20.
3. **Phase 2** — Migrate remaining LLM callsites + Apify + Azure DocIntel.
4. **Phase 3** — Build internal admin page (read-only first: live feed, leaderboard, cost breakdown). No throttle/block actions yet.
5. **Phase 4** — User-facing Settings AI Usage panel.
6. **Phase 5** — Runaway monitor + alert email + throttle/block actions in admin page.
7. **Phase 6** — Production rollout. Seed `isInternal=true` for Pocket Fund team.

Total estimate: **3–5 days of focused work**, sequenced as separate PRs.

## 13. Open Questions / Defer-To-Implementation

- **Streaming responses:** OpenAI streaming returns tokens incrementally; we record `UsageEvent` only on stream completion. If a stream is aborted, we record what we have with `status='error'`. (Confirm during implementation.)
- **OpenRouter pass-through pricing:** OpenRouter sometimes adds a small markup. Decide whether `ModelPrice` reflects OpenRouter's billed rate or upstream provider rate. Likely OpenRouter's, since that's what we actually pay.
- **Async insert resilience:** `UsageEvent` insert must not block the response. We fire-and-forget but log on failure. If Supabase is down momentarily, we lose events — acceptable for v1.
- **PII in `metadata`:** Don't store prompts. Only IDs (`dealId`, `documentId`, `requestId`).

## 14. Success Criteria

- Internal team can answer "who consumed the most yesterday?" in under 30 seconds without leaving the product.
- Every LLM/Apify/Azure call is attributable to a specific `userId` + `organizationId`.
- $ cost per user matches the OpenAI/OpenRouter dashboard within 2% over a 7-day window.
- Beta users notice nothing — no friction, no errors, no UI surprises.
- One configurable kill-switch (`isBlocked`) reachable in 2 clicks from the internal admin page.
