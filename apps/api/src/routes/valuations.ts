// ─── Valuation Models routes ───────────────────────────────────────
// Standalone LBO (and later DCF) models. Each row stores assumptions
// as JSONB; computed outputs are recomputed on read via lib/lbo-model.
//
// Routes:
//   GET    /api/valuations           — list current user's models
//   POST   /api/valuations           — create a new model (default LBO assumptions)
//   GET    /api/valuations/:id       — fetch one
//   PATCH  /api/valuations/:id       — update name / assumptions
//   DELETE /api/valuations/:id       — delete
//   POST   /api/valuations/:id/chat  — talk to the LBO agent
//
// Mounted only in app-ai (chat is the headline feature; CRUD comes
// along for free since both bundles share the same auth middleware).

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { getOrgId } from '../middleware/orgScope.js';
import { resolveUserId } from './notifications.js';
import { log } from '../utils/logger.js';
import { isLLMAvailable } from '../services/llm.js';
import { runValuationChatAgent } from '../services/agents/valuationChatAgent/index.js';
import {
  DEFAULT_LBO_ASSUMPTIONS,
  ASSUMPTION_KEYS,
  computeLBO,
  applyAssumptionUpdate,
  type AssumptionKey,
  type LBOAssumptions,
} from '../lib/lbo-model.js';
import { buildLBOWorkbookBuffer } from '../lib/lbo-excel.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  assumptions: z.record(z.string(), z.number()).optional(),
});

const chatSchema = z.object({
  content: z.string().min(1).max(4000),
});

// Sanitize incoming assumptions: only known keys, only numeric values, clamped.
function sanitizeAssumptions(raw: unknown): LBOAssumptions {
  const base: LBOAssumptions = { ...DEFAULT_LBO_ASSUMPTIONS };
  if (!raw || typeof raw !== 'object') return base;
  let next = base;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ASSUMPTION_KEYS.includes(k as AssumptionKey)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    next = applyAssumptionUpdate(next, k as AssumptionKey, v);
  }
  return next;
}

function buildModelResponse(row: any) {
  const assumptions = sanitizeAssumptions(row.assumptions);
  const outputs = computeLBO(assumptions);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    assumptions,
    outputs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GET /api/valuations ───────────────────────────────────────────
router.get('/', async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data, error } = await supabase
      .from('ValuationModel')
      .select('id, name, type, assumptions, createdAt, updatedAt')
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .order('updatedAt', { ascending: false });

    if (error) throw error;

    // Light list view: just the headline returns, not full output trees.
    const items = (data || []).map(row => {
      const assumptions = sanitizeAssumptions(row.assumptions);
      const out = computeLBO(assumptions);
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        moic: out.returns.moic,
        irr: out.returns.irr,
        equityInvested: out.returns.equityInvested,
        holdYears: out.returns.holdYears,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      };
    });

    res.json({ items });
  } catch (err) {
    log.error('List valuations error', err);
    res.status(500).json({ error: 'Failed to load valuation models' });
  }
});

// ─── POST /api/valuations ──────────────────────────────────────────
router.post('/', async (req: any, res) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
    }

    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data, error } = await supabase
      .from('ValuationModel')
      .insert({
        organizationId: orgId,
        userId,
        name: parsed.data.name?.trim() || 'Untitled LBO',
        type: 'lbo',
        assumptions: DEFAULT_LBO_ASSUMPTIONS,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json(buildModelResponse(data));
  } catch (err) {
    log.error('Create valuation error', err);
    res.status(500).json({ error: 'Failed to create valuation model' });
  }
});

// ─── GET /api/valuations/:id ───────────────────────────────────────
router.get('/:id', async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data, error } = await supabase
      .from('ValuationModel')
      .select('*')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Valuation model not found' });

    res.json(buildModelResponse(data));
  } catch (err) {
    log.error('Get valuation error', err);
    res.status(500).json({ error: 'Failed to load valuation model' });
  }
});

// ─── PATCH /api/valuations/:id ─────────────────────────────────────
router.patch('/:id', async (req: any, res) => {
  try {
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
    }

    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    // Load existing to merge assumptions (PATCH semantics — partial update).
    const { data: existing, error: lookupErr } = await supabase
      .from('ValuationModel')
      .select('*')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!existing) return res.status(404).json({ error: 'Valuation model not found' });

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.assumptions !== undefined) {
      const merged = { ...sanitizeAssumptions(existing.assumptions), ...parsed.data.assumptions };
      updates.assumptions = sanitizeAssumptions(merged);
    }

    const { data, error } = await supabase
      .from('ValuationModel')
      .update(updates)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json(buildModelResponse(data));
  } catch (err) {
    log.error('Patch valuation error', err);
    res.status(500).json({ error: 'Failed to update valuation model' });
  }
});

// ─── DELETE /api/valuations/:id ────────────────────────────────────
router.delete('/:id', async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data: existing } = await supabase
      .from('ValuationModel')
      .select('id')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Valuation model not found' });

    const { error } = await supabase
      .from('ValuationModel')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    log.error('Delete valuation error', err);
    res.status(500).json({ error: 'Failed to delete valuation model' });
  }
});

// ─── POST /api/valuations/:id/chat ─────────────────────────────────
router.post('/:id/chat', async (req: any, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.errors });
    }

    if (!isLLMAvailable()) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data: existing, error: lookupErr } = await supabase
      .from('ValuationModel')
      .select('*')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;
    if (!existing) return res.status(404).json({ error: 'Valuation model not found' });

    // Save user message
    await supabase.from('ValuationModelMessage').insert({
      modelId: existing.id,
      role: 'user',
      content: parsed.data.content,
    });

    // Load history (last 16, oldest-first)
    const { data: historyRows } = await supabase
      .from('ValuationModelMessage')
      .select('role, content, createdAt')
      .eq('modelId', existing.id)
      .order('createdAt', { ascending: true })
      .limit(16);

    const history = (historyRows || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1) // exclude the just-inserted user message; agent gets it as the new turn
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const result = await runValuationChatAgent({
      modelId: existing.id,
      orgId,
      message: parsed.data.content,
      assumptions: sanitizeAssumptions(existing.assumptions),
      history,
    });

    // Persist updated assumptions if the agent changed them
    let finalRow = existing;
    if (result.applied && result.updatedAssumptions) {
      const { data: updated, error: updErr } = await supabase
        .from('ValuationModel')
        .update({
          assumptions: result.updatedAssumptions,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (updErr) {
        log.error('Failed to persist agent assumption updates', updErr);
      } else {
        finalRow = updated;
      }
    }

    // Save AI response
    await supabase.from('ValuationModelMessage').insert({
      modelId: existing.id,
      role: 'assistant',
      content: result.response,
      metadata: {
        model: result.model,
        applied: result.applied,
        changedKeys: result.changedKeys || [],
      },
    });

    res.json({
      role: 'assistant',
      content: result.response,
      timestamp: new Date().toISOString(),
      model: result.model,
      action: result.applied ? 'applied' : undefined,
      changedKeys: result.changedKeys || [],
      modelState: result.applied ? buildModelResponse(finalRow) : undefined,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    log.error('Valuation chat error', err);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// ─── GET /api/valuations/:id/export.xlsx ───────────────────────────
router.get('/:id/export.xlsx', async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    const { data: row, error } = await supabase
      .from('ValuationModel')
      .select('id, name, assumptions')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (error) throw error;
    if (!row) return res.status(404).json({ error: 'Valuation model not found' });

    const assumptions = sanitizeAssumptions(row.assumptions);
    const buf = buildLBOWorkbookBuffer(row.name || 'LBO Model', assumptions);

    const filename = `${(row.name || 'lbo-model').replace(/[^a-z0-9-_ ]/gi, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    log.error('Export valuation xlsx error', err);
    res.status(500).json({ error: 'Failed to export model' });
  }
});

// ─── GET /api/valuations/:id/messages ──────────────────────────────
router.get('/:id/messages', async (req: any, res) => {
  try {
    const orgId = getOrgId(req);
    const userId = req.user?.id ? await resolveUserId(req.user.id) : null;
    if (!userId) return res.status(401).json({ error: 'User not found' });

    // Verify ownership before reading messages
    const { data: model } = await supabase
      .from('ValuationModel')
      .select('id')
      .eq('id', req.params.id)
      .eq('organizationId', orgId)
      .eq('userId', userId)
      .maybeSingle();

    if (!model) return res.status(404).json({ error: 'Valuation model not found' });

    const { data, error } = await supabase
      .from('ValuationModelMessage')
      .select('id, role, content, createdAt')
      .eq('modelId', model.id)
      .order('createdAt', { ascending: true });

    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err) {
    log.error('List valuation messages error', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

export default router;
