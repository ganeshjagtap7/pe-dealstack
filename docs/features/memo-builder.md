# Memo Builder

Compose Investment Committee memos with AI-generated sections grounded in the deal's actual financials and documents. Templates are org-shared so partners standardise.

## Where

- Legacy: [`apps/web/memo-builder.html`](../../apps/web/memo-builder.html) + 5 supporting JS modules
- Web-next: `apps/web-next/src/app/(app)/memo-builder/`
- Templates: [`apps/web/templates.html`](../../apps/web/templates.html) + `templates.js`

## Section types (12)

Each prompted with section-specific context. Common types: Executive Summary, Investment Thesis, Market Analysis, Company Overview, Financial Performance, Operational Review, Management & Team, Risk Factors, Valuation, Deal Structure, Returns Analysis, Recommendation.

## How to use

1. Open Memo Builder from the deal-detail header → "Generate Memo".
2. Pick a template (org-shared `MemoTemplate`).
3. Memo + section skeleton are created.
4. For each section: click "Generate" — agent assembles context (deal, financial statements, recent docs) and runs a section-specific prompt.
5. Edit the generated text inline; manual edits flip `aiGenerated = false`.
6. Use Memo Chat to ask follow-up questions or request revisions.
7. Set status to `REVIEW` → `FINAL` → `ARCHIVED`.

## Memo Agent internals

- [`agents/memoAgent/index.ts`](../../apps/api/src/services/agents/memoAgent/index.ts) — entry
- [`agents/memoAgent/pipeline.ts`](../../apps/api/src/services/agents/memoAgent/pipeline.ts) — section-by-section orchestration
- [`agents/memoAgent/context.ts`](../../apps/api/src/services/agents/memoAgent/context.ts) — pulls deal data, active financials, recent documents
- [`agents/memoAgent/prompts.ts`](../../apps/api/src/services/agents/memoAgent/prompts.ts) — one prompt per section type
- [`agents/memoAgent/tools.ts`](../../apps/api/src/services/agents/memoAgent/tools.ts) — section-specific helpers

## API

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /api/memos` | List + create |
| `GET/PATCH /api/memos/:id` | Read + update memo |
| `POST /api/memos/:id/sections/:id/generate` | Run agent for a section (AI-rate-limited) |
| `POST /api/memos/:id/chat` | Memo-scoped chat (AI-rate-limited) |

## Templates

Org-shared via `MemoTemplate.organizationId`. Sections stored as JSONB. Edit in Templates page.

`MemoSection` schema:

| Field | Notes |
| --- | --- |
| `type` | One of 12 section types |
| `content` | Markdown |
| `aiGenerated` | true if AI-authored, flips false on manual edit |
| `sortOrder` | Position |

## Status flow

`DRAFT → REVIEW → FINAL → ARCHIVED`. Status changes log `Activity` rows.

## Common gotchas

- **Context-blind generation.** If financial statements aren't extracted yet, "Financial Performance" will say so and prompt the user — it shouldn't fabricate numbers. If it does, file an issue.
- **Rate-limit 429 on rapid regenerate.** AI bucket is 10/min/user. Debounce.
- **Sections out of order.** `sortOrder` is the source of truth. The frontend honours it.

## Related

- [`docs/diagrams/04-memo-builder-flow.mmd`](../diagrams/04-memo-builder-flow.mmd)
- [`docs/user-flows/memo-builder.md`](../user-flows/memo-builder.md)
- [Templates](./templates.md)
