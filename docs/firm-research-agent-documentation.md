# Firm Research Agent -- Technical Documentation

## Overview

The Firm Research Agent is a LangGraph-based AI pipeline that automatically researches a PE firm and its team members using web scraping and search. It runs during onboarding (when a user provides their firm website/LinkedIn) and produces structured profiles that are used throughout the platform -- in deal chat context, settings display, and the onboarding completion screen.

The agent uses no paid search APIs. All web search is done via DuckDuckGo HTML scraping (`apps/api/src/services/webSearch.ts`).

---

## Architecture

### File Structure

```
apps/api/src/services/agents/firmResearchAgent/
  index.ts          Entry point: runFirmResearch(), timeout, concurrent lock
  graph.ts          LangGraph StateGraph wiring (6 nodes, linear edges)
  state.ts          Annotation-based state schema, TypeScript interfaces
  nodes/
    scrape.ts       Website scraping (homepage + subpages)
    searchFirm.ts   DuckDuckGo firm research (3 queries)
    searchPerson.ts DuckDuckGo person/LinkedIn research
    synthesize.ts   GPT-4o structured extraction with Zod
    verify.ts       Cross-validation and confidence scoring
    save.ts         Persist to Supabase (Organization + User tables)

apps/api/src/services/webSearch.ts   DuckDuckGo HTML scraping utility
```

### Node Responsibilities

| Node | Purpose | Key Behavior |
|---|---|---|
| **scrape** | Fetch firm website content | Fetches homepage + up to 10 subpages (about, team, portfolio, strategy, etc.). SSRF protection blocks private IPs. 15s timeout per fetch. Total text capped at 20K characters. |
| **searchFirm** | Web search for firm info | Runs 3 DuckDuckGo queries: `"firmName" private equity`, `firmName portfolio deals`, `firmName fund raise`. Aggregates results. |
| **searchPerson** | Web search for person info | Extracts LinkedIn slug from URL. Runs DDG searches for LinkedIn profile and person-firm co-occurrence. |
| **synthesize** | AI extraction | Sends all gathered text to GPT-4o with Zod-validated structured output. Enforces 8 strict accuracy rules (see Guardrails below). Produces FirmProfile and PersonProfile. |
| **verify** | Cross-validation | Searches DDG for each portfolio company + firm name co-occurrence. Validates person-firm match. Checks that claimed sectors have source backing. Sets confidence level (high/medium/low). |
| **save** | Persist results | Stores FirmProfile on `Organization.settings` JSONB, PersonProfile on `User.onboardingStatus` JSONB. Maintains audit trail of last 5 enrichment runs. |

### Graph Topology

The graph is a simple linear pipeline (no conditional edges or retry loops):

```
START -> scrape -> searchFirm -> searchPerson -> synthesize -> verify -> save -> END
```

The graph is compiled once and cached (`_compiledGraph` singleton in `graph.ts`).

---

## API Endpoint

### `POST /api/onboarding/enrich-firm`

**Authentication:** Required (Bearer token via `PEAuth.authFetch()`)

**Request body:**
```json
{
  "websiteUrl": "https://pocket-fund.com",
  "linkedinUrl": "https://linkedin.com/in/john-doe",
  "firmName": "Pocket Fund"
}
```

All fields are optional but at least `websiteUrl` or `firmName` should be provided for meaningful results.

**Response (success):**
```json
{
  "success": true,
  "firmProfile": {
    "description": "Lower middle-market PE firm focused on B2B SaaS",
    "strategy": "Buy-and-build in enterprise software",
    "sectors": ["SaaS", "Enterprise Software", "Healthcare IT"],
    "checkSizeRange": "$5M - $25M",
    "aum": "$150M",
    "teamSize": "12",
    "headquarters": "New York, NY",
    "foundedYear": "2018",
    "investmentCriteria": "$3M+ ARR, 80%+ gross margins, Rule of 40",
    "keyDifferentiators": "Operational value creation, founder-friendly approach",
    "portfolioCompanies": [
      { "name": "Acme Corp", "sector": "SaaS", "status": "Active", "verified": true },
      { "name": "DataFlow", "sector": "Analytics", "status": "Exited", "verified": false }
    ],
    "recentDeals": [
      { "title": "Acme Corp Series B", "date": "2025-03", "source": "website" }
    ],
    "confidence": "high",
    "enrichedAt": "2026-04-18T10:30:00.000Z",
    "sources": ["https://pocket-fund.com", "https://pocket-fund.com/portfolio"]
  },
  "personProfile": {
    "title": "Managing Partner",
    "role": "ADMIN",
    "bio": "10+ years in PE and growth equity...",
    "experience": ["Goldman Sachs", "Bain Capital"],
    "education": "MBA, Wharton",
    "expertise": ["SaaS", "Buyouts", "Operational Value Creation"],
    "linkedinUrl": "https://linkedin.com/in/john-doe",
    "yearsInPE": "10",
    "notableDeals": ["Acme Corp acquisition"],
    "verified": true
  },
  "sources": ["https://pocket-fund.com", "https://pocket-fund.com/about", "..."],
  "steps": [
    { "timestamp": "2026-04-18T10:30:01Z", "node": "scrape", "message": "Fetched 8 pages from pocket-fund.com" },
    { "timestamp": "2026-04-18T10:30:05Z", "node": "searchFirm", "message": "Found 12 results across 3 queries" }
  ],
  "error": null
}
```

**Response (concurrent lock):**
```json
{
  "success": false,
  "firmProfile": null,
  "personProfile": null,
  "sources": [],
  "steps": [],
  "error": "Enrichment already in progress for this organization. Please wait."
}
```

**Response (rate limited):**
```json
{
  "error": "Rate limit exceeded. Maximum 3 enrichments per hour."
}
```

---

## Data Schemas

### FirmProfile

Stored on `Organization.settings` JSONB column.

```typescript
interface FirmProfile {
  description: string;        // One-line firm description
  strategy: string;           // Investment strategy summary
  sectors: string[];          // Target sectors (e.g., ["SaaS", "Healthcare"])
  checkSizeRange: string;     // e.g., "$5M - $25M"
  aum: string;                // Assets under management
  teamSize: string;           // Number of team members
  headquarters: string;       // City, State
  foundedYear: string;        // e.g., "2018"
  investmentCriteria: string; // Key criteria for deals
  keyDifferentiators: string; // What sets the firm apart
  portfolioCompanies: PortfolioCompany[];
  recentDeals: RecentDeal[];
  confidence: 'high' | 'medium' | 'low';
  enrichedAt: string;         // ISO timestamp
  sources: string[];          // URLs used as sources
}

interface PortfolioCompany {
  name: string;
  sector: string;
  status: string;     // "Active", "Exited", etc.
  verified: boolean;  // true if DDG co-occurrence confirmed
}

interface RecentDeal {
  title: string;
  date: string;       // e.g., "2025-03"
  source: string;     // "website", "news", etc.
}
```

### PersonProfile

Stored on `User.onboardingStatus` JSONB column.

```typescript
interface PersonProfile {
  title: string;          // e.g., "Managing Partner"
  role: string;           // Organizational role
  bio: string;            // Brief professional bio
  experience: string[];   // Prior firms/roles
  education: string;      // Highest degree
  expertise: string[];    // Areas of expertise
  linkedinUrl: string;    // LinkedIn profile URL
  yearsInPE: string;      // Years in private equity
  notableDeals: string[]; // Known deals
  verified: boolean;      // Person-firm match confirmed
}
```

---

## Guardrails

### Accuracy Rules (enforced in synthesize node)

The GPT-4o prompt includes 8 strict accuracy rules:

1. Only extract information explicitly stated in the source text
2. Never infer or guess fund sizes, AUM, or financial figures
3. Mark sectors only when explicitly mentioned on the website
4. Portfolio companies must appear by name in source material
5. Person titles must match the source exactly
6. Do not conflate different firms or people
7. If information is ambiguous, omit rather than guess
8. Years and dates must be directly stated, not inferred

### Rate Limiting

- Maximum 3 enrichment runs per organization per hour
- Enforced at the API route level
- Returns `429` status with clear error message

### SSRF Prevention

The scrape node validates all URLs before fetching:
- Blocks private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
- Blocks `localhost`, `0.0.0.0`, and link-local addresses
- Only allows `http://` and `https://` protocols
- DNS resolution checked against private ranges

### Timeouts

- **Agent-level:** 60 seconds total (`AGENT_TIMEOUT_MS` in `index.ts`)
- **Per-fetch:** 15 seconds per HTTP request in scrape node
- **Subpage cap:** Maximum 10 subpages scraped
- **Text cap:** 20,000 characters total from website scraping

### Concurrent Lock

- Only one enrichment can run per organization at a time
- Implemented via an in-memory `Set<string>` keyed by `organizationId`
- Lock is released in a `finally` block (even on error/timeout)
- Prevents duplicate agent runs from rapid button clicks

---

## Where Enriched Data Is Used

### 1. Deal Chat (system prompt injection)

When a user opens deal chat, the system prompt is augmented with firm context from `Organization.settings`:

- Firm strategy and investment criteria
- Target sectors and check size range
- Portfolio companies (for comparison context)
- Key differentiators

This enables conversations like "Does this deal match our criteria?" with informed, contextual responses.

### 2. Settings Page (Firm Profile section)

The Settings page displays the enriched firm profile with:
- All extracted fields rendered in a readable card layout
- Confidence badge (high/medium/low)
- "Refresh" button that re-runs `POST /api/onboarding/enrich-firm`
- Last enriched timestamp

### 3. Onboarding Completion Screen

After the user completes the 3-task checklist, the completion screen shows dynamic findings:
- Detected sectors and fund size
- Number of portfolio companies found
- Person title/role (if LinkedIn was provided)
- If the agent is still running, shows a "processing" spinner that polls for results

---

## Cost and Performance

| Metric | Value |
|---|---|
| **GPT-4o calls** | 1 (synthesize node only) |
| **Cost per enrichment** | ~$0.02-0.05 (depends on text volume) |
| **Total runtime** | 15-25 seconds typical |
| **Web requests** | 10-15 (1 homepage + subpages + 6-8 DDG searches) |
| **DuckDuckGo API cost** | $0 (HTML scraping, no API key) |

The verify node adds 3-8 seconds for portfolio company co-occurrence checks (one DDG search per company, up to 5 companies checked).

---

## Troubleshooting

### Agent returns empty/minimal results

- **Cause:** Website may block scraping (Cloudflare, anti-bot), or the firm has minimal web presence.
- **Fix:** User can manually fill in the form fields. The agent is best-effort enrichment, not a requirement.

### "Enrichment already in progress" error

- **Cause:** A previous enrichment run is still active (or crashed without releasing the lock).
- **Fix:** Wait 60 seconds (agent timeout will release the lock). If the server was restarted, the in-memory lock is cleared automatically.

### Rate limit hit (429)

- **Cause:** 3 enrichments already ran for this org in the past hour.
- **Fix:** Wait until the hour window resets. This is intentional to prevent abuse.

### Portfolio companies marked as unverified

- **Cause:** DDG co-occurrence search did not find the company name alongside the firm name.
- **Fix:** This is expected for lesser-known portfolio companies. The data is still displayed but with `verified: false`. Users should manually verify.

### Confidence is "low"

- **Cause:** Few sources available, website content is sparse, or key fields (strategy, sectors, AUM) could not be extracted.
- **Fix:** Provide a more informative website URL. Firm websites with clear "About", "Strategy", and "Portfolio" pages produce the best results.

### Timeout (60 seconds exceeded)

- **Cause:** Slow website responses or many subpages to scrape.
- **Fix:** The agent will return whatever it gathered before the timeout. Partial results are still saved. User can retry via the Settings refresh button.

### SSRF error on URL

- **Cause:** User provided a URL pointing to a private/internal network.
- **Fix:** Only public URLs are accepted. This is a security measure and cannot be bypassed.
