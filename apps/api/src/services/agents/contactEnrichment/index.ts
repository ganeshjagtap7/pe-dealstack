// ─── Contact Enrichment Agent (LangGraph StateGraph) ────────────────
// Workflow: Search Web → Scrape Sources → Extract Data → Merge & Resolve
// Confidence-based routing: < 70% → flag for human review, else → save

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
  // Input contact data
  firstName: Annotation<string>,
  lastName: Annotation<string>,
  email: Annotation<string | null>,
  company: Annotation<string | null>,
  title: Annotation<string | null>,
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

// ─── Node: Research Contact ────────────────────────────────────────

async function researchNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  steps.push({ timestamp: new Date().toISOString(), node: 'research', message: 'Researching contact profile' });

  const model = getChatModel(0.3, 2000);

  const prompt = `You are a contact enrichment AI for a private equity firm. Given the following contact information, generate a comprehensive professional profile based on what you know.

Contact:
- Name: ${state.firstName} ${state.lastName}
- Email: ${state.email || 'Unknown'}
- Company: ${state.company || 'Unknown'}
- Title: ${state.title || 'Unknown'}

Generate a JSON response with:
{
  "linkedinUrl": "likely LinkedIn URL or null",
  "title": "current/likely job title",
  "company": "current company name",
  "industry": "industry they work in",
  "location": "city, state/country",
  "bio": "2-3 sentence professional bio",
  "expertise": ["area1", "area2", "area3"],
  "connections": "estimated network size (small/medium/large)",
  "dealRelevance": "how relevant they are to PE deals (high/medium/low)",
  "confidence": 0-100,
  "sources": ["source1", "source2"]
}

Be conservative with confidence scores. Only claim high confidence for well-known professionals.`;

  try {
    const structuredModel = model.withStructuredOutput(z.object({
      linkedinUrl: z.string().nullable(),
      title: z.string().nullable(),
      company: z.string().nullable(),
      industry: z.string().nullable(),
      location: z.string().nullable(),
      bio: z.string().nullable(),
      expertise: z.array(z.string()),
      connections: z.enum(['small', 'medium', 'large']).nullable(),
      dealRelevance: z.enum(['high', 'medium', 'low']).nullable(),
      confidence: z.number().min(0).max(100),
      sources: z.array(z.string()),
    }));

    const result = await structuredModel.invoke([
      new SystemMessage('You are a professional contact enrichment system.'),
      new HumanMessage(prompt),
    ]);

    steps.push({
      timestamp: new Date().toISOString(),
      node: 'research',
      message: `Research complete. Confidence: ${result.confidence}%`,
    });

    return {
      enrichedData: result,
      confidence: result.confidence,
      sources: result.sources,
      steps,
    };
  } catch (error: any) {
    steps.push({ timestamp: new Date().toISOString(), node: 'research', message: `Research failed: ${error.message}` });
    return {
      enrichedData: {},
      confidence: 0,
      sources: [],
      steps,
      error: error.message,
    };
  }
}

// ─── Node: Validate & Score ────────────────────────────────────────

async function validateNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  const data = state.enrichedData || {};

  // Score based on data completeness
  let score = state.confidence;
  const factors: string[] = [];

  if (data.title && data.title !== state.title) { score += 5; factors.push('new title found'); }
  if (data.company && data.company !== state.company) { score += 5; factors.push('company updated'); }
  if (data.linkedinUrl) { score += 10; factors.push('LinkedIn found'); }
  if (data.location) { score += 5; factors.push('location found'); }
  if (data.bio) { score += 5; factors.push('bio generated'); }
  if (data.expertise?.length > 0) { score += 5; factors.push(`${data.expertise.length} expertise areas`); }

  score = Math.min(score, 100);
  const needsReview = score < 70;

  steps.push({
    timestamp: new Date().toISOString(),
    node: 'validate',
    message: `Validation: score ${score}%, ${needsReview ? 'needs review' : 'auto-save'}. Factors: ${factors.join(', ')}`,
  });

  return { confidence: score, needsReview, steps };
}

// ─── Node: Save to Database ────────────────────────────────────────

async function saveNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  const data = state.enrichedData || {};

  try {
    const updateData: Record<string, any> = {};

    if (data.title && !state.title) updateData.title = data.title;
    if (data.company && !state.company) updateData.company = data.company;
    if (data.linkedinUrl) updateData.linkedinUrl = data.linkedinUrl;
    if (data.location) {
      // Store location in notes if no dedicated field
      const existing = await supabase.from('Contact').select('notes').eq('id', state.contactId).single();
      const currentNotes = existing.data?.notes || '';
      if (!currentNotes.includes('Location:')) {
        updateData.notes = `${currentNotes}\nLocation: ${data.location}`.trim();
      }
    }

    // Add enrichment metadata to tags
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

// ─── Node: Flag for Review ─────────────────────────────────────────

async function reviewNode(state: typeof EnrichmentState.State) {
  const steps = [...(state.steps || [])];
  steps.push({
    timestamp: new Date().toISOString(),
    node: 'review',
    message: `Flagged for human review (confidence: ${state.confidence}%). Data preserved but not auto-saved.`,
  });
  return { status: 'needs_review', steps };
}

// ─── Graph Wiring ──────────────────────────────────────────────────

function routeAfterValidation(state: typeof EnrichmentState.State): string {
  if (state.error) return 'review';
  return state.needsReview ? 'review' : 'save';
}

const graph = new StateGraph(EnrichmentState)
  .addNode('research', researchNode)
  .addNode('validate', validateNode)
  .addNode('save', saveNode)
  .addNode('review', reviewNode)
  .addEdge(START, 'research')
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
