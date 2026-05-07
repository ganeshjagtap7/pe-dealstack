# Integrations Platform — Design Spec

**Date:** 2026-04-30
**Status:** Draft — pending user review
**Author:** Claude (brainstormed with Ganesh)
**Scope:** Shared integration platform + 4 sequenced provider integrations (Granola → Gmail → Google Calendar → Outbound)

---

## 1. Problem & goal

PE / search-fund users at Pocket Fund spend significant time manually:
- Re-typing meeting notes into deal records
- Forgetting which deal contacts they last emailed
- Walking into founder/banker calls without context
- Copy-pasting figures from email threads into the CRM

The CRM should auto-ingest the conversations, meetings, and emails that *already happen* in the user's existing tools, attach them to the right Deal/Contact, and run AI extraction on top — so users walk in prepared and walk out with everything captured.

**Success criteria:**
- A new user can connect Granola in <60s and see auto-populated meeting notes on their next call.
- Every email a user sends/receives with a deal contact appears on the Deal's Activities tab within 5 minutes (Gmail).
- Pre-meeting briefs are delivered 1 hour before each deal-linked calendar event.
- The integration platform supports adding a new provider in <1 week of work.

---

## 2. Decisions (non-negotiable for this spec)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Build vs. unified API (Nylas/Merge.dev) | **Build direct** | Cost scales badly per-seat; control; team has existing Granola/OpenAI integration depth |
| 2 | Connection scope | **Per-user OAuth** | Inbox/calendar are personal; matches per-user onboarding model |
| 3 | Sync model | **Hybrid: webhook-first, cron fallback** | Webhooks for real-time; 6h cron catches misses + does backfill |
| 4 | Token storage | **AES-256 via existing `apps/api/src/services/encryption.ts`** | Already in repo |
| 5 | Build order | Granola → Gmail → Calendar → Outbound | Granola is webhook-only and reuses existing AI; Gmail is the hardest piece (relevance) |
| 6 | UI hub | **Settings → Integrations** | Matches existing settings IA |
| 7 | Per-deal surface | **Activities tab + right-rail on `apps/web/deal.html`** | Reuses existing Activities infrastructure |

---

## 3. Information architecture (where it lives)

### 3.1 Settings → Integrations (the connection hub)
- New section in settings sidebar: "Integrations"
- Card grid of providers: Granola, Gmail, Google Calendar (V1). Fireflies / Otter / Microsoft 365 deferred to a future phase outside this spec.
- Each card shows: status (Connected ✓ / Not connected / Reconnect needed), connected account email, last sync timestamp, sync stats, [Settings] [Disconnect] buttons
- Sync activity log table below the grid (last 50 events with status + retry link on failures)

### 3.2 Deal page additions (`apps/web/deal.html`)
- **Header:** "Brief me" button (top-right) → opens pre-meeting brief panel
- **Activities tab:** auto-populated with emails, meetings (with transcripts), calendar events. Each item is a card with timestamp, source icon, AI summary, expand-to-detail.
- **Right rail:**
  - "Upcoming meetings" widget (Calendar)
  - "Last contact" widget (Gmail) with stale indicator (>7 days no reply)

### 3.3 Contact page additions
- Email thread history section
- Meeting history section (Calendar + transcript links)

### 3.4 Onboarding
- New step #4: "Connect your tools" (optional, skippable)
- Two CTAs: [Connect Granola] [Connect Gmail]
- Skipping marks step done in `onboardingStatus`

### 3.5 Notification center (top-right bell)
- New notification types: `NEW_TRANSCRIPT`, `STALE_THREAD`, `MEETING_BRIEF_READY`, `INTEGRATION_SYNC_FAILED`, `INTEGRATION_RECONNECT_NEEDED`

### 3.6 Empty states
- Deal Activities tab (no integrations connected): "Connect Gmail and Granola to auto-populate this deal" → links to Settings → Integrations

---

## 4. Shared platform architecture

### 4.1 Data model

```sql
CREATE TABLE "Integration" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES "Organization"(id),
  userId UUID NOT NULL REFERENCES "User"(id),
  provider TEXT NOT NULL CHECK (provider IN ('granola','gmail','google_calendar','fireflies','otter')),
  status TEXT NOT NULL CHECK (status IN ('connected','token_expired','revoked','error')),
  externalAccountId TEXT,
  externalAccountEmail TEXT,
  accessTokenEncrypted TEXT,
  refreshTokenEncrypted TEXT,
  tokenExpiresAt TIMESTAMPTZ,
  scopes TEXT[],
  settings JSONB DEFAULT '{}',
  lastSyncAt TIMESTAMPTZ,
  lastSyncError TEXT,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(userId, provider)
);

CREATE INDEX idx_integration_org ON "Integration"(organizationId);
CREATE INDEX idx_integration_provider_status ON "Integration"(provider, status);

CREATE TABLE "IntegrationEvent" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrationId UUID NOT NULL REFERENCES "Integration"(id) ON DELETE CASCADE,
  externalId TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB,
  receivedAt TIMESTAMPTZ DEFAULT NOW(),
  processedAt TIMESTAMPTZ,
  error TEXT,
  UNIQUE(integrationId, externalId)
);

CREATE INDEX idx_integration_event_unprocessed ON "IntegrationEvent"(integrationId, processedAt)
  WHERE processedAt IS NULL;
```

### 4.2 Folder structure

```
apps/api/src/integrations/
├── _platform/
│   ├── oauth.ts          OAuth 2.0 helpers (PKCE, state signing, callback)
│   ├── tokenStore.ts     Encrypted token CRUD + refresh
│   ├── syncEngine.ts     Cron entrypoint
│   ├── webhookRouter.ts  Signature verification, dedupe, dispatch
│   ├── matcher.ts        Email/meeting → Deal/Contact matcher
│   └── types.ts          IntegrationProvider interface
├── granola/
│   ├── auth.ts
│   ├── sync.ts
│   ├── webhook.ts
│   └── mapper.ts
├── gmail/
│   ├── auth.ts
│   ├── sync.ts
│   ├── webhook.ts
│   ├── classifier.ts     Relevance classifier (GPT-4o-mini)
│   └── mapper.ts
└── googleCalendar/
    ├── auth.ts
    ├── sync.ts
    ├── webhook.ts
    └── mapper.ts
```

### 4.3 Provider interface

```ts
interface IntegrationProvider {
  id: 'granola' | 'gmail' | 'google_calendar' | 'fireflies' | 'otter';
  displayName: string;
  scopes: string[];

  initiateAuth(userId: string): Promise<{ authUrl: string; state: string }>;
  handleCallback(code: string, state: string): Promise<Integration>;
  sync(integration: Integration, options: { since?: Date; backfill?: boolean }): Promise<SyncResult>;
  handleWebhook(headers: Headers, body: unknown): Promise<void>;
  disconnect(integration: Integration): Promise<void>;
}

interface SyncResult {
  itemsSynced: number;
  itemsMatched: number;
  errors: string[];
  newCursor?: string;
}
```

### 4.4 Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/integrations` | List user's connections (org-scoped) |
| POST | `/api/integrations/:provider/connect` | Initiate OAuth, return authUrl |
| GET | `/api/integrations/:provider/callback` | OAuth callback (provider-specific state) |
| DELETE | `/api/integrations/:id` | Disconnect (revoke + soft-delete) |
| POST | `/api/integrations/:id/sync` | Manual resync trigger |
| GET | `/api/integrations/:id/events` | Paginated event log |
| POST | `/api/integrations/webhooks/:provider` | Public webhook receiver, signature-verified |

All non-webhook routes go through existing `orgMiddleware` from `apps/api/src/middleware/orgScope.ts`.

### 4.5 Cron

Vercel cron entry at `/api/integrations/sync-all` runs every 6 hours and serves two roles:
1. **Backfill / catch-up:** sync providers whose webhooks may have been missed (network blips, signature mismatches, Vercel cold starts dropping a request).
2. **Polling fallback:** for any provider/setup where webhooks aren't available (e.g., Gmail without Cloud Pub/Sub configured).

Per tick:
1. Fetch all `Integration` rows where `status = 'connected'`
2. For each, call `provider.sync({ since: lastSyncAt })`
3. Update `lastSyncAt` / `lastSyncError`
4. Emit `INTEGRATION_SYNC_FAILED` notification if 3 consecutive failures

---

## 5. Phased plan

### Phase 0 — Platform foundations (1–2 weeks)
**Ships:** Settings → Integrations page (empty grid). No providers yet. Nothing user-visible besides the page.
**Validates:** schema, OAuth core, encryption, cron, webhook router.

### Phase 1 — Granola (1 week)
**Ships:** auto-populated meeting transcripts on Deal Activities tab, AI-extracted figures.
**Why first:** webhook-only sync is simplest; reuses existing LangGraph financial agent.

### Phase 2 — Gmail (2–3 weeks)
**Ships:** every relevant email auto-logged on Deal page, stale-thread alerts, review queue.
**Hardest piece:** relevance classifier ("is this email about Deal X?").

### Phase 3 — Google Calendar (1 week)
**Ships:** upcoming-meetings widget, pre-meeting briefs 1h before deal events.
**Fast because:** reuses Google OAuth from Phase 2 (scope upgrade).

### Phase 4 — Outbound (2 weeks)
**Ships:** send email + schedule meeting from Deal page.
**Highest risk:** every action audited, confirmation flows mandatory.

---

## 6. User flows (per phase)

### 6.1 Granola — Connect
1. Settings → Integrations → "Connect Granola" card
2. New tab: Granola OAuth consent
3. Approve → callback → toast "Granola connected"
4. Card flips to "Connected ✓ — synced 0 meetings"
5. Background backfill (last 30 days)

### 6.2 Granola — Live use
1. Meeting ends; Granola sends `transcript.ready` webhook
2. We fetch full transcript
3. AI run: extract figures, action items, attendees
4. Match attendees → existing Deal contacts → if found, attach as Activity
5. If unmatched → notification + queue entry "Link to deal?"
6. User opens Deal → Activities tab → meeting card with summary, expand for transcript

### 6.3 Gmail — Connect
1. Settings → Integrations → "Connect Gmail" → Google OAuth (`gmail.readonly`, `userinfo.email`)
2. Consent → callback → toast
3. Background: 90-day backfill of emails matching deal contact addresses
4. Settings shows: "Synced 412 emails to 23 deals"

### 6.4 Gmail — Live use
1. New email → Gmail push → our webhook
2. Relevance classifier scores email (sender match? subject match? body match? deal name in thread?)
3. Score ≥ 0.7 → auto-attach as Activity
4. 0.3 ≤ score < 0.7 → review queue
5. Score < 0.3 → ignored (logged for tuning)

### 6.5 Gmail — Stale-thread alert
1. Daily cron checks each active Deal's last inbound email vs. last outbound reply
2. If user "owes a reply" >7 days → notification "3 deals have stale threads"

### 6.6 Calendar — Pre-meeting brief
1. 1 hour before a Deal-matched event
2. AI assembles brief: deal stage, last 3 emails, prior transcript, financial snapshot, open questions
3. Notification + email: "Brief for Acme Corp call in 1h"
4. Click → Deal page with brief panel pinned

### 6.7 Outbound — Send email from deal
1. Deal page → Activities → "Reply" or "New email"
2. Compose modal (subject, body, optional template)
3. Confirm dialog: "Send to john@acme.com?"
4. Gmail API send
5. Auto-logged as outbound Activity in audit log + Activities tab

### 6.8 Disconnect (any provider)
1. Settings → Integrations → provider card → "Disconnect"
2. Confirm dialog: "Past data stays; no new sync."
3. Token revoked at provider; row status → 'revoked'

---

## 7. Error handling

| Failure | Behavior |
|---|---|
| OAuth callback rejected/cancelled | Toast + redirect to Integrations page; no Integration row created |
| Token refresh fails (revoked at provider) | Status → `token_expired`; notification "Reconnect Gmail"; sync paused |
| Webhook signature invalid | 401, no DB write |
| Webhook duplicate (same `externalId`) | Idempotent — `IntegrationEvent` UNIQUE constraint catches it |
| Provider API rate-limited | Exponential backoff per provider; resume next cron tick |
| Provider API 5xx | Retry once, then mark `lastSyncError`, continue with other integrations |
| AI extraction fails on a transcript | Activity still created with raw transcript; AI fields null; user can retry from UI |
| Email relevance ambiguous | Goes to review queue, not auto-attached |
| 3 consecutive cron failures | Notification + status `error` + manual reconnect required |

---

## 8. Security

- All tokens encrypted at rest via existing `encryption.ts` (AES-256-GCM)
- Webhook endpoints verify provider signatures; reject unsigned requests
- OAuth state tokens are signed JWTs with 10min expiry to prevent CSRF
- All sync operations org-scoped via `orgMiddleware`
- Outbound (Phase 4) actions logged to `auditLog.ts` with full payload
- No PII written to logs; tokens never logged
- Disconnecting calls provider's revocation endpoint, not just deletes our row

---

## 9. Testing strategy

- **Unit:** OAuth callback, token refresh, webhook dedupe, relevance classifier (against labeled fixtures)
- **Integration:** mock provider servers using `nock` or similar; full connect → sync → disconnect flow per provider
- **E2E:** at least one Playwright test per phase covering the connect → live-use flow
- **Manual QA:** real OAuth against staging Granola/Google sandbox accounts before each phase ships

---

## 10. Out of scope (explicitly)

- Microsoft 365 / Outlook (future)
- Slack / Teams (future)
- LinkedIn (already partially covered by `firmResearchAgent`)
- HubSpot/Salesforce import (covered by deal-import)
- Per-org service accounts (only per-user OAuth in V1)

---

## 11. Open questions

- Granola OAuth: confirm they have a public OAuth app or only API keys (impacts Phase 1 design)
- Gmail push notifications require Google Cloud Pub/Sub topic — confirm Vercel-Pub/Sub interop or use polling fallback for V1
- Pre-meeting brief: 1h advance fixed, or configurable per user?

---

## 12. Detailed TODO checklist

### Phase 0 — Platform foundations
- [ ] DB migration: `Integration` + `IntegrationEvent` (`apps/api/integrations-migration.sql`)
- [ ] `apps/api/src/integrations/_platform/types.ts`
- [ ] `apps/api/src/integrations/_platform/oauth.ts`
- [ ] `apps/api/src/integrations/_platform/tokenStore.ts`
- [ ] `apps/api/src/integrations/_platform/syncEngine.ts`
- [ ] `apps/api/src/integrations/_platform/webhookRouter.ts`
- [ ] `apps/api/src/integrations/_platform/matcher.ts`
- [ ] `apps/api/src/routes/integrations.ts`
- [ ] `apps/api/src/routes/integrations-webhooks.ts`
- [ ] Vercel cron entry for `/api/integrations/sync-all` (every 6h)
- [ ] Settings UI shell: new "Integrations" section inside existing `apps/web/settings.html`
- [ ] `apps/web/js/integrations.js` (provider cards, connect button, status, sync log)
- [ ] Settings sidebar: add "Integrations" entry
- [ ] Extend `apps/api/src/routes/notifications.ts` with new types
- [ ] Tests: OAuth callback, token refresh, webhook dedupe

### Phase 1 — Granola
- [ ] Granola OAuth app registration + env vars
- [ ] `granola/auth.ts`
- [ ] `granola/sync.ts` (30-day backfill default)
- [ ] `granola/webhook.ts` (`meeting.transcript.ready` handler)
- [ ] `granola/mapper.ts` (transcript → Activity + AI extraction)
- [ ] Reuse `runFinancialAgent` on transcripts where applicable
- [ ] Match-or-prompt UI: unmatched transcript inbox
- [ ] Deal page render: meeting Activity card with expand-to-transcript
- [ ] Settings card: Granola stats display
- [ ] Tests: webhook signature, mapper extraction, dedupe

### Phase 2 — Gmail
- [ ] Google OAuth app + env vars
- [ ] `gmail/auth.ts` (scopes: `gmail.readonly`, `userinfo.email`)
- [ ] `gmail/sync.ts` (90-day backfill, paginated history)
- [ ] `gmail/webhook.ts` (Cloud Pub/Sub message handler)
- [ ] `gmail/classifier.ts` (GPT-4o-mini relevance scorer; uses `aiCache.ts`)
- [ ] `gmail/mapper.ts` (email → Activity, threading by `In-Reply-To`)
- [ ] Stale-thread cron + notification
- [ ] Review queue UI in settings
- [ ] Deal page render: email thread component
- [ ] Contact page: email history section
- [ ] Tests: classifier on labeled fixtures, threading

### Phase 3 — Google Calendar
- [ ] Scope upgrade flow if Gmail already connected
- [ ] `googleCalendar/auth.ts` (`calendar.readonly`)
- [ ] `googleCalendar/sync.ts` (-30d / +30d window)
- [ ] `googleCalendar/webhook.ts` (Calendar push notifications)
- [ ] `googleCalendar/mapper.ts` (event → Activity, attendee match)
- [ ] Pre-meeting brief generator (60min-before scheduler)
- [ ] Right-rail "Upcoming meetings" widget on deal page + dashboard
- [ ] Brief notification + dedicated brief panel UI
- [ ] Tests: match accuracy, brief assembly

### Phase 4 — Outbound
- [ ] Scope upgrade flow (`gmail.send`, `calendar.events`)
- [ ] Compose email modal
- [ ] `POST /api/deals/:id/send-email` endpoint
- [ ] Schedule meeting modal
- [ ] `POST /api/deals/:id/schedule-meeting` endpoint
- [ ] Audit log entries for every outbound action
- [ ] Confirmation dialogs (mandatory)
- [ ] Template library seed: follow-up, NDA request, term sheet
- [ ] Tests: dry-run mode, audit completeness

---

## 13. Next step

After this spec is approved, hand off to `superpowers:writing-plans` to produce the **Phase 0 implementation plan**. Subsequent phases each get their own plan when their predecessor is done.
