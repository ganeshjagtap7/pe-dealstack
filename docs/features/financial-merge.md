# Multi-Document Financial Merge

What happens when two documents both produce a `FinancialStatement` for the same `(dealId, statementType, period)`.

## DB constraints

- `UNIQUE (dealId, statementType, period, documentId)` — one row per source per period.
- Partial unique index `WHERE isActive = true` — only one **active** row per `(dealId, statementType, period)`.

The DB physically prevents duplicates among active rows. Application bugs can't create them.

## Merge statuses

`mergeStatus` ∈ `{auto, needs_review, user_resolved}`.

- **auto** — no conflict; the new row was made active automatically.
- **needs_review** — conflict detected; new row stored as inactive, surfaces in Conflicts queue.
- **user_resolved** — a human picked the active row.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/financials/conflicts` | List conflicts for a deal |
| `POST /api/financials/resolve` | Pick active row for one conflict |
| `POST /api/financials/resolve-all` | Bulk-resolve with a strategy (newest, highest-confidence, manual) |

## Frontend

[`apps/web/js/financials-merge.js`](../../apps/web/js/financials-merge.js) renders the merge modal. Side-by-side compare of source values per line item; click to set active.

## Common scenarios

- **CIM vs Audited.** Audited usually wins. Set `extractionConfidence` higher in the agent or pick manually.
- **Revised CIM.** Newer doc; usually pick newer.
- **Both wrong.** Edit a line item — flips that field's `extractionSource` to `manual`.

## Related

- [Financial Extraction](./financial-extraction.md)
- [`docs/architecture/data-model.md#financialstatement`](../architecture/data-model.md#financialstatement)
