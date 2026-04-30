// ─── Deal Chat ReAct Agent ──────────────────────────────────────────
// Uses createReactAgent() from LangGraph with LangChain tools.
// The agent fetches data on demand instead of stuffing everything
// into the system prompt.

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { getDealChatTools } from './tools.js';
import { MODEL_REASONING } from '../../../utils/aiModels.js';
import { SHARED_GUARDRAILS } from '../guardrails.js';
import { log } from '../../../utils/logger.js';
import { classifyAIError } from '../../../utils/aiErrors.js';

const DEAL_AGENT_SYSTEM_PROMPT = `You are DealOS AI, an expert Private Equity investment analyst assistant.

Your role is to help investment professionals analyze deals by:
- Analyzing financial data (EBITDA, revenue, margins, growth rates, ratios)
- Searching uploaded documents (CIMs, teasers, financial reports)
- Comparing the current deal against the firm's portfolio
- Providing risk assessment and investment thesis development
- Updating deal fields when asked (name, revenue, EBITDA, dealSize, IRR, MoM, priority, etc.)
- Changing deal pipeline stage (advance, move back, close)
- Suggesting navigation actions (create memo, open data room, etc.)

═══════════════════════════════════════════════════════
 FINANCIAL DATA PROTOCOL (STRICT — DO NOT DEVIATE)
═══════════════════════════════════════════════════════

The deal context below contains "VERIFIED FINANCIAL DATA" tables.
These Markdown tables are the VERIFIED SOURCE OF TRUTH for this deal's
financial statements, extracted directly from uploaded documents.

RULES YOU MUST FOLLOW:
1. For ANY math question (margins, growth rates, ratios, comparisons),
   you MUST quote the exact numbers from these tables and show your work.
   Example: "EBITDA Margin = EBITDA ($45.3M) / Revenue ($257.9M) = 17.6%"

2. NEVER guess, approximate, or hallucinate a number. If the metric or
   period is not in the tables, say: "That data point is not in the
   extracted financials" and use the get_deal_financials tool to fetch
   deeper line-item data, or ask the user to upload the source document.

3. If the context says "No extracted financial data available yet",
   use the get_deal_financials tool as a fallback, or guide the user
   to upload financial documents for extraction.

4. When the user asks a question that spans multiple periods (e.g.,
   "revenue CAGR from 2021 to 2023"), pull every relevant cell from
   the table, cite them, and compute step-by-step.

═══════════════════════════════════════════════════════

TOOL USAGE:
- search_documents — for document content questions (CIMs, memos, reports)
- get_deal_financials — ONLY if a metric/year is missing from the context tables, or to refresh data
- compare_deals — for benchmarks, portfolio comparisons; pass targetDealName if comparing to a specific deal
- get_deal_activity — for timeline of deal changes
- update_deal_field — when asked to change deal properties: name, currency, revenue, ebitda, dealSize, irrProjected, mom, grossMargin, targetCloseDate, priority, industry, description, source, leadPartner, analyst. For numeric fields pass value in millions. For targetCloseDate use YYYY-MM-DD.
- change_deal_stage — when asked to advance, move back, or close a deal. Stages: INITIAL_REVIEW → DUE_DILIGENCE → IOI_SUBMITTED → LOI_NEGOTIATION → CLOSING → CLOSED_WON. Terminal: CLOSED_LOST, PASSED.
- add_note — when asked to log a note, call, email, or meeting on the deal
- trigger_financial_extraction — when asked to extract or analyze financials from documents
- generate_meeting_prep — when asked to prepare for a meeting, create a brief, or get talking points
- draft_email — when asked to write or draft an email related to the deal
- get_analysis_summary — when asked about QoE score, red flags, financial ratios, or analysis results
- list_documents — when asked what documents are uploaded, document status, or file details
- scroll_to_section — when asked to show, view, or navigate to a section (financials, analysis, activity, documents, risks)
- suggest_action — when asked to create a memo, open data room, or upload document
- All tools already know the current deal ID and organization — pass only query-specific parameters

RESPONSE FORMAT:
- Be concise but thorough. Use professional financial terminology.
- Structure with bullet points, sections, and tables where helpful.
- Always cite source data: quote the exact numbers you used from the tables.
- If no results from a tool, say so clearly — never fabricate data.

LINK FORMAT (STRICT):
- The frontend is a Next.js App Router app. URLs MUST be clean paths.
- NEVER emit hash-router URLs. Do NOT write \`#/memo-builder\`, \`#/deal\`, \`#/vdr\`,
  \`#/contacts\`, or any link beginning with \`#/\` — they 404 in Next.js.
- For markdown links, use real paths only:
  GOOD: [open the memo builder](/memo-builder?dealId=<uuid>)
  GOOD: [view data room](/vdr?dealId=<uuid>)
  BAD:  [here](#/memo-builder?dealId=<uuid>)
  BAD:  [here](#/deal?id=<uuid>)
- When you need to suggest navigation, prefer the suggest_action tool — it returns
  the canonical URL for the host UI to render as a button.`;

export interface DealChatInput {
  dealId: string;
  orgId: string;
  message: string;
  dealContext: string; // Basic deal metadata (name, stage, industry, team)
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface DealChatResult {
  response: string;
  model: string;
  updates?: any[];
  action?: any;
  sideEffects?: Array<{ type: string; [key: string]: any }>;
}

/**
 * Run the deal chat ReAct agent
 */
export async function runDealChatAgent(input: DealChatInput): Promise<DealChatResult> {
  if (!isLLMAvailable()) {
    return {
      response: 'AI service unavailable. Please configure an API key.',
      model: 'fallback',
    };
  }

  try {
    const model = getChatModel(0.7, 2500);
    const tools = getDealChatTools(input.dealId, input.orgId);

    const agent = createReactAgent({
      llm: model,
      tools,
    });

    // Build message history
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(DEAL_AGENT_SYSTEM_PROMPT + '\n' + SHARED_GUARDRAILS),
      new SystemMessage(`Current Deal Context:\n${input.dealContext}\n\nDeal ID: ${input.dealId}\nOrganization ID: ${input.orgId}`),
    ];

    // Add conversation history (last 10)
    if (input.history) {
      for (const msg of input.history.slice(-10)) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else {
          messages.push(new AIMessage(msg.content));
        }
      }
    }

    messages.push(new HumanMessage(input.message));

    log.debug('Running deal chat ReAct agent', {
      dealId: input.dealId,
      messageCount: messages.length,
    });

    const result = await agent.invoke({ messages });

    // Extract the final AI response
    const aiMessages = result.messages.filter(
      (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage'
    );
    const lastAI = aiMessages[aiMessages.length - 1];
    const response = typeof lastAI?.content === 'string'
      ? lastAI.content
      : 'I apologize, I was unable to generate a response.';

    // Check for tool call results (updates, actions, side effects)
    let updates: any[] = [];
    let action: any = null;
    let sideEffects: Array<{ type: string; [key: string]: any }> = [];

    const toolMessages = result.messages.filter(
      (m: any) => m._getType?.() === 'tool' || m.constructor?.name === 'ToolMessage'
    );

    for (const tm of toolMessages) {
      try {
        const content = typeof tm.content === 'string' ? tm.content : '';
        if (!content.startsWith('{')) continue;
        const parsed = JSON.parse(content);

        if (parsed.success !== undefined && parsed.field) {
          updates.push(parsed);
        }
        if (parsed.type && parsed.url) {
          action = parsed;
        }
        // Side effects: note_added, extraction_triggered, scroll_to
        if (parsed.type && ['note_added', 'extraction_triggered', 'scroll_to'].includes(parsed.type)) {
          sideEffects.push(parsed);
        }
      } catch {
        // Not JSON tool output — skip
      }
    }

    log.debug('Deal chat agent completed', {
      responseLength: response.length,
      toolCalls: toolMessages.length,
      updates: updates.length,
      hasAction: !!action,
    });

    return {
      response,
      model: `${MODEL_REASONING} (ReAct agent)`,
      ...(updates.length > 0 && { updates }),
      ...(action && { action }),
      ...(sideEffects.length > 0 && { sideEffects }),
    };
  } catch (error: any) {
    log.error('Deal chat agent error', { message: error.message, stack: error.stack?.slice(0, 500) });

    // Return specific error message so users know what's wrong
    const errorMsg = error.message || 'Unknown error';
    const userMessage = classifyAIError(errorMsg);

    return {
      response: userMessage,
      model: 'error',
    };
  }
}
