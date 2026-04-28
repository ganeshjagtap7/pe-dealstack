import OpenAI from 'openai';
import dotenv from 'dotenv';
import { log } from './utils/logger.js';
import { OPENROUTER_BASE_URL, OPENROUTER_HEADERS, isOpenRouterEnabled } from './utils/aiModels.js';

dotenv.config();

// Prefer OpenRouter (unified gateway routing Claude + GPT-4.1 family) when configured.
// OpenRouter is OpenAI-API-compatible, so the existing OpenAI SDK works as a drop-in
// once we swap the baseURL and key. Falls back to direct OpenAI otherwise.
const openRouterKey = process.env.OPENROUTER_API_KEY;
const openAIKey = process.env.OPENAI_API_KEY;
const useOpenRouter = isOpenRouterEnabled();

const apiKey = useOpenRouter ? openRouterKey : openAIKey;

if (!apiKey) {
  log.warn('No LLM API key set (OPENROUTER_API_KEY / OPENAI_API_KEY), AI features disabled');
}

export const openai = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: useOpenRouter ? OPENROUTER_BASE_URL : undefined,
      defaultHeaders: useOpenRouter ? OPENROUTER_HEADERS : undefined,
    })
  : null;

// Direct OpenAI client (never routed through OpenRouter). Required for code paths
// that depend on OpenAI-specific endpoints like the Responses API (PDF file inputs
// for vision extraction), which OpenRouter does not proxy.
export const openaiDirect = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;

export const isAIEnabled = () => !!openai;

log.info('LLM client status', {
  enabled: isAIEnabled(),
  provider: useOpenRouter ? 'openrouter' : 'openai-direct',
});

// System prompt for deal analysis
export const DEAL_ANALYSIS_SYSTEM_PROMPT = `You are DealOS AI, an expert private equity analyst assistant. You help analyze deals, financial data, and investment opportunities.

Your expertise includes:
- Financial analysis (EBITDA, revenue, margins, multiples)
- Deal evaluation and risk assessment
- Investment thesis development
- Due diligence support
- Market and competitive analysis

Guidelines:
- Be concise but thorough
- Use specific numbers and data when available
- Highlight both opportunities and risks
- Reference documents when citing information
- Use professional financial terminology
- Format responses with clear structure (bullet points, sections)

When analyzing a deal, consider:
1. Financial performance and trends
2. Valuation multiples vs. market comparables
3. Key risks and mitigants
4. Growth drivers and opportunities
5. Management and operational factors`;

// Generate deal context for AI
export function generateDealContext(deal: any): string {
  const context = [];

  context.push(`Deal: ${deal.name}`);
  context.push(`Industry: ${deal.industry || 'N/A'}`);
  context.push(`Stage: ${deal.stage}`);
  context.push(`Status: ${deal.status}`);

  if (deal.revenue) context.push(`Revenue: $${deal.revenue}M`);
  if (deal.ebitda) context.push(`EBITDA: $${deal.ebitda}M`);
  if (deal.dealSize) context.push(`Deal Size: $${deal.dealSize}M`);
  if (deal.irrProjected) context.push(`Projected IRR: ${deal.irrProjected}%`);
  if (deal.mom) context.push(`MoM: ${deal.mom}x`);

  if (deal.aiThesis) {
    context.push(`\nCurrent AI Thesis: ${deal.aiThesis}`);
  }

  if (deal.company) {
    context.push(`\nCompany: ${deal.company.name}`);
    if (deal.company.description) context.push(`Description: ${deal.company.description}`);
  }

  if (deal.documents && deal.documents.length > 0) {
    context.push(`\nAvailable Documents:`);
    deal.documents.forEach((doc: any) => {
      context.push(`- ${doc.name} (${doc.type})`);
    });
  }

  if (deal.activities && deal.activities.length > 0) {
    context.push(`\nRecent Activities:`);
    deal.activities.slice(0, 5).forEach((activity: any) => {
      context.push(`- ${activity.title}: ${activity.description || ''}`);
    });
  }

  return context.join('\n');
}
