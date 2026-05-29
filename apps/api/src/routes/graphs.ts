// ─── /api/graphs + /api/deals/:dealId/graphs router ───────────────
// Per-deal user-defined custom charts (CustomGraph table).
//
// Endpoints (mounted at /api in app.ts):
//   GET    /graphs                       — cross-deal list (org-scoped)
//   GET    /deals/:dealId/graphs         — per-deal list
//   POST   /deals/:dealId/graphs         — create
//   PATCH  /graphs/:graphId              — update (org-scoped)
//   DELETE /graphs/:graphId              — delete (org-scoped)
//
// Returns arrays raw (matches templates.ts convention — the frontend
// does NOT need a { graphs: [...] } envelope; bare arrays simplify
// React Query keys + cache invalidation).
//
// Org scoping: every row carries organizationId, set on insert from
// req.user.organizationId via getOrgId(req). Update / delete handlers
// gate on organizationId equality to prevent cross-org tampering.
// Per-deal endpoints additionally call verifyDealAccess to make sure
// the dealId belongs to the requesting org before touching anything.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';

const router = Router();

// ============================================================
// Validation
// ============================================================

const seriesSchema = z
  .array(
    z.object({
      metricKey: z.string().min(1),
      seriesType: z.enum(['bar', 'line', 'area']),
      color: z.string().min(1),
    }),
  )
  .default([]);

const createGraphSchema = z.object({
  title: z.string().min(1),
  chartType: z.enum(['bar', 'line', 'area', 'combo']),
  series: seriesSchema,
});

const updateGraphSchema = z
  .object({
    title: z.string().min(1).optional(),
    chartType: z.enum(['bar', 'line', 'area', 'combo']).optional(),
    series: seriesSchema.optional(),
  })
  // Reject empty PATCH bodies — saves a no-op write and surfaces
  // client bugs that send {} expecting some default behaviour.
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field required',
  });

// Postgres "undefined relation" / Supabase "table not found" codes —
// returned when the CustomGraph migration hasn't been applied yet.
// We surface an empty list (or a 503-style error on writes) instead of
// a 500 so the UI can render its empty state without a scary banner.
function isMissingTableError(error: { code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}

// ============================================================
// GET /graphs — cross-deal list, org-scoped
// ============================================================

router.get('/graphs', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    // Join Deal so the cross-deal cards can show deal/company labels
    // without an extra round-trip. Alias `name -> projectName` and
    // `companyName -> target` so the wire shape matches the frontend
    // contract (GraphWithDeal.deal in apps/web-next).
    const { data, error } = await supabase
      .from('CustomGraph')
      .select('*, deal:Deal(id, projectName:name, target:companyName)')
      .eq('organizationId', orgId)
      .order('updatedAt', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return res.json([]);
      }
      throw error;
    }

    res.json(data ?? []);
  } catch (err) {
    log.error('GET /api/graphs error', err);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

// ============================================================
// GET /deals/:dealId/graphs — per-deal list
// ============================================================

router.get('/deals/:dealId/graphs', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { dealId } = req.params;

    const deal = await verifyDealAccess(dealId, orgId);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { data, error } = await supabase
      .from('CustomGraph')
      .select('*')
      .eq('organizationId', orgId)
      .eq('dealId', dealId)
      .order('updatedAt', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return res.json([]);
      }
      throw error;
    }

    res.json(data ?? []);
  } catch (err) {
    log.error('GET /api/deals/:dealId/graphs error', err);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

// ============================================================
// POST /deals/:dealId/graphs — create
// ============================================================

router.post('/deals/:dealId/graphs', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { dealId } = req.params;

    const deal = await verifyDealAccess(dealId, orgId);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const parsed = createGraphSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid data', details: parsed.error.errors });
    }

    const insertRow = {
      organizationId: orgId,
      dealId,
      createdById: req.user?.id ?? null,
      title: parsed.data.title,
      chartType: parsed.data.chartType,
      series: parsed.data.series,
    };

    const { data, error } = await supabase
      .from('CustomGraph')
      .insert(insertRow)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    log.error('POST /api/deals/:dealId/graphs error', err);
    res.status(500).json({ error: 'Failed to create graph' });
  }
});

// ============================================================
// PATCH /graphs/:graphId — update
// ============================================================

router.patch('/graphs/:graphId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { graphId } = req.params;

    const parsed = updateGraphSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid data', details: parsed.error.errors });
    }

    // Explicit org-scope precheck — Supabase update with .eq filters
    // would silently return zero rows on a cross-org request, which we
    // want to distinguish from "row not found" vs "real failure".
    const { data: existing, error: existsErr } = await supabase
      .from('CustomGraph')
      .select('id, organizationId')
      .eq('id', graphId)
      .maybeSingle();

    if (existsErr) throw existsErr;
    if (!existing || existing.organizationId !== orgId) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    const updatePayload = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('CustomGraph')
      .update(updatePayload)
      .eq('id', graphId)
      .eq('organizationId', orgId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    log.error('PATCH /api/graphs/:graphId error', err);
    res.status(500).json({ error: 'Failed to update graph' });
  }
});

// ============================================================
// DELETE /graphs/:graphId — delete (204 on success)
// ============================================================

router.delete('/graphs/:graphId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { graphId } = req.params;

    const { data: existing, error: existsErr } = await supabase
      .from('CustomGraph')
      .select('id, organizationId')
      .eq('id', graphId)
      .maybeSingle();

    if (existsErr) throw existsErr;
    if (!existing || existing.organizationId !== orgId) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    const { error } = await supabase
      .from('CustomGraph')
      .delete()
      .eq('id', graphId)
      .eq('organizationId', orgId);

    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    log.error('DELETE /api/graphs/:graphId error', err);
    res.status(500).json({ error: 'Failed to delete graph' });
  }
});

export default router;
