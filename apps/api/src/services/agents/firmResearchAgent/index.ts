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

// Best-effort concurrency lock — works for single-instance (local dev, single Vercel instance).
// Does NOT prevent concurrent runs across multiple serverless instances.
// For stronger guarantees, use a DB-level lock (enrichmentStartedAt timestamp).
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
export { runDeepResearch } from './deepResearch.js';
export type { DeepResearchInput } from './deepResearch.js';
