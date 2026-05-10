// LangChain tools for the LBO valuation chat agent.
// Tools mutate a shared `state` container so multiple tool calls within one
// agent invocation see each other's updates. After the agent finishes, the
// route reads `state.assumptions` to persist the final state.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  ASSUMPTION_KEYS,
  applyAssumptionUpdate,
  computeLBO,
  summarizeForLLM,
  type AssumptionKey,
  type LBOAssumptions,
} from '../../../lib/lbo-model.js';

export interface ValuationAgentState {
  assumptions: LBOAssumptions;
  changedKeys: Set<AssumptionKey>;
}

const assumptionKeyEnum = z.enum(ASSUMPTION_KEYS as [AssumptionKey, ...AssumptionKey[]]);

export function getValuationChatTools(state: ValuationAgentState) {
  const getModelState = tool(
    async () => {
      const out = computeLBO(state.assumptions);
      return summarizeForLLM(state.assumptions, out);
    },
    {
      name: 'get_model_state',
      description: 'Read the current LBO assumptions and computed outputs (sources & uses, P&L, debt schedule, returns). Returns Markdown.',
      schema: z.object({}),
    },
  );

  const updateAssumption = tool(
    async ({ key, value }) => {
      state.assumptions = applyAssumptionUpdate(state.assumptions, key, value);
      state.changedKeys.add(key);
      const out = computeLBO(state.assumptions);
      return JSON.stringify({
        success: true,
        applied: { [key]: state.assumptions[key] },
        moic: Number(out.returns.moic.toFixed(3)),
        irr: Number(out.returns.irr.toFixed(4)),
        equityProceeds: Number(out.returns.equityProceeds.toFixed(2)),
        endingDebt: Number(out.returns.endingDebt.toFixed(2)),
      });
    },
    {
      name: 'update_assumption',
      description: 'Update a single LBO assumption. Pass percentages as decimals (10% = 0.10, 12% = 0.12). Returns the new MOIC and IRR.',
      schema: z.object({
        key: assumptionKeyEnum,
        value: z.number().describe('New value. Percentages as decimals (0.10 = 10%). Multiples as plain numbers (10 = 10x). Currency in $M.'),
      }),
    },
  );

  const updateAssumptions = tool(
    async ({ changes }) => {
      const applied: Partial<LBOAssumptions> = {};
      for (const [k, v] of Object.entries(changes)) {
        const key = k as AssumptionKey;
        if (!ASSUMPTION_KEYS.includes(key)) continue;
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        state.assumptions = applyAssumptionUpdate(state.assumptions, key, v);
        state.changedKeys.add(key);
        applied[key] = state.assumptions[key];
      }
      const out = computeLBO(state.assumptions);
      return JSON.stringify({
        success: true,
        applied,
        moic: Number(out.returns.moic.toFixed(3)),
        irr: Number(out.returns.irr.toFixed(4)),
        equityProceeds: Number(out.returns.equityProceeds.toFixed(2)),
        endingDebt: Number(out.returns.endingDebt.toFixed(2)),
      });
    },
    {
      name: 'update_assumptions',
      description: 'Update multiple LBO assumptions at once for stress tests / scenarios. Pass percentages as decimals.',
      schema: z.object({
        changes: z.record(assumptionKeyEnum, z.number())
          .describe('Map of assumption key → new numeric value. Percentages as decimals.'),
      }),
    },
  );

  return [getModelState, updateAssumption, updateAssumptions];
}
