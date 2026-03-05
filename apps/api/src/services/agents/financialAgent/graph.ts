/**
 * Financial Agent Graph — LangGraph state machine.
 *
 * Wires the 4 nodes together with conditional edges:
 *
 *   START → extract → validate ──→ store → END
 *                        │                  ↑
 *                        └→ self_correct ───┘
 *                           (loops back to validate, max 3 retries)
 *
 * Each node reads/writes to the shared FinancialAgentState.
 * The validate node decides whether to self-correct or store
 * based on failed checks and retry count.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { FinancialAgentState } from './state.js';
import { extractNode } from './nodes/extractNode.js';
import { validateNode } from './nodes/validateNode.js';
import { selfCorrectNode } from './nodes/selfCorrectNode.js';
import { storeNode } from './nodes/storeNode.js';
import type { FinancialAgentStateType } from './state.js';

// ─── Routing Functions ───────────────────────────────────────

/** After extract: if failed go to END, otherwise go to validate */
function routeAfterExtract(state: FinancialAgentStateType): string {
  if (state.status === 'failed') return END;
  return 'validate';
}

/** After validate: route based on status set by validate node */
function routeAfterValidate(state: FinancialAgentStateType): string {
  if (state.status === 'self_correcting') return 'self_correct';
  return 'store'; // 'storing' or anything else → store
}

/** After self-correct: always go back to validate for re-check */
function routeAfterSelfCorrect(_state: FinancialAgentStateType): string {
  return 'validate';
}

// ─── Build Graph ─────────────────────────────────────────────

function buildFinancialAgentGraph() {
  const graph = new StateGraph(FinancialAgentState)
    // Add nodes
    .addNode('extract', extractNode)
    .addNode('validate', validateNode)
    .addNode('self_correct', selfCorrectNode)
    .addNode('store', storeNode)

    // Entry edge
    .addEdge(START, 'extract')

    // Conditional edges
    .addConditionalEdges('extract', routeAfterExtract, {
      validate: 'validate',
      [END]: END,
    })
    .addConditionalEdges('validate', routeAfterValidate, {
      self_correct: 'self_correct',
      store: 'store',
    })
    .addConditionalEdges('self_correct', routeAfterSelfCorrect, {
      validate: 'validate',
    })

    // Store always ends
    .addEdge('store', END);

  return graph.compile();
}

/** Singleton compiled graph — reused across requests */
let _compiledGraph: ReturnType<typeof buildFinancialAgentGraph> | null = null;

export function getFinancialAgentGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildFinancialAgentGraph();
  }
  return _compiledGraph;
}
