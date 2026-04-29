# API Routes

> Complete map of every route file in [`apps/api/src/routes/`](../../apps/api/src/routes/). 48 files, ~200 endpoints. Generated from the live router; refresh by re-reading the directory.

All routes live under `/api/*` and require `authMiddleware + orgMiddleware` unless marked **PUBLIC**. The mounting order is in [`apps/api/src/app.ts`](../../apps/api/src/app.ts).

> Express routing note: `/api/deals/import` MUST be mounted before `/api/deals` so the import sub-route doesn't get swallowed by `/api/deals/:id`.

## Convention

- Routes validate input (Zod) and call services. Business logic does not live here.
- Errors should throw `ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError` from [`middleware/errorHandler.ts`](../../apps/api/src/middleware/errorHandler.ts) — the global handler converts to JSON.
- Org-scoped queries either filter `.eq('organizationId', orgId)` directly or call `verifyDealAccess(dealId, orgId)`.

## Public routes (no auth)

| Method + path | Handler | Notes |
| --- | --- | --- |
| `GET /health` | `app.ts` | Liveness — no DB query |
| `GET /health/ready` | `app.ts` | Readiness with DB / OpenAI / Sentry / Gemini status |
| `GET /api` | `app.ts` | Index of resource roots |
| `GET /api/ai/status` | `app.ts` | `{ enabled, model }` for AI gating |
| `POST /api/public/invitations/accept` | [`invitations-accept.ts`](../../apps/api/src/routes/invitations-accept.ts) | Invitee creates account |
| `GET /api/public/invitations/verify/:token` | [`invitations-accept.ts`](../../apps/api/src/routes/invitations-accept.ts) | Verify a token (returns org name + logo) |

## Authenticated routes

### Deals

| File | Mount | Notes |
| --- | --- | --- |
| [`deals.ts`](../../apps/api/src/routes/deals.ts) | `/api/deals` | CRUD on Deal. `GET /stats/summary`. |
| [`deals-analysis.ts`](../../apps/api/src/routes/deals-analysis.ts) | `/api/deals/:id/analysis` | PE analysis suite endpoints (QoE, ratios, red flags) |
| [`deals-chat.ts`](../../apps/api/src/routes/deals-chat.ts) | `/api/deals/:id/chat` | Chat history reads / messages |
| [`deals-chat-ai.ts`](../../apps/api/src/routes/deals-chat-ai.ts) | `/api/deals/:id/chat` | POST chat — runs Deal Chat ReAct agent. Hydrates deal context + financial tables before invoking. |
| [`deals-team.ts`](../../apps/api/src/routes/deals-team.ts) | `/api/deals/:id/team` | DealTeamMember CRUD |
| [`deal-import.ts`](../../apps/api/src/routes/deal-import.ts) | `/api/deals/import` | `POST /analyze` (GPT-4o column mapping) and `POST /` (5-phase batch insert) |

### Documents

| File | Mount | Notes |
| --- | --- | --- |
| [`documents.ts`](../../apps/api/src/routes/documents.ts) | `/api` | List / get / patch / delete. Reads scoped via deal. |
| [`documents-upload.ts`](../../apps/api/src/routes/documents-upload.ts) | (mounted in documents) | Upload to Supabase storage. Auto-fills `folderId`. Fires onboarding-step hook. |
| [`documents-sharing.ts`](../../apps/api/src/routes/documents-sharing.ts) | `/api/documents/:id/share` | Doc-request emails via Resend |
| [`documents-alerts.ts`](../../apps/api/src/routes/documents-alerts.ts) | `/api/documents` | Document AI alerts |

### Folders

| File | Mount | Notes |
| --- | --- | --- |
| [`folders.ts`](../../apps/api/src/routes/folders.ts) | `/api` | Self-referential tree CRUD |
| [`folders-insights.ts`](../../apps/api/src/routes/folders-insights.ts) | `/api/folders/:id/insights` | Generated summary + redFlags + missing docs |

### Financials

| File | Mount | Notes |
| --- | --- | --- |
| [`financials.ts`](../../apps/api/src/routes/financials.ts) | `/api` | Index — list active statements per deal |
| [`financials-extraction.ts`](../../apps/api/src/routes/financials-extraction.ts) | (mounted in financials) | `POST /extract` — runs the LangGraph Financial Agent. Returns `{ result, agent: { steps[], retryCount, validationResult, ... } }` |
| [`financials-merge.ts`](../../apps/api/src/routes/financials-merge.ts) | (mounted in financials) | `GET /conflicts`, `POST /resolve`, `POST /resolve-all` |
| [`financials-analysis.ts`](../../apps/api/src/routes/financials-analysis.ts) | (mounted in financials) | PE analysis aggregation |
| [`financials-memo.ts`](../../apps/api/src/routes/financials-memo.ts) | (mounted in financials) | Pull financial blocks for memo |

### Memos

| File | Mount | Notes |
| --- | --- | --- |
| [`memos.ts`](../../apps/api/src/routes/memos.ts) | `/api/memos` | Memo CRUD |
| [`memos-sections.ts`](../../apps/api/src/routes/memos-sections.ts) | (mounted in memos) | `POST /:id/sections/:id/generate` runs Memo Agent (rate-limited as AI) |
| [`memos-chat.ts`](../../apps/api/src/routes/memos-chat.ts) | (mounted in memos) | `POST /:id/chat` — memo-scoped chat (rate-limited as AI) |

### Templates

| File | Mount | Notes |
| --- | --- | --- |
| [`templates.ts`](../../apps/api/src/routes/templates.ts) | `/api/templates` | Org-shared memo templates |
| [`templates-sections.ts`](../../apps/api/src/routes/templates-sections.ts) | (mounted in templates) | Section CRUD inside a template |

### AI

| File | Mount | Notes |
| --- | --- | --- |
| [`ai.ts`](../../apps/api/src/routes/ai.ts) | `/api` | General AI helpers |
| [`ai-agents.ts`](../../apps/api/src/routes/ai-agents.ts) | `/api/ai` | `POST /enrich-contact`, `/meeting-prep`, `/draft-email`, `/scan-signals` — wires to corresponding agents |
| [`ai-portfolio.ts`](../../apps/api/src/routes/ai-portfolio.ts) | `/api/ai/portfolio` | Inline ReAct portfolio chat with 3 tools |
| [`ai-ingest.ts`](../../apps/api/src/routes/ai-ingest.ts) | `/api/ai/ingest` | AI ingest helpers |

### Ingest

`/api/ingest/*` — write-rate-limited (30/min).

| File | Mount | Notes |
| --- | --- | --- |
| [`ingest.ts`](../../apps/api/src/routes/ingest.ts) | `/api/ingest` | Top-level router that mounts the rest |
| [`ingest-upload.ts`](../../apps/api/src/routes/ingest-upload.ts) | `POST /upload` | File upload entrypoint — creates Deal if needed |
| [`ingest-url.ts`](../../apps/api/src/routes/ingest-url.ts) | `POST /url` | URL scrape + parse |
| [`ingest-email.ts`](../../apps/api/src/routes/ingest-email.ts) | `POST /email` | Forwarded email parsing |
| [`ingest-text.ts`](../../apps/api/src/routes/ingest-text.ts) | `POST /text` | Pasted text |
| [`ingest-shared.ts`](../../apps/api/src/routes/ingest-shared.ts) | (helper) | Shared code — extracted to break circular import with `ingest.ts` |

### Users / Profile / Invitations

| File | Mount | Notes |
| --- | --- | --- |
| [`users.ts`](../../apps/api/src/routes/users.ts) | `/api/users` | List + `GET /me` |
| [`users-profile.ts`](../../apps/api/src/routes/users-profile.ts) | `/api/users/profile` | `PATCH /me` — name, title, prefs |
| [`invitations.ts`](../../apps/api/src/routes/invitations.ts) | `/api/invitations` | Authenticated invite mgmt — list, create, revoke, resend. `POST /` always returns `inviteUrl`. `GET /` decorates PENDING with `inviteUrl`. |
| [`invitations-accept.ts`](../../apps/api/src/routes/invitations-accept.ts) | `/api/public/invitations` | Public verify + accept |

### Contacts

| File | Mount | Notes |
| --- | --- | --- |
| [`contacts.ts`](../../apps/api/src/routes/contacts.ts) | `/api/contacts` | CRUD + import + export + sort + pagination |
| [`contacts-insights.ts`](../../apps/api/src/routes/contacts-insights.ts) | `/api/contacts/insights` | Scores, duplicates, stale, timeline |
| [`contacts-connections.ts`](../../apps/api/src/routes/contacts-connections.ts) | `/api/contacts/:id/connections` | Network graph data |

### System

| File | Mount | Notes |
| --- | --- | --- |
| [`activities.ts`](../../apps/api/src/routes/activities.ts) | `/api` | Activity timeline reads + writes |
| [`audit.ts`](../../apps/api/src/routes/audit.ts) | `/api/audit` | Read-only AuditLog (admin) |
| [`tasks.ts`](../../apps/api/src/routes/tasks.ts) | `/api/tasks` | Task CRUD |
| [`export.ts`](../../apps/api/src/routes/export.ts) | `/api/export` | CSV / data export |
| [`notifications.ts`](../../apps/api/src/routes/notifications.ts) | `/api/notifications` | Lookup uses `User.authId` to resolve internal id |
| [`onboarding.ts`](../../apps/api/src/routes/onboarding.ts) | `/api/onboarding` | `GET /status` (auto-backfills 5 steps), `PATCH /step`, `POST /enrich-firm`, `GET /research-status` |
| [`watchlist.ts`](../../apps/api/src/routes/watchlist.ts) | `/api/watchlist` | Saved-deals list |
| [`chat.ts`](../../apps/api/src/routes/chat.ts) | `/api` | Generic conversation reads |
| [`companies.ts`](../../apps/api/src/routes/companies.ts) | `/api/companies` | Company CRUD |

## Rate-limit map

Configured in [`app.ts`](../../apps/api/src/app.ts):

| Bucket | Limit | Applied to |
| --- | --- | --- |
| general | 600 / 15 min / user | All `/api/*` |
| AI | 10 / min / user | `/api/ai`, `/api/memos/*/chat`, `/api/memos/*/sections/*/generate` |
| write | 30 / min / user | `/api/ingest` |

The key generator uses the last 16 chars of the Bearer token (so each user gets their own bucket; Vercel CDN IP sharing won't cause false 429s). Falls back to `X-Forwarded-For` for unauthenticated requests.

## Status codes used

- `200`/`201` — success
- `400` — `ValidationError` (Zod failure or business rule)
- `401` — missing/invalid JWT
- `403` — RBAC failure within own org (rare; cross-org returns 404 instead)
- `404` — `NotFoundError` — also returned for cross-org access attempts
- `409` — `ConflictError` (duplicate, merge conflict)
- `429` — rate limit hit
- `500` — unhandled — surfaces to Sentry with the correlation header `X-Request-Id`

## How to add a new route

1. Create `apps/api/src/routes/<name>.ts` exporting an Express router.
2. Validate input with Zod. Throw the right error class on failure.
3. Call a service in `services/`. Don't put business logic in the route.
4. Always include the org filter (`.eq('organizationId', orgId)`) or `verifyDealAccess` before reading.
5. Mount in `apps/api/src/app.ts` with `authMiddleware, orgMiddleware`.
6. Add an integration test in `apps/api/tests/`. Run `npm run test:org-isolation` if it touches a tenanted resource.
