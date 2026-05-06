# AI Usage Tracking — Rollout Checklist

> Companion to `2026-05-05-ai-usage-tracking.md` (Task 18). Run through this when shipping the feature to staging and production.

## Pre-deploy

- [ ] **Migration** — `apps/api/usage-tracking-migration.sql` already run in production (confirmed 2026-05-05).
- [ ] **Operation seed addendum** — Run `apps/api/usage-tracking-addendum.sql` to seed `email_drafting`, `contact_enrichment`, `linkedin_scrape` credits. Idempotent — safe to re-run.
- [ ] **Internal admins** — Confirm the three internal team rows are flagged:
  ```sql
  SELECT email, "isInternal" FROM public."User"
  WHERE email IN ('dev@pocket-fund.com', 'ganeshjagtap006@gmail.com', 'hello@pocket-fund.com');
  ```
  If any is missing (sign-up hasn't happened yet), re-run the bootstrap UPDATE block from the migration after they sign up.

## Vercel env vars

Set in the Vercel project settings before deploying the branch:

| Variable | Recommended value | Notes |
|---|---|---|
| `INTERNAL_ALERT_EMAIL` | your team inbox | Required to fire alert emails |
| `USAGE_DAILY_COST_ALERT_USD` | `20` | Tunable after first week of data |
| `USAGE_DAILY_TOKEN_ALERT` | `500000` | Tunable |
| `USAGE_AUTO_THROTTLE` | `false` | Flip to `true` after thresholds are tuned |
| `APIFY_PRICE_PER_SEARCH_USD` | `0.005` | Verify against Apify dashboard |
| `APIFY_PRICE_PER_LINKEDIN_PROFILE_USD` | `0.02` | Verify against Apify dashboard |
| `AZURE_DOC_PRICE_PER_PAGE_USD` | `0.0015` | Verify against Azure dashboard |

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` already exist in the project — alert emails reuse the same Resend account.

## Post-deploy smoke (staging first, then prod)

- [ ] Log in as an internal admin; visit `/internal/usage.html`. All three tabs render.
- [ ] Log in as a regular beta user; visit `/internal/usage.html`. Redirects to `/dashboard.html`.
- [ ] In the Settings page, expand the new "AI Usage" section. Counter renders (zero is OK if no calls yet).
- [ ] Trigger a deal chat message. Within seconds, check Live Feed — one row with `operation='deal_chat'`, non-zero tokens, small positive `costUsd`.
- [ ] Trigger a financial extraction (CIM upload). Confirm rows for `financial_extraction`.
- [ ] In the Cost Breakdown tab, the daily bar chart populates with at least one segment.
- [ ] In the Leaderboard tab, sort by 24h cost. Toggle `Throttle` on a test user, verify the badge flips. Toggle `Block`, verify chat returns a blocked error.

## First-week observation

- Watch the OpenRouter dashboard daily total vs. the admin Cost Breakdown total. Should match within ~2%.
- If runaway alerts fire, investigate before flipping `USAGE_AUTO_THROTTLE=true`.
- After a week of clean data, decide whether to introduce user-facing quotas (Phase B in the original spec).

## Files added by this work

| Path | Purpose |
|---|---|
| `apps/api/usage-tracking-migration.sql` | Initial DB migration (already run) |
| `apps/api/usage-tracking-addendum.sql` | Seeds 3 late-discovered operations |
| `apps/api/src/middleware/usageContext.ts` | AsyncLocalStorage request context |
| `apps/api/src/middleware/internalAdmin.ts` | `requireInternalAdmin` gate |
| `apps/api/src/services/usage/modelPrices.ts` | Cached ModelPrice lookup |
| `apps/api/src/services/usage/operationCredits.ts` | Cached OperationCredits lookup |
| `apps/api/src/services/usage/trackedLLM.ts` | `recordUsageEvent` ledger |
| `apps/api/src/services/usage/trackedApify.ts` | Apify cost wrapper |
| `apps/api/src/services/usage/trackedAzureDocIntel.ts` | Azure DocIntel cost wrapper |
| `apps/api/src/services/usage/userFlags.ts` | TTL cache for `isBlocked`/`isThrottled` |
| `apps/api/src/services/usage/throttle.ts` | In-process per-user 1-req/2s soft throttle |
| `apps/api/src/services/usage/enforcement.ts` | `enforceUserGate` + `UserBlockedError` |
| `apps/api/src/services/usage/runawayMonitor.ts` | Daily threshold check + Resend alert |
| `apps/api/src/services/email.ts` | Centralized Resend wrapper |
| `apps/api/src/routes/internal-usage.ts` | `/api/internal/usage/*` admin routes |
| `apps/api/src/routes/usage.ts` | `/api/usage/me` user-facing rollup |
| `apps/web/internal/usage.html` + `usage.js` | Internal admin page (3 tabs) |
| `apps/web/js/settingsAiUsage.js` | Settings page AI Usage panel |
