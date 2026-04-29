# Dashboard

Landing page after login. Shows pipeline KPIs, recent activity, tasks, and AI signals.

## Where

- Legacy: [`apps/web/dashboard.html`](../../apps/web/dashboard.html) + `dashboard.js` + `dashboard-search.js` + `dashboard-tasks.js` + `dashboard-widgets.js`
- Web-next: `apps/web-next/src/app/(app)/dashboard/`

## Widgets

- Pipeline summary — counts per stage, total pipeline value
- KPI cards — active deals, deals closed YTD, average deal size
- Recent activity — latest `Activity` rows across all deals
- Tasks — assigned to the current user, sorted by due date
- AI Signals — runs Signal Monitor (Scan Signals button)
- Onboarding checklist — until all 5 steps done
- Welcome modal — first load only

## Backends fed in

- `GET /api/deals/stats/summary`
- `GET /api/activities` (recent)
- `GET /api/tasks`
- `GET /api/onboarding/status`
- `POST /api/ai/scan-signals` (on demand)

## Search

[`dashboard-search.js`](../../apps/web/dashboard-search.js) implements global Cmd+K search via [`js/commandPalette.js`](../../apps/web/js/commandPalette.js). Searches deals, contacts, documents, memos.

## Related

- [Onboarding](./onboarding.md)
- [Tasks](./tasks.md)
- [Notifications](./notifications.md)
