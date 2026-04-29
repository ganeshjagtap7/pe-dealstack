# Deal Intake

Manual deal creation form. The simplest path to add a deal — no documents required.

## Where

- Legacy: [`apps/web/deal-intake.html`](../../apps/web/deal-intake.html) + `js/deal-intake.js`, `js/deal-intake-modal.js`, `js/deal-intake-actions.js`, `js/deal-intake-template.js`
- Web-next: `apps/web-next/src/app/(app)/deal-intake/`

## Fields

- Deal name, Company (existing or new), Industry, Source
- Stage (defaults to `INITIAL_REVIEW`), Priority, Status
- Deal Size, Revenue, EBITDA, Gross Margin (millions USD)
- IRR projection, MoM, Target Close Date
- Lead Partner, Analyst, Description

Unrecognised fields can be set later from chat (`update_deal_field`) or imported from CSV.

## Backend

`POST /api/deals` in [`routes/deals.ts`](../../apps/api/src/routes/deals.ts). Auto-creates a `Company` if `companyName` doesn't match an existing row (case-insensitive lookup).

## Compared to Deal Import

| | Deal Intake | Deal Import |
| --- | --- | --- |
| Source | Manual form | CSV / Excel / paste |
| Volume | One at a time | Up to 500 |
| AI assist | Optional fields | GPT-4o column mapping |
| Best for | Single new deal | Migrating from Affinity / Excel tracker |

## Related

- [Deal Pipeline](./deal-pipeline.md)
- [Deal Import](./deal-import.md)
