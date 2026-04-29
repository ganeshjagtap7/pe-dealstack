# Signal Monitor

Portfolio-wide AI scan that surfaces signals (good and bad) across all active deals.

## Trigger

- Dashboard "Scan Signals" widget
- API: `POST /api/ai/scan-signals`

## Architecture

3-node graph: `fetchPortfolio → analyzeSignals → routeSignals`.

[`agents/signalMonitor/index.ts`](../../apps/api/src/services/agents/signalMonitor/index.ts).

## Signal types (8)

Examples:

- **stale_deal** — no activity for X days
- **missing_financials** — deal in DD without `FinancialStatement` rows
- **declining_revenue** — extracted financials show >20% YoY drop
- **high_concentration** — top customer > 30% of revenue
- **debt_burden** — net debt / EBITDA > 5x
- **stage_stuck** — deal in same stage for >90 days
- **document_aging** — last document upload > 60 days
- **incoming_close_date** — `targetCloseDate` < 14 days

## Severity routing

- **critical** — fires `Notification` to deal team
- **warning** — surfaces on dashboard widget
- **info** — silent, available in audit log

## Tuning

Thresholds live in `analyzeSignals`. Adjust per firm if you have stricter underwriting standards.

## Related

- [`docs/architecture/ai-agents.md#7--signal-monitor`](../architecture/ai-agents.md#7--signal-monitor)
