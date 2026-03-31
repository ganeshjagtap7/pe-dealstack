// ─── Contact Enrichment Agent (LangGraph StateGraph) ────────────────
// REAL enrichment: searches CRM documents, analyzes email domain,
// finds linked deals, and synthesizes with LLM.
// No fake data — only what can be found in your own data + email analysis.

import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { supabase } from '../../../supabase.js';
import { log } from '../../../utils/logger.js';

// ─── State Schema ──────────────────────────────────────────────────

const EnrichmentState = Annotation.Root({
  contactId: Annotation<string>,
  organizationId: Annotation<string>,
  firstName: Annotation<string>,
  lastName: Annotation<string>,
  email: Annotation<string | null>,
  company: Annotation<string | null>,
  title: Annotation<string | null>,
  // CRM data found
  crmContext: Annotation<string>,
  emailAnalysis: Annotation<Record<string, any>>,
  linkedDeals: Annotation<Array<{ name: string; stage: string; industry: string }>>,
  documentMentions: Annotation<string[]>,
  // Enrichment results
  enrichedData: Annotation<Record<string, any>>,
  confidence: Annotation<number>,
  sources: Annotation<string[]>,
  // Status
  status: Annotation<string>,
  error: Annotation<string | null>,
  needsReview: Annotation<boolean>,
  steps: Annotation<Array<{ timestamp: string; node: string; message: string }>>,
});

// ─── Known corporate email domains ──────────────────────────────────

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'me.com', 'live.com', 'msn.com', 'protonmail.com',
  'mail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'inbox.com',
]);

function analyzeEmailDomain(email: string | null): Record<string, any> {
  if (!email || !email.includes('@')) {
    return { isPersonal: null, domain: null, companyFromDomain: null };
  }

  const domain = email.split('@')[1].toLowerCase();
  const isPersonal = PERSONAL_DOMAINS.has(domain);

  // Extract company name from corporate domain
  let companyFromDomain: string | null = null;
  if (!isPersonal) {
    // e.g., "john@goldmansachs.com" → "Goldman Sachs" (LLM will refine this)
    const baseDomain = domain.replace(/\.(com|org|net|io|co|ai|app|dev|tech)$/i, '');
    companyFromDomain = baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1);
  }

  return {
    domain,
    isPersonal,
    companyFromDomain,
    emailProvider: isPersonal ? domain.split('.')[0] : null,
  };
}

// ─── Company website scraper ────────────────────────────────────────

async function scrapeCompanyWebsite(domain: string): Promise<{ title: string; description: string; raw: string } | null> {
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://${domain}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PEOSBot/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Extract meta tags and first chunk of visible text
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    // Strip HTML tags to get visible text (first 2000 chars)
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
    return {
      title: titleMatch?.[1]?.trim() || '',
      description: descMatch?.[1]?.trim() || ogDescMatch?.[1]?.trim() || '',
      raw: textContent,
    };
  } catch {
    return null;
  }
}

// ─── LinkedIn URL construction ──────────────────────────────────────

function constructLinkedInUrl(firstName: string, lastName: string, company?: string | null): string | null {
  if (!firstName || !lastName) return null;
  // Construct a LinkedIn search URL (not a profile URL — we can't guess the slug)
  const query = company
    ? `${firstName} ${lastName} ${company}`
    : `${firstName} ${lastName}`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

// ─── Node 1: Gather CRM Data + External Intelligence ───────────────

async function gatherNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  steps.push({ timestamp: new Date().toISOString(), node: 'gather', message: 'Gathering intelligence from CRM + web' });

  const fullName = `${state.firstName} ${state.lastName}`;
  const emailAnalysis = analyzeEmailDomain(state.email);
  const companyLower = (state.company || emailAnalysis.companyFromDomain || '').toLowerCase();

  // Parallel fetch: documents, deals, notes, activities, company website, relationship proximity
  const [docResults, dealResults, noteResults, activityResults, websiteData, sameCompanyContacts] = await Promise.all([
    // 1. Search documents for mentions of this person's name or company
    (async () => {
      try {
        const { data } = await supabase
          .from('Document')
          .select('name, extractedText, dealId')
          .eq('organizationId', state.organizationId)
          .not('extractedText', 'is', null)
          .limit(50);

        if (!data) return [];
        const nameLower = fullName.toLowerCase();

        return data.filter(d => {
          const text = (d.extractedText || '').toLowerCase();
          return text.includes(nameLower) ||
            (companyLower && companyLower.length > 2 && text.includes(companyLower));
        }).map(d => {
          const text = d.extractedText || '';
          const nameLow = fullName.toLowerCase();
          const idx = text.toLowerCase().indexOf(nameLow);
          const searchIdx = idx >= 0 ? idx : text.toLowerCase().indexOf(companyLower);
          const start = Math.max(0, searchIdx - 300);
          const end = Math.min(text.length, searchIdx + 500);
          return { name: d.name, excerpt: text.slice(start, end), dealId: d.dealId };
        });
      } catch { return []; }
    })(),

    // 2. Find deals linked to this contact by company name match
    (async () => {
      try {
        const { data: deals } = await supabase
          .from('Deal')
          .select('id, name, stage, industry, revenue, ebitda')
          .eq('organizationId', state.organizationId);

        if (!deals || !companyLower || companyLower.length < 3) return [];

        return deals
          .filter(d => d.name.toLowerCase().includes(companyLower))
          .map(d => ({ name: d.name, stage: d.stage, industry: d.industry || 'N/A' }));
      } catch { return []; }
    })(),

    // 3. Get contact's existing notes, tags, LinkedIn
    (async () => {
      try {
        const { data } = await supabase
          .from('Contact')
          .select('notes, tags, linkedinUrl, lastContactedAt')
          .eq('id', state.contactId)
          .single();
        return data;
      } catch { return null; }
    })(),

    // 4. Search Activity table for interactions mentioning this contact
    (async () => {
      try {
        const { data } = await supabase
          .from('Activity')
          .select('type, title, description, createdAt, dealId')
          .eq('organizationId', state.organizationId)
          .order('createdAt', { ascending: false })
          .limit(100);

        if (!data) return [];
        const nameLower = fullName.toLowerCase();
        return data.filter(a => {
          const text = `${a.title} ${a.description || ''}`.toLowerCase();
          return text.includes(nameLower) ||
            (companyLower && companyLower.length > 2 && text.includes(companyLower));
        }).slice(0, 10);
      } catch { return []; }
    })(),

    // 5. Scrape company website for real data
    (async () => {
      const domain = emailAnalysis.domain;
      if (!domain || emailAnalysis.isPersonal) return null;
      return scrapeCompanyWebsite(domain);
    })(),

    // 6. Relationship proximity — other contacts at same company/domain
    (async () => {
      try {
        if (!companyLower || companyLower.length < 3) return [];
        const { data } = await supabase
          .from('Contact')
          .select('firstName, lastName, title, email')
          .eq('organizationId', state.organizationId)
          .neq('id', state.contactId)
          .ilike('company', `%${companyLower}%`)
          .limit(10);
        return data || [];
      } catch { return []; }
    })(),
  ]);

  // Build CRM context string for LLM
  const contextParts: string[] = [];

  // Email domain analysis
  if (emailAnalysis.domain && !emailAnalysis.isPersonal) {
    contextParts.push(`EMAIL ANALYSIS: Corporate email (${emailAnalysis.domain}). Company: ${emailAnalysis.companyFromDomain}`);
  } else if (emailAnalysis.isPersonal) {
    contextParts.push(`EMAIL ANALYSIS: Personal email (${emailAnalysis.domain}). No company from email.`);
  }

  // Company website data (REAL external data)
  if (websiteData) {
    contextParts.push(`\nCOMPANY WEBSITE (${emailAnalysis.domain}):`);
    if (websiteData.title) contextParts.push(`  Site Title: ${websiteData.title}`);
    if (websiteData.description) contextParts.push(`  Description: ${websiteData.description}`);
    if (websiteData.raw) contextParts.push(`  Page Content: ${websiteData.raw.slice(0, 1000)}`);
  }

  // CRM documents
  if (docResults.length > 0) {
    contextParts.push(`\nFOUND IN ${docResults.length} CRM DOCUMENT(S):`);
    for (const doc of docResults.slice(0, 5)) {
      contextParts.push(`  Document: "${doc.name}"\n  Excerpt: ...${doc.excerpt.slice(0, 300)}...`);
    }
  }

  // Linked deals
  if (dealResults.length > 0) {
    contextParts.push(`\nLINKED TO ${dealResults.length} DEAL(S):`);
    for (const deal of dealResults) {
      contextParts.push(`  - ${deal.name} (${deal.stage}, ${deal.industry})`);
    }
  }

  // Past interactions
  if (activityResults.length > 0) {
    contextParts.push(`\nPAST INTERACTIONS (${activityResults.length}):`);
    for (const act of activityResults.slice(0, 5)) {
      const date = new Date(act.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      contextParts.push(`  [${date}] ${act.type}: ${act.title}${act.description ? ` — ${act.description}` : ''}`);
    }
  }

  // Relationship proximity
  if (sameCompanyContacts.length > 0) {
    contextParts.push(`\nOTHER CONTACTS AT SAME COMPANY (${sameCompanyContacts.length}):`);
    for (const c of sameCompanyContacts.slice(0, 5)) {
      contextParts.push(`  - ${c.firstName} ${c.lastName}${c.title ? ` (${c.title})` : ''}`);
    }
  }

  // Existing notes
  if (noteResults?.notes) contextParts.push(`\nEXISTING NOTES: ${noteResults.notes}`);
  if (noteResults?.linkedinUrl) contextParts.push(`LINKEDIN: ${noteResults.linkedinUrl}`);

  // Calculate staleness
  let staleWarning: string | null = null;
  if (noteResults?.lastContactedAt) {
    const daysSince = Math.floor((Date.now() - new Date(noteResults.lastContactedAt).getTime()) / 86400000);
    if (daysSince > 90) staleWarning = `WARNING: Last contacted ${daysSince} days ago — relationship going cold`;
    if (staleWarning) contextParts.push(`\n${staleWarning}`);
  }

  // LinkedIn search URL
  const linkedinSearchUrl = noteResults?.linkedinUrl || constructLinkedInUrl(state.firstName, state.lastName, state.company);

  // Sources
  const sources: string[] = [];
  if (emailAnalysis.domain && !emailAnalysis.isPersonal) sources.push('email_domain');
  if (websiteData) sources.push('company_website');
  if (docResults.length > 0) sources.push(`crm_docs(${docResults.length})`);
  if (dealResults.length > 0) sources.push(`deals(${dealResults.length})`);
  if (activityResults.length > 0) sources.push(`activities(${activityResults.length})`);
  if (sameCompanyContacts.length > 0) sources.push(`network(${sameCompanyContacts.length})`);

  steps.push({
    timestamp: new Date().toISOString(),
    node: 'gather',
    message: `Found: ${docResults.length} docs, ${dealResults.length} deals, ${activityResults.length} activities, ${sameCompanyContacts.length} same-co contacts, website=${!!websiteData}`,
  });

  return {
    crmContext: contextParts.join('\n') || 'No data found for this contact.',
    emailAnalysis: { ...emailAnalysis, linkedinSearchUrl, staleWarning },
    linkedDeals: dealResults,
    documentMentions: docResults.map((d: any) => d.name),
    sources,
    steps,
  };
}

// ─── Node 2: Research with LLM (using CRM context) ──────────────────

async function researchNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  steps.push({ timestamp: new Date().toISOString(), node: 'research', message: 'Synthesizing profile from CRM data' });

  const model = getChatModel(0.3, 2000);

  const hasCRMData = state.documentMentions.length > 0 || state.linkedDeals.length > 0;

  const prompt = `You are enriching a contact profile for a private equity CRM. You have REAL data from the firm's CRM system below.

CONTACT:
- Name: ${state.firstName} ${state.lastName}
- Email: ${state.email || 'Not provided'}
- Company: ${state.company || 'Not provided'}
- Title: ${state.title || 'Not provided'}

CRM DATA FOUND:
${state.crmContext}

YOUR JOB:
1. Synthesize what we KNOW about this person from the CRM data above
2. Identify their role, company, and relevance to our deals
3. ${hasCRMData ? 'Use the document excerpts and deal links to build a real profile' : 'With no CRM data, only provide what can be inferred from the email domain and provided fields'}
4. Set fields to null if you genuinely cannot determine them
5. The "bio" should summarize what we know from OUR data, not generic info
6. "dealRelevance" = how relevant this person is to our active deals

CONFIDENCE RULES:
- ${hasCRMData ? 'CRM data found → base confidence 40-60% depending on quality' : 'No CRM data → base confidence should be low (15-35%)'}
- Corporate email with company match → +10%
- Found in deal documents → +15%
- Linked to active deals → +10%
- Personal email + no CRM data → max 25%

Generate a JSON response:
{
  "title": "job title or null",
  "company": "company name or null",
  "industry": "industry or null",
  "location": "location or null if cannot determine",
  "bio": "2-3 sentence profile based on CRM data, or null if no data",
  "expertise": ["area1"] or [],
  "contactType": "one of: founder_owner, investment_banker, advisor_consultant, management_team, legal_counsel, lp_investor, co_investor, board_member, intermediary, other",
  "dealRelevance": "high/medium/low",
  "confidence": 0-100,
  "keyInsight": "One actionable sentence: WHY this person matters to our deals and WHAT to do next (e.g. 'CEO of target company in active deal — schedule intro call' or 'Banker who covers healthcare M&A — add to outreach list')",
  "suggestedAction": "One concrete next step: 'Schedule meeting', 'Add to deal team', 'Request warm intro via [person]', 'Add to outreach pipeline', or null"
}`;

  try {
    const enrichmentSchema = z.object({
      title: z.string().nullable().optional().default(null),
      company: z.string().nullable().optional().default(null),
      industry: z.string().nullable().optional().default(null),
      location: z.string().nullable().optional().default(null),
      bio: z.string().nullable().optional().default(null),
      expertise: z.array(z.string()).optional().default([]),
      contactType: z.string().optional().default('other'),
      dealRelevance: z.string().optional().default('low'),
      confidence: z.number().optional().default(25),
      keyInsight: z.string().nullable().optional().default(null),
      suggestedAction: z.string().nullable().optional().default(null),
    });

    const structuredModel = model.withStructuredOutput(enrichmentSchema);

    const result = await structuredModel.invoke([
      new SystemMessage('You are a CRM enrichment system. Only state facts supported by the provided data. Return valid JSON.'),
      new HumanMessage(prompt),
    ]);

    // Merge LLM results with gathered intelligence
    const enrichedData: Record<string, any> = {
      ...result,
      linkedinUrl: state.emailAnalysis?.linkedinSearchUrl || null,
      sources: state.sources,
      emailAnalysis: state.emailAnalysis,
      linkedDeals: state.linkedDeals,
      documentMentions: state.documentMentions,
      staleWarning: state.emailAnalysis?.staleWarning || null,
    };

    // Use company from email domain if LLM didn't find one and user didn't provide one
    if (!result.company && !state.company && state.emailAnalysis?.companyFromDomain) {
      enrichedData.company = state.emailAnalysis.companyFromDomain;
    }

    steps.push({
      timestamp: new Date().toISOString(),
      node: 'research',
      message: `Profile synthesized. LLM confidence: ${result.confidence}%. Relevance: ${result.dealRelevance}`,
    });

    return {
      enrichedData,
      confidence: result.confidence,
      steps,
    };
  } catch (error: any) {
    log.error('Contact enrichment research failed', { error: error.message, contact: `${state.firstName} ${state.lastName}` });
    steps.push({ timestamp: new Date().toISOString(), node: 'research', message: `LLM synthesis failed: ${error.message}` });

    // Fallback: return what we gathered from CRM without LLM
    const hasDocs = state.documentMentions.length > 0;
    const hasDeals = state.linkedDeals.length > 0;
    const hasCorp = state.emailAnalysis?.isPersonal === false;
    let fallbackConfidence = 10;
    if (hasCorp) fallbackConfidence += 10;
    if (hasDocs) fallbackConfidence += 15;
    if (hasDeals) fallbackConfidence += 10;

    return {
      enrichedData: {
        title: state.title || null,
        company: state.company || state.emailAnalysis?.companyFromDomain || null,
        industry: null,
        location: null,
        bio: hasDocs ? `Mentioned in ${state.documentMentions.length} CRM document(s).` : null,
        expertise: [],
        dealRelevance: hasDeals ? 'medium' : 'low',
        confidence: fallbackConfidence,
        keyInsight: hasDocs
          ? `Found in: ${state.documentMentions.slice(0, 3).join(', ')}`
          : 'No CRM data found for this contact.',
        linkedinUrl: null,
        connections: null,
        sources: [...state.sources, 'error_fallback'],
        emailAnalysis: state.emailAnalysis,
        linkedDeals: state.linkedDeals,
        documentMentions: state.documentMentions,
      },
      confidence: fallbackConfidence,
      steps,
      error: error.message,
    };
  }
}

// ─── Node 3: Validate & Score ────────────────────────────────────────

async function validateNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  const data = state.enrichedData || {};

  let score = state.confidence;
  const factors: string[] = [];

  // Boost based on REAL data found (not just LLM inference)
  const hasCorporateEmail = state.emailAnalysis?.isPersonal === false;
  const docCount = state.documentMentions?.length || 0;
  const dealCount = state.linkedDeals?.length || 0;

  if (hasCorporateEmail) { score += 5; factors.push('corporate email'); }
  if (docCount > 0) { score += Math.min(docCount * 5, 15); factors.push(`found in ${docCount} docs`); }
  if (dealCount > 0) { score += Math.min(dealCount * 5, 10); factors.push(`${dealCount} linked deals`); }
  if (data.industry) { score += 3; factors.push('industry identified'); }

  // Cap based on data quality
  const hasRealData = docCount > 0 || dealCount > 0;
  const maxConfidence = hasRealData ? 85 : (hasCorporateEmail ? 60 : 40);
  score = Math.min(score, maxConfidence);

  // Minimum floor — never show 0% if we at least tried
  score = Math.max(score, 10);

  const needsReview = score < 70;
  factors.push(`max: ${maxConfidence}, real_data: ${hasRealData}`);

  steps.push({
    timestamp: new Date().toISOString(),
    node: 'validate',
    message: `Score: ${score}%, ${needsReview ? 'needs review' : 'auto-save'}. ${factors.join(', ')}`,
  });

  return { confidence: score, needsReview, steps };
}

// ─── Node 4: Save to Database ────────────────────────────────────────

async function saveNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  const data = state.enrichedData || {};

  try {
    const updateData: Record<string, any> = {};

    if (data.title && !state.title) updateData.title = data.title;
    if (data.company && !state.company) updateData.company = data.company;
    if (data.location) {
      const existing = await supabase.from('Contact').select('notes').eq('id', state.contactId).single();
      const currentNotes = existing.data?.notes || '';
      if (!currentNotes.includes('Location:')) {
        updateData.notes = `${currentNotes}\nLocation: ${data.location}`.trim();
      }
    }

    // Add enrichment tag
    if (data.dealRelevance) {
      const { data: contact } = await supabase.from('Contact').select('tags').eq('id', state.contactId).single();
      const tags = contact?.tags || [];
      const enrichTag = `enriched:${data.dealRelevance}`;
      if (!tags.includes(enrichTag)) {
        updateData.tags = [...tags.filter((t: string) => !t.startsWith('enriched:')), enrichTag];
      }
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date().toISOString();
      await supabase.from('Contact').update(updateData).eq('id', state.contactId);
      steps.push({
        timestamp: new Date().toISOString(),
        node: 'save',
        message: `Updated ${Object.keys(updateData).length} fields: ${Object.keys(updateData).join(', ')}`,
      });
    } else {
      steps.push({ timestamp: new Date().toISOString(), node: 'save', message: 'No new data to save' });
    }

    return { status: 'completed', steps };
  } catch (error: any) {
    steps.push({ timestamp: new Date().toISOString(), node: 'save', message: `Save failed: ${error.message}` });
    return { status: 'failed', error: error.message, steps };
  }
}

// ─── Node 5: Flag for Review ─────────────────────────────────────────

async function reviewNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  steps.push({
    timestamp: new Date().toISOString(),
    node: 'review',
    message: `Flagged for review (confidence: ${state.confidence}%). Data preserved but not auto-saved.`,
  });
  return { status: 'needs_review', steps };
}

// ─── Graph Wiring ──────────────────────────────────────────────────

function routeAfterValidation(state: typeof EnrichmentState.State): string {
  if (state.error) return 'review';
  return state.needsReview ? 'review' : 'save';
}

const graph = new StateGraph(EnrichmentState)
  .addNode('gather', gatherNode)
  .addNode('research', researchNode)
  .addNode('validate', validateNode)
  .addNode('save', saveNode)
  .addNode('review', reviewNode)
  .addEdge(START, 'gather')
  .addEdge('gather', 'research')
  .addEdge('research', 'validate')
  .addConditionalEdges('validate', routeAfterValidation, { save: 'save', review: 'review' })
  .addEdge('save', END)
  .addEdge('review', END);

const compiledGraph = graph.compile();

// ─── Public API ────────────────────────────────────────────────────

export interface EnrichmentInput {
  contactId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  company?: string | null;
  title?: string | null;
}

export interface EnrichmentResult {
  status: 'completed' | 'needs_review' | 'failed';
  enrichedData: Record<string, any>;
  confidence: number;
  needsReview: boolean;
  sources: string[];
  steps: Array<{ timestamp: string; node: string; message: string }>;
  error?: string | null;
}

export async function runContactEnrichment(input: EnrichmentInput): Promise<EnrichmentResult> {
  if (!isLLMAvailable()) {
    return {
      status: 'failed',
      enrichedData: {},
      confidence: 0,
      needsReview: false,
      sources: [],
      steps: [{ timestamp: new Date().toISOString(), node: 'agent', message: 'No LLM provider configured' }],
      error: 'No LLM provider configured',
    };
  }

  log.info('Running contact enrichment agent', { contactId: input.contactId, name: `${input.firstName} ${input.lastName}` });

  const result = await compiledGraph.invoke({
    contactId: input.contactId,
    organizationId: input.organizationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email || null,
    company: input.company || null,
    title: input.title || null,
    crmContext: '',
    emailAnalysis: {},
    linkedDeals: [],
    documentMentions: [],
    enrichedData: {},
    confidence: 0,
    sources: [],
    status: 'pending',
    error: null,
    needsReview: false,
    steps: [],
  });

  return {
    status: result.status as any,
    enrichedData: result.enrichedData,
    confidence: result.confidence,
    needsReview: result.needsReview,
    sources: result.sources,
    steps: result.steps,
    error: result.error,
  };
}
