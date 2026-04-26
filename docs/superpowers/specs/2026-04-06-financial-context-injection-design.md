# Financial Context Injection for Deal Chat

**Date:** 2026-04-06
**Problem:** The deal chat agent doesn't have financial table data in its prompt, causing it to fail math questions about line items visible on the deal page.

## Solution

Fetch all `FinancialStatement` records for the deal in `deals-chat-ai.ts` and inject the full extracted data as a structured JSON block in the system prompt, alongside the existing deal context.

## Changes (2 files)

### 1. `apps/api/src/routes/deals-chat-ai.ts`

- After fetching deal info/team, query `FinancialStatement` table for all statements where `dealId = :dealId`
- Format into a structured string grouped by statement type and period:

```
=== FINANCIAL DATA (from extracted statements) ===
INCOME_STATEMENT:
  2022: { "Revenue": 257.9, "COGS": 142.1, "EBITDA": 45.3, ... }
  2023: { "Revenue": 310.5, "COGS": 168.2, "EBITDA": 58.7, ... }
BALANCE_SHEET:
  2022: { "Total Assets": 890.2, "Total Debt": 340.0, ... }
  ...
CASH_FLOW:
  ...
All values in millions USD.
```

- Append this to the `dealContext` string passed to the agent

### 2. `apps/api/src/services/agents/dealChatAgent/index.ts`

- Update system prompt to inform the agent that financial data is pre-loaded:
  > "The deal's full financial statement data is included below. Use this data directly for calculations and analysis. Only use the get_deal_financials tool if you need to refresh or verify data."

## What stays the same

- `get_deal_financials` tool remains as fallback/refresh
- Frontend unchanged (no changes to deal.html, deal.js, or deal-chat.js)
- Chat history handling unchanged
- All other tools unchanged

## Edge cases

- **No financial data:** Inject "No financial statements extracted yet." — agent guides user to upload docs
- **Large datasets:** 3 types × 10 periods × 50 line items ≈ ~3K tokens — well within GPT-4o capacity
- **Stale data:** Next chat message picks up fresh data (fetched per-request)

## Design decisions

- **Inject in route, not agent:** Keeps all context-building in one place (`deals-chat-ai.ts`)
- **Keep tool:** No harm as fallback; system prompt tells agent data is already available
- **Full line items, not summaries:** User needs exact numbers for math/calculations
