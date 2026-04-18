# Deep Research Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phase 2 background deep research to the firm research agent — GPT-4o generates follow-up queries from Phase 1 results, follows threads, and builds a comprehensive profile that updates live on the completion screen.

**Architecture:** Phase 2 runs as a fire-and-forget async function after Phase 1 returns. GPT-4o generates 8-12 targeted search queries, executes them via DuckDuckGo Lite, follows threads (keyword extraction for new names → follow-up searches), scrapes high-value URLs, then merges into an enriched profile. Frontend polls `/research-status` every 5s and shows a slide-in notification when complete.

**Tech Stack:** GPT-4o (via existing llm.ts), DuckDuckGo Lite (existing webSearch.ts), Zod, Supabase JSONB

**Spec:** `docs/superpowers/specs/2026-04-19-deep-research-agent-design.md`

---

### Task 1: Update State Types for Phase 2 Fields

**Files:**
- Modify: `apps/api/src/services/agents/firmResearchAgent/state.ts`

- [ ] **Step 1: Add Phase 2 fields to FirmProfile and PersonProfile interfaces**

In `apps/api/src/services/agents/firmResearchAgent/state.ts`, add the Phase 2 fields to the existing interfaces.

Add to `FirmProfile` interface (after `sources: string[]`):

```typescript
  // Phase 2 deep research additions
  socialPresence?: {
    twitter?: string;
    youtube?: string;
    newsletter?: string;
    podcast?: string;
    blog?: string;
  };
  pressArticles?: Array<{
    title: string;
    url: string;
    date: string;
    summary: string;
  }>;
  communityMentions?: string[];
  coInvestors?: string[];
  competitorFirms?: string[];
  deepResearchComplete?: boolean;
  deepResearchCompletedAt?: string;
  deepResearchInsightsCount?: number;
```

Add to `PersonProfile` interface (after `verified: boolean`):

```typescript
  // Phase 2 deep research additions
  socialHandles?: {
    twitter?: string;
    youtube?: string;
    github?: string;
    blog?: string;
  };
  interviews?: Array<{
    title: string;
    url: string;
    platform: string;
  }>;
  publicContent?: string[];
  networkConnections?: string[];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -3`
Expected: No errors (these are optional fields, won't break existing code)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/state.ts
git commit -m "feat(enrichment): add Phase 2 deep research fields to profile types"
```

---

### Task 2: Create Deep Research Module

**Files:**
- Create: `apps/api/src/services/agents/firmResearchAgent/deepResearch.ts`

- [ ] **Step 1: Create deepResearch.ts**

```typescript
// apps/api/src/services/agents/firmResearchAgent/deepResearch.ts
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FirmProfile, PersonProfile } from './state.js';
import { getChatModel } from '../../llm.js';
import { searchWeb } from '../../webSearch.js';
import { scrapePageText } from '../../companyResearcher.js';
import { supabase } from '../../../supabase.js';
import { log } from '../../../utils/logger.js';

const PHASE2_TIMEOUT_MS = 120000;
const MAX_PRIMARY_QUERIES = 12;
const MAX_FOLLOWUP_QUERIES = 6;
const MAX_URL_SCRAPES = 3;

// ==========================================
// Types
// ==========================================

interface GeneratedQuery {
  query: string;
  category: string;
  reason: string;
}

export interface DeepResearchInput {
  phase1Profile: FirmProfile | null;
  phase1PersonProfile: PersonProfile | null;
  websiteUrl: string;
  linkedinUrl: string;
  firmName: string;
  userId: string;
  organizationId: string;
}

interface DeepResearchProgress {
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  completedAt?: string;
  queriesRun: number;
  insightsFound: number;
  error?: string;
}

// ==========================================
// Query Generation (GPT-4o)
// ==========================================

const QuerySchema = z.array(z.object({
  query: z.string(),
  category: z.enum(['person', 'deals', 'portfolio', 'reputation', 'social', 'network']),
  reason: z.string(),
}));

async function generateQueries(
  firmProfile: FirmProfile | null,
  personProfile: PersonProfile | null,
): Promise<GeneratedQuery[]> {
  const model = getChatModel(0.3, 1500);
  const structuredModel = model.withStructuredOutput(QuerySchema);

  const systemPrompt = `You are a PE research analyst. Based on an initial scan of a firm, generate 8-12 targeted DuckDuckGo search queries to find DEEPER information.

Focus on:
1. The person's public presence (interviews, podcasts, talks, social media)
2. Specific deal history (acquisitions, exits, deal sizes)
3. Each portfolio company (what they do, when acquired)
4. Firm reputation (press articles, reviews, rankings)
5. Social presence (Twitter, YouTube, newsletters, blogs)
6. Network (co-investors, community involvement, LPs)

Rules:
- Use exact names and handles found in the initial scan (don't guess)
- Combine terms for specificity: "name" + "firm" + "topic"
- Use site: operator for specific platforms (site:twitter.com, site:crunchbase.com)
- Generate diverse queries across all 6 categories
- Don't repeat generic queries like "firm name private equity"`;

  const userPrompt = `Initial scan results:

FIRM PROFILE:
${JSON.stringify(firmProfile, null, 2)}

PERSON PROFILE:
${JSON.stringify(personProfile, null, 2)}

Generate 8-12 targeted follow-up search queries.`;

  try {
    const result = await structuredModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return (result as GeneratedQuery[]).slice(0, MAX_PRIMARY_QUERIES);
  } catch (error) {
    log.error('Deep research: query generation failed', { error: (error as Error).message });
    return [];
  }
}

// ==========================================
// Follow-the-Thread: Extract New Names
// ==========================================

function extractNewNames(
  snippets: string,
  knownNames: Set<string>,
): string[] {
  // Find capitalized multi-word phrases (likely company/person names)
  const matches = snippets.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];

  // Count occurrences
  const counts = new Map<string, number>();
  for (const name of matches) {
    const lower = name.toLowerCase();
    if (knownNames.has(lower)) continue;
    if (name.length < 5 || name.length > 50) continue;
    // Skip common phrases
    if (['United States', 'New York', 'San Francisco', 'Private Equity', 'Managing Director',
         'Vice President', 'Chief Executive', 'Read More', 'Learn More', 'Terms Service',
         'Privacy Policy', 'All Rights'].some(skip => name.includes(skip))) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  // Return names that appear 2+ times (likely significant)
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
}

// ==========================================
// URL Value Scoring
// ==========================================

function isHighValueUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  // High value: articles, Crunchbase, AngelList, press
  if (lower.includes('crunchbase.com')) return true;
  if (lower.includes('pitchbook.com')) return true;
  if (lower.includes('angellist.com') || lower.includes('wellfound.com')) return true;
  if (lower.includes('techcrunch.com')) return true;
  if (lower.includes('forbes.com')) return true;
  if (lower.includes('bloomberg.com')) return true;
  if (lower.includes('/blog/') || lower.includes('/news/') || lower.includes('/press/')) return true;
  if (lower.includes('/article/') || lower.includes('/story/')) return true;
  // Skip: social media feeds, search pages, PDFs
  if (lower.includes('twitter.com') || lower.includes('x.com')) return false;
  if (lower.includes('facebook.com')) return false;
  if (lower.includes('google.com')) return false;
  if (lower.endsWith('.pdf')) return false;
  return false;
}

// ==========================================
// Final Synthesis (Merge Phase 1 + Phase 2)
// ==========================================

const EnrichedFirmSchema = z.object({
  socialPresence: z.object({
    twitter: z.string().default(''),
    youtube: z.string().default(''),
    newsletter: z.string().default(''),
    podcast: z.string().default(''),
    blog: z.string().default(''),
  }).default({}),
  pressArticles: z.array(z.object({
    title: z.string(),
    url: z.string().default(''),
    date: z.string().default(''),
    summary: z.string().default(''),
  })).default([]),
  communityMentions: z.array(z.string()).default([]),
  coInvestors: z.array(z.string()).default([]),
  competitorFirms: z.array(z.string()).default([]),
  newPortfolioCompanies: z.array(z.object({
    name: z.string(),
    sector: z.string().default(''),
    status: z.string().default('active'),
  })).default([]),
  newRecentDeals: z.array(z.object({
    title: z.string(),
    date: z.string().default(''),
    source: z.string().default(''),
  })).default([]),
  additionalSectors: z.array(z.string()).default([]),
});

const EnrichedPersonSchema = z.object({
  socialHandles: z.object({
    twitter: z.string().default(''),
    youtube: z.string().default(''),
    github: z.string().default(''),
    blog: z.string().default(''),
  }).default({}),
  interviews: z.array(z.object({
    title: z.string(),
    url: z.string().default(''),
    platform: z.string().default(''),
  })).default([]),
  publicContent: z.array(z.string()).default([]),
  networkConnections: z.array(z.string()).default([]),
});

async function synthesizePhase2(
  allSnippets: string,
  scrapedContent: string,
  firmProfile: FirmProfile | null,
  personProfile: PersonProfile | null,
): Promise<{ firm: z.infer<typeof EnrichedFirmSchema>; person: z.infer<typeof EnrichedPersonSchema> }> {
  const model = getChatModel(0.1, 2000);

  const systemPrompt = `You are a PE research analyst. Extract NEW information found in deep research results that was NOT in the initial profile. Only include facts that are clearly stated in the source text. Do not guess.`;

  const context = [
    `=== INITIAL FIRM PROFILE (already known — do NOT repeat) ===\n${JSON.stringify(firmProfile, null, 2)}`,
    `=== INITIAL PERSON PROFILE (already known — do NOT repeat) ===\n${JSON.stringify(personProfile, null, 2)}`,
    `=== DEEP RESEARCH RESULTS ===\n${allSnippets.slice(0, 10000)}`,
    scrapedContent ? `=== SCRAPED ARTICLES ===\n${scrapedContent.slice(0, 5000)}` : '',
  ].filter(Boolean).join('\n\n');

  // Extract firm additions
  let firm: z.infer<typeof EnrichedFirmSchema>;
  try {
    const firmModel = model.withStructuredOutput(EnrichedFirmSchema);
    firm = await firmModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Extract NEW firm-level information (social presence, press articles, community mentions, co-investors, competitors, new portfolio companies, new deals, additional sectors):\n\n${context}`),
    ]) as z.infer<typeof EnrichedFirmSchema>;
  } catch {
    firm = EnrichedFirmSchema.parse({});
  }

  // Extract person additions
  let person: z.infer<typeof EnrichedPersonSchema>;
  try {
    const personModel = model.withStructuredOutput(EnrichedPersonSchema);
    person = await personModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Extract NEW person-level information (social handles, interviews/podcasts, public content, network connections):\n\n${context}`),
    ]) as z.infer<typeof EnrichedPersonSchema>;
  } catch {
    person = EnrichedPersonSchema.parse({});
  }

  return { firm, person };
}

// ==========================================
// Count New Insights
// ==========================================

function countInsights(
  firm: z.infer<typeof EnrichedFirmSchema>,
  person: z.infer<typeof EnrichedPersonSchema>,
): number {
  let count = 0;
  const sp = firm.socialPresence;
  if (sp.twitter) count++;
  if (sp.youtube) count++;
  if (sp.newsletter) count++;
  if (sp.podcast) count++;
  if (sp.blog) count++;
  count += firm.pressArticles.length;
  count += firm.communityMentions.length;
  count += firm.coInvestors.length;
  count += firm.competitorFirms.length;
  count += firm.newPortfolioCompanies.length;
  count += firm.newRecentDeals.length;
  count += firm.additionalSectors.length;
  const sh = person.socialHandles;
  if (sh.twitter) count++;
  if (sh.youtube) count++;
  if (sh.github) count++;
  if (sh.blog) count++;
  count += person.interviews.length;
  count += person.publicContent.length;
  count += person.networkConnections.length;
  return count;
}

// ==========================================
// Save Phase 2 Progress
// ==========================================

async function updateProgress(orgId: string, progress: DeepResearchProgress): Promise<void> {
  if (!orgId) return;
  try {
    const { data: org } = await supabase
      .from('Organization')
      .select('settings')
      .eq('id', orgId)
      .single();
    const settings = (org?.settings || {}) as Record<string, any>;
    settings.deepResearch = progress;
    await supabase.from('Organization').update({ settings }).eq('id', orgId);
  } catch (error) {
    log.warn('Deep research: failed to update progress', { error: (error as Error).message });
  }
}

// ==========================================
// Main: runDeepResearch
// ==========================================

export async function runDeepResearch(input: DeepResearchInput): Promise<void> {
  const startedAt = new Date().toISOString();
  let queriesRun = 0;

  // Set initial progress
  await updateProgress(input.organizationId, {
    status: 'running', startedAt, queriesRun: 0, insightsFound: 0,
  });

  const timeoutAt = Date.now() + PHASE2_TIMEOUT_MS;

  try {
    log.info('Deep research Phase 2 started', { firmName: input.firmName });

    // 1. Generate queries from Phase 1 results
    const queries = await generateQueries(input.phase1Profile, input.phase1PersonProfile);
    if (queries.length === 0) {
      log.warn('Deep research: no queries generated');
      await updateProgress(input.organizationId, {
        status: 'complete', startedAt, queriesRun: 0, insightsFound: 0,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    log.info('Deep research: generated queries', { count: queries.length, categories: queries.map(q => q.category) });

    // Build set of known names (to detect new ones)
    const knownNames = new Set<string>();
    if (input.firmName) knownNames.add(input.firmName.toLowerCase());
    if (input.phase1Profile) {
      for (const pc of input.phase1Profile.portfolioCompanies || []) {
        knownNames.add(pc.name.toLowerCase());
      }
    }

    // 2. Execute queries + follow threads
    let allSnippets = '';
    let followUpsUsed = 0;
    const highValueUrls: string[] = [];

    for (const q of queries) {
      if (Date.now() > timeoutAt) {
        log.warn('Deep research: timeout reached during query execution');
        break;
      }

      try {
        const results = await searchWeb(q.query, 5);
        queriesRun++;

        if (results.length > 0) {
          allSnippets += `\n--- ${q.category.toUpperCase()}: ${q.query} ---\n`;
          for (const r of results) {
            allSnippets += `${r.title}\n${r.snippet}\nURL: ${r.url}\n\n`;
            // Collect high-value URLs for scraping
            if (isHighValueUrl(r.url) && highValueUrls.length < MAX_URL_SCRAPES) {
              highValueUrls.push(r.url);
            }
          }

          // Follow-the-thread: look for new names
          if (followUpsUsed < MAX_FOLLOWUP_QUERIES) {
            const batchText = results.map(r => `${r.title} ${r.snippet}`).join(' ');
            const newNames = extractNewNames(batchText, knownNames);

            for (const name of newNames) {
              if (followUpsUsed >= MAX_FOLLOWUP_QUERIES) break;
              if (Date.now() > timeoutAt) break;

              const followUpQuery = `"${name}" "${input.firmName}"`;
              const followUpResults = await searchWeb(followUpQuery, 3);
              queriesRun++;
              followUpsUsed++;

              if (followUpResults.length > 0) {
                allSnippets += `\n--- FOLLOW-UP: ${followUpQuery} ---\n`;
                for (const r of followUpResults) {
                  allSnippets += `${r.title}\n${r.snippet}\nURL: ${r.url}\n\n`;
                }
                knownNames.add(name.toLowerCase());
              }

              log.info('Deep research: follow-up', { name, results: followUpResults.length });
            }
          }
        }
      } catch (error) {
        log.warn('Deep research: query failed', { query: q.query, error: (error as Error).message });
      }

      // Update progress periodically
      if (queriesRun % 4 === 0) {
        await updateProgress(input.organizationId, {
          status: 'running', startedAt, queriesRun, insightsFound: 0,
        });
      }
    }

    // 3. Scrape high-value URLs
    let scrapedContent = '';
    for (const url of highValueUrls) {
      if (Date.now() > timeoutAt) break;
      try {
        const text = await scrapePageText(url);
        if (text && text.length > 200) {
          scrapedContent += `\n=== ARTICLE: ${url} ===\n${text.slice(0, 3000)}\n`;
        }
      } catch {
        // Skip failed scrapes
      }
    }

    // 4. Final synthesis — merge Phase 1 + Phase 2
    const { firm: firmAdditions, person: personAdditions } = await synthesizePhase2(
      allSnippets, scrapedContent, input.phase1Profile, input.phase1PersonProfile,
    );

    const insightsCount = countInsights(firmAdditions, personAdditions);
    log.info('Deep research: synthesis complete', { insightsCount, queriesRun });

    // 5. Merge into existing Organization.settings.firmProfile
    if (input.organizationId) {
      try {
        const { data: org } = await supabase
          .from('Organization')
          .select('settings')
          .eq('id', input.organizationId)
          .single();

        const settings = (org?.settings || {}) as Record<string, any>;
        const existingProfile = settings.firmProfile || {};

        // Merge Phase 2 additions — never overwrite Phase 1 fields
        const mergedProfile: Record<string, any> = { ...existingProfile };
        mergedProfile.socialPresence = firmAdditions.socialPresence;
        mergedProfile.pressArticles = firmAdditions.pressArticles.slice(0, 5);
        mergedProfile.communityMentions = firmAdditions.communityMentions;
        mergedProfile.coInvestors = firmAdditions.coInvestors;
        mergedProfile.competitorFirms = firmAdditions.competitorFirms;
        mergedProfile.deepResearchComplete = true;
        mergedProfile.deepResearchCompletedAt = new Date().toISOString();
        mergedProfile.deepResearchInsightsCount = insightsCount;

        // Enrich arrays (add new items, don't duplicate)
        const existingPortfolioNames = new Set(
          (existingProfile.portfolioCompanies || []).map((c: any) => c.name.toLowerCase())
        );
        for (const pc of firmAdditions.newPortfolioCompanies) {
          if (!existingPortfolioNames.has(pc.name.toLowerCase())) {
            mergedProfile.portfolioCompanies = [...(mergedProfile.portfolioCompanies || []), { ...pc, verified: false }];
          }
        }

        const existingDealTitles = new Set(
          (existingProfile.recentDeals || []).map((d: any) => d.title.toLowerCase())
        );
        for (const deal of firmAdditions.newRecentDeals) {
          if (!existingDealTitles.has(deal.title.toLowerCase())) {
            mergedProfile.recentDeals = [...(mergedProfile.recentDeals || []), deal];
          }
        }

        // Add new sectors without duplicating
        if (firmAdditions.additionalSectors.length > 0) {
          const existingSectors = new Set((mergedProfile.sectors || []).map((s: string) => s.toLowerCase()));
          for (const sector of firmAdditions.additionalSectors) {
            if (!existingSectors.has(sector.toLowerCase())) {
              mergedProfile.sectors = [...(mergedProfile.sectors || []), sector];
            }
          }
        }

        settings.firmProfile = mergedProfile;

        // Merge person profile additions
        const existingPerson = settings.firmProfile ? null : null; // person is on User, not org
        settings.deepResearch = {
          status: 'complete',
          startedAt,
          completedAt: new Date().toISOString(),
          queriesRun,
          insightsFound: insightsCount,
        };

        await supabase.from('Organization').update({ settings }).eq('id', input.organizationId);
      } catch (error) {
        log.error('Deep research: failed to save firm profile', { error: (error as Error).message });
      }
    }

    // 6. Save person profile additions to User
    if (input.userId && (personAdditions.interviews.length > 0 || personAdditions.socialHandles.twitter)) {
      try {
        const { data: user } = await supabase
          .from('User')
          .select('onboardingStatus')
          .eq('authId', input.userId)
          .single();

        const status = (user?.onboardingStatus || {}) as Record<string, any>;
        const existingPerson = status.personProfile || {};
        status.personProfile = {
          ...existingPerson,
          socialHandles: personAdditions.socialHandles,
          interviews: personAdditions.interviews.slice(0, 5),
          publicContent: personAdditions.publicContent.slice(0, 10),
          networkConnections: personAdditions.networkConnections.slice(0, 10),
        };

        await supabase.from('User').update({ onboardingStatus: status }).eq('authId', input.userId);
      } catch (error) {
        log.error('Deep research: failed to save person profile', { error: (error as Error).message });
      }
    }

    log.info('Deep research Phase 2 complete', {
      firmName: input.firmName,
      queriesRun,
      insightsFound: insightsCount,
      duration: `${Date.now() - new Date(startedAt).getTime()}ms`,
    });

  } catch (error) {
    log.error('Deep research Phase 2 failed', { error: (error as Error).message });
    await updateProgress(input.organizationId, {
      status: 'failed', startedAt, queriesRun,
      insightsFound: 0, error: (error as Error).message,
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/deepResearch.ts
git commit -m "feat(enrichment): add Phase 2 deep research module — query gen, follow threads, merge"
```

---

### Task 3: Export runDeepResearch from Agent Index

**Files:**
- Modify: `apps/api/src/services/agents/firmResearchAgent/index.ts`

- [ ] **Step 1: Add export for runDeepResearch and DeepResearchInput**

At the top of `apps/api/src/services/agents/firmResearchAgent/index.ts`, add the import:

```typescript
export { runDeepResearch } from './deepResearch.js';
export type { DeepResearchInput } from './deepResearch.js';
```

Add this after the existing `export type { FirmProfile, PersonProfile }` line at the bottom of the file.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/agents/firmResearchAgent/index.ts
git commit -m "feat(enrichment): export runDeepResearch from agent index"
```

---

### Task 4: Update Onboarding Route — Fire Phase 2 + Research Status Endpoint

**Files:**
- Modify: `apps/api/src/routes/onboarding.ts`

- [ ] **Step 1: Add runDeepResearch import**

In `apps/api/src/routes/onboarding.ts`, update the import from:
```typescript
import { runFirmResearch } from '../services/agents/firmResearchAgent/index.js';
```
to:
```typescript
import { runFirmResearch, runDeepResearch } from '../services/agents/firmResearchAgent/index.js';
```

- [ ] **Step 2: Fire Phase 2 after Phase 1 returns**

In the `POST /enrich-firm` handler, after `res.json(result);`, add the Phase 2 background fire:

```typescript
    res.json(result);

    // Fire Phase 2 deep research in background (not awaited)
    if (result.success && result.firmProfile && (websiteUrl || linkedinUrl)) {
      runDeepResearch({
        phase1Profile: result.firmProfile,
        phase1PersonProfile: result.personProfile,
        websiteUrl: websiteUrl || '',
        linkedinUrl: linkedinUrl || '',
        firmName,
        userId,
        organizationId: orgId,
      }).catch(err => log.error('Deep research background task failed', { error: err.message }));
    }
```

**Important:** This code goes AFTER `res.json(result)` — the response is already sent, Phase 2 runs in the background.

- [ ] **Step 3: Add GET /research-status endpoint**

Before the `export default router;` line, add:

```typescript
// GET /api/onboarding/research-status
// Polled by frontend to check Phase 2 deep research progress
router.get('/research-status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.json({ phase: 1, status: 'complete', newInsightsCount: 0 });

    let orgId: string = req.user?.organizationId || '';
    if (!orgId) {
      const { data: userData } = await supabase
        .from('User')
        .select('organizationId')
        .eq('authId', userId)
        .single();
      orgId = userData?.organizationId || '';
    }
    if (!orgId) {
      return res.json({ phase: 1, status: 'complete', newInsightsCount: 0 });
    }

    const { data: org } = await supabase
      .from('Organization')
      .select('settings')
      .eq('id', orgId)
      .single();

    const settings = (org?.settings || {}) as Record<string, any>;
    const deepResearch = settings.deepResearch;

    if (!deepResearch) {
      return res.json({ phase: 1, status: 'complete', newInsightsCount: 0 });
    }

    res.json({
      phase: 2,
      status: deepResearch.status,
      newInsightsCount: deepResearch.insightsFound || 0,
      completedAt: deepResearch.completedAt || null,
    });
  } catch (error: any) {
    log.error('Research status check failed', { error: error.message });
    res.json({ phase: 1, status: 'complete', newInsightsCount: 0 });
  }
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/onboarding.ts
git commit -m "feat(enrichment): fire Phase 2 in background + add /research-status endpoint"
```

---

### Task 5: Frontend — Poll for Phase 2 + Live Notification

**Files:**
- Modify: `apps/web/js/onboarding/onboarding-flow.js`

- [ ] **Step 1: Add Phase 2 polling and notification functions**

In `apps/web/js/onboarding/onboarding-flow.js`, add these functions before the `// Confetti` section:

```javascript
  // ==========================================
  // Phase 2 Deep Research Polling
  // ==========================================

  let _pollInterval = null;
  let _pollCount = 0;
  const MAX_POLLS = 36; // 3 minutes at 5s intervals

  function startDeepResearchPolling() {
    if (_pollInterval) return;
    _pollCount = 0;

    _pollInterval = setInterval(async () => {
      _pollCount++;
      if (_pollCount > MAX_POLLS) {
        stopDeepResearchPolling();
        return;
      }

      try {
        const resp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/research-status`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (data.phase === 2 && data.status === 'complete') {
          stopDeepResearchPolling();
          showDeepResearchNotification(data.newInsightsCount);
        }
      } catch {
        // Silent — polling is best-effort
      }
    }, 5000);
  }

  function stopDeepResearchPolling() {
    if (_pollInterval) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }
  }

  function showDeepResearchNotification(insightsCount) {
    if (insightsCount === 0) return;

    const cta = $('completion-cta');
    if (!cta || cta.classList.contains('hidden')) {
      // User hasn't reached completion screen yet — show on next load
      return;
    }

    // Create slide-in notification at top of completion CTA
    const notification = document.createElement('div');
    notification.id = 'deep-research-notification';
    notification.style.cssText = 'animation: slideDown 300ms ease-out both; margin-bottom: 12px;';
    notification.innerHTML = `
      <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary-light/40">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-white" style="font-size:16px;font-variation-settings:'FILL' 1">auto_awesome</span>
          </div>
          <div>
            <div class="text-[13px] font-semibold text-text-main flex items-center gap-2">
              Your AI analyst found ${insightsCount} more insight${insightsCount > 1 ? 's' : ''} about your firm
              <span class="pulse-dot"></span>
            </div>
            <button id="deep-research-view" class="text-[12px] text-primary font-medium hover:underline mt-0.5">View full profile</button>
          </div>
        </div>
        <button id="deep-research-dismiss" class="text-text-muted hover:text-text-main p-1">
          <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
      </div>
    `;

    // Add animation keyframe if not already present
    if (!document.getElementById('slide-down-style')) {
      const style = document.createElement('style');
      style.id = 'slide-down-style';
      style.textContent = '@keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }';
      document.head.appendChild(style);
    }

    // Insert at top of completion CTA
    cta.insertBefore(notification, cta.firstChild);

    // Bind dismiss
    const dismissBtn = document.getElementById('deep-research-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => notification.remove());
    }

    // Bind "View full profile" — reload findings
    const viewBtn = document.getElementById('deep-research-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => {
        notification.remove();
        loadCompletionFindings(); // Reload with enriched data
      });
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'fadeIn 200ms ease reverse both';
        setTimeout(() => notification.remove(), 200);
      }
    }, 8000);
  }
```

- [ ] **Step 2: Start polling when enrichment triggers**

In the `triggerEnrichment` function in `onboarding-tasks.js`, we need to start polling after Phase 1 completes. But since `triggerEnrichment` is in `onboarding-tasks.js` and polling is in `onboarding-flow.js`, expose a global function.

At the end of the polling section in `onboarding-flow.js`, add:

```javascript
  // Expose for onboarding-tasks.js to trigger
  window._startDeepResearchPolling = startDeepResearchPolling;
```

- [ ] **Step 3: Trigger polling from onboarding-tasks.js**

In `apps/web/js/onboarding/onboarding-tasks.js`, inside the `triggerEnrichment` function, after `state._enrichmentResult = result;`, add:

```javascript
      // Start polling for Phase 2 deep research
      if (window._startDeepResearchPolling) window._startDeepResearchPolling();
```

- [ ] **Step 4: Also start polling when completion screen loads**

In `onboarding-flow.js`, inside the `loadCompletionFindings` function, add at the end (before the closing `}`):

```javascript
    // Start polling for Phase 2 if not already running
    startDeepResearchPolling();
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/js/onboarding/onboarding-flow.js apps/web/js/onboarding/onboarding-tasks.js
git commit -m "feat(enrichment): frontend polls Phase 2 + slide-in notification on completion"
```

---

### Task 6: TypeScript Verification + Restart

**Files:**
- No new files

- [ ] **Step 1: Full TypeScript check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Check file sizes**

Run: `wc -l apps/api/src/services/agents/firmResearchAgent/deepResearch.ts apps/web/js/onboarding/onboarding-flow.js apps/web/js/onboarding/onboarding-tasks.js`
Expected: All under 500 lines

- [ ] **Step 3: Restart servers and test**

```bash
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null
cd apps/web && npm run dev &
cd apps/api && npm run dev &
```

- [ ] **Step 4: Manual test**

1. Go to `/onboarding.html`
2. Enter a firm website URL, tab out
3. See Phase 1 preview card appear (~15s)
4. Click "Use this profile"
5. Complete remaining tasks
6. On completion screen, wait 30-60s
7. Phase 2 notification should slide in: "Your AI analyst found N more insights"
8. Click "View full profile" — findings section updates with deeper data

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(enrichment): deep research agent — Phase 2 background research complete"
```
