import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('Warning: OPENAI_API_KEY not set. AI features will be disabled.');
}

export const openai = apiKey ? new OpenAI({ apiKey }) : null;

export const isAIEnabled = () => !!openai;

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
