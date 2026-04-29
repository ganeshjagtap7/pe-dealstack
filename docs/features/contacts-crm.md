# Contacts CRM

Track every banker, advisor, executive, LP, and lawyer involved in your deal flow.

## Where

- Legacy: [`apps/web/contacts.html`](../../apps/web/contacts.html) + `contacts.js` + helpers
- Web-next: `apps/web-next/src/app/(app)/contacts/`

## Schema

`Contact`, `ContactInteraction`, `ContactDeal`. Type ∈ `{BANKER, ADVISOR, EXECUTIVE, LP, LEGAL}`.

## Features

- Sort dropdown — 6 options
- Pagination (Load More)
- Grid / list view
- Group by company
- "More" dropdown — Group / Export CSV / Import CSV
- Card badge — relationship score 0-100 (Cold ≤ 25 / Warm ≤ 50 / Active ≤ 75 / Strong > 75)

## Relationship score

```
score = recency(0-40) + frequency(0-40) + deals(0-20)
```

Computed in [`routes/contacts-insights.ts`](../../apps/api/src/routes/contacts-insights.ts), cached client-side.

## CSV import

3-step modal (upload → preview → result). Parser handles 20+ header variations, quoted fields, full-name splitting, type validation.

## Insights

- Duplicates — by email then by full name + company
- Stale — no interaction in N days
- Network — connections graph from `ContactDeal`

## Related

- [`docs/user-flows/contacts-crm.md`](../user-flows/contacts-crm.md)
- [Contact Enrichment](./contact-enrichment.md)
