# Deal Pipeline

Visual Kanban of every deal in your firm, organised by stage. The default landing surface for analysts.

## Where

- Legacy: [`apps/web/crm.html`](../../apps/web/crm.html) + `crm.js` + `crm-cards.js` + `crm-filters.js` + `crm-actions.js`
- Web-next: `apps/web-next/src/app/(app)/deals/`

## Stages

```
INITIAL_REVIEW → DUE_DILIGENCE → IOI_SUBMITTED → LOI_NEGOTIATION → CLOSING → CLOSED_WON
```

Plus terminals: `CLOSED_LOST`, `PASSED`. Stage transitions are written via `update_deal_field` (chat) or `change_deal_stage` (chat / API), and logged as `Activity` rows.

## What you can do

- **Drag-drop** between columns (writes `stage`).
- **Filter** by industry, deal size, priority, stage, lead partner, status.
- **Search** the deal name field across the org.
- **Group** by company.
- **Quick actions** on a card: open detail, reassign, set priority, close, pass.
- **Import** CSV / Excel via the "Import Deals" button — see [deal-import.md](./deal-import.md).
- **Create** a new deal manually.
- **Filters by AI** — show deals with red flags, missing financials, stale activity.

## Cards show

- Deal name + company logo
- Industry + deal size
- Stage + priority badge
- Lead partner avatar
- Last activity timestamp
- Compact financial summary (revenue, EBITDA in millions USD)

## Stats summary

`GET /api/deals/stats/summary` returns counts per stage, total pipeline value, average deal size, and stage conversion rates.

## Backend

| File | Purpose |
| --- | --- |
| [`routes/deals.ts`](../../apps/api/src/routes/deals.ts) | CRUD + stats |
| [`routes/deals-team.ts`](../../apps/api/src/routes/deals-team.ts) | Per-deal team membership |
| [`routes/activities.ts`](../../apps/api/src/routes/activities.ts) | Stage-change logging |

All queries are org-scoped (`.eq('organizationId', orgId)`).

## Common questions

- **Why doesn't drag-drop persist?** The optimistic UI applies the move; if the API call fails, you'll see a toast and the card snaps back. Check rate limits.
- **A deal vanished after import.** Likely created without `companyId`. The deal is still in `Deal` rows but the card needs a Company. Look in admin tools or fix via SQL.
- **The pipeline looks empty for a new user.** Onboarding step 2 hasn't been completed yet. Drop a CIM into onboarding to seed.

## Related

- [`docs/diagrams/02-deal-lifecycle.mmd`](../diagrams/02-deal-lifecycle.mmd)
- [Deal Detail page](./deal-detail.md)
