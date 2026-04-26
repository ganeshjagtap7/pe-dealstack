/**
 * Financial Agent — Public entry point.
 *
 * Usage:
 *   import { runFinancialAgent } from './services/agents/financialAgent/index.js';
 *
 *   const result = await runFinancialAgent({
 *     dealId: '...',
 *     documentId: '...',
 *     fileBuffer: Buffer.from(...),
 *     fileName: 'CIM.pdf',
 *     fileType: 'pdf',
 *   });
 *
 *   // result.status === 'completed' | 'failed'
 *   // result.steps[] — full agent execution log
 *   // result.statementIds — stored DB row IDs
 *   // result.validationResult — math check results
 */

import { getFinancialAgentGraph } from './graph.js';
import { log } from '../../../utils/logger.js';
import type { FileType, FinancialAgentStateType } from './state.js';

// ─── Input Types ─────────────────────────────────────────────

export interface FinancialAgentInput {
  dealId: string;
  documentId?: string | null;
  fileBuffer: Buffer;
  fileName: string;
  fileType: FileType;
  organizationId?: string | null;
  /** Max self-correction retries (default 3) */
  maxRetries?: number;
}

export interface FinancialAgentResult {
  status: FinancialAgentStateType['status'];
  statementIds: string[];
  periodsStored: number;
  hasConflicts: boolean;
  overallConfidence: number;
  extractionSource: string;
  validationResult: FinancialAgentStateType['validationResult'];
  retryCount: number;
  warnings: string[];
  error: string | null;
  steps: FinancialAgentStateType['steps'];
  /** Total tokens consumed across all LLM calls in this agent run */
  tokensUsed: number;
  /** Estimated USD cost for this agent run (gpt-4o pricing) */
  estimatedCostUsd: number;
}

// ─── Run Agent ───────────────────────────────────────────────

export async function runFinancialAgent(
  input: FinancialAgentInput,
): Promise<FinancialAgentResult> {
  const startTime = Date.now();

  log.info('Financial agent starting', {
    dealId: input.dealId,
    documentId: input.documentId,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSizeKB: Math.round(input.fileBuffer.length / 1024),
  });

  try {
    const graph = getFinancialAgentGraph();

    const finalState = await graph.invoke({
      dealId: input.dealId,
      documentId: input.documentId ?? null,
      fileBuffer: input.fileBuffer,
      fileName: input.fileName,
      fileType: input.fileType,
      organizationId: input.organizationId ?? null,
      maxRetries: input.maxRetries ?? 1,
      skipVerify: true,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    log.info('Financial agent completed', {
      dealId: input.dealId,
      status: finalState.status,
      periodsStored: finalState.periodsStored,
      overallConfidence: finalState.overallConfidence,
      retryCount: finalState.retryCount,
      hasConflicts: finalState.hasConflicts,
      elapsedSeconds: elapsed,
      totalSteps: finalState.steps?.length ?? 0,
    });

    return {
      status: finalState.status,
      statementIds: finalState.statementIds ?? [],
      periodsStored: finalState.periodsStored ?? 0,
      hasConflicts: finalState.hasConflicts ?? false,
      overallConfidence: finalState.overallConfidence ?? 0,
      extractionSource: finalState.extractionSource ?? 'gpt4o',
      validationResult: finalState.validationResult ?? null,
      retryCount: finalState.retryCount ?? 0,
      warnings: finalState.warnings ?? [],
      error: finalState.error ?? null,
      steps: finalState.steps ?? [],
      tokensUsed: finalState.tokensUsed ?? 0,
      estimatedCostUsd: finalState.estimatedCostUsd ?? 0,
    };
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.error('Financial agent failed', { dealId: input.dealId, elapsedSeconds: elapsed, error: err });

    return {
      status: 'failed',
      statementIds: [],
      periodsStored: 0,
      hasConflicts: false,
      overallConfidence: 0,
      extractionSource: 'gpt4o',
      validationResult: null,
      retryCount: 0,
      warnings: [],
      error: err instanceof Error ? err.message : String(err),
      tokensUsed: 0,
      estimatedCostUsd: 0,
      steps: [{
        timestamp: new Date().toISOString(),
        node: 'agent',
        message: `Agent crashed: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }
}

// Re-export types for convenience
export type { FileType, FinancialAgentStateType } from './state.js';
export type { AgentStep, ValidationResult } from './state.js';
