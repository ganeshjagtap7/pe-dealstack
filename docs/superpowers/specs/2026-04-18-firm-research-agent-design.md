# Firm Research Agent — Design Spec

**Date:** 2026-04-18
**Status:** Approved
**Scope:** LangGraph agent that auto-researches a PE firm + person from website URL and LinkedIn URL, builds a persistent profile, and injects it as AI context throughout the product.

---

## Problem

Users enter their firm website and LinkedIn during onboarding, but the system does nothing meaningful with those URLs. The deal chat agent has zero knowledge of the firm's strategy, sectors, fund size, or portfolio — it can't tell a user "this deal doesn't match your buyout criteria" because it doesn't know the criteria.

Current state: website scraping + GPT-4o extraction exists (`firmEnrichment.ts`) but only extracts basic fields from the homepage. No web search. No LinkedIn data. No integration with the deal chat agent.

## Solution

A LangGraph research agent that:
1. Scrapes the firm website (10+ pages deep)
2. Searches DuckDuckGo for firm intel (deals, portfolio, fund announcements)
3. Searches DuckDuckGo for person intel (LinkedIn snippets, press mentions)
4. Synthesizes everything via GPT-4o into structured FirmProfile + PersonProfile
5. Stores profiles on Organization.settings and User record
6. Injects firm context into deal chat agent system prompt

## Triggers

1. **Onboarding** — when user completes "Define your investment focus" task (enters website URL)
2. **Settings page** — "Refresh firm profile" button for manual re-run

Both are async — frontend shows a progress indicator while the agent runs (15-25 seconds).

---

## Architecture

### New Files

```
apps/api/src/services/agents/firmResearchAgent/
  index.ts          — entry: runFirmResearch(input) → FirmResearchResult
  state.ts          — LangGraph state schema
  graph.ts          — StateGraph: scrape → searchFirm → searchPerson → synthesize → verify → save
  nodes/
    scrape.ts       — scrape firm website (homepage + 10 common subpages)
    searchFirm.ts   — DuckDuckGo queries for firm intel (3 searches)
    searchPerson.ts — DuckDuckGo queries for person intel (2 searches)
    synthesize.ts   — GPT-4o structured extraction from all gathered text
    verify.ts       — cross-check extracted data, flag/remove unverified fields
    save.ts         — persist FirmProfile + PersonProfile to database

apps/api/src/services/webSearch.ts
  — DuckDuckGo HTML search wrapper, reusable utility
  — export async function searchWeb(query: string, maxResults?: number): Promise<SearchResult[]>
```

### Modified Files

| File | Change |
|------|--------|
| `routes/onboarding.ts` | Replace `enrich-firm` endpoint to use new agent |
| `routes/deals-chat-ai.ts` | Inject `Organization.settings.firmProfile` into system prompt |
| `services/firmEnrichment.ts` | Deprecate — replaced by firmResearchAgent |
| `apps/web/js/onboarding/onboarding-tasks.js` | Update enrichment trigger to call new endpoint |
| `apps/web/settings.js` | Add "Refresh firm profile" button + UI |

---

## Web Search Utility

**File:** `apps/api/src/services/webSearch.ts`

Fetches DuckDuckGo HTML search results. No API key required.

```typescript
interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

async function searchWeb(query: string, maxResults = 8): Promise<SearchResult[]>
```

**Implementation:**
- GET `https://html.duckduckgo.com/html/?q={encoded_query}`
- Parse HTML response: extract `.result__title`, `.result__snippet`, `.result__url`
- 10-second timeout per search
- Return top N results (title + snippet + URL)
- Graceful fallback: returns empty array on failure

---

## Agent Graph

### State Schema

```typescript
interface FirmResearchState {
  // Input
  websiteUrl: string;
  linkedinUrl: string;
  firmName: string;
  userId: string;
  organizationId: string;

  // Gathered data (append-only)
  websiteText: string;           // scraped website content
  firmSearchResults: string;     // DDG search results for firm
  personSearchResults: string;   // DDG search results for person

  // Output
  firmProfile: FirmProfile | null;
  personProfile: PersonProfile | null;
  sources: string[];
  error: string | null;
}
```

### Nodes

**Node 1: scrape** — Scrape firm website
- Scrape homepage + up to 10 subpages: `/about`, `/about-us`, `/team`, `/our-team`, `/strategy`, `/portfolio`, `/investments`, `/sectors`, `/contact`, `/news`
- Use existing `scrapeWebsite()` utility
- Concatenate all text into `websiteText` (cap at 20K chars total)
- Track which pages succeeded in `sources[]`

**Node 2: searchFirm** — DuckDuckGo searches for firm intel
- Query 1: `"{firmName}" private equity`
- Query 2: `"{firmName}" portfolio deals investments`
- Query 3: `"{firmName}" fund raise announcement`
- Concatenate all snippets into `firmSearchResults`
- If firmName is missing, extract from website text first

**Node 3: searchPerson** — DuckDuckGo searches for person
- Extract person slug from LinkedIn URL (e.g., `linkedin.com/in/johndoe` → `johndoe`)
- Query 1: `site:linkedin.com "{personSlug}"` — gets indexed LinkedIn profile snippets
- Query 2: `"{personName}" "{firmName}"` — press mentions, speaking, articles
- If person name isn't known, search just the LinkedIn URL
- Concatenate into `personSearchResults`

**Node 4: synthesize** — GPT-4o structured extraction
- Combine all gathered text: websiteText + firmSearchResults + personSearchResults
- Two structured output calls:
  - **FirmProfile extraction** (firm-focused prompt)
  - **PersonProfile extraction** (person-focused prompt)
- Temperature 0.1, max 2000 tokens each
- If extraction fails, set error message, return partial results

**Accuracy rules baked into GPT-4o system prompt:**
```
ACCURACY RULES — FOLLOW STRICTLY:
1. ONLY extract facts that appear verbatim or near-verbatim in the source text.
   Do NOT infer, guess, or "fill in" fields based on what seems likely.
2. For every fact you extract, mentally identify the exact sentence in the
   source that supports it. If you cannot point to a specific sentence, 
   leave the field empty.
3. Company name must EXACTLY match what appears on the website — do not
   correct spelling, expand abbreviations, or normalize capitalization.
4. For portfolio companies: only include names that appear in a clear 
   "portfolio" or "investments" context. A company mentioned in a blog
   post is NOT a portfolio company.
5. For person data: only include information where the person's name
   co-occurs with the fact in the SAME snippet/paragraph. Do not combine
   facts from different people.
6. If two sources contradict each other, include BOTH values with their
   sources rather than picking one.
7. Fund size / AUM: only include if stated as a specific number. 
   "Significant capital" or "substantial resources" is NOT a fund size.
8. Sectors: only include sectors where the firm explicitly claims focus.
   Mentioning a sector in a news article is not the same as focusing on it.
```

**Node 5: save** — Persist to database
- Store `firmProfile` on `Organization.settings.firmProfile` (JSONB)
- Store `personProfile` on `User` record (in `onboardingStatus.personProfile` or a dedicated field)
- Update `Organization.website` if not already set
- Log enrichment timestamp and sources

**Node 6: verify** — Cross-check extracted data for accuracy
- Compare firm name extracted from website vs. firm name from search results vs. Organization.name in DB — flag mismatches
- Verify portfolio companies: for each extracted portfolio company, run a quick DuckDuckGo search `"{companyName}" "{firmName}"` — if zero results, mark as `unverified` and drop it
- Verify person-firm match: confirm the LinkedIn person actually works at this firm (search snippets must mention both person name AND firm name together) — if no co-occurrence found, flag personProfile as `unverified`
- Verify sectors: cross-check that sectors extracted from website match sectors found in deal/portfolio news — remove sectors that appear only in GPT inference with no source backing
- Each verified field gets `verified: true`, unverified fields get `verified: false` with reason
- If >50% of critical fields (description, strategy, sectors) are unverified, set `profile.confidence = 'low'` and show user a warning: "We couldn't fully verify this profile. Please review."

### Edges

```
scrape → searchFirm → searchPerson → synthesize → verify → save
```

Linear graph with verification before save. Each node runs regardless of prior failures and handles errors gracefully. If scrape fails, search results still provide data. If search fails, website data is still used. Verify node works with whatever synthesize produced — it removes/flags bad data rather than blocking.

---

## Output Schemas

### FirmProfile

Stored at `Organization.settings.firmProfile`:

```typescript
interface FirmProfile {
  description: string;          // "Lower-middle market PE firm focused on healthcare services"
  strategy: string;             // "Buyout", "Growth Equity", "Search Fund", etc.
  sectors: string[];            // ["Healthcare", "Industrials", "Software"]
  checkSizeRange: string;       // "$50M-$200M"
  aum: string;                  // "$1.2B"
  teamSize: string;             // "25 people"
  headquarters: string;         // "New York, NY"
  foundedYear: string;          // "2012"
  investmentCriteria: string;   // "EBITDA $5-25M, platform acquisitions"
  keyDifferentiators: string;   // "Operational value-add, healthcare specialization"
  portfolioCompanies: Array<{
    name: string;
    sector: string;
    status: string;             // "active", "exited"
  }>;
  recentDeals: Array<{
    title: string;
    date: string;
    source: string;             // URL where this was found
  }>;
}
```

### PersonProfile

Stored at `User.onboardingStatus.personProfile` (JSONB field already exists on User table — adding a `personProfile` key alongside existing `steps`, `welcomeShown`, etc.):

```typescript
interface PersonProfile {
  title: string;                // "Managing Partner"
  role: string;                 // "Partner", "VP", "Analyst"
  bio: string;                  // 1-2 sentence summary
  experience: string[];         // ["15 years in PE", "Former McKinsey"]
  education: string;            // "Wharton MBA, Duke BS"
  expertise: string[];          // ["Healthcare", "Operational turnarounds"]
  linkedinUrl: string;
  yearsInPE: string;            // "15"
  notableDeals: string[];       // ["Acme Health acquisition", "TechCo exit"]
}
```

---

## AI Context Injection

### Deal Chat Agent

In `deals-chat-ai.ts`, add firm profile to the system prompt context block:

```
=== YOUR FIRM CONTEXT ===
Firm: {firmProfile.description}
Strategy: {firmProfile.strategy}
Sectors: {firmProfile.sectors.join(', ')}
Check Size: {firmProfile.checkSizeRange}
Investment Criteria: {firmProfile.investmentCriteria}
Portfolio: {firmProfile.portfolioCompanies.map(c => c.name).join(', ')}
Recent Deals: {firmProfile.recentDeals.map(d => d.title).join(', ')}

Your Role: {personProfile.title} — {personProfile.bio}
```

This enables the deal chat agent to:
- Compare deals against firm criteria ("This EBITDA is below your typical range")
- Identify sector alignment ("This is your 3rd healthcare deal")
- Reference portfolio overlap ("Similar to your Acme Health acquisition")
- Tailor communication to the user's seniority and expertise

### Other AI Touchpoints

The firm profile should also be available to:
- **Analysis engine** — weight red flags by sector relevance
- **Contact enrichment** — cross-reference portfolio companies
- **Memo builder** — auto-populate firm context in investment memos

These are future enhancements, not in scope for this build.

---

## Frontend Changes

### Onboarding Task ("Define your investment focus")

Current behavior: user enters URL → on blur, calls `POST /api/onboarding/enrich-firm` → pre-fills sectors/fund size.

New behavior: same trigger, but calls the agent endpoint. Shows richer loading state:
1. "Scanning your website..." (scrape node)
2. "Researching your firm..." (search nodes)
3. "Building your profile..." (synthesize node)
4. Green success: "Found: {description} — {sectors.length} sectors, {portfolioCompanies.length} portfolio companies"

Pre-fill behavior stays the same (auto-select fund size buttons + sector chips).

### Settings Page

Add a "Firm Profile" section to Settings with:
- Display of current enriched profile (description, strategy, sectors, portfolio list)
- "Refresh profile" button that re-runs the agent
- Last enriched timestamp
- Manual override fields (user can edit any field)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Website unreachable | Agent continues with search results only |
| DuckDuckGo blocked/timeout | Agent continues with website data only |
| Both scrape and search fail | Return error, ask user to fill in manually |
| GPT-4o extraction fails | Return partial data from whatever was gathered |
| Agent timeout (>60s) | Kill agent, return whatever was gathered so far |
| User has no website or LinkedIn | Skip enrichment entirely, manual form only |

The agent should never block onboarding. If enrichment fails, the user fills in the form manually and moves on.

---

## Guardrails

### Data Quality

| Guardrail | Rule |
|-----------|------|
| **Confidence scoring** | Every extracted field gets a confidence flag: `high` (found on website), `medium` (found in search snippets), `low` (GPT inference only). Fields below `medium` are marked "unverified" in the UI. |
| **Source attribution** | Every fact in the profile stores which source it came from (e.g., `"source": "website:/about"` or `"source": "ddg:query2"`). User can see where each piece of data originated. |
| **Hallucination prevention** | GPT system prompt explicitly says: "Only include information that is clearly stated in the provided text. If a field is not mentioned, leave it empty. Do NOT guess or infer data that isn't supported by the sources." |
| **Cross-validation** | If website says "Healthcare focus" but search results say "Industrials" — flag the conflict, don't silently pick one. Store both with a `conflicted: true` flag for user review. |
| **Empty > wrong** | Better to return an empty field than a hallucinated one. The synthesize node checks each field — if confidence is below threshold, it sets the field to null rather than including questionable data. |

### Input Validation

| Guardrail | Rule |
|-----------|------|
| **URL sanitization** | Strip query params, fragments, tracking UTMs before scraping. Normalize to HTTPS. Reject non-HTTP URLs, localhost, internal IPs (127.x, 10.x, 192.168.x). |
| **Domain allowlist check** | LinkedIn URL must match `linkedin.com/in/*` or `linkedin.com/company/*` pattern. Reject other domains passed as LinkedIn. |
| **Rate limiting** | Max 3 enrichment runs per organization per hour. Prevents abuse and runaway costs. |
| **Content size limits** | Max 20K chars total website text, max 5K chars per search result set. Truncate, don't fail. |
| **SSRF prevention** | Reject URLs that resolve to private IP ranges. Only scrape public internet hosts. |

### Runtime Safety

| Guardrail | Rule |
|-----------|------|
| **Per-node timeout** | Each node (scrape, searchFirm, searchPerson, synthesize, save) has its own 15s timeout. One slow node doesn't kill the whole agent. |
| **Agent-level timeout** | 60s hard cap on the entire agent run. Returns whatever was gathered so far. |
| **Retry logic** | Each DuckDuckGo search retries once on failure (with 2s delay). Website scrape does not retry (if the site is down, it's down). |
| **Graceful degradation** | Agent runs all nodes regardless of prior failures. If scrape fails, search still runs. If search fails, synthesize works with website data only. Partial results are always better than no results. |
| **Cost cap** | Max 2 GPT-4o calls per enrichment (firm + person). No follow-up "let me search more" loops that could spiral costs. |
| **Concurrent enrichment lock** | Only one enrichment can run per organization at a time. If user clicks "Refresh" while one is running, return "Enrichment already in progress." |

### Data Privacy & Storage

| Guardrail | Rule |
|-----------|------|
| **No PII scraping** | Do not extract/store phone numbers, personal emails, home addresses, or social security numbers from scraped content. GPT prompt explicitly excludes these. |
| **Org-scoped storage** | Firm profile is stored on Organization.settings (org-scoped). Person profile on User record (user-scoped). No cross-org data leakage. |
| **Overwrite protection** | Re-enrichment merges with existing profile, not replaces. If a field was manually edited by the user, the manual value takes precedence (marked `"manualOverride": true`). |
| **Audit trail** | Log every enrichment run: timestamp, sources used, fields populated, fields skipped, total duration. Stored in `Organization.settings.enrichmentHistory[]` (last 5 runs). |

---

## Cost & Performance

- **Web scraping:** 10-15 HTTP requests, ~5-10s total
- **DuckDuckGo searches:** 5 queries, ~3-5s total
- **GPT-4o calls:** 2 structured extractions, ~$0.02-0.04 per enrichment
- **Total time:** 15-25 seconds end-to-end
- **Total cost:** ~$0.03-0.05 per enrichment (GPT-4o only, searches are free)

---

## Out of Scope

- Third-party enrichment APIs (Apollo, Clearbit, Proxycurl)
- Automatic periodic refresh (only manual re-run from Settings)
- LinkedIn scraping (using search snippets instead)
- Person email/phone lookup
- Enrichment for contacts (existing contact enrichment agent stays separate)
