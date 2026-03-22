// ─── Deal Chat AI Route — ReAct Agent ───────────────────────────────
// Uses LangGraph ReAct agent with LangChain tools for on-demand data
// fetching instead of stuffing everything into the system prompt.

import { Router } from 'express';
import { supabase } from '../supabase.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import { isLLMAvailable } from '../services/llm.js';
import { runDealChatAgent } from '../services/agents/dealChatAgent/index.js';
import { generateFallbackResponse } from '../services/chatHelpers.js';

const router = Router();

// POST /api/deals/:dealId/chat - Send a message to AI about this deal
router.post('/:dealId/chat', async (req, res) => {
  log.debug('Chat request received', { dealId: req.params.dealId });

  try {
    const { dealId } = req.params;
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify deal belongs to user's org before any data access
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Get deal with basic context (agent fetches details on demand via tools)
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, dealSize, revenue, ebitda,
        irrProjected, mom, aiThesis, description, source, organizationId,
        company:Company(id, name, description),
        teamMembers:DealTeamMember(role, user:User(id, name, email, title))
      `)
      .eq('id', dealId)
      .single();

    if (dealError) {
      if (dealError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw dealError;
    }

    // Check AI availability
    if (!isLLMAvailable()) {
      return res.json({
        response: generateFallbackResponse(message, deal),
        model: 'fallback',
      });
    }

    // Build lightweight deal context (agent tools fetch details on demand)
    const contextParts = [`Deal: ${deal.name}`];
    contextParts.push(`Stage: ${deal.stage}, Status: ${deal.status}`);
    if (deal.industry) contextParts.push(`Industry: ${deal.industry}`);
    if (deal.dealSize) contextParts.push(`Deal Size: $${deal.dealSize}M`);
    if (deal.revenue) contextParts.push(`Revenue: $${deal.revenue}M`);
    if (deal.ebitda) contextParts.push(`EBITDA: $${deal.ebitda}M`);
    if (deal.irrProjected) contextParts.push(`Projected IRR: ${deal.irrProjected}%`);
    if (deal.mom) contextParts.push(`MoM: ${deal.mom}x`);
    if (deal.source) contextParts.push(`Deal Source: ${deal.source}`);
    if (deal.aiThesis) contextParts.push(`Investment Thesis: ${deal.aiThesis}`);

    const company = deal.company as any;
    if (company) {
      contextParts.push(`Company: ${company.name}`);
      if (company.description) contextParts.push(`Description: ${company.description}`);
    }

    const teamMembers = deal.teamMembers as any[];
    if (teamMembers?.length > 0) {
      contextParts.push('\nTeam:');
      for (const m of teamMembers) {
        if (m.user) contextParts.push(`  - ${m.user.name} (${m.role}, ID: ${m.user.id})`);
      }
    }

    // Fetch available users for assignment (same org only)
    const { data: availableUsers } = await supabase
      .from('User')
      .select('id, name, title, role')
      .eq('organizationId', orgId)
      .order('name');

    if (availableUsers?.length) {
      contextParts.push('\nAvailable team members for assignment:');
      for (const u of availableUsers) {
        contextParts.push(`  - ${u.name} (ID: ${u.id}, ${u.title || u.role})`);
      }
    }

    // Run the ReAct agent
    const result = await runDealChatAgent({
      dealId,
      orgId: deal.organizationId,
      message,
      dealContext: contextParts.join('\n'),
      history: history.slice(-10),
    });

    // Save messages to database
    const userId = req.user?.id || null;

    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'user',
      content: message,
    });

    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'assistant',
      content: result.response,
      metadata: {
        model: result.model,
        ...(result.updates && { updates: result.updates }),
        ...(result.action && { action: result.action }),
      },
    });

    await AuditLog.aiChat(req, `Deal: ${deal.name} (ReAct agent)`);

    res.json(result);
  } catch (error) {
    log.error('Error in deal chat', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;
