# Financial Analysis (PE Engine)

Once a deal has `FinancialStatement` rows, the PE Analysis Suite computes 13+ analysis modules used by deal teams to underwrite. Lives in [`apps/api/src/services/analysis/`](../../apps/api/src/services/analysis/).

## Modules

| Module | File | Output |
| --- | --- | --- |
| QoE Score | [`qoeAnalysis.ts`](../../apps/api/src/services/analysis/qoeAnalysis.ts) | 0–100 quality of earnings score |
| Financial Ratios | [`ratioAnalysis.ts`](../../apps/api/src/services/analysis/ratioAnalysis.ts) | Profitability, leverage, liquidity, efficiency |
| Operational Analysis | [`operationalAnalysis.ts`](../../apps/api/src/services/analysis/operationalAnalysis.ts) | Working capital, cost structure, revenue quality |
| Debt & LBO | [`debtAndLBO.ts`](../../apps/api/src/services/analysis/debtAndLBO.ts) | Debt capacity, LBO screen, cash flow coverage |
| Red Flags | [`redFlags.ts`](../../apps/api/src/services/analysis/redFlags.ts) | EBITDA bridges, cash-flow inconsistencies |

Helpers and types live in [`helpers.ts`](../../apps/api/src/services/analysis/helpers.ts) and [`types.ts`](../../apps/api/src/services/analysis/types.ts). Module surfacing is coordinated from [`index.ts`](../../apps/api/src/services/analysis/index.ts).

## Frontend

[`apps/web/js/analysis.js`](../../apps/web/js/analysis.js) renders 13+ sections below the Financial Statements section on the deal page. Sub-modules:

- `analysis-styles.js` — constants (Banker Blue, severity styles, tabs, chart palette) + CSS injection
- `analysis-valuation.js` — `renderLBOScreen`, `renderCrossDoc`, `renderBenchmark`
- `analysis-modules.js` — `renderRatioDashboard`, `renderRatioRow`, `renderDuPont`, `renderRedFlags`, `renderEBITDABridge`, `renderRevenueQuality`, `renderCashFlowAnalysis`, `renderWorkingCapital`, `renderCostStructure`, `renderDebtCapacity`, `switchRatioTab`
- `analysis-charts.js` — `renderRatioCharts`, `renderSingleRatioChart` (Chart.js)

**Load order in `deal.html`:** styles → valuation → modules → charts → analysis. Out-of-order = silent failure (the catch block hides missing renderers).

## API

`/api/deals/:id/analysis/*` routes in [`deals-analysis.ts`](../../apps/api/src/routes/deals-analysis.ts) expose individual modules. The dashboard layout fans out N parallel calls and renders as each resolves.

## Caching

Narrative insights are cached in `NarrativeInsightCache` keyed by `(dealId, analysisHash)`. Hash includes the underlying financial values, so cache invalidates when statements change.

## QoE score

The QoE module produces a score badge that's the headline metric on the analysis dashboard. Inputs include EBITDA quality, cash conversion, revenue concentration, working capital trends, debt burden.

## Red flags

Two main checks:

- **EBITDA bridge** — does reported EBITDA reconcile with adjusted EBITDA via add-backs and one-off items?
- **Cash-flow inconsistency** — Net Income + non-cash items + working-capital change should equal Operating Cash Flow. Material discrepancies → flag.

## Related

- [`docs/diagrams/12-ai-agents-architecture.mmd`](../diagrams/12-ai-agents-architecture.mmd)
- [Financial Extraction](./financial-extraction.md)
- [Memo Builder](./memo-builder.md) — uses analysis output for IC memo sections
