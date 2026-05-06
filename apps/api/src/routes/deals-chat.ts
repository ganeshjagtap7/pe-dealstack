import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';

// Sub-routers
import dealsChatAiRouter from './deals-chat-ai.js';

const router = Router();

// Mount sub-routers
router.use('/', dealsChatAiRouter);

// Pagination schema
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const chatHistoryQuerySchema = paginationSchema;

// GET /api/deals/:dealId/chat/history - Get chat history for a deal
router.get('/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { limit = 200, offset = 0 } = chatHistoryQuerySchema.parse(req.query);

    log.debug('Fetching chat history', { dealId, limit, offset });

    // Fetch the most recent messages (descending), then reverse to chronological order
    const { data: messages, error } = await supabase
      .from('ChatMessage')
      .select('id, role, content, metadata, created_at')
      .eq('dealId', dealId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Reverse to chronological order for display
    if (messages) messages.reverse();

    if (error) {
      log.error('Database error fetching chat history', { error, dealId });
      throw error;
    }

    log.debug('Chat history fetched', { dealId, count: messages?.length || 0 });

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
router.delete('/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

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

export default router;
