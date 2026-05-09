// ─── Deep research — Phase 2 synthesis ───────────────────────────
// Schemas for the enriched firm/person additions and the LLM call
// that extracts NEW (non-Phase 1) information from the search snippets
// and scraped articles.

import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { FirmProfile, PersonProfile } from './state.js';
import { invokeStructured } from '../../llm.js';
import { log } from '../../../utils/logger.js';

export const EnrichedFirmSchema = z.object({
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

export const EnrichedPersonSchema = z.object({
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

export type EnrichedFirm = z.infer<typeof EnrichedFirmSchema>;
export type EnrichedPerson = z.infer<typeof EnrichedPersonSchema>;

export async function synthesizePhase2(
  allSnippets: string,
  scrapedContent: string,
  firmProfile: FirmProfile | null,
  personProfile: PersonProfile | null,
): Promise<{ firm: EnrichedFirm; person: EnrichedPerson }> {
  const systemPrompt = `You are a PE research analyst. Extract NEW information found in deep research results that was NOT in the initial profile. Only include facts that are clearly stated in the source text. Do not guess.`;

  const context = [
    `=== INITIAL FIRM PROFILE (already known — do NOT repeat) ===\n${JSON.stringify(firmProfile, null, 2)}`,
    `=== INITIAL PERSON PROFILE (already known — do NOT repeat) ===\n${JSON.stringify(personProfile, null, 2)}`,
    `=== DEEP RESEARCH RESULTS ===\n${allSnippets.slice(0, 10000)}`,
    scrapedContent ? `=== SCRAPED ARTICLES ===\n${scrapedContent.slice(0, 5000)}` : '',
  ].filter(Boolean).join('\n\n');

  // Extract firm additions
  let firm: EnrichedFirm;
  try {
    firm = await invokeStructured(EnrichedFirmSchema, [
      new SystemMessage(systemPrompt),
      new HumanMessage(`Extract NEW firm-level information (social presence, press articles, community mentions, co-investors, competitors, new portfolio companies, new deals, additional sectors):\n\n${context}`),
    ], { maxTokens: 2000, label: 'deepResearch.firm' });
  } catch (err) {
    log.warn('deepResearch: firm enrichment failed, using empty defaults', { error: err instanceof Error ? err.message : String(err) });
    firm = EnrichedFirmSchema.parse({});
  }

  // Extract person additions
  let person: EnrichedPerson;
  try {
    person = await invokeStructured(EnrichedPersonSchema, [
      new SystemMessage(systemPrompt),
      new HumanMessage(`Extract NEW person-level information (social handles, interviews/podcasts, public content, network connections):\n\n${context}`),
    ], { maxTokens: 2000, label: 'deepResearch.person' });
  } catch (err) {
    log.warn('deepResearch: person enrichment failed, using empty defaults', { error: err instanceof Error ? err.message : String(err) });
    person = EnrichedPersonSchema.parse({});
  }

  return { firm, person };
}

// ─── Count New Insights ────────────────────────────────────────────

export function countInsights(firm: EnrichedFirm, person: EnrichedPerson): number {
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
