// ─── Valuation (LBO) Chat ReAct Agent ──────────────────────────────
// Stateful per request: tools mutate a `state` container so multiple
// tool calls within one invocation compound (agent reads state, makes
// changes, reads again). The route persists `state.assumptions` after.

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { getValuationChatTools, type ValuationAgentState } from './tools.js';
import { MODEL_REASONING } from '../../../utils/aiModels.js';
import { SHARED_GUARDRAILS } from '../guardrails.js';
import { log } from '../../../utils/logger.js';
import { classifyAIError } from '../../../utils/aiErrors.js';
import {
  ASSUMPTION_KEYS,
  ASSUMPTION_LABELS,
  computeLBO,
  summarizeForLLM,
  type LBOAssumptions,
} from '../../../lib/lbo-model.js';

const VALUATION_AGENT_SYSTEM_PROMPT = `You are an expert LBO modeler embedded in PE OS. The user is editing a standalone leveraged buyout model and can ask you to read it, explain it, or modify assumptions.

═══════════════════════════════════════════════════════
 LBO MODEL CONTRACT
═══════════════════════════════════════════════════════

Model assumptions (the only fields you can modify via tools):
${ASSUMPTION_KEYS.map(k => `- ${k} — ${ASSUMPTION_LABELS[k]}`).join('\n')}

VALUE FORMAT (CRITICAL — common mistake):
- Percentages are stored as DECIMALS. 10% = 0.10. 12% = 0.12. 60% = 0.60.
  When the user says "raise WACC to 12%" you must call update_assumption with value=0.12.
- Multiples are plain numbers (entryMultiple of 10x = 10, 9.5x = 9.5).
- Currency (revenueY0) is in $ millions (100 means $100M).
- exitYear is an integer number of years.

WACC vs interestRate: the model now has both.
- interestRate = cash interest rate paid on debt (drives the debt schedule, affects FCF and IRR).
- wacc = weighted-average cost of capital, used as a hurdle rate for comparison only — it does NOT affect the cashflows or IRR. The Returns tab shows IRR Spread vs WACC. When the user says "raise WACC to 12%", call update_assumption with key="wacc" and value=0.12. When they say "raise the interest rate" or "the cost of debt", use key="interestRate".

═══════════════════════════════════════════════════════
 TOOLS
═══════════════════════════════════════════════════════

- get_model_state — call ONCE at the start of any analytical question to see current assumptions and computed outputs (MOIC, IRR, debt schedule, etc.).
- update_assumption — change ONE assumption. Use this for single edits ("raise the entry multiple to 11").
- update_assumptions — change multiple assumptions at once. Use for stress tests and scenarios ("stress test with 12% rate and 8x exit").

After updating, the tool returns the new MOIC, IRR, equity proceeds, and ending debt — quote these in your reply so the user immediately sees the impact.

═══════════════════════════════════════════════════════
 RESPONSE STYLE
═══════════════════════════════════════════════════════

- Concise. PE professionals are time-constrained.
- For analytical questions: lead with the answer (the metric value), then 1-2 sentences of context.
- For modifications: state what changed, then the resulting MOIC and IRR.
- Use the format $X.XM for currency, X.X% for percentages, X.XXx for multiples.
- Never invent assumption keys outside the contract above.
- Never claim to have updated a value without actually calling the tool.`;

export interface ValuationChatInput {
  modelId: string;
  orgId: string;
  message: string;
  assumptions: LBOAssumptions;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ValuationChatResult {
  response: string;
  model: string;
  updatedAssumptions?: LBOAssumptions;
  changedKeys?: string[];
  applied: boolean;
}

export async function runValuationChatAgent(
  input: ValuationChatInput,
): Promise<ValuationChatResult> {
  if (!isLLMAvailable()) {
    return {
      response: 'AI service unavailable. Please configure an API key.',
      model: 'fallback',
      applied: false,
    };
  }

  // Mutable state shared across all tool invocations in this request.
  const state: ValuationAgentState = {
    assumptions: { ...input.assumptions },
    changedKeys: new Set(),
  };

  try {
    const llm = getChatModel(0.3, 1500, 'valuation_chat');
    const tools = getValuationChatTools(state);
    const agent = createReactAgent({ llm, tools });

    const initialOutputs = computeLBO(state.assumptions);
    const initialContext = summarizeForLLM(state.assumptions, initialOutputs);

    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(VALUATION_AGENT_SYSTEM_PROMPT + '\n\n' + SHARED_GUARDRAILS),
      new SystemMessage(`Current model state at start of turn:\n\n${initialContext}\n\nModel ID: ${input.modelId}`),
    ];

    if (input.history) {
      for (const msg of input.history.slice(-10)) {
        if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
        else messages.push(new AIMessage(msg.content));
      }
    }
    messages.push(new HumanMessage(input.message));

    log.debug('Running valuation chat agent', {
      modelId: input.modelId,
      messageCount: messages.length,
    });

    const result = await agent.invoke({ messages });

    const aiMessages = result.messages.filter(
      (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage',
    );
    const lastAI = aiMessages[aiMessages.length - 1];
    const response = typeof lastAI?.content === 'string'
      ? lastAI.content
      : 'I was unable to generate a response.';

    const applied = state.changedKeys.size > 0;
    return {
      response,
      model: `${MODEL_REASONING} (ReAct agent)`,
      ...(applied && {
        updatedAssumptions: state.assumptions,
        changedKeys: Array.from(state.changedKeys),
      }),
      applied,
    };
  } catch (error: any) {
    log.error('Valuation chat agent error', {
      message: error?.message,
      stack: error?.stack?.slice(0, 500),
    });
    const userMessage = classifyAIError(error?.message || 'Unknown error');
    return {
      response: userMessage,
      model: 'error',
      applied: false,
    };
  }
}
