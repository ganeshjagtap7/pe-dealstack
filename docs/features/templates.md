# Templates

Org-shared memo templates. Define your firm's standard IC memo skeleton once; every memo starts from it.

## Where

- Frontend: [`apps/web/templates.html`](../../apps/web/templates.html) + `templates.js` + `js/templates-api.js` + `js/templates-editor.js` + `js/templates-sections.js`
- Web-next: `apps/web-next/src/app/(app)/templates/`
- Backend: [`routes/templates.ts`](../../apps/api/src/routes/templates.ts) + [`routes/templates-sections.ts`](../../apps/api/src/routes/templates-sections.ts)

## Schema

`MemoTemplate`:

| Field | Notes |
| --- | --- |
| `name` | "Standard IC Memo", "Quick Screen", etc. |
| `type` | `IC_MEMO` / `TEASER` / `SUMMARY` |
| `sections` | JSONB — array of `{ type, title, prompt? }` |
| `organizationId` | Org-shared |

## How it's used

When a user creates a Memo from this template, the API copies `sections` into `MemoSection` rows. The user can then generate / edit each.

## Built-in section types (12)

Executive Summary, Investment Thesis, Market Analysis, Company Overview, Financial Performance, Operational Review, Management & Team, Risk Factors, Valuation, Deal Structure, Returns Analysis, Recommendation.

## Related

- [Memo Builder](./memo-builder.md)
