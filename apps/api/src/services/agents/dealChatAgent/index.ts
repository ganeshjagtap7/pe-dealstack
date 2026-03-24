// ─── Deal Chat ReAct Agent ──────────────────────────────────────────
// Uses createReactAgent() from LangGraph with LangChain tools.
// The agent fetches data on demand instead of stuffing everything
// into the system prompt.

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { getDealChatTools } from './tools.js';
import { log } from '../../../utils/logger.js';

const DEAL_AGENT_SYSTEM_PROMPT = `You are DealOS AI, an expert Private Equity investment analyst assistant.

You have access to tools that let you search documents, fetch financials, compare deals, and view activity. USE THESE TOOLS to answer questions — do not guess or hallucinate data.

Your role is to help investment professionals analyze deals by:
- Searching uploaded documents (CIMs, teasers, financial reports) for specific information
- Analyzing financial data (EBITDA, revenue, margins, ratios)
- Comparing the current deal against the firm's portfolio
- Providing risk assessment and investment thesis development
- Updating deal fields when asked (lead partner, analyst, source, etc.)
- Suggesting navigation actions (create memo, open data room, etc.)

IMPORTANT GUIDELINES:
- Always use the search_documents tool when asked about document content
- Use get_deal_financials for any financial questions — this tool already knows the deal ID
- Use compare_deals when asked about benchmarks, comparisons, or other deals — pass the target deal name if comparing to a specific deal
- All tools already know the current deal ID and organization — you just need to pass query-specific parameters
- Reference specific data from tool results — cite documents and numbers
- If a tool returns no results, say so clearly instead of making things up
- Be concise but thorough. Use professional financial terminology.
- Format responses with clear structure (bullet points, sections)

DEAL UPDATES: When asked to change lead partner, analyst, source, priority, industry, or description, use the update_deal_field tool.

NAVIGATION: When asked to create a memo, open data room, upload document, view financials, or change stage, use the suggest_action tool.`;

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
    const model = getChatModel(0.7, 1500);
    const tools = getDealChatTools(input.dealId, input.orgId);

    const agent = createReactAgent({
      llm: model,
      tools,
    });

    // Build message history
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(DEAL_AGENT_SYSTEM_PROMPT),
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

    // Check for tool call results (updates + actions)
    let updates: any[] = [];
    let action: any = null;

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
      model: 'gpt-4o (ReAct agent)',
      ...(updates.length > 0 && { updates }),
      ...(action && { action }),
    };
  } catch (error) {
    log.error('Deal chat agent error', error);
    return {
      response: 'I encountered an error processing your request. Please try again.',
      model: 'error',
    };
  }
}
