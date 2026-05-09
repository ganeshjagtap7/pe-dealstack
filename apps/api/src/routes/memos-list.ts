// ─── Memo list / detail / debug routes ────────────────────────────
// GET /api/memos/debug — table-existence check (dev-only)
// GET /api/memos       — list memos (filtered/paginated)
// GET /api/memos/:id   — full memo with sections + deal + conversations

import { Router } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { memosQuerySchema } from './memos-schemas.js';

const router = Router();

// GET /api/memos/debug - Check if Memo table exists (dev only)
router.get('/debug', async (req, res) => {
  try {
    // Try a simple select
    const { data, error } = await supabase
      .from('Memo')
      .select('id')
      .limit(1);

    if (error) {
      return res.json({
        tableExists: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        solution: 'Run the SQL migration in Supabase: apps/api/prisma/migrations/add_memo_tables.sql'
      });
    }

    res.json({
      tableExists: true,
      rowCount: data?.length || 0,
      message: 'Memo table is accessible'
    });
  } catch (err: any) {
    res.status(500).json({
      tableExists: false,
      error: err.message,
    });
  }
});

// GET /api/memos - List all memos
router.get('/', async (req, res) => {
  try {
    const params = memosQuerySchema.parse(req.query);
    const orgId = getOrgId(req);

    let query = supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(id, type, title, sortOrder, aiGenerated),
        deal:Deal(id, name, company:Company(name))
      `)
      .eq('organizationId', orgId)
      .order('updatedAt', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1);

    // Apply filters
    if (params.dealId) query = query.eq('dealId', params.dealId);
    if (params.status) query = query.eq('status', params.status);
    if (params.type) query = query.eq('type', params.type);

    const { data: memos, error } = await query;

    if (error) throw error;

    res.json(memos || []);
  } catch (error) {
    log.error('Error fetching memos', error);
    res.status(500).json({ error: 'Failed to fetch memos' });
  }
});

// GET /api/memos/:id - Get single memo with all sections
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: memo, error } = await supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(*),
        deal:Deal(
          id, name, stage, status, industry, dealSize, revenue, ebitda, irrProjected, mom,
          company:Company(id, name, description),
          documents:Document(id, name, type, fileUrl)
        ),
        conversations:MemoConversation(
          id,
          updatedAt,
          messages:MemoChatMessage(id, role, content, createdAt)
        )
      `)
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Memo not found' });
      }
      throw error;
    }

    // Sort sections by sortOrder
    if (memo.sections) {
      memo.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    }

    // Sort conversation messages by createdAt
    if (memo.conversations) {
      memo.conversations.forEach((conv: any) => {
        if (conv.messages) {
          conv.messages.sort((a: any, b: any) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
      });
    }

    res.json(memo);
  } catch (error) {
    log.error('Error fetching memo', error);
    res.status(500).json({ error: 'Failed to fetch memo' });
  }
});

export default router;
