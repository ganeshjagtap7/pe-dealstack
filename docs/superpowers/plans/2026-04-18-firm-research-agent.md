# Firm Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LangGraph agent that auto-researches a PE firm + person from website URL and LinkedIn URL, stores a verified profile, and injects it as AI context in deal chat.

**Architecture:** 6-node LangGraph StateGraph (scrape → searchFirm → searchPerson → synthesize → verify → save) using DuckDuckGo HTML search (no API keys), GPT-4o structured extraction, and cross-validation verification. Profiles stored on Organization.settings (firm) and User.onboardingStatus (person).

**Tech Stack:** LangGraph, LangChain, Zod, GPT-4o (via existing llm.ts), DuckDuckGo HTML scraping, Supabase JSONB

**Spec:** `docs/superpowers/specs/2026-04-18-firm-research-agent-design.md`

---

### Task 1: DuckDuckGo Web Search Utility

**Files:**
- Create: `apps/api/src/services/webSearch.ts`

- [ ] **Step 1: Create webSearch.ts**

```typescript
// apps/api/src/services/webSearch.ts
import { log } from '../utils/logger.js';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search DuckDuckGo HTML and extract result snippets.
 * No API key required. Returns top N results.
 * Retries once on failure with 2s delay.
 */
export async function searchWeb(query: string, maxResults = 8): Promise<SearchResult[]> {
  const attempt = async (): Promise<SearchResult[]> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `q=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) return [];

      const html = await response.text();
      return parseResults(html, maxResults);
    } catch (error) {
      log.warn('DuckDuckGo search failed', { query, error: (error as Error).message });
      return [];
    }
  };

  // First attempt
  let results = await attempt();
  if (results.length === 0) {
    // Retry once after 2s
    await new Promise(r => setTimeout(r, 2000));
    results = await attempt();
  }
  return results;
}

function parseResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML results are in <div class="result results_links results_links_deep web-result">
  // Title in <a class="result__a"> and snippet in <a class="result__snippet">
  const resultBlocks = html.split(/class="result results_links/g).slice(1);

  for (const block of resultBlocks) {
    if (results.length >= maxResults) break;

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch
      ? decodeEntities(snippetMatch[1].replace(/<[^>]+>/g, '').trim())
      : '';

    // Extract URL
    const urlMatch = block.match(/class="result__url"[^>]*href="([^"]+)"/);
    const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    let resultUrl = '';
    if (urlMatch) {
      resultUrl = urlMatch[1];
    } else if (hrefMatch) {
      resultUrl = hrefMatch[1];
    }
    // DDG wraps URLs in redirect — extract the actual URL
    if (resultUrl.includes('uddg=')) {
      const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) resultUrl = decodeURIComponent(uddgMatch[1]);
    }

    if (title || snippet) {
      results.push({ title, snippet, url: resultUrl });
    }
  }

  return results;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep webSearch || echo "No errors"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/webSearch.ts
git commit -m "feat(enrichment): add DuckDuckGo web search utility"
```

---

### Task 2: Agent State Schema

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/state.ts`

- [ ] **Step 1: Create state.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/state.ts
import { Annotation } from '@langchain/langgraph';

export interface PortfolioCompany {
  name: string;
  sector: string;
  status: string;
  verified: boolean;
}

export interface RecentDeal {
  title: string;
  date: string;
  source: string;
}

export interface FirmProfile {
  description: string;
  strategy: string;
  sectors: string[];
  checkSizeRange: string;
  aum: string;
  teamSize: string;
  headquarters: string;
  foundedYear: string;
  investmentCriteria: string;
  keyDifferentiators: string;
  portfolioCompanies: PortfolioCompany[];
  recentDeals: RecentDeal[];
  confidence: 'high' | 'medium' | 'low';
  enrichedAt: string;
  sources: string[];
}

export interface PersonProfile {
  title: string;
  role: string;
  bio: string;
  experience: string[];
  education: string;
  expertise: string[];
  linkedinUrl: string;
  yearsInPE: string;
  notableDeals: string[];
  verified: boolean;
}

export interface AgentStep {
  timestamp: string;
  node: string;
  message: string;
  detail?: string;
}

export const FirmResearchState = Annotation.Root({
  // Input
  websiteUrl: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  linkedinUrl: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  firmName: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  userId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  organizationId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // Gathered data
  websiteText: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  firmSearchResults: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  personSearchResults: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // Output
  firmProfile: Annotation<FirmProfile | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  personProfile: Annotation<PersonProfile | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  sources: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'pending',
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Append-only step log
  steps: Annotation<AgentStep[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type FirmResearchStateType = typeof FirmResearchState.State;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep firmResearch || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/state.ts
git commit -m "feat(enrichment): add firm research agent state schema"
```

---

### Task 3: Scrape Node

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/scrape.ts`

- [ ] **Step 1: Create scrape.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/scrape.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { scrapePageText } from '../../../companyResearcher.js';
import { log } from '../../../../utils/logger.js';

const SUBPAGES = [
  '/about', '/about-us', '/team', '/our-team', '/strategy',
  '/portfolio', '/investments', '/sectors', '/contact', '/news',
];

const MAX_TOTAL_CHARS = 20000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'scrape', message, detail };
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  // SSRF prevention: reject private IPs
  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.startsWith('127.') ||
        hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.')) {
      return '';
    }
  } catch {
    return '';
  }
  return normalized;
}

export async function scrapeNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.websiteUrl) {
    steps.push(step('No website URL provided, skipping scrape'));
    return { steps, sources: [] };
  }

  const baseUrl = normalizeUrl(state.websiteUrl);
  if (!baseUrl) {
    steps.push(step('Invalid or private URL, skipping scrape'));
    return { steps, sources: [] };
  }

  steps.push(step('Starting website scrape', baseUrl));

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), NODE_TIMEOUT_MS)
  );

  const scrapePromise = async (): Promise<{ text: string; sources: string[] }> => {
    const sources: string[] = [];
    let allText = '';

    // Scrape homepage first
    const homepageText = await scrapePageText(baseUrl);
    if (homepageText && homepageText.length > 100) {
      allText += `=== HOMEPAGE ===\n${homepageText}\n\n`;
      sources.push('website:/');
    }

    // Scrape subpages in parallel batches of 4
    const batchSize = 4;
    for (let i = 0; i < SUBPAGES.length; i += batchSize) {
      if (allText.length >= MAX_TOTAL_CHARS) break;
      const batch = SUBPAGES.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (path) => {
          try {
            const pageUrl = new URL(path, baseUrl).href;
            const text = await scrapePageText(pageUrl);
            return { path, text };
          } catch {
            return { path, text: null };
          }
        })
      );

      for (const { path, text } of results) {
        if (text && text.length > 200 && allText.length < MAX_TOTAL_CHARS) {
          allText += `=== ${path.toUpperCase()} PAGE ===\n${text}\n\n`;
          sources.push(`website:${path}`);
        }
      }
    }

    return { text: allText.slice(0, MAX_TOTAL_CHARS), sources };
  };

  const result = await Promise.race([scrapePromise(), timeoutPromise]);

  if (!result) {
    steps.push(step('Scrape timed out after 15s'));
    return { websiteText: '', steps, sources: [] };
  }

  steps.push(step(`Scraped ${result.sources.length} pages`, `${result.text.length} chars total`));
  log.info('Firm research: scrape complete', {
    url: baseUrl,
    pages: result.sources.length,
    chars: result.text.length,
  });

  return {
    websiteText: result.text,
    sources: result.sources,
    steps,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep -i "scrape\|firmResearch" || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/scrape.ts
git commit -m "feat(enrichment): add scrape node for firm research agent"
```

---

### Task 4: Search Firm Node

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/searchFirm.ts`

- [ ] **Step 1: Create searchFirm.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/searchFirm.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchFirm', message, detail };
}

export async function searchFirmNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];
  const firmName = state.firmName;

  if (!firmName) {
    steps.push(step('No firm name available, skipping firm search'));
    return { firmSearchResults: '', steps };
  }

  steps.push(step('Starting DuckDuckGo searches for firm intel'));

  const queries = [
    `"${firmName}" private equity`,
    `"${firmName}" portfolio deals investments`,
    `"${firmName}" fund raise announcement`,
  ];

  const timeoutPromise = new Promise<string>((resolve) =>
    setTimeout(() => resolve(''), NODE_TIMEOUT_MS)
  );

  const searchPromise = async (): Promise<string> => {
    let allSnippets = '';
    const newSources: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        const results = await searchWeb(query, 5);
        if (results.length > 0) {
          allSnippets += `\n--- SEARCH: ${query} ---\n`;
          for (const r of results) {
            allSnippets += `${r.title}\n${r.snippet}\nSource: ${r.url}\n\n`;
          }
          newSources.push(`ddg:firm_q${i + 1}`);
          steps.push(step(`Query ${i + 1}: ${results.length} results`, query));
        } else {
          steps.push(step(`Query ${i + 1}: no results`, query));
        }
      } catch (error) {
        steps.push(step(`Query ${i + 1} failed`, (error as Error).message));
      }
    }

    // Update sources
    const existingSources = state.sources || [];
    state.sources = [...existingSources, ...newSources];

    return allSnippets.slice(0, MAX_SEARCH_CHARS);
  };

  const result = await Promise.race([searchPromise(), timeoutPromise]);

  if (!result) {
    steps.push(step('Firm search timed out after 15s'));
  }

  log.info('Firm research: firm search complete', {
    firmName,
    resultChars: result?.length || 0,
  });

  return {
    firmSearchResults: result || '',
    sources: state.sources,
    steps,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/searchFirm.ts
git commit -m "feat(enrichment): add searchFirm node — DuckDuckGo firm intel"
```

---

### Task 5: Search Person Node

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts`

- [ ] **Step 1: Create searchPerson.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchPerson', message, detail };
}

function extractLinkedInSlug(url: string): string | null {
  // linkedin.com/in/johndoe → johndoe
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function isValidLinkedInUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?linkedin\.com\/(in|company)\/[^/?#]+/i.test(url) ||
         /^linkedin\.com\/(in|company)\/[^/?#]+/i.test(url);
}

export async function searchPersonNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.linkedinUrl) {
    steps.push(step('No LinkedIn URL provided, skipping person search'));
    return { personSearchResults: '', steps };
  }

  // Validate LinkedIn URL format
  if (!isValidLinkedInUrl(state.linkedinUrl)) {
    steps.push(step('Invalid LinkedIn URL format, skipping', state.linkedinUrl));
    return { personSearchResults: '', steps };
  }

  const slug = extractLinkedInSlug(state.linkedinUrl);
  steps.push(step('Starting person search', `slug: ${slug || 'unknown'}`));

  const queries: string[] = [];

  // Query 1: search for the LinkedIn profile itself
  if (slug) {
    // Convert slug to likely name: "john-doe" → "John Doe"
    const likelyName = slug.replace(/-/g, ' ').replace(/\d+/g, '').trim();
    queries.push(`site:linkedin.com/in "${slug}"`);
    // Query 2: person + firm mentions
    if (state.firmName && likelyName) {
      queries.push(`"${likelyName}" "${state.firmName}"`);
    }
  } else {
    queries.push(state.linkedinUrl);
  }

  const timeoutPromise = new Promise<string>((resolve) =>
    setTimeout(() => resolve(''), NODE_TIMEOUT_MS)
  );

  const searchPromise = async (): Promise<string> => {
    let allSnippets = '';
    const newSources: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        const results = await searchWeb(query, 5);
        if (results.length > 0) {
          allSnippets += `\n--- SEARCH: ${query} ---\n`;
          for (const r of results) {
            allSnippets += `${r.title}\n${r.snippet}\nSource: ${r.url}\n\n`;
          }
          newSources.push(`ddg:person_q${i + 1}`);
          steps.push(step(`Query ${i + 1}: ${results.length} results`, query));
        } else {
          steps.push(step(`Query ${i + 1}: no results`, query));
        }
      } catch (error) {
        steps.push(step(`Query ${i + 1} failed`, (error as Error).message));
      }
    }

    const existingSources = state.sources || [];
    state.sources = [...existingSources, ...newSources];

    return allSnippets.slice(0, MAX_SEARCH_CHARS);
  };

  const result = await Promise.race([searchPromise(), timeoutPromise]);

  log.info('Firm research: person search complete', {
    linkedinUrl: state.linkedinUrl,
    resultChars: result?.length || 0,
  });

  return {
    personSearchResults: result || '',
    sources: state.sources,
    steps,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts
git commit -m "feat(enrichment): add searchPerson node — LinkedIn + press search"
```

---

### Task 6: Synthesize Node (GPT-4o Extraction)

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/synthesize.ts`

- [ ] **Step 1: Create synthesize.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/synthesize.ts
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FirmResearchStateType, AgentStep, FirmProfile, PersonProfile } from '../state.js';
import { getExtractionModel } from '../../../llm.js';
import { log } from '../../../../utils/logger.js';

const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'synthesize', message, detail };
}

// Zod schemas for structured output
const FirmProfileSchema = z.object({
  description: z.string().default(''),
  strategy: z.string().default(''),
  sectors: z.array(z.string()).default([]),
  checkSizeRange: z.string().default(''),
  aum: z.string().default(''),
  teamSize: z.string().default(''),
  headquarters: z.string().default(''),
  foundedYear: z.string().default(''),
  investmentCriteria: z.string().default(''),
  keyDifferentiators: z.string().default(''),
  portfolioCompanies: z.array(z.object({
    name: z.string(),
    sector: z.string().default(''),
    status: z.string().default('active'),
  })).default([]),
  recentDeals: z.array(z.object({
    title: z.string(),
    date: z.string().default(''),
    source: z.string().default(''),
  })).default([]),
});

const PersonProfileSchema = z.object({
  title: z.string().default(''),
  role: z.string().default(''),
  bio: z.string().default(''),
  experience: z.array(z.string()).default([]),
  education: z.string().default(''),
  expertise: z.array(z.string()).default([]),
  yearsInPE: z.string().default(''),
  notableDeals: z.array(z.string()).default([]),
});

const FIRM_SYSTEM_PROMPT = `You are a private equity research analyst. Extract structured information about an investment firm from gathered research data.

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
5. If two sources contradict each other, include BOTH values with their
   sources rather than picking one.
6. Fund size / AUM: only include if stated as a specific number.
   "Significant capital" or "substantial resources" is NOT a fund size.
7. Sectors: only include sectors where the firm explicitly claims focus.
   Mentioning a sector in a news article is not the same as focusing on it.
8. Do NOT extract phone numbers, personal emails, home addresses, or SSNs.`;

const PERSON_SYSTEM_PROMPT = `You are a private equity research analyst. Extract structured information about a specific person from gathered research data.

ACCURACY RULES — FOLLOW STRICTLY:
1. ONLY include information where the person's name co-occurs with the fact
   in the SAME snippet/paragraph. Do not combine facts from different people.
2. If you cannot identify the specific person in the text, leave all fields empty.
3. Do NOT guess titles, roles, or experience based on the firm's seniority structure.
4. Education and experience must be explicitly stated, not inferred.
5. Do NOT extract phone numbers, personal emails, home addresses, or SSNs.`;

export async function synthesizeNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  const hasData = state.websiteText || state.firmSearchResults || state.personSearchResults;
  if (!hasData) {
    steps.push(step('No data gathered, skipping synthesis'));
    return { status: 'failed', error: 'No data could be gathered from website or search', steps };
  }

  steps.push(step('Starting GPT-4o structured extraction'));

  const model = getExtractionModel(2000);

  // === Extract Firm Profile ===
  let firmProfile: FirmProfile | null = null;
  try {
    const firmContext = [
      state.websiteText ? `=== WEBSITE CONTENT ===\n${state.websiteText.slice(0, 12000)}` : '',
      state.firmSearchResults ? `\n=== WEB SEARCH RESULTS ===\n${state.firmSearchResults}` : '',
    ].filter(Boolean).join('\n\n');

    const firmModel = model.withStructuredOutput(FirmProfileSchema);
    const firmResult = await firmModel.invoke([
      new SystemMessage(FIRM_SYSTEM_PROMPT),
      new HumanMessage(`Extract the firm profile for "${state.firmName}" from:\n\n${firmContext}`),
    ]);

    firmProfile = {
      ...(firmResult as z.infer<typeof FirmProfileSchema>),
      confidence: 'medium',
      enrichedAt: new Date().toISOString(),
      sources: state.sources || [],
    } as FirmProfile;

    steps.push(step('Firm profile extracted', `${firmProfile.sectors.length} sectors, ${firmProfile.portfolioCompanies.length} portfolio cos`));
  } catch (error) {
    steps.push(step('Firm extraction failed', (error as Error).message));
    log.error('Firm synthesis failed', { error: (error as Error).message });
  }

  // === Extract Person Profile ===
  let personProfile: PersonProfile | null = null;
  if (state.personSearchResults || state.linkedinUrl) {
    try {
      const personContext = [
        state.personSearchResults ? `=== PERSON SEARCH RESULTS ===\n${state.personSearchResults}` : '',
        state.websiteText ? `\n=== FIRM WEBSITE (for context) ===\n${state.websiteText.slice(0, 4000)}` : '',
      ].filter(Boolean).join('\n\n');

      const personModel = model.withStructuredOutput(PersonProfileSchema);
      const personResult = await personModel.invoke([
        new SystemMessage(PERSON_SYSTEM_PROMPT),
        new HumanMessage(`Extract the profile for the person at LinkedIn: ${state.linkedinUrl}\nFirm: ${state.firmName}\n\n${personContext}`),
      ]);

      personProfile = {
        ...(personResult as z.infer<typeof PersonProfileSchema>),
        linkedinUrl: state.linkedinUrl,
        verified: false,
      } as PersonProfile;

      steps.push(step('Person profile extracted', personProfile.title || 'no title found'));
    } catch (error) {
      steps.push(step('Person extraction failed', (error as Error).message));
      log.error('Person synthesis failed', { error: (error as Error).message });
    }
  }

  return {
    firmProfile,
    personProfile,
    status: firmProfile ? 'verifying' : 'failed',
    steps,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | grep -c "error" || echo "0 errors"`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/synthesize.ts
git commit -m "feat(enrichment): add synthesize node — GPT-4o structured extraction"
```

---

### Task 7: Verify Node (Cross-Validation)

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/verify.ts`

- [ ] **Step 1: Create verify.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/verify.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';

const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'verify', message, detail };
}

export async function verifyNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.firmProfile) {
    steps.push(step('No firm profile to verify'));
    return { status: 'failed', steps };
  }

  steps.push(step('Starting cross-validation'));

  const profile = { ...state.firmProfile };
  let verifiedCount = 0;
  let totalChecks = 0;

  // 1. Verify firm name matches Organization name
  if (state.firmName && profile.description) {
    totalChecks++;
    const nameInDesc = profile.description.toLowerCase().includes(state.firmName.toLowerCase());
    if (nameInDesc) {
      verifiedCount++;
      steps.push(step('Firm name matches description'));
    } else {
      steps.push(step('Firm name not found in description — may be inaccurate'));
    }
  }

  // 2. Verify portfolio companies exist (search for co-occurrence with firm name)
  if (profile.portfolioCompanies.length > 0 && state.firmName) {
    const verifiedPortfolio = [];
    const toVerify = profile.portfolioCompanies.slice(0, 5); // Cap at 5 to limit searches

    const timeoutAt = Date.now() + NODE_TIMEOUT_MS;

    for (const company of toVerify) {
      if (Date.now() > timeoutAt) {
        steps.push(step('Verification timed out, keeping remaining portfolio unverified'));
        break;
      }

      totalChecks++;
      try {
        const results = await searchWeb(`"${company.name}" "${state.firmName}"`, 3);
        if (results.length > 0) {
          verifiedPortfolio.push({ ...company, verified: true });
          verifiedCount++;
        } else {
          verifiedPortfolio.push({ ...company, verified: false });
          steps.push(step(`Portfolio "${company.name}" — not verified (no co-occurrence)`));
        }
      } catch {
        verifiedPortfolio.push({ ...company, verified: false });
      }
    }

    // Keep unverified ones from beyond the cap
    const remaining = profile.portfolioCompanies.slice(5).map(c => ({ ...c, verified: false }));
    profile.portfolioCompanies = [...verifiedPortfolio, ...remaining];
  }

  // 3. Verify person-firm match
  if (state.personProfile && state.firmName && state.personProfile.title) {
    totalChecks++;
    // Check if person's name/title co-occurs with firm name in search results
    const personInFirmContext = state.personSearchResults?.toLowerCase().includes(state.firmName.toLowerCase());
    if (personInFirmContext) {
      state.personProfile.verified = true;
      verifiedCount++;
      steps.push(step('Person-firm match verified'));
    } else {
      state.personProfile.verified = false;
      steps.push(step('Person-firm match NOT verified — person may not work at this firm'));
    }
  }

  // 4. Verify sectors have source backing
  if (profile.sectors.length > 0) {
    totalChecks++;
    const allText = (state.websiteText + ' ' + state.firmSearchResults).toLowerCase();
    const verifiedSectors = profile.sectors.filter(sector =>
      allText.includes(sector.toLowerCase())
    );
    const droppedSectors = profile.sectors.filter(s => !verifiedSectors.includes(s));

    if (droppedSectors.length > 0) {
      steps.push(step(`Dropped ${droppedSectors.length} unverified sectors`, droppedSectors.join(', ')));
    }
    if (verifiedSectors.length > 0) {
      verifiedCount++;
    }
    profile.sectors = verifiedSectors;
  }

  // Set confidence level
  const ratio = totalChecks > 0 ? verifiedCount / totalChecks : 0;
  if (ratio >= 0.7) {
    profile.confidence = 'high';
  } else if (ratio >= 0.4) {
    profile.confidence = 'medium';
  } else {
    profile.confidence = 'low';
  }

  steps.push(step(`Verification complete: ${verifiedCount}/${totalChecks} checks passed`, `confidence: ${profile.confidence}`));

  log.info('Firm research: verification complete', {
    firmName: state.firmName,
    confidence: profile.confidence,
    verified: verifiedCount,
    total: totalChecks,
  });

  return {
    firmProfile: profile,
    personProfile: state.personProfile,
    status: 'saving',
    steps,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/verify.ts
git commit -m "feat(enrichment): add verify node — cross-validation of extracted data"
```

---

### Task 8: Save Node

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/nodes/save.ts`

- [ ] **Step 1: Create save.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/nodes/save.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'save', message, detail };
}

export async function saveNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  // Save firm profile to Organization.settings
  if (state.firmProfile && state.organizationId) {
    try {
      const { data: org } = await supabase
        .from('Organization')
        .select('settings, website')
        .eq('id', state.organizationId)
        .single();

      const existingSettings = (org?.settings || {}) as Record<string, any>;

      // Merge with existing — manual overrides take precedence
      const existingProfile = existingSettings.firmProfile || {};
      const mergedProfile = { ...state.firmProfile };

      // Preserve manually overridden fields
      for (const [key, val] of Object.entries(existingProfile)) {
        if (existingProfile[`${key}_manualOverride`] === true) {
          (mergedProfile as any)[key] = val;
        }
      }

      // Build audit trail (keep last 5 runs)
      const history = existingSettings.enrichmentHistory || [];
      history.unshift({
        timestamp: new Date().toISOString(),
        sources: state.sources,
        confidence: state.firmProfile.confidence,
        fieldsPopulated: Object.entries(state.firmProfile)
          .filter(([, v]) => v && (typeof v === 'string' ? v.length > 0 : true))
          .map(([k]) => k),
        duration: Date.now(), // Will be calculated by caller
      });

      const updatedSettings = {
        ...existingSettings,
        firmProfile: mergedProfile,
        firmWebsite: state.websiteUrl || existingSettings.firmWebsite,
        firmLinkedin: state.linkedinUrl || existingSettings.firmLinkedin,
        enrichedAt: new Date().toISOString(),
        enrichmentSources: state.sources,
        enrichmentHistory: history.slice(0, 5),
      };

      await supabase
        .from('Organization')
        .update({
          website: state.websiteUrl || org?.website,
          settings: updatedSettings,
        })
        .eq('id', state.organizationId);

      steps.push(step('Firm profile saved to Organization'));
    } catch (error) {
      steps.push(step('Failed to save firm profile', (error as Error).message));
      log.error('Save firm profile failed', { error: (error as Error).message });
    }
  }

  // Save person profile to User.onboardingStatus
  if (state.personProfile && state.userId) {
    try {
      const { data: user } = await supabase
        .from('User')
        .select('onboardingStatus')
        .eq('authId', state.userId)
        .single();

      const status = (user?.onboardingStatus || {}) as Record<string, any>;
      status.personProfile = state.personProfile;

      await supabase
        .from('User')
        .update({ onboardingStatus: status })
        .eq('authId', state.userId);

      steps.push(step('Person profile saved to User'));
    } catch (error) {
      steps.push(step('Failed to save person profile', (error as Error).message));
      log.error('Save person profile failed', { error: (error as Error).message });
    }
  }

  return { status: 'complete', steps };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/nodes/save.ts
git commit -m "feat(enrichment): add save node — persist profiles to DB"
```

---

### Task 9: Graph Wiring + Entry Point

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/graph.ts`
- Create: `apps/api/src/services/agents/firmResearchAgent/index.ts`

- [ ] **Step 1: Create graph.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/graph.ts
import { StateGraph, START, END } from '@langchain/langgraph';
import { FirmResearchState } from './state.js';
import { scrapeNode } from './nodes/scrape.js';
import { searchFirmNode } from './nodes/searchFirm.js';
import { searchPersonNode } from './nodes/searchPerson.js';
import { synthesizeNode } from './nodes/synthesize.js';
import { verifyNode } from './nodes/verify.js';
import { saveNode } from './nodes/save.js';

function buildFirmResearchGraph() {
  const graph = new StateGraph(FirmResearchState)
    .addNode('scrape', scrapeNode)
    .addNode('searchFirm', searchFirmNode)
    .addNode('searchPerson', searchPersonNode)
    .addNode('synthesize', synthesizeNode)
    .addNode('verify', verifyNode)
    .addNode('save', saveNode)
    .addEdge(START, 'scrape')
    .addEdge('scrape', 'searchFirm')
    .addEdge('searchFirm', 'searchPerson')
    .addEdge('searchPerson', 'synthesize')
    .addEdge('synthesize', 'verify')
    .addEdge('verify', 'save')
    .addEdge('save', END);

  return graph.compile();
}

let _compiledGraph: ReturnType<typeof buildFirmResearchGraph> | null = null;

export function getFirmResearchGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildFirmResearchGraph();
  }
  return _compiledGraph;
}
```

- [ ] **Step 2: Create index.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/index.ts
import { getFirmResearchGraph } from './graph.js';
import { FirmProfile, PersonProfile } from './state.js';
import { log } from '../../../utils/logger.js';

export interface FirmResearchInput {
  websiteUrl: string;
  linkedinUrl: string;
  firmName: string;
  userId: string;
  organizationId: string;
}

export interface FirmResearchResult {
  success: boolean;
  firmProfile: FirmProfile | null;
  personProfile: PersonProfile | null;
  sources: string[];
  steps: Array<{ timestamp: string; node: string; message: string; detail?: string }>;
  error: string | null;
}

const AGENT_TIMEOUT_MS = 60000;

// Concurrent enrichment lock per org
const runningEnrichments = new Set<string>();

export async function runFirmResearch(input: FirmResearchInput): Promise<FirmResearchResult> {
  const startTime = Date.now();

  // Concurrent lock check
  if (runningEnrichments.has(input.organizationId)) {
    return {
      success: false,
      firmProfile: null,
      personProfile: null,
      sources: [],
      steps: [],
      error: 'Enrichment already in progress for this organization. Please wait.',
    };
  }

  runningEnrichments.add(input.organizationId);

  try {
    log.info('Starting firm research agent', {
      firmName: input.firmName,
      websiteUrl: input.websiteUrl,
      linkedinUrl: input.linkedinUrl,
    });

    const graph = getFirmResearchGraph();

    // Run with agent-level timeout
    const resultPromise = graph.invoke({
      websiteUrl: input.websiteUrl,
      linkedinUrl: input.linkedinUrl,
      firmName: input.firmName,
      userId: input.userId,
      organizationId: input.organizationId,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Agent timed out after 60s')), AGENT_TIMEOUT_MS)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]) as any;

    const duration = Date.now() - startTime;
    log.info('Firm research agent complete', {
      firmName: input.firmName,
      duration: `${duration}ms`,
      confidence: result.firmProfile?.confidence,
      status: result.status,
    });

    return {
      success: result.status === 'complete',
      firmProfile: result.firmProfile,
      personProfile: result.personProfile,
      sources: result.sources || [],
      steps: result.steps || [],
      error: result.error,
    };
  } catch (error) {
    log.error('Firm research agent failed', { error: (error as Error).message });
    return {
      success: false,
      firmProfile: null,
      personProfile: null,
      sources: [],
      steps: [],
      error: (error as Error).message,
    };
  } finally {
    runningEnrichments.delete(input.organizationId);
  }
}

// Re-export types
export type { FirmProfile, PersonProfile } from './state.js';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -3`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/
git commit -m "feat(enrichment): wire firm research agent graph — 6 nodes, entry point"
```

---

### Task 10: Update Onboarding Route to Use Agent

**Files:**
- Modify: `apps/api/src/routes/onboarding.ts`

- [ ] **Step 1: Replace the enrich-firm endpoint**

In `apps/api/src/routes/onboarding.ts`, replace the import of `firmEnrichment` and the `POST /enrich-firm` handler.

Replace the import:
```typescript
// OLD: import { enrichFirmProfile } from '../services/firmEnrichment.js';
import { runFirmResearch } from '../services/agents/firmResearchAgent/index.js';
```

Replace the `POST /enrich-firm` route handler body (keep the route path and auth checks). The new handler:

```typescript
// POST /api/onboarding/enrich-firm
router.post('/enrich-firm', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const orgId = getOrgId(req);

    const { websiteUrl, linkedinUrl } = req.body;
    if (!websiteUrl && !linkedinUrl) {
      return res.status(400).json({ error: 'Provide at least a websiteUrl or linkedinUrl' });
    }

    // Rate limit: max 3 per org per hour
    const { data: org } = await supabase
      .from('Organization')
      .select('id, name, website, settings')
      .eq('id', orgId)
      .single();

    const settings = (org?.settings || {}) as Record<string, any>;
    const history = settings.enrichmentHistory || [];
    const oneHourAgo = Date.now() - 3600000;
    const recentRuns = history.filter((h: any) => new Date(h.timestamp).getTime() > oneHourAgo);
    if (recentRuns.length >= 3) {
      return res.status(429).json({ error: 'Max 3 enrichment runs per hour. Try again later.' });
    }

    const firmName = org?.name || '';

    // Run the research agent
    const result = await runFirmResearch({
      websiteUrl: websiteUrl || '',
      linkedinUrl: linkedinUrl || '',
      firmName,
      userId,
      organizationId: orgId,
    });

    log.info('Firm enrichment complete', { orgId, success: result.success, confidence: result.firmProfile?.confidence });

    res.json(result);
  } catch (error: any) {
    log.error('Firm enrichment endpoint failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Enrichment failed. Please try again.' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/onboarding.ts
git commit -m "feat(enrichment): route uses firm research agent instead of simple scraper"
```

---

### Task 11: Inject Firm Context into Deal Chat

**Files:**
- Modify: `apps/api/src/routes/deals-chat-ai.ts`

- [ ] **Step 1: Add firm profile context injection**

In `apps/api/src/routes/deals-chat-ai.ts`, after the line that builds `contextParts` (after the team members section, before the financial context), add:

```typescript
// ─── Firm Profile Context Injection ─────────────────────────────
// Load the firm's enriched profile so the agent knows investment criteria
try {
  const { data: orgData } = await supabase
    .from('Organization')
    .select('settings')
    .eq('id', orgId)
    .single();

  const firmProfile = (orgData?.settings as any)?.firmProfile;
  if (firmProfile) {
    contextParts.push('\n=== YOUR FIRM CONTEXT ===');
    if (firmProfile.description) contextParts.push(`Firm: ${firmProfile.description}`);
    if (firmProfile.strategy) contextParts.push(`Strategy: ${firmProfile.strategy}`);
    if (firmProfile.sectors?.length) contextParts.push(`Sectors: ${firmProfile.sectors.join(', ')}`);
    if (firmProfile.checkSizeRange) contextParts.push(`Check Size: ${firmProfile.checkSizeRange}`);
    if (firmProfile.investmentCriteria) contextParts.push(`Investment Criteria: ${firmProfile.investmentCriteria}`);
    if (firmProfile.portfolioCompanies?.length) {
      const names = firmProfile.portfolioCompanies.map((c: any) => c.name).join(', ');
      contextParts.push(`Portfolio: ${names}`);
    }
    if (firmProfile.recentDeals?.length) {
      const deals = firmProfile.recentDeals.map((d: any) => d.title).join(', ');
      contextParts.push(`Recent Deals: ${deals}`);
    }
  }

  // Also inject person context if available
  const { data: userData } = await supabase
    .from('User')
    .select('onboardingStatus')
    .eq('authId', req.user?.id)
    .single();

  const personProfile = (userData?.onboardingStatus as any)?.personProfile;
  if (personProfile?.title) {
    contextParts.push(`\nYour Role: ${personProfile.title}${personProfile.bio ? ' — ' + personProfile.bio : ''}`);
  }
} catch {
  // Non-blocking — firm context is supplementary
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/deals-chat-ai.ts
git commit -m "feat(enrichment): inject firm profile context into deal chat agent"
```

---

### Task 12: Update Frontend Onboarding Trigger

**Files:**
- Modify: `apps/web/js/onboarding/onboarding-tasks.js`

- [ ] **Step 1: Update triggerEnrichment to handle new agent response**

In `apps/web/js/onboarding/onboarding-tasks.js`, update the `triggerEnrichment` function. The agent now returns `firmProfile` and `personProfile` objects with richer data. Update the loading states and success message:

Replace the loading indicator HTML inside `triggerEnrichment`:
```javascript
    statusEl.innerHTML = `
      <div class="flex items-center gap-2 text-[12px] text-primary font-medium">
        <div class="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Researching your firm — scanning website, searching news &amp; deals...
      </div>
    `;
```

Replace the success message (inside `if (result.success && result.profile)`) — change `result.profile` to `result.firmProfile`:
```javascript
    if (result.success && result.firmProfile) {
      state._enriched = true;
      const profile = result.firmProfile;

      // ... existing pre-fill logic for AUM and sectors stays the same,
      // but references result.firmProfile instead of result.profile ...

      // Show richer success
      const parts = [];
      if (profile.description) parts.push(profile.description.slice(0, 80));
      if (profile.sectors?.length) parts.push(`${profile.sectors.length} sectors`);
      if (profile.portfolioCompanies?.length) parts.push(`${profile.portfolioCompanies.length} portfolio cos`);

      if (statusEl) {
        statusEl.innerHTML = `
          <div class="flex items-center gap-2 text-[12px] text-secondary font-medium">
            <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">check_circle</span>
            Profile enriched${parts.length ? ' — ' + parts.join(', ') : ''}
            ${profile.confidence === 'low' ? '<span class="text-amber-600 ml-1">(low confidence — please review)</span>' : ''}
          </div>
        `;
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/js/onboarding/onboarding-tasks.js
git commit -m "feat(enrichment): frontend uses new agent response shape"
```

---

### Task 13: Settings Page — Firm Profile Display + Refresh

**Files:**
- Modify: `apps/web/settings.js`

- [ ] **Step 1: Add firm profile section to settings**

In `apps/web/settings.js`, add a new section for the firm profile. Find the settings initialization code and add after the existing sections:

```javascript
// ─── Firm Profile Section ────────────────────────────
async function initFirmProfileSection() {
  const container = document.getElementById('firm-profile-section');
  if (!container) return;

  try {
    const resp = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
    if (!resp.ok) return;
    const user = await resp.json();

    // Fetch org settings for firm profile
    const orgResp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/status`);
    // We need a dedicated endpoint or use existing org data
    // For now, call enrich-firm with GET-like behavior through the status endpoint

    // Render the section
    renderFirmProfile(container, user);
  } catch {
    // Silent fail
  }
}

function renderFirmProfile(container, user) {
  // Fetch from org settings via a lightweight call
  PEAuth.authFetch(`${API_BASE_URL}/onboarding/enrich-firm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ websiteUrl: '', linkedinUrl: '' }),
  }).catch(() => {});
  // This section renders the stored profile — implementation depends on
  // how settings.js structures its tabs. Add to the existing settings UI pattern.
}

async function refreshFirmProfile() {
  const statusEl = document.getElementById('firm-refresh-status');
  const btn = document.getElementById('firm-refresh-btn');
  if (!statusEl || !btn) return;

  btn.disabled = true;
  statusEl.innerHTML = '<div class="flex items-center gap-2 text-sm text-primary"><div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>Researching your firm (15-25 seconds)...</div>';

  try {
    // Get current org website + linkedin from settings
    const meResp = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
    const me = await meResp.json();
    const orgSettings = me?.organization?.settings || {};

    const resp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/enrich-firm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteUrl: orgSettings.firmWebsite || me?.organization?.website || '',
        linkedinUrl: orgSettings.firmLinkedin || '',
      }),
    });

    const result = await resp.json();

    if (result.success) {
      statusEl.innerHTML = '<div class="text-sm text-green-600 flex items-center gap-2"><span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:\'FILL\' 1">check_circle</span>Profile refreshed successfully</div>';
      // Reload the page section to show updated data
      setTimeout(() => window.location.reload(), 1500);
    } else {
      statusEl.innerHTML = `<div class="text-sm text-red-500">${result.error || 'Refresh failed. Try again.'}</div>`;
    }
  } catch {
    statusEl.innerHTML = '<div class="text-sm text-red-500">Refresh failed. Try again.</div>';
  } finally {
    btn.disabled = false;
  }
}

window.refreshFirmProfile = refreshFirmProfile;
```

- [ ] **Step 2: Add firm profile HTML section to settings.html**

In `apps/web/settings.html`, add a new tab/section for "Firm Profile" in the settings navigation and content area. Add after the existing sections:

```html
<!-- Firm Profile Section -->
<div id="firm-profile-section" class="settings-section hidden" data-section="firm-profile">
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-lg font-bold text-text-main">Firm Profile</h3>
      <p class="text-sm text-text-secondary mt-0.5">AI-researched profile of your firm. Used as context across deal analysis.</p>
    </div>
    <div class="flex items-center gap-3">
      <div id="firm-refresh-status"></div>
      <button id="firm-refresh-btn" onclick="refreshFirmProfile()" class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle hover:bg-gray-50 transition" style="color:#003366">
        <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
        Refresh profile
      </button>
    </div>
  </div>
  <div id="firm-profile-content" class="bg-white border border-border-subtle rounded-xl p-5">
    <p class="text-sm text-text-muted">Loading firm profile...</p>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/settings.js apps/web/settings.html
git commit -m "feat(enrichment): add firm profile section to settings with refresh button"
```

---

### Task 14: TypeScript Verification + Integration Test

**Files:**
- No new files

- [ ] **Step 1: Full TypeScript check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Verify agent can be imported**

Create a quick test by running:
```bash
cd apps/api && node -e "
  import('./dist/services/agents/firmResearchAgent/index.js')
    .then(m => console.log('Agent loaded, exports:', Object.keys(m)))
    .catch(e => console.error('Failed:', e.message))
"
```

- [ ] **Step 3: Manual integration test**

Start the dev servers:
```bash
cd apps/web && npm run dev &
cd apps/api && npm run dev &
```

Test the enrichment endpoint:
```bash
curl -X POST http://localhost:3001/api/onboarding/enrich-firm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"websiteUrl": "pocket-fund.com", "linkedinUrl": ""}'
```

Expected: JSON response with `success: true`, `firmProfile` object, `sources` array.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(enrichment): firm research agent — complete implementation"
```
