import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled, DEAL_ANALYSIS_SYSTEM_PROMPT, generateDealContext } from '../openai.js';
import { z } from 'zod';
import { AICache } from '../services/aiCache.js';
import { log } from '../utils/logger.js';
import { notifyDealTeam, resolveUserId } from './notifications.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import ingestRouter from './ai-ingest.js';
import portfolioRouter from './ai-portfolio.js';

const router = Router();

// Mount sub-routers for ingest/extract and portfolio/market-sentiment
router.use('/', ingestRouter);
router.use('/', portfolioRouter);

// Validation schemas
const chatMessageSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

// POST /api/deals/:dealId/chat - Chat with AI about a deal
router.post('/deals/:dealId/chat', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const { message, history = [] } = chatMessageSchema.parse(req.body);

    // Verify deal belongs to user's org
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Fetch deal data for context
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
      { role: 'system', content: `Current Deal Context:\n${generateDealContext(deal)}` },
    ];

    // Add conversation history
    history.forEach((msg: any) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI
    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || 'No response generated.';

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'NOTE_ADDED',
      title: 'AI Chat Query',
      description: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      metadata: { type: 'ai_chat' },
    });

    // Save messages to database
    const userId = req.user?.id || null;

    // Save user message
    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'user',
      content: message,
    });

    // Save assistant response
    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'assistant',
      content: response,
      metadata: { model: 'gpt-4o' },
    });

    res.json({
      response,
      model: 'gpt-4o',
      dealId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error in AI chat', error);
    res.status(500).json({ error: 'Failed to process AI chat' });
  }
});

// GET /api/deals/:dealId/chat/history - Get chat history for a deal
router.get('/deals/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: messages, error } = await supabase
      .from('ChatMessage')
      .select('id, role, content, metadata, createdAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      messages: messages || [],
      dealId,
      count: messages?.length || 0,
    });
  } catch (error) {
    log.error('Error fetching chat history', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// DELETE /api/deals/:dealId/chat/history - Clear chat history for a deal
router.delete('/deals/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    const { error } = await supabase
      .from('ChatMessage')
      .delete()
      .eq('dealId', dealId);

    if (error) throw error;

    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    log.error('Error clearing chat history', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// POST /api/deals/:dealId/generate-thesis - Generate AI investment thesis
// Query params: ?refresh=true to bypass cache
router.post('/deals/:dealId/generate-thesis', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });
    const forceRefresh = req.query.refresh === 'true';

    // Check cache first (unless refresh requested)
    if (!forceRefresh) {
      const cached = await AICache.getThesis(dealId);
      if (cached.hit && cached.data) {
        log.debug('Thesis served from cache', { dealId });
        return res.json({
          thesis: cached.data,
          dealId,
          cached: true,
          cacheAge: cached.age,
        });
      }
    }

    // Fetch deal data
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const prompt = `Based on the following deal information, generate a concise investment thesis (2-3 sentences) that highlights the key opportunity and any notable risks or considerations.

Deal Information:
${generateDealContext(deal)}

Generate a professional investment thesis that a PE analyst would write. Be specific about the opportunity and any flags that need attention.`;

    log.info('Generating thesis for deal', { dealId, forceRefresh });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const thesis = completion.choices[0]?.message?.content || 'Unable to generate thesis.';

    // Store in cache
    await AICache.setThesis(dealId, thesis);

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'STATUS_UPDATED',
      title: 'AI Thesis Generated',
      description: forceRefresh ? 'Investment thesis regenerated by AI' : 'Investment thesis automatically generated by AI',
      metadata: { type: 'thesis_generation', refresh: forceRefresh },
    });

    // Notify team: thesis generated (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        notifyDealTeam(dealId, 'AI_INSIGHT', `AI thesis generated for "${deal.name}"`, undefined, internalId || undefined);
      }).catch(err => log.error('Notification error (thesis)', err));
    }

    res.json({
      thesis,
      dealId,
      cached: false,
    });
  } catch (error) {
    log.error('Error generating thesis', error);
    res.status(500).json({ error: 'Failed to generate thesis' });
  }
});

// POST /api/deals/:dealId/analyze-risks - Analyze deal risks
// Query params: ?refresh=true to bypass cache
router.post('/deals/:dealId/analyze-risks', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });
    const forceRefresh = req.query.refresh === 'true';

    // Check cache first (unless refresh requested)
    if (!forceRefresh) {
      const cached = await AICache.getRisks(dealId);
      if (cached.hit && cached.data) {
        log.debug('Risks served from cache', { dealId });
        return res.json({
          risks: cached.data,
          dealId,
          cached: true,
          cacheAge: cached.age,
        });
      }
    }

    // Fetch deal data
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const prompt = `Analyze the following deal and identify the top 3-5 key risks that an investor should consider. For each risk, provide a severity level (High/Medium/Low) and a brief mitigation suggestion.

Deal Information:
${generateDealContext(deal)}

Format your response as a JSON array of risk objects with fields: title, description, severity, mitigation`;

    log.info('Analyzing risks for deal', { dealId, forceRefresh });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    let risks;
    try {
      const content = completion.choices[0]?.message?.content || '{"risks":[]}';
      const parsed = JSON.parse(content);
      risks = parsed.risks || parsed;
    } catch {
      risks = [{ title: 'Analysis Error', description: 'Could not parse risk analysis', severity: 'Medium' }];
    }

    // Store in cache
    await AICache.setRisks(dealId, risks);

    // Notify team: risk analysis complete (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        notifyDealTeam(dealId, 'AI_INSIGHT', `Risk analysis completed for "${deal.name}"`, undefined, internalId || undefined);
      }).catch(err => log.error('Notification error (risks)', err));
    }

    res.json({
      risks,
      dealId,
      cached: false,
    });
  } catch (error) {
    log.error('Error analyzing risks', error);
    res.status(500).json({ error: 'Failed to analyze risks' });
  }
});

// GET /api/ai/status - Check AI service status
router.get('/ai/status', (req, res) => {
  res.json({
    enabled: isAIEnabled(),
    model: 'gpt-4o',
  });
});

// GET /api/deals/:dealId/ai-cache - Get cache stats for a deal
router.get('/deals/:dealId/ai-cache', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });
    const stats = await AICache.getStats(dealId);
    res.json(stats);
  } catch (error) {
    log.error('Error getting cache stats', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// DELETE /api/deals/:dealId/ai-cache - Invalidate cache for a deal
router.delete('/deals/:dealId/ai-cache', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });
    await AICache.invalidate(dealId);
    res.json({ success: true, message: 'Cache invalidated' });
  } catch (error) {
    log.error('Error invalidating cache', error);
    res.status(500).json({ error: 'Failed to invalidate cache' });
  }
});

export default router;
