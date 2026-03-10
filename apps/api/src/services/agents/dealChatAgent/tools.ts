// ─── LangChain Tools for Deal Chat Agent ───────────────────────────
// Tools the deal chat ReAct agent can invoke on demand instead of
// stuffing all deal data into the system prompt.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../supabase.js';
import { searchDocumentChunks, buildRAGContext, isRAGEnabled } from '../../../rag.js';
import { log } from '../../../utils/logger.js';

/**
 * Semantic search across deal documents using RAG
 */
export const searchDocumentsTool = tool(
  async ({ query, dealId }) => {
    try {
      if (!isRAGEnabled()) {
        // Fallback: keyword search on extracted text
        const { data: docs } = await supabase
          .from('Document')
          .select('id, name, type, extractedText')
          .eq('dealId', dealId)
          .not('extractedText', 'is', null);

        if (!docs || docs.length === 0) return 'No documents found for this deal.';

        const queryLower = query.toLowerCase();
        const relevant = docs.filter(d =>
          d.extractedText?.toLowerCase().includes(queryLower) ||
          d.name.toLowerCase().includes(queryLower)
        );

        if (relevant.length === 0) return 'No relevant content found in documents.';

        return relevant.map(d => {
          const text = d.extractedText || '';
          const idx = text.toLowerCase().indexOf(queryLower);
          const start = Math.max(0, idx - 200);
          const end = Math.min(text.length, idx + queryLower.length + 500);
          return `### ${d.name}\n${text.slice(start, end)}`;
        }).join('\n\n');
      }

      const searchResults = await searchDocumentChunks(query, dealId, 8, 0.4);

      if (searchResults.length === 0) return 'No relevant content found in documents.';

      const { data: docs } = await supabase
        .from('Document')
        .select('id, name, type')
        .eq('dealId', dealId);

      return buildRAGContext(searchResults, docs || []);
    } catch (error) {
      log.error('searchDocuments tool error', error);
      return 'Error searching documents.';
    }
  },
  {
    name: 'search_documents',
    description: 'Search through all uploaded deal documents using semantic search. Use this when the user asks about specific information from documents, CIMs, financial reports, etc.',
    schema: z.object({
      query: z.string().describe('The search query — what information to find in the documents'),
      dealId: z.string().describe('The deal ID to search documents for'),
    }),
  }
);

/**
 * Fetch financial data (statements, analysis, ratios) for a deal
 */
export const getDealFinancialsTool = tool(
  async ({ dealId }) => {
    try {
      const { data: statements } = await supabase
        .from('FinancialStatement')
        .select('statementType, period, extractedData, confidence, extractionSource, isActive')
        .eq('dealId', dealId)
        .eq('isActive', true)
        .order('period', { ascending: false });

      if (!statements || statements.length === 0) {
        return 'No financial statements extracted for this deal yet.';
      }

      const summary: string[] = [`Found ${statements.length} active financial statements:`];

      // Group by type
      const byType: Record<string, typeof statements> = {};
      for (const s of statements) {
        byType[s.statementType] = byType[s.statementType] || [];
        byType[s.statementType].push(s);
      }

      for (const [type, stmts] of Object.entries(byType)) {
        summary.push(`\n**${type}** (${stmts.length} periods):`);
        for (const s of stmts.slice(0, 5)) {
          const data = s.extractedData as any;
          const items = Array.isArray(data) ? data : [];
          const revenue = items.find((i: any) => i.label?.toLowerCase().includes('revenue'));
          const ebitda = items.find((i: any) => i.label?.toLowerCase().includes('ebitda'));
          const lineCount = items.length;

          summary.push(`  - ${s.period}: ${lineCount} line items, confidence ${s.confidence}%, source: ${s.extractionSource}`);
          if (revenue) summary.push(`    Revenue: $${revenue.value}M`);
          if (ebitda) summary.push(`    EBITDA: $${ebitda.value}M`);
        }
      }

      // Also fetch deal-level financial metrics
      const { data: deal } = await supabase
        .from('Deal')
        .select('revenue, ebitda, dealSize, irrProjected, mom')
        .eq('id', dealId)
        .single();

      if (deal) {
        summary.push('\n**Deal-Level Metrics:**');
        if (deal.revenue) summary.push(`  Revenue: $${deal.revenue}M`);
        if (deal.ebitda) summary.push(`  EBITDA: $${deal.ebitda}M`);
        if (deal.dealSize) summary.push(`  Deal Size: $${deal.dealSize}M`);
        if (deal.irrProjected) summary.push(`  Projected IRR: ${deal.irrProjected}%`);
        if (deal.mom) summary.push(`  MoM: ${deal.mom}x`);
      }

      return summary.join('\n');
    } catch (error) {
      log.error('getDealFinancials tool error', error);
      return 'Error fetching financial data.';
    }
  },
  {
    name: 'get_deal_financials',
    description: 'Fetch extracted financial statements and deal-level metrics (revenue, EBITDA, IRR, MoM). Use when user asks about financials, numbers, or analysis.',
    schema: z.object({
      dealId: z.string().describe('The deal ID to fetch financials for'),
    }),
  }
);

/**
 * Compare current deal against other deals in the portfolio
 */
export const compareDealsTool = tool(
  async ({ dealId, orgId }) => {
    try {
      // Get current deal
      const { data: currentDeal } = await supabase
        .from('Deal')
        .select('id, name, industry, revenue, ebitda, dealSize, irrProjected, mom, stage')
        .eq('id', dealId)
        .single();

      if (!currentDeal) return 'Deal not found.';

      // Get comparable deals (same org, optionally same industry)
      const { data: deals } = await supabase
        .from('Deal')
        .select('id, name, industry, revenue, ebitda, dealSize, irrProjected, mom, stage')
        .eq('organizationId', orgId)
        .neq('id', dealId)
        .order('updatedAt', { ascending: false })
        .limit(20);

      if (!deals || deals.length === 0) return 'No other deals in the portfolio to compare against.';

      const sameIndustry = deals.filter(d => d.industry === currentDeal.industry);
      const allDeals = deals;

      const parts: string[] = [`**Comparison: ${currentDeal.name}**\n`];

      // Current deal metrics
      parts.push('Current Deal:');
      parts.push(`  Industry: ${currentDeal.industry || 'N/A'}, Revenue: $${currentDeal.revenue || 0}M, EBITDA: $${currentDeal.ebitda || 0}M`);
      parts.push(`  Deal Size: $${currentDeal.dealSize || 0}M, IRR: ${currentDeal.irrProjected || 'N/A'}%, MoM: ${currentDeal.mom || 'N/A'}x\n`);

      // Portfolio averages
      const withRevenue = allDeals.filter(d => d.revenue);
      const withEbitda = allDeals.filter(d => d.ebitda);
      const avgRevenue = withRevenue.length > 0 ? withRevenue.reduce((s, d) => s + (d.revenue || 0), 0) / withRevenue.length : 0;
      const avgEbitda = withEbitda.length > 0 ? withEbitda.reduce((s, d) => s + (d.ebitda || 0), 0) / withEbitda.length : 0;

      parts.push(`Portfolio Averages (${allDeals.length} deals):`);
      parts.push(`  Avg Revenue: $${avgRevenue.toFixed(1)}M, Avg EBITDA: $${avgEbitda.toFixed(1)}M`);

      if (sameIndustry.length > 0) {
        parts.push(`\nSame Industry (${currentDeal.industry}, ${sameIndustry.length} deals):`);
        for (const d of sameIndustry.slice(0, 5)) {
          parts.push(`  - ${d.name}: Revenue $${d.revenue || 0}M, EBITDA $${d.ebitda || 0}M, ${d.stage}`);
        }
      }

      // Percentile rankings
      if (currentDeal.revenue && withRevenue.length >= 3) {
        const rank = withRevenue.filter(d => (d.revenue || 0) < currentDeal.revenue!).length;
        const percentile = Math.round((rank / withRevenue.length) * 100);
        parts.push(`\nRevenue Percentile: ${percentile}th (${rank + 1} of ${withRevenue.length + 1})`);
      }

      return parts.join('\n');
    } catch (error) {
      log.error('compareDeals tool error', error);
      return 'Error comparing deals.';
    }
  },
  {
    name: 'compare_deals',
    description: 'Compare the current deal metrics against other deals in the firm portfolio. Shows percentile rankings and industry comparisons.',
    schema: z.object({
      dealId: z.string().describe('The current deal ID'),
      orgId: z.string().describe('The organization ID for portfolio scope'),
    }),
  }
);

/**
 * Fetch recent activity and timeline for a deal
 */
export const getDealActivityTool = tool(
  async ({ dealId, limit }) => {
    try {
      const { data: activities } = await supabase
        .from('Activity')
        .select('type, title, description, createdAt')
        .eq('dealId', dealId)
        .order('createdAt', { ascending: false })
        .limit(limit || 15);

      if (!activities || activities.length === 0) return 'No activities recorded for this deal.';

      const parts: string[] = [`**Recent Activity (${activities.length} items):**\n`];

      for (const a of activities) {
        const date = new Date(a.createdAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        });
        parts.push(`- [${date}] **${a.type}**: ${a.title}${a.description ? ` — ${a.description}` : ''}`);
      }

      return parts.join('\n');
    } catch (error) {
      log.error('getDealActivity tool error', error);
      return 'Error fetching activity.';
    }
  },
  {
    name: 'get_deal_activity',
    description: 'Fetch recent activity timeline for a deal — document uploads, status changes, team updates, chat history, etc.',
    schema: z.object({
      dealId: z.string().describe('The deal ID'),
      limit: z.number().optional().describe('Max activities to return (default 15)'),
    }),
  }
);

/**
 * Update a field on the deal (lead partner, analyst, source, priority, etc.)
 */
export const updateDealFieldTool = tool(
  async ({ dealId, field, value, userName }) => {
    try {
      if (field === 'leadPartner' || field === 'analyst') {
        const role = field === 'leadPartner' ? 'LEAD' : 'MEMBER';

        const { data: existingMember } = await supabase
          .from('DealTeamMember')
          .select('id')
          .eq('dealId', dealId)
          .eq('userId', value)
          .single();

        if (existingMember) {
          await supabase
            .from('DealTeamMember')
            .update({ role })
            .eq('id', existingMember.id);
        } else {
          await supabase
            .from('DealTeamMember')
            .insert({ dealId, userId: value, role });
        }

        await supabase
          .from('Deal')
          .update({ updatedAt: new Date().toISOString() })
          .eq('id', dealId);

        await supabase.from('Activity').insert({
          dealId,
          type: 'TEAM_MEMBER_ADDED',
          title: `${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'} Updated`,
          description: `${userName || 'Team member'} assigned as ${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'}`,
        });

        return JSON.stringify({ success: true, field, value, userName });
      }

      const updateData: Record<string, any> = {};
      updateData[field] = value;
      updateData.updatedAt = new Date().toISOString();

      await supabase.from('Deal').update(updateData).eq('id', dealId);

      await supabase.from('Activity').insert({
        dealId,
        type: 'STATUS_UPDATED',
        title: `${field.charAt(0).toUpperCase() + field.slice(1)} Updated`,
        description: `Changed to: ${value}`,
      });

      return JSON.stringify({ success: true, field, value });
    } catch (error) {
      log.error('updateDealField tool error', error);
      return JSON.stringify({ success: false, error: 'Failed to update deal field' });
    }
  },
  {
    name: 'update_deal_field',
    description: 'Update a field on the current deal. Use when the user asks to change lead partner, analyst, source, priority, industry, or description.',
    schema: z.object({
      dealId: z.string().describe('The deal ID'),
      field: z.enum(['leadPartner', 'analyst', 'source', 'priority', 'industry', 'description']),
      value: z.string().describe('New value. For leadPartner/analyst, use user ID.'),
      userName: z.string().optional().describe('Name of user being assigned (for confirmation message)'),
    }),
  }
);

/**
 * Suggest a navigation action (create memo, open VDR, etc.)
 */
export const suggestActionTool = tool(
  async ({ dealId, actionType, label, description }) => {
    const urlMap: Record<string, string> = {
      create_memo: `/memo-builder.html?dealId=${dealId}`,
      open_data_room: `/vdr.html?dealId=${dealId}`,
      upload_document: `/vdr.html?dealId=${dealId}&action=upload`,
      view_financials: `/deal.html?id=${dealId}#financials`,
      change_stage: `/deal.html?id=${dealId}&action=change_stage`,
    };

    return JSON.stringify({
      type: actionType,
      label,
      description,
      url: urlMap[actionType] || `/deal.html?id=${dealId}`,
    });
  },
  {
    name: 'suggest_action',
    description: 'Suggest navigation to another page: create memo, open data room, upload document, view financials, change deal stage.',
    schema: z.object({
      dealId: z.string().describe('The deal ID'),
      actionType: z.enum(['create_memo', 'open_data_room', 'upload_document', 'view_financials', 'change_stage']),
      label: z.string().describe('Button label text'),
      description: z.string().optional().describe('Brief explanation of what happens'),
    }),
  }
);

/** All deal chat tools for the ReAct agent */
export function getDealChatTools(dealId: string, orgId: string) {
  return [
    searchDocumentsTool,
    getDealFinancialsTool,
    compareDealsTool,
    getDealActivityTool,
    updateDealFieldTool,
    suggestActionTool,
  ];
}
