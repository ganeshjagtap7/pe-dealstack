/**
 * Store Node — LangGraph node for the financial extraction agent.
 *
 * Persists validated financial statements to Supabase via the existing
 * runDeepPass() orchestrator. This reuses all the conflict detection,
 * merge status, and partial unique index logic already built.
 *
 * Does NOT duplicate any DB logic — delegates entirely to runDeepPass().
 */

import { runDeepPass } from '../../../financialExtractionOrchestrator.js';
import { recordExtractionLearning } from '../../../agentMemory.js';
import { log } from '../../../../utils/logger.js';
import type { FinancialAgentStateType } from '../state.js';
import type { AgentStep } from '../state.js';

/** Create a timestamped agent step */
function step(node: string, message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node, message, detail };
}

/**
 * LangGraph Store Node
 *
 * Reads: dealId, documentId, statements, classification, rawText, extractionSource
 * Writes: statementIds, periodsStored, hasConflicts, status, steps
 */
export async function storeNode(
  state: FinancialAgentStateType,
): Promise<Partial<FinancialAgentStateType>> {
  const steps: AgentStep[] = [];
  const { dealId, documentId, statements, classification, rawText, extractionSource } = state;

  if (!statements || statements.length === 0) {
    steps.push(step('store', 'No statements to store'));
    return {
      statementIds: [],
      periodsStored: 0,
      hasConflicts: false,
      status: 'completed',
      steps: [...steps, step('store', 'Agent completed — no financial data extracted')],
    };
  }

  const stmtTypes = statements.map(s => s.statementType).join(', ');
  const totalPeriods = statements.reduce((sum, s) => sum + s.periods.length, 0);
  steps.push(step('store', `Storing ${stmtTypes} (${totalPeriods} periods) to database`));

  try {
    // Build a ClassificationResult from the current (possibly corrected) statements
    const classificationToStore = {
      statements,
      overallConfidence: state.overallConfidence,
      warnings: state.warnings,
    };

    const result = await runDeepPass({
      text: rawText,
      dealId,
      documentId: documentId ?? undefined,
      classification: classificationToStore,
      extractionSource,
    });

    if (!result) {
      steps.push(step('store', 'runDeepPass returned null — storage failed'));
      return {
        status: 'failed',
        error: 'Failed to store financial statements',
        steps,
      };
    }

    steps.push(step(
      'store',
      `Stored ${result.periodsStored} periods (${result.statementsStored} statement types)`,
      result.hasConflicts ? 'Conflicts detected — flagged for user review' : undefined,
    ));

    if (result.hasConflicts) {
      steps.push(step('store', 'Multi-document conflicts found — existing data flagged as needs_review'));
    }

    // Final completion step with summary
    const validationSummary = state.validationResult
      ? `Validation: ${state.validationResult.errorCount} errors, ${state.validationResult.warningCount} warnings`
      : 'Validation: not run';
    const retrySummary = state.retryCount > 0
      ? `Self-corrections: ${state.retryCount}`
      : 'Self-corrections: none needed';

    steps.push(step('store', `Done. ${validationSummary}. ${retrySummary}. Confidence: ${state.overallConfidence}%`));

    // Fire-and-forget: record extraction learning for agent memory
    if (state.organizationId) {
      const docPattern = state.fileName.replace(/\.[^.]+$/, '').replace(/[0-9_-]+/g, '').trim() || 'general';
      recordExtractionLearning(
        state.organizationId,
        docPattern,
        state.fileType,
        extractionSource,
        state.overallConfidence,
      ).catch(() => {});
    }

    return {
      statementIds: result.statementIds,
      periodsStored: result.periodsStored,
      hasConflicts: result.hasConflicts,
      status: 'completed',
      tokensUsed: 0,
      estimatedCostUsd: 0,
      steps,
    };
  } catch (err) {
    log.error('Store node: error persisting statements', err);
    return {
      status: 'failed',
      error: `Storage failed: ${err instanceof Error ? err.message : String(err)}`,
      steps: [...steps, step('store', 'Storage failed', String(err))],
    };
  }
}
