# Flow — Contacts CRM

Track every banker, advisor, executive, LP, and lawyer. Bulk import via CSV. Score relationships. Surface stale contacts.

## Components

| Layer | File |
| --- | --- |
| Legacy frontend | [`apps/web/contacts.html`](../../apps/web/contacts.html) (single-file with inline JS for primary contacts UI) + supporting `contacts.js`, `contacts-render.js`, `contacts-detail.js`, `contacts-modals.js`, `contacts-csv.js` |
| Web-next | `apps/web-next/src/app/(app)/contacts/` |
| Backend | [`contacts.ts`](../../apps/api/src/routes/contacts.ts), [`contacts-insights.ts`](../../apps/api/src/routes/contacts-insights.ts), [`contacts-connections.ts`](../../apps/api/src/routes/contacts-connections.ts) |
| Schema | `Contact`, `ContactInteraction`, `ContactDeal` — see [data-model.md](../architecture/data-model.md#contact--contactinteraction--contactdeal) |

## Features

- Sort dropdown — 6 options (name, last interaction, deals, score, type, recency)
- Pagination — Load More + "Showing X of Y"
- Grid / list view toggle
- Group by company
- "More" dropdown — Group by Company / Export CSV / Import CSV
- Card badge — relationship score 0–100 (Cold ≤25 blue, Warm ≤50 amber, Active ≤75 emerald, Strong >75 green)
- CSV import — 3-step modal: upload → preview → result
- CSV export — `GET /api/contacts/export`
- Insights — duplicates, stale contacts, network graph

## CSV import

[`contacts-csv.js`](../../apps/web/contacts-csv.js) handles 20+ header name variations, quoted fields, full-name splitting, and type validation. Server-side validation enforces type whitelist (`BANKER` / `ADVISOR` / `EXECUTIVE` / `LP` / `LEGAL`).

## Relationship score

Scoring formula in [`contacts-insights.ts`](../../apps/api/src/routes/contacts-insights.ts):

```
score = recency(0–40) + frequency(0–40) + deals(0–20)
```

- **recency** — days since last `ContactInteraction`. Linear decay over ~180 days.
- **frequency** — count of `ContactInteraction` rows in trailing 180 days.
- **deals** — distinct count in `ContactDeal`.

Cached client-side in `contactScores` object; refreshed on page nav.

## Common issues

- **Imported contacts skip rows.** CSV parser is permissive with headers but strict with types. Anything that's not in the type whitelist becomes `OTHER` (or skipped depending on path).
- **Score shows blank.** Insights endpoint failed; likely the parent route was scoped but the insights subroute wasn't. Tell the team — there's a regression test in the org-isolation suite.
- **Duplicates not detected.** Match is case-insensitive on `email` first, then `firstName + lastName + company`. Duplicate detection runs in `contacts-insights.ts`.

## Audit checklist

[`docs/superpowers/specs/2026-04-04-deal-import-design.md`](../superpowers/specs/2026-04-04-deal-import-design.md) shares CSV-import patterns with deals; the same parser logic is used in both. `CONTACTS_AUDIT_TODO.md` (root) tracks tier-by-tier feature status.

## Related

- [`docs/features/contacts-crm.md`](../features/contacts-crm.md)
