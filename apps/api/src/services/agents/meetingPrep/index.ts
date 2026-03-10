// ─── AI Meeting Prep Workflow ────────────────────────────────────────
// Parallel fetch: contact history + deal status + RAG doc summaries
// Then LLM compiles a meeting brief with talking points.

import { getChatModel, isLLMAvailable } from '../../llm.js';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { searchDocumentChunks, buildRAGContext, isRAGEnabled } from '../../../rag.js';
import { supabase } from '../../../supabase.js';
import { z } from 'zod';
import { log } from '../../../utils/logger.js';

export interface MeetingPrepInput {
  dealId: string;
  contactId?: string;
  organizationId: string;
  meetingTopic?: string;
  meetingDate?: string;
}

export interface MeetingBrief {
  headline: string;
  dealSummary: string;
  contactProfile: string | null;
  keyTalkingPoints: string[];
  questionsToAsk: string[];
  risksToAddress: string[];
  documentHighlights: string[];
  suggestedAgenda: string[];
  generatedAt: string;
}

/**
 * Generate a meeting prep brief by fetching context in parallel
 * and compiling with LLM.
 */
export async function generateMeetingPrep(input: MeetingPrepInput): Promise<MeetingBrief> {
  if (!isLLMAvailable()) {
    throw new Error('No LLM provider configured');
  }

  log.info('Generating meeting prep', { dealId: input.dealId, contactId: input.contactId });

  // Parallel fetch: deal + contact + documents + activities
  const [dealResult, contactResult, docSearchResult, activitiesResult] = await Promise.all([
    // 1. Deal with financials
    supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, revenue, ebitda, dealSize,
        irrProjected, mom, aiThesis, description, source,
        company:Company(name, description, industry),
        teamMembers:DealTeamMember(role, user:User(name, title))
      `)
      .eq('id', input.dealId)
      .single(),

    // 2. Contact history (if provided)
    input.contactId
      ? supabase
          .from('Contact')
          .select(`
            firstName, lastName, email, title, company, notes, lastContactedAt,
            interactions:ContactInteraction(type, title, description, date)
          `)
          .eq('id', input.contactId)
          .single()
      : Promise.resolve({ data: null, error: null }),

    // 3. RAG document search for meeting topic
    input.meetingTopic && isRAGEnabled()
      ? searchDocumentChunks(input.meetingTopic, input.dealId, 5, 0.4)
      : Promise.resolve([]),

    // 4. Recent activities
    supabase
      .from('Activity')
      .select('type, title, description, createdAt')
      .eq('dealId', input.dealId)
      .order('createdAt', { ascending: false })
      .limit(10),
  ]);

  const deal = dealResult.data;
  if (!deal) throw new Error('Deal not found');

  const contact = contactResult.data as any;
  const docResults = docSearchResult as any[];
  const activities = activitiesResult.data || [];

  // Build context for LLM
  const contextParts: string[] = [];

  // Deal context
  contextParts.push(`DEAL: ${deal.name}`);
  contextParts.push(`Stage: ${deal.stage}, Industry: ${deal.industry || 'N/A'}`);
  if (deal.revenue) contextParts.push(`Revenue: $${deal.revenue}M`);
  if (deal.ebitda) contextParts.push(`EBITDA: $${deal.ebitda}M`);
  if (deal.dealSize) contextParts.push(`Deal Size: $${deal.dealSize}M`);
  if (deal.aiThesis) contextParts.push(`Thesis: ${deal.aiThesis}`);

  const company = deal.company as any;
  if (company?.description) contextParts.push(`Company: ${company.description}`);

  // Team
  const team = deal.teamMembers as any[];
  if (team?.length > 0) {
    contextParts.push(`\nTeam: ${team.map((t: any) => `${t.user?.name} (${t.role})`).join(', ')}`);
  }

  // Contact context
  if (contact) {
    contextParts.push(`\nMEETING WITH: ${contact.firstName} ${contact.lastName}`);
    if (contact.title) contextParts.push(`Title: ${contact.title}`);
    if (contact.company) contextParts.push(`Company: ${contact.company}`);
    if (contact.notes) contextParts.push(`Notes: ${contact.notes}`);

    const interactions = contact.interactions as any[];
    if (interactions?.length > 0) {
      contextParts.push(`\nPast Interactions (${interactions.length}):`);
      for (const i of interactions.slice(0, 5)) {
        contextParts.push(`  - [${i.date}] ${i.type}: ${i.title}${i.description ? ` — ${i.description}` : ''}`);
      }
    }
  }

  // Document highlights
  if (docResults.length > 0) {
    const { data: docs } = await supabase.from('Document').select('id, name, type').eq('dealId', input.dealId);
    contextParts.push(`\nDOCUMENT HIGHLIGHTS:`);
    contextParts.push(buildRAGContext(docResults, docs || []));
  }

  // Recent activities
  if (activities.length > 0) {
    contextParts.push(`\nRECENT ACTIVITY:`);
    for (const a of activities.slice(0, 5)) {
      contextParts.push(`  - ${a.type}: ${a.title}`);
    }
  }

  // Generate meeting brief with structured output
  const model = getChatModel(0.5, 2000);
  const structuredModel = model.withStructuredOutput(z.object({
    headline: z.string().describe('One-line meeting headline'),
    dealSummary: z.string().describe('2-3 sentence deal summary for quick context'),
    contactProfile: z.string().nullable().describe('Brief profile of the person being met'),
    keyTalkingPoints: z.array(z.string()).describe('5-7 key talking points with specific data'),
    questionsToAsk: z.array(z.string()).describe('3-5 critical questions to ask in the meeting'),
    risksToAddress: z.array(z.string()).describe('2-3 risks or concerns to discuss'),
    documentHighlights: z.array(z.string()).describe('Key findings from uploaded documents'),
    suggestedAgenda: z.array(z.string()).describe('4-6 agenda items in order'),
  }));

  const brief = await structuredModel.invoke([
    new SystemMessage(`You are a PE deal team meeting prep assistant. Generate a comprehensive meeting brief that helps the deal team walk in prepared. Use specific numbers and data from the context. Be direct and actionable.`),
    new HumanMessage(`Generate a meeting prep brief for this context:\n\n${contextParts.join('\n')}\n\nMeeting topic: ${input.meetingTopic || 'General deal discussion'}\nMeeting date: ${input.meetingDate || 'Today'}`),
  ]);

  log.info('Meeting prep generated', { dealId: input.dealId, talkingPoints: brief.keyTalkingPoints.length });

  return {
    headline: brief.headline,
    dealSummary: brief.dealSummary,
    contactProfile: brief.contactProfile,
    keyTalkingPoints: brief.keyTalkingPoints,
    questionsToAsk: brief.questionsToAsk,
    risksToAddress: brief.risksToAddress,
    documentHighlights: brief.documentHighlights,
    suggestedAgenda: brief.suggestedAgenda,
    generatedAt: new Date().toISOString(),
  };
}
