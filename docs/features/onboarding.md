# Onboarding

Get a brand-new user from signup to "first deal in pipeline with extracted financials" in roughly five minutes.

## Surfaces

| Surface | Where | When |
| --- | --- | --- |
| Welcome modal | Dashboard, first load | After signup |
| Standalone onboarding flow | [`apps/web/onboarding.html`](../../apps/web/onboarding.html) (legacy), `apps/web-next/src/app/(onboarding)/onboarding/` | New users only |
| Persistent checklist widget | Sidebar on dashboard / CRM / contacts | Until all 5 steps done |
| Empty-state coachmarks | Per-page empty states | Until that resource has rows |
| Feedback button + BETA badge | Top-right of every page | Always |

## The 5 steps

| Step | Backfill check (auto-completes) |
| --- | --- |
| 1 — Define investment focus | `Organization.settings.firmProfile` exists |
| 2 — Create first deal | At least one `Deal` in org |
| 3 — Upload document | At least one `Document` in any deal |
| 4 — Review extraction | At least one `FinancialStatement` row |
| 5 — Try AI chat | At least one `ChatMessage` row |

`GET /api/onboarding/status` runs these checks every load and updates `onboardingStatus` accordingly. So if a user does step 2 outside the onboarding flow (e.g., through CRM), the checklist still ticks.

## Manual completion

Clicking the empty circle next to a step also marks it done (forward-only — can't unmark).

## Implementation

| File | Purpose |
| --- | --- |
| [`apps/web/onboarding.html`](../../apps/web/onboarding.html) | Standalone 3-step page (Investment Focus → Upload Deal → Invite Team) |
| [`apps/web/onboarding-flow.js`](../../apps/web/onboarding-flow.js) + `onboarding-tasks.js` | Standalone-flow logic |
| [`apps/web/js/onboarding/onboarding-config.js`](../../apps/web/js/onboarding/) | All step text, links, settings |
| `onboarding-welcome.js` | Welcome modal |
| `onboarding-checklist.js` | Persistent sidebar widget. `resolveStepHrefs()` resolves `null` hrefs to most recent deal page |
| `onboarding-empty.js` | Per-resource empty states |
| `onboarding-feedback.js` | Feedback button + BETA badge |
| `onboarding-api.js` | API client (cached 30s in-memory) |

## Backend

[`routes/onboarding.ts`](../../apps/api/src/routes/onboarding.ts):

- `GET /status` — auto-backfills, returns checklist
- `PATCH /step` — manual completion
- `PATCH /welcome-shown` — flips welcome modal flag
- `POST /enrich-firm` — runs Firm Research Agent
- `GET /research-status` — Phase-2 deep research polling

DB schema: `User.onboardingStatus` JSONB column.

## Auto-completion hooks

Both backend and frontend fire step completions:

- Backend: `documents-upload.ts` (uploadDocument), `invitations.ts` (inviteTeamMember)
- Frontend: `crm.js` (createDeal), `financials.js` (reviewExtraction), `deal-chat.js` (tryDealChat)

Backend backfill in `/status` catches anything they miss.

## Firm Research integration

Step 1 triggers `runFirmResearch()` on URL blur. See [firm-research.md](./firm-research.md) for the full agent. Result is shown as a preview card; user clicks "Use this profile" to confirm.

## Common questions

- **Sample deal.** [`services/sampleDealService.ts`](../../apps/api/src/services/sampleDealService.ts) seeds a demo deal (Luktara) for users who don't have a CIM handy.
- **Welcome modal keeps reappearing.** Check `PATCH /welcome-shown` succeeds — flag lives in `onboardingStatus.welcomeShown`.
- **Step shows incomplete after action.** Cache TTL is 30s; force a refresh by reloading dashboard.

## Related

- [`docs/diagrams/14-onboarding-flow.mmd`](../diagrams/14-onboarding-flow.mmd)
- [`docs/user-flows/signup-and-onboarding.md`](../user-flows/signup-and-onboarding.md)
- [`docs/onboarding-agent-architecture.md`](../onboarding-agent-architecture.md)
- [`docs/testing-guide-onboarding-flow.md`](../testing-guide-onboarding-flow.md)
