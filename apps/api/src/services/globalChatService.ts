// ─── Global (non-deal-scoped) AI Chat Service ──────────────────────
// Powers the bottom-right floating AI assistant (frontend AIAssistant.tsx)
// when the user is NOT on a per-deal view. The per-deal branch posts to
// /deals/:dealId/chat (runDealChatAgent); this service backs the global
// branch POST /api/ai/chat for the dashboard / deals / contacts / memo /
// general contexts.
//
// Dispatch:
//   - dashboard | deals → portfolio-aware answer. We assemble a bounded
//     org portfolio summary (deal counts, revenue/EBITDA/IRR, stage +
//     industry breakdown, top deals) and feed it to the chat model as
//     context. This mirrors ai-portfolio.ts's get_portfolio_summary tool
//     output WITHOUT importing/altering that route — kept here as a small
//     shared helper so the floating chat works org-wide without a dealId.
//   - contacts | memo | general → lightweight org-scoped LLM call with a
//     "PE deal platform assistant" system prompt (no extra data fetch).
//     `memo` has no memo id at the global level, so it's treated as general.
//
// Token usage is bounded: portfolio summary is capped (top 10 deals), and
// the model is constructed with an explicit maxTokens.

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { supabase } from '../supabase.js';
import { getChatModel } from './llm.js';
import { log } from '../utils/logger.js';

// Usage-tracking operation label (see services/llm.ts). Matches the label the
// portfolio chat route uses so global-chat traffic lands in the same bucket.
const CHAT_OPERATION = 'deal_analysis';

export type GlobalChatContext = 'dashboard' | 'deals' | 'contacts' | 'memo' | 'general';

const PORTFOLIO_CONTEXTS = new Set<GlobalChatContext>(['dashboard', 'deals']);

export interface GlobalChatResult {
  response: string;
  model: string;
}

/** Coerce an arbitrary context string from the client into a known context. */
export function normalizeContext(raw: string | undefined): GlobalChatContext {
  switch (raw) {
    case 'dashboard':
    case 'deals':
    case 'contacts':
    case 'memo':
      return raw;
    default:
      return 'general';
  }
}

/**
 * Build a bounded portfolio summary string for an org. Mirrors the data
 * shape of ai-portfolio.ts's get_portfolio_summary tool (revenue, EBITDA,
 * IRR, stage/industry breakdown, top 10 deals) but as a plain helper so the
 * global chat can include it as static context without spinning up a
 * tool-using agent.
 */
async function buildPortfolioContext(orgId: string): Promise<string> {
  const { data: deals } = await supabase
    .from('Deal')
    .select('id, name, stage, status, industry, revenue, ebitda, dealSize, irrProjected, mom, createdAt')
    .eq('organizationId', orgId)
    .order('updatedAt', { ascending: false });

  if (!deals || deals.length === 0) {
    return 'The firm currently has no deals in its pipeline.';
  }

  const active = deals.filter(d => d.status !== 'PASSED' && d.stage !== 'CLOSED_LOST');
  const totalRevenue = active.reduce((s, d) => s + (d.revenue || 0), 0);
  const totalEbitda = active.reduce((s, d) => s + (d.ebitda || 0), 0);
  const withIRR = active.filter(d => d.irrProjected);
  const avgIRR = withIRR.length > 0
    ? withIRR.reduce((s, d) => s + (d.irrProjected || 0), 0) / withIRR.length
    : 0;

  const stageCount: Record<string, number> = {};
  const industryCount: Record<string, number> = {};
  for (const d of active) {
    stageCount[d.stage] = (stageCount[d.stage] || 0) + 1;
    if (d.industry) industryCount[d.industry] = (industryCount[d.industry] || 0) + 1;
  }

  const parts: string[] = [
    `Total Deals: ${deals.length} (${active.length} active)`,
    `Total Revenue: $${totalRevenue.toFixed(1)}M`,
    `Total EBITDA: $${totalEbitda.toFixed(1)}M`,
    `Average IRR: ${avgIRR.toFixed(1)}%`,
    `By Stage: ${Object.entries(stageCount).map(([k, v]) => `${k}: ${v}`).join(', ') || 'n/a'}`,
    `By Industry: ${Object.entries(industryCount).map(([k, v]) => `${k}: ${v}`).join(', ') || 'n/a'}`,
    `Top ${Math.min(10, active.length)} Active Deals:`,
  ];
  for (const d of active.slice(0, 10)) {
    parts.push(`- ${d.name} (${d.industry || 'N/A'}): ${d.stage}, Rev $${d.revenue || 0}M, EBITDA $${d.ebitda || 0}M`);
  }
  return parts.join('\n');
}

/** Resolve the org's display name for grounding the system prompt. */
async function getOrgName(orgId: string): Promise<string> {
  const { data } = await supabase
    .from('Organization')
    .select('name')
    .eq('id', orgId)
    .single();
  return data?.name || 'your firm';
}

/**
 * Run the global (non-deal-scoped) chat. Returns the assistant text plus the
 * model name. Throws on LLM failure — the caller maps that to a 500 via the
 * codebase's classifyAIErrorObject pattern.
 */
export async function runGlobalChat(params: {
  orgId: string;
  message: string;
  context: GlobalChatContext;
}): Promise<GlobalChatResult> {
  const { orgId, message, context } = params;

  const orgName = await getOrgName(orgId);
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Portfolio-aware contexts get a bounded portfolio summary injected.
  let systemPrompt: string;
  let maxTokens: number;
  if (PORTFOLIO_CONTEXTS.has(context)) {
    const portfolio = await buildPortfolioContext(orgId);
    maxTokens = 1200;
    systemPrompt = `You are an AI portfolio assistant for ${orgName}, a Private Equity firm. Answer the user's question using ONLY the firm's portfolio data below. Cite specific numbers (revenue, EBITDA, IRR, stage) and deal names where relevant. If the data doesn't contain the answer, say so plainly rather than guessing. Be concise.

Today's date: ${today}

Firm Portfolio Snapshot:
${portfolio}`;
  } else {
    // contacts / memo / general → lightweight, no extra data fetch.
    maxTokens = 800;
    systemPrompt = `You are an AI assistant inside ${orgName}'s Private Equity deal management platform. You help users navigate deals, contacts, data rooms, and investment memos. Give concise, practical answers. You do NOT have access to specific deal or contact records in this conversation — if the user asks about a specific deal's data, point them to that deal's page where a deal-scoped assistant has full context.

Today's date: ${today}`;
  }

  const model = getChatModel(0.3, maxTokens, CHAT_OPERATION);

  log.info('Global AI chat', { context, query: message.substring(0, 50) });

  const result = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(message),
  ]);

  const response = typeof result.content === 'string'
    ? result.content
    : Array.isArray(result.content)
      ? result.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('')
      : 'Unable to generate a response.';

  // getChatModel tags usage by operation; surface a stable model label to the
  // client. We don't have the resolved provider model name on the message, so
  // report the configured chat model identifier.
  const modelName = (result as any).response_metadata?.model_name
    || (result as any).response_metadata?.model
    || 'chat';

  return {
    response: response || 'Unable to generate a response.',
    model: modelName,
  };
}
