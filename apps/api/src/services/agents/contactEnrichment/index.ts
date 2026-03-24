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

  const prompt = `You are a contact enrichment AI for a private equity firm. Given the following contact information, provide ONLY information you can reasonably infer from the provided data.

Contact:
- Name: ${state.firstName} ${state.lastName}
- Email: ${state.email || 'Not provided'}
- Company: ${state.company || 'Not provided'}
- Title: ${state.title || 'Not provided'}

CRITICAL RULES:
- Set fields to NULL if you cannot reasonably determine them from the provided data
- Do NOT fabricate LinkedIn URLs — set to null unless you are certain
- Do NOT guess locations unless the email domain or company strongly implies one
- Do NOT invent company info if the company field is "Not provided"
- Confidence scoring guide:
  - 0-20: Only a name was provided, everything else is guesswork
  - 20-40: Name + email OR name + company, some inference possible
  - 40-60: Name + email + company, reasonable inferences
  - 60-80: Name + email + company + title, strong profile
  - 80+: ONLY if this is a well-known public figure you can verify
- Sources must honestly reflect what you used: "llm_inference" for anything from your training data

Generate a JSON response with:
{
  "linkedinUrl": "LinkedIn URL or null if uncertain",
  "title": "job title or null if not provided and can't be inferred",
  "company": "company name or null if not provided",
  "industry": "industry or null if unknown",
  "location": "location or null if cannot be determined",
  "bio": "2-3 sentence bio or null if insufficient data",
  "expertise": ["area1"] or empty array if unknown,
  "connections": "small/medium/large or null if unknown",
  "dealRelevance": "high/medium/low",
  "confidence": 0-100,
  "sources": ["llm_inference"]
}`;

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

  // Determine input richness — how much data was provided by the user
  let inputSignals = 0;
  if (state.email) inputSignals++;
  if (state.company) inputSignals++;
  if (state.title) inputSignals++;

  // Cap confidence based on how much input we had (no real external APIs = limited enrichment)
  // 0 signals (name only) → max 30, 1 signal → max 50, 2 → max 70, 3 → max 85
  const maxConfidenceByInput = [30, 50, 70, 85][inputSignals] || 30;

  let score = state.confidence;
  const factors: string[] = [];

  // Only boost for genuinely NEW information (not echoed-back input)
  if (data.title && data.title !== state.title && state.title) { score += 3; factors.push('title refined'); }
  if (data.company && data.company !== state.company && state.company) { score += 3; factors.push('company updated'); }
  // LinkedIn URL gets no boost — we have no API to verify it
  if (data.industry && state.company) { score += 3; factors.push('industry identified'); }

  // Penalize null/empty fields the LLM should have filled if it had real data
  if (!data.linkedinUrl) { factors.push('no LinkedIn (expected)'); }
  if (!data.location && inputSignals < 2) { factors.push('no location (insufficient input)'); }

  // Apply input-based cap
  score = Math.min(score, maxConfidenceByInput);
  const needsReview = score < 70;
  factors.push(`input signals: ${inputSignals}, max allowed: ${maxConfidenceByInput}`);

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
