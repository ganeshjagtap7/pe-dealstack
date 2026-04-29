# Deal Import

Bulk-import deals from CSV / Excel / pasted text. Up to 500 deals, 5 MB max. ~$0.01–0.02 per import (single GPT-4o call for column mapping).

## Where

- Trigger: "Import Deals" button on `/crm.html` (legacy) or `/deals` route (web-next)
- Frontend: [`apps/web/js/deal-import.js`](../../apps/web/js/deal-import.js) — 4-step modal
- Backend: [`apps/api/src/services/dealImportMapper.ts`](../../apps/api/src/services/dealImportMapper.ts) + [`routes/deal-import.ts`](../../apps/api/src/routes/deal-import.ts)

## 4-step modal

1. **Upload** — CSV / Excel / paste
2. **Map columns** — review GPT-4o column mapping; correct or accept
3. **Preview** — first 10 rows with dupe-detection
4. **Result** — green / amber / red

## Endpoints

- `POST /api/deals/import/analyze` — parses + maps with GPT-4o
- `POST /api/deals/import` — 5-phase batch insert

## 5-phase batch insert

1. Pre-fetch existing deal names (paginated for >1000)
2. Pre-fetch companies; lowercase Map dedupe
3. Validate in-memory
4. Batch-create missing companies (groups of 50)
5. Batch-insert deals (groups of 50; per-row fallback on batch error)

## Deterministic overrides

After GPT-4o mapping, regex patterns force-correct:

- ARR / MRR / Sales / Revenue → `revenue`
- EV / Enterprise Value → `dealSize`
- MOIC / MoM / Multiple → `mom`

Don't remove these — they fix common LLM mismaps for SaaS metrics.

## customFields JSONB

Unmapped columns drop into `Deal.customFields` JSONB. Visible in deal detail under "Imported fields".

## Mount order

`/api/deals/import` is mounted **before** `/api/deals` in `app.ts` so the import sub-route isn't swallowed by `:id`. Don't reorder.

## Related

- [`docs/diagrams/16-deal-import-flow.mmd`](../diagrams/16-deal-import-flow.mmd)
- [`docs/user-flows/deal-import.md`](../user-flows/deal-import.md)
- [`docs/DEAL-IMPORT-TEST-GUIDE.md`](../DEAL-IMPORT-TEST-GUIDE.md)
