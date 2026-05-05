// apps/api/src/services/agents/firmResearchAgent/deepResearch.ts
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FirmProfile, PersonProfile } from './state.js';
import { getChatModel } from '../../llm.js';
import { searchWeb } from '../../webSearch.js';
import { scrapePageText } from '../../companyResearcher.js';
import { supabase } from '../../../supabase.js';
import { log } from '../../../utils/logger.js';
import { isHighValueUrl } from '../../../utils/urlHelpers.js';

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
  const model = getChatModel(0.3, 1500, 'firm_research');
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
  const model = getChatModel(0.1, 2000, 'firm_research');

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

    // 2. Execute queries in parallel batches + follow threads
    let allSnippets = '';
    let followUpsUsed = 0;
    const highValueUrls: string[] = [];
    const batchSize = 3;

    for (let i = 0; i < queries.length; i += batchSize) {
      if (Date.now() > timeoutAt) {
        log.warn('Deep research: timeout reached during query execution');
        break;
      }

      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (q) => {
          try {
            const results = await searchWeb(q.query, 5);
            return { q, results };
          } catch (error) {
            log.warn('Deep research: query failed', { query: q.query, error: (error as Error).message });
            return { q, results: [] as Awaited<ReturnType<typeof searchWeb>> };
          }
        })
      );

      // Process batch results
      for (const { q, results } of batchResults) {
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
        // Person profile is stored on User, not Organization — see step 6 below
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
