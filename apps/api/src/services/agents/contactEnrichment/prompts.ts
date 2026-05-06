// ─── Contact Enrichment Agent — Prompt + Schema ──────────────────
// LLM prompt and structured-output schema for the research node.

import { z } from 'zod';

export function buildResearchPrompt(state: {
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  crmContext: string;
  documentMentions: string[];
  linkedDeals: any[];
}): string {
  const hasCRMData = state.documentMentions.length > 0 || state.linkedDeals.length > 0;

  return `You are enriching a contact profile for a private equity CRM. You have REAL data from the firm's CRM system below.

CONTACT:
- Name: ${state.firstName} ${state.lastName}
- Email: ${state.email || 'Not provided'}
- Company: ${state.company || 'Not provided'}
- Title: ${state.title || 'Not provided'}

CRM DATA FOUND:
${state.crmContext}

YOUR JOB:
1. Synthesize what we KNOW about this person from the CRM data above
2. Identify their role, company, and relevance to our deals
3. ${hasCRMData ? 'Use the document excerpts and deal links to build a real profile' : 'With no CRM data, only provide what can be inferred from the email domain and provided fields'}
4. Set fields to null if you genuinely cannot determine them
5. The "bio" should summarize what we know from OUR data, not generic info
6. "dealRelevance" = how relevant this person is to our active deals

CONFIDENCE RULES:
- ${hasCRMData ? 'CRM data found → base confidence 40-60% depending on quality' : 'No CRM data → base confidence should be low (15-35%)'}
- Corporate email with company match → +10%
- Found in deal documents → +15%
- Linked to active deals → +10%
- Personal email + no CRM data → max 25%

Generate a JSON response:
{
  "title": "job title or null",
  "company": "company name or null",
  "industry": "industry or null",
  "location": "location or null if cannot determine",
  "bio": "2-3 sentence profile based on CRM data, or null if no data",
  "expertise": ["area1"] or [],
  "contactType": "one of: founder_owner, investment_banker, advisor_consultant, management_team, legal_counsel, lp_investor, co_investor, board_member, intermediary, other",
  "dealRelevance": "high/medium/low",
  "confidence": 0-100,
  "keyInsight": "One actionable sentence: WHY this person matters to our deals and WHAT to do next (e.g. 'CEO of target company in active deal — schedule intro call' or 'Banker who covers healthcare M&A — add to outreach list')",
  "suggestedAction": "One concrete next step: 'Schedule meeting', 'Add to deal team', 'Request warm intro via [person]', 'Add to outreach pipeline', or null"
}`;
}

export const enrichmentSchema = z.object({
  title: z.string().nullable().optional().default(null),
  company: z.string().nullable().optional().default(null),
  industry: z.string().nullable().optional().default(null),
  location: z.string().nullable().optional().default(null),
  bio: z.string().nullable().optional().default(null),
  expertise: z.array(z.string()).optional().default([]),
  contactType: z.string().optional().default('other'),
  dealRelevance: z.string().optional().default('low'),
  confidence: z.number().optional().default(25),
  keyInsight: z.string().nullable().optional().default(null),
  suggestedAction: z.string().nullable().optional().default(null),
});

export type EnrichmentSchemaResult = z.infer<typeof enrichmentSchema>;
