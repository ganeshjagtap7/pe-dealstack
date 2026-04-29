# Deal Detail Page

Single-deal cockpit. Everything you need to evaluate one company.

## Where

- Legacy: [`apps/web/deal.html`](../../apps/web/deal.html) + `deal.js` + a constellation of supporting modules (`deal-activity.js`, `deal-chat.js`, `deal-documents.js`, `deal-edit.js`, `deal-stages.js`, `deal-team.js`, etc.)
- Web-next: `apps/web-next/src/app/(app)/deals/[dealId]/`

## Layout

- **Header** — deal name (editable), stage, priority, lead partner, last activity timestamp, "Add document" + "Open VDR" + "Generate Memo" buttons.
- **Tabs**:
  - Overview — summary metrics + recent activity
  - Documents — flat doc list with upload (also opens VDR)
  - Financials — extracted statements + Agent Log + analysis
  - Analysis — PE engine output (QoE, ratios, red flags)
  - Activity — full timeline
- **Right rail (resizable)** — Deal Chat (ReAct agent with 14 tools)

## Tabs in detail

**Documents tab.** Cross-references `Document` rows for this deal. Upload triggers ingest pipeline (see [deal-ingest.md](../user-flows/deal-ingest.md)).

**Financials tab.** Pulls active `FinancialStatement` rows. Charts respect `filterConsistentPeriods()` to avoid mixing annual totals with quarterly data. The Agent Log sub-tab streams `agent.steps[]` from the Financial Agent for transparency.

**Analysis tab.** Runs the PE Analysis Suite — see [financial-analysis.md](./financial-analysis.md).

**Activity tab.** Reads `Activity` rows (notes, calls, meetings, stage changes, document uploads).

## Deal Chat (right rail)

ReAct agent. Resizable. See [deal-chat.md](./deal-chat.md). Bound to current `(dealId, orgId)`.

Side effects from the agent (`scroll_to_section`, `extraction_triggered`) drive the main pane — chat is a control surface as well as a Q&A surface.

## Key files

| File | Purpose |
| --- | --- |
| [`apps/web/deal.html`](../../apps/web/deal.html) | Page shell |
| [`apps/web/deal.js`](../../apps/web/deal.js) | Orchestrator |
| [`apps/web/js/financials.js`](../../apps/web/js/financials.js) + helpers | Financial UI + charts |
| [`apps/web/js/analysis.js`](../../apps/web/js/analysis.js) + 4 modules | Analysis UI |
| [`apps/web/js/deal-chat.js`](../../apps/web/js/deal-chat.js) + 3 helpers | Chat UI |
| [`apps/api/src/routes/deals.ts`](../../apps/api/src/routes/deals.ts) | CRUD + summary |
| [`apps/api/src/routes/deals-chat-ai.ts`](../../apps/api/src/routes/deals-chat-ai.ts) | Chat agent invocation |
| [`apps/api/src/routes/deals-team.ts`](../../apps/api/src/routes/deals-team.ts) | Team mgmt |
| [`apps/api/src/routes/deals-analysis.ts`](../../apps/api/src/routes/deals-analysis.ts) | PE analysis endpoints |

## Common gotchas

- **Mixing period scales in charts.** Use `filterConsistentPeriods()`.
- **Tab content disappears.** `analysis.js` calls renderers from `analysis-modules.js` / `analysis-charts.js`; if a renderer is missing, the section silently fails. Load order in `deal.html` matters: analysis-styles → valuation → modules → charts → analysis.
- **Sticky table columns transparent.** Solid hex backgrounds via `style`, not Tailwind classes.

## Related

- [Deal Chat](./deal-chat.md)
- [Financial Extraction](./financial-extraction.md)
- [Financial Analysis](./financial-analysis.md)
