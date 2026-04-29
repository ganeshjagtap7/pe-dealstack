# Financial Extraction

Turn a CIM (PDF / Excel / scan) into structured `FinancialStatement` rows. Implemented as a 6-node LangGraph state machine that auto-corrects scale errors, transposed digits, and wrong row mappings before storing.

## What gets extracted

For each statement and each period:

- **INCOME_STATEMENT** — Revenue, COGS, Gross Profit, Operating Expenses, EBITDA, Depreciation, EBIT, Interest, Taxes, Net Income
- **BALANCE_SHEET** — Current/Total Assets, Cash, AR, Inventory, PPE, Current/Total Liabilities, Equity
- **CASH_FLOW** — Operating, Investing, Financing, Net change in Cash, Free Cash Flow

All values stored in **millions USD**. Variant statement names (`P_AND_L`, `CASH_FLOW_STATEMENT`, `STATEMENT_OF_OPERATIONS`) are normalised by [`financialClassifier.ts`](../../apps/api/src/services/financialClassifier.ts).

## How

1. **Upload** a doc via VDR or onboarding dropzone.
2. Backend stores the file and creates the `Document` row.
3. Click "Extract Financials" on the Financials tab → `POST /api/financials/extract`.
4. Agent runs through `extract → verify → cross_verify → validate → self_correct → store`.
5. Statements appear in the Financials tab; Agent Log shows each step's output.

Extraction can also be triggered from the Deal Chat agent via the `trigger_financial_extraction` tool, or automatically on first ingest if the document looks financial.

## The 6 nodes

See [`docs/architecture/ai-agents.md#1--financial-agent`](../architecture/ai-agents.md#1--financial-agent) for the full breakdown.

## Three extraction sources

| Source | When used | Cost |
| --- | --- | --- |
| `azure` | If `AZURE_DI_KEY` configured. Best for complex CIM tables. | ~$0.01 / page |
| `gpt4o` | Default for text-rich PDFs. `pdf-parse` text → GPT-4o classifier. | ~$0.03 / doc |
| `vision` | Scanned/image-only PDFs. GPT-4o Vision over page images. | ~$0.10 / doc |
| `manual` | Set when a user edits a value in the UI. | — |

DB CHECK constraint enforces only these four values for `extractionSource`. Don't use compound values.

## Multi-document merge

When two documents both produce a statement for the same period, the DB enforces `UNIQUE (dealId, statementType, period, documentId)`. A partial unique index `WHERE isActive = true` ensures only one **active** row per `(dealId, statementType, period)`.

If a new extraction conflicts:

- `mergeStatus = needs_review` is set
- Conflict appears at `GET /api/financials/conflicts`
- User resolves via the merge modal or `POST /api/financials/resolve(-all)`

See [financial-merge.md](./financial-merge.md).

## Confidence scoring

Each statement has `extractionConfidence` (0–1). Low-confidence rows surface a UI badge so the user knows to verify.

## Costs

- Verify pass: ~$0.003/run (GPT-4o-mini)
- Self-correct: only fires on validate failure, targets only failing statements/periods

## Related

- [`docs/diagrams/11-financial-extraction-pipeline.mmd`](../diagrams/11-financial-extraction-pipeline.mmd)
- [`docs/user-flows/financial-extraction.md`](../user-flows/financial-extraction.md)
- [`docs/architecture/ai-agents.md#1--financial-agent`](../architecture/ai-agents.md#1--financial-agent)
- [`docs/FINANCIAL_ANALYSIS_AGENT.md`](../FINANCIAL_ANALYSIS_AGENT.md)
- [`docs/superpowers/plans/2026-04-26-financial-extraction-accuracy.md`](../superpowers/plans/2026-04-26-financial-extraction-accuracy.md)
