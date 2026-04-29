# Firm Research Agent

Auto-enrich a PE firm's profile during onboarding (or manually from Settings) so downstream agents can ground answers in the firm's strategy, sectors, check size, and portfolio.

## What it produces

Stored in `Organization.settings.firmProfile` (JSONB):

- Strategy / thesis
- Target sectors
- Check size (typical, range)
- Stage focus (seed / Series A / growth / buyout)
- Geography
- Portfolio (current + recent)
- Founder / partner backgrounds
- Confidence score per field (0–1)
- `deepResearch` — Phase-2 enriched findings

Person profile (founder / partner whose LinkedIn was provided) stored in `User.onboardingStatus.personProfile`.

## How to trigger

| Trigger | UI |
| --- | --- |
| Onboarding step 1 | Type firm website → blur → enrichment fires |
| Settings → Firm Profile → Refresh | Re-runs both phases |

Both call `POST /api/onboarding/enrich-firm`.

## Two-phase architecture

**Phase 1 (≤ 60s, sync).** 6-node LangGraph: scrape → search_firm → search_person → synthesize → verify → save. The user waits for this.

**Phase 2 (60–120s, async).** GPT-4o derives 8–12 follow-up queries based on Phase-1 output, recurses on top results, merges into `firmProfile.deepResearch`. The user has already moved on; a slide-in notification on the dashboard tells them when it's ready.

## Web search

[`services/webSearch.ts`](../../apps/api/src/services/webSearch.ts) — Apify Google Search primary, DuckDuckGo Lite fallback. Set `APIFY_API_TOKEN` for primary; falls back gracefully if missing.

LinkedIn scraping via `scrapeLinkedInProfile()` for direct profile data — covers country subdomains.

## Guardrails

- Rate limit: 3 / hour / org
- Concurrent lock: one run per org at a time
- Phase 1 hard timeout: 60s
- Phase 2 hard timeout: 120s
- SSRF prevention in [`utils/urlHelpers.ts`](../../apps/api/src/utils/urlHelpers.ts)
- No PII surfaced from LinkedIn scrapes
- Per-field confidence so low-quality data is flagged instead of trusted

## Consumers

- **Deal Chat.** [`deals-chat-ai.ts`](../../apps/api/src/routes/deals-chat-ai.ts) injects firm strategy, sectors, check size, portfolio into the system prompt.
- **Memo Agent.** [`agents/memoAgent/context.ts`](../../apps/api/src/services/agents/memoAgent/context.ts) pulls firm thesis into the IC memo.
- **Onboarding completion.** Showed as "AI findings" card.

## Common issues

- **Enrichment never returns.** Check `APIFY_API_TOKEN`; the DDG fallback works but is rate-limited. Phase 1 hard times out at 60s and reports degraded confidence.
- **Phase 2 doesn't appear.** Frontend polls `GET /api/onboarding/research-status`. Make sure dashboard is mounted and polling.
- **Wrong portfolio company list.** Confidence on `portfolio` is usually < 0.6 — don't trust silently. The UI surfaces low-confidence fields with a badge.

## Related

- [`docs/diagrams/15-firm-research-agent.mmd`](../diagrams/15-firm-research-agent.mmd)
- [`docs/architecture/ai-agents.md#4--firm-research-agent`](../architecture/ai-agents.md#4--firm-research-agent)
- [`docs/firm-research-agent-documentation.md`](../firm-research-agent-documentation.md)
- [`docs/testing-guide-firm-research-agent.md`](../testing-guide-firm-research-agent.md)
