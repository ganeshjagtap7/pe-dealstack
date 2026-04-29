# Deal Chat

Conversational deal Q&A. ReAct agent with 14 closure-bound tools. The chat panel is the primary AI surface for analysts.

## What you can ask

- **Calculations** — "What's the EBITDA CAGR from 2021 to 2023?" The agent quotes exact numbers from the verified financials and shows its work.
- **Document Q&A** — "What does the CIM say about pricing power?" Calls `search_documents` for full-text search.
- **Comparisons** — "How does this compare to our portfolio average revenue multiple?" Calls `compare_deals`.
- **Updates** — "Set EBITDA to $12.4M" / "Move this deal to LOI". Agent calls `update_deal_field` / `change_deal_stage`.
- **Triggers** — "Extract the latest financials" / "Draft an outreach email" / "Prep me for tomorrow's call". Agent kicks off the relevant other agent.
- **Navigation** — "Show me the analysis section" → scrolls the page.

## Tool catalog

See full table in [`docs/architecture/ai-agents.md#2--deal-chat-agent`](../architecture/ai-agents.md#2--deal-chat-agent).

Summary:

- 6 read tools — search docs, get financials, compare deals, get activity, get analysis summary, list documents
- 3 write tools — update field, change stage, add note
- 3 trigger tools — financial extraction, meeting prep, draft email
- 2 UI tools — scroll, suggest action

## How to use it well

- Quote the exact metric ("revenue 2022") in your question; the agent grounds in the financial table and won't guess.
- Ask follow-ups — last 10 messages are kept as history.
- If the agent says "data point not in extracted financials," upload the source doc and ask again.
- Stage changes through chat are logged as `Activity` rows; team can see them in the timeline.

## Constraints

- Numeric `update_deal_field` values are always **millions USD**.
- `targetCloseDate` format: `YYYY-MM-DD`.
- Max 10/min AI rate limit. Heavy users will see 429.
- Tool messages emit JSON; the system prompt enforces "always cite source data".

## Where

| File | Purpose |
| --- | --- |
| Agent | [`services/agents/dealChatAgent/index.ts`](../../apps/api/src/services/agents/dealChatAgent/index.ts) |
| Tools | [`services/agents/dealChatAgent/tools.ts`](../../apps/api/src/services/agents/dealChatAgent/tools.ts) |
| Route | [`routes/deals-chat-ai.ts`](../../apps/api/src/routes/deals-chat-ai.ts) |
| Frontend (legacy) | [`apps/web/js/deal-chat.js`](../../apps/web/js/deal-chat.js) + `deal-chat-attachments.js` + `deal-chat-resize.js` + `deal-chat-responses.js` |
| Frontend (web-next) | `apps/web-next/src/app/(app)/deals/[dealId]/` |

## Common pitfalls

- **Hallucinated number.** The Financial Data Protocol forbids it. If it happens, file an issue with the prompt + response so we can tighten the system prompt.
- **Tool output not applied to UI.** Frontend looks at `updates`, `action`, `sideEffects` arrays in the response. Optimistic UI applies them locally. If the deal page didn't refresh, hard-reload.
- **Cross-org dealId.** Tools are closure-bound; the LLM cannot pass an arbitrary deal id. If you add a tool, follow the same pattern.

## Related

- [`docs/diagrams/19-deal-chat-react-agent.mmd`](../diagrams/19-deal-chat-react-agent.mmd)
- [`docs/user-flows/deal-chat.md`](../user-flows/deal-chat.md)
