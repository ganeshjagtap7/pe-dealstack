# Deep Research Agent — Design Spec

**Date:** 2026-04-19
**Status:** Approved
**Scope:** Upgrade the firm research agent from shallow fixed queries to a two-phase intelligent research system that follows leads, generates its own search queries, and builds a comprehensive firm + person profile in the background.

---

## Problem

The firm research agent runs 5 hardcoded DuckDuckGo queries and stops. It finds surface-level info ("Pocket Fund is a Micro PE firm") but misses depth — deal history, press coverage, podcast interviews, social presence, community mentions, co-investors. A real analyst would read what they found, notice keywords, and search deeper. The agent doesn't.

## Solution

Split the agent into two phases:

- **Phase 1 (Quick Scan, 15s):** Current behavior. Returns a preview to the user immediately so they can review and approve it.
- **Phase 2 (Deep Research, 60-120s):** Runs in the background after Phase 1 returns. GPT-4o reads Phase 1 results and generates 8-12 targeted follow-up queries. Executes them, follows threads, scrapes high-value URLs. Merges everything into an enriched profile. Notifies the user when done.

---

## Architecture

### Phase 1 — Quick Scan (unchanged)

Same as current `firmResearchAgent`. 6-node LangGraph graph:
`scrape → searchFirm → searchPerson → synthesize → verify → save`

Returns `FirmResearchResult` to the frontend in ~15s. User sees the preview card with "Use this profile" button.

**One change:** The endpoint now also fires Phase 2 in the background after returning the Phase 1 response.

### Phase 2 — Deep Research (new)

A new async function `runDeepResearch()` that:

1. **Query Generation:** Sends Phase 1 profile to GPT-4o with a prompt: "You are a PE research analyst. Based on this initial profile, generate 8-12 targeted DuckDuckGo search queries to find deeper information." GPT returns structured queries in 6 categories.

2. **Query Execution:** Runs each query via `searchWeb()`. For each batch of results, checks if any result mentions a new name/company worth investigating. If so, spawns up to 1 follow-up query per discovery (max 6 follow-ups).

3. **URL Scraping:** For up to 3 high-value URLs found in search results (articles, Crunchbase pages, about pages), scrapes the full page content.

4. **Final Synthesis:** GPT-4o merges Phase 1 profile + all Phase 2 discoveries into an enriched profile. Only adds/enriches — never overwrites Phase 1 data.

5. **Save:** Updates `Organization.settings.firmProfile` with enriched data. Sets `deepResearchComplete: true`.

6. **Notify:** Sets a flag that the frontend polls for.

### File Structure

```
apps/api/src/services/agents/firmResearchAgent/
  index.ts              — add runDeepResearch() export
  deepResearch.ts       — Phase 2 logic (query gen + execution + synthesis)

apps/api/src/routes/onboarding.ts
  — POST /enrich-firm fires Phase 2 after returning Phase 1
  — GET /research-status returns current phase + status

apps/web/js/onboarding/onboarding-flow.js
  — Poll /research-status after Phase 1 completes
  — Update completion screen when Phase 2 finishes
```

---

## Phase 2: Query Generation

GPT-4o receives the Phase 1 profile and generates queries in these categories:

### Query Categories

| Category | Purpose | Example |
|----------|---------|---------|
| **Person deep-dive** | Find interviews, talks, social profiles | `"devlikesbizness" interview OR podcast`, `"Ganesh Jagtap" "Pocket Fund"` |
| **Deal history** | Find acquisitions, deal sizes, exits | `"Pocket Fund" acquired OR acquisition 2024 2025` |
| **Portfolio deep-dive** | Research each portfolio company | `"{portfolio_co_name}" acquisition details` |
| **Firm reputation** | Press, reviews, rankings | `site:crunchbase.com "Pocket Fund"`, `"Pocket Fund" review` |
| **Social presence** | Twitter, YouTube, newsletters | `site:twitter.com "devlikesbizness"`, `"Pocket Fund" newsletter` |
| **Network** | Co-investors, community, LPs | `"Pocket Fund" investor OR LP`, `"devlikesbizness" community` |

### Query Generation Prompt

```
You are a PE research analyst. I've done an initial scan of a firm and found this:

{Phase 1 FirmProfile JSON}
{Phase 1 PersonProfile JSON}

Generate 8-12 DuckDuckGo search queries to find DEEPER information. Focus on:
1. The person's public presence (interviews, podcasts, talks, social media)
2. Specific deal history (acquisitions, exits, deal sizes)
3. Each portfolio company (what they do, when acquired)
4. Firm reputation (press articles, reviews, rankings)
5. Social presence (Twitter, YouTube, newsletters, blogs)
6. Network (co-investors, community involvement, LPs)

Return as JSON array: [{ "query": "...", "category": "person|deals|portfolio|reputation|social|network", "reason": "why this query" }]

Rules:
- Use exact names and handles found in Phase 1 (don't guess)
- Combine terms for specificity: "name" + "firm" + "topic"
- Use site: operator for specific platforms
- Don't repeat Phase 1 queries
```

### Execution Rules

- Max 12 primary queries
- Each query can spawn max 1 follow-up if it discovers a new name/company worth investigating
- Max 6 follow-ups total
- Total cap: 18 DDG searches in Phase 2
- Scrape up to 3 high-value URLs from results (articles, Crunchbase, about pages)
- Skip URLs that are social media feeds (Twitter timelines, etc.) — just use the search snippets

---

## Phase 2: Follow-the-Thread Logic

After each batch of search results, a lightweight check determines if follow-up is warranted:

```
For each search result batch:
  - Extract any NEW names/companies not in Phase 1 profile
  - If a new name appears 2+ times across results → spawn follow-up query
  - Follow-up query: "{new_name}" "{firm_name}"
  - Max 1 follow-up per batch, max 6 total
```

This is NOT a full GPT call — it's simple keyword extraction (regex for capitalized multi-word phrases not already in the profile). Keeps cost low while still following threads.

---

## Enriched Profile Schema

Phase 2 adds these fields to the existing FirmProfile and PersonProfile:

### FirmProfile Additions

```typescript
// Added by Phase 2 deep research
socialPresence?: {
  twitter?: string;       // handle or URL
  youtube?: string;
  newsletter?: string;    // URL
  podcast?: string;       // name or URL
  blog?: string;          // URL
};
pressArticles?: Array<{
  title: string;
  url: string;
  date: string;
  summary: string;        // 1-2 sentences
}>;                        // up to 5
communityMentions?: string[];     // forums, communities where firm is mentioned
coInvestors?: string[];           // LPs or co-invest partners found
competitorFirms?: string[];       // similar firms discovered in research
deepResearchComplete: boolean;
deepResearchCompletedAt?: string;
deepResearchInsightsCount: number;
```

### PersonProfile Additions

```typescript
// Added by Phase 2 deep research
socialHandles?: {
  twitter?: string;
  youtube?: string;
  github?: string;
  blog?: string;
};
interviews?: Array<{
  title: string;
  url: string;
  platform: string;      // "podcast", "youtube", "blog", "press"
}>;                       // up to 5
publicContent?: string[];  // notable articles, tweets, posts found
networkConnections?: string[];  // notable people mentioned alongside this person
```

### Merge Rules

- Phase 2 **never overwrites** Phase 1 fields (description, strategy, sectors, etc.)
- Phase 2 only **adds** new fields (socialPresence, pressArticles, etc.) or **enriches** arrays (adds to portfolioCompanies, recentDeals)
- If Phase 2 finds a better description or more sectors, it stores them as `phase2_description`, `phase2_sectors` — the final synthesis picks the best

---

## Frontend: Polling + Live Notification

### API Endpoint

```
GET /api/onboarding/research-status
Response: {
  phase: 1 | 2,
  status: "running" | "complete" | "failed",
  newInsightsCount: 7,
  completedAt?: "2026-04-19T..."
}
```

### Polling Behavior

- Frontend starts polling after Phase 1 returns (every 5 seconds)
- Stops polling when `status === "complete"` or after 3 minutes (timeout)
- Max 36 poll requests (3 min / 5s)

### Completion Screen Update

When Phase 2 completes and user is on the onboarding completion screen:

1. **Notification slide-in** (top of completion CTA card):
   - Elegant slide-down animation (300ms ease-out)
   - Navy icon tile with `auto_awesome` icon + green pulse dot
   - Text: "Your AI analyst found {N} more insights about your firm"
   - "View full profile" link → scrolls to updated findings section
   - Auto-dismisses after 8 seconds (or click to dismiss)

2. **Findings section updates:**
   - Smooth fade-in of new finding cards below existing ones
   - New cards have a subtle left border accent (`border-l-2 border-primary`) to distinguish from Phase 1 findings
   - Categories shown: press articles, social presence, portfolio details

### If User Has Navigated Away

- On next page load (any page), check `deepResearchComplete` flag
- Show a toast notification (existing `showNotification` system):
  - Title: "Firm research complete"
  - Message: "7 new insights added to your profile"
  - Type: "success"
  - Duration: 5 seconds

---

## Background Execution

### Server-Side

Phase 2 runs as a fire-and-forget async function. Not awaited by the endpoint.

```typescript
// In POST /enrich-firm handler, after returning Phase 1 result:
res.json(phase1Result);

// Fire Phase 2 in background (not awaited)
runDeepResearch({
  phase1Profile: phase1Result.firmProfile,
  phase1PersonProfile: phase1Result.personProfile,
  websiteUrl, linkedinUrl, firmName,
  userId, organizationId: orgId,
}).catch(err => log.error('Deep research failed', { error: err.message }));
```

### State Tracking

Store Phase 2 progress in `Organization.settings.deepResearch`:

```typescript
{
  status: "running" | "complete" | "failed",
  startedAt: "2026-04-19T...",
  completedAt?: "2026-04-19T...",
  queriesRun: 14,
  insightsFound: 7,
  error?: string
}
```

This is what the `/research-status` endpoint reads.

---

## Cost & Performance

| | Phase 1 | Phase 2 | Total |
|--|---------|---------|-------|
| DDG searches | 5 | 12-18 | 17-23 |
| Website scrapes | 10 | up to 3 | 13 |
| GPT-4o calls | 2 | 2 (query gen + final merge) | 4 |
| Time | ~15s | 60-120s | 75-135s |
| Cost | ~$0.03 | ~$0.03 | ~$0.06 |

### Guardrails

All existing guardrails from the Phase 1 spec remain:
- SSRF prevention on all URLs
- No PII extraction
- Source attribution on every fact
- Confidence scoring (high/medium/low)
- Concurrent lock per org (Phase 2 shares the same lock)
- Rate limit: max 3 enrichments per org per hour (Phase 1 + Phase 2 count as 1)
- Phase 2 timeout: 120s hard cap — returns whatever was gathered

### Phase 2 Specific Guardrails

- Max 18 DDG searches total
- Max 3 URL scrapes
- Max 2 GPT-4o calls
- Follow-up depth limited to 1 level (no recursive spiraling)
- If Phase 2 fails, Phase 1 data is untouched — no data loss

---

## Out of Scope

- Real-time websocket updates (polling is simpler and sufficient)
- Scheduled re-research (manual refresh only, from Settings)
- Third-party enrichment APIs
- Scraping actual social media content (just finding handles/URLs)
