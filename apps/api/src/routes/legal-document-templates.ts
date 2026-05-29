// ─── /api/legal-document-templates router ───────────────────────
// Admin-managed library of Google-Doc-backed templates used to
// scaffold new LegalDocuments. v1 ships unseeded — admins paste a
// Google Doc URL (or ID) and we store the docId for later copy.
//
// Read is open to any org member; write is gated to org admins via
// requireMinimumRole(ADMIN). The underlying Google Doc is NOT deleted
// when a template row is deleted — admins can clean up Drive manually.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { requireMinimumRole, ROLES } from '../middleware/rbac.js';
import { extractGoogleDocId } from '../services/legalDocService.js';

const router = Router();

const DOC_TYPES = ['NDA', 'LOI', 'TERM_SHEET', 'DEFINITIVE_AGREEMENT', 'SIDE_LETTER', 'OTHER'] as const;

const listQuerySchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
});

const createBodySchema = z.object({
  name: z.string().min(1).max(200),
  docType: z.enum(DOC_TYPES).optional(),
  googleDocUrlOrId: z.string().min(8).max(2048),
  placeholderMap: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const patchBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    docType: z.enum(DOC_TYPES).optional(),
    googleDocUrlOrId: z.string().min(8).max(2048).optional(),
    placeholderMap: z.record(z.string(), z.string()).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'At least one field required' });

function isMissingTableError(error: { code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}

// ============================================================
// GET /legal-document-templates — org-scoped read
// ============================================================

router.get('/legal-document-templates', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
    }
    let query = supabase
      .from('LegalDocTemplate')
      .select('*')
      .eq('organizationId', orgId)
      .order('updatedAt', { ascending: false });
    if (parsed.data.docType) query = query.eq('docType', parsed.data.docType);

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw error;
    }
    res.json(data ?? []);
  } catch (err) {
    log.error('GET /api/legal-document-templates error', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================================
// POST /legal-document-templates — admin only
// ============================================================

router.post(
  '/legal-document-templates',
  requireMinimumRole(ROLES.ADMIN),
  async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const parsed = createBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
      }

      const googleDocId = extractGoogleDocId(parsed.data.googleDocUrlOrId);
      if (!googleDocId) {
        return res.status(400).json({
          error: 'Invalid Google Doc URL or ID',
          code: 'INVALID_DOC_ID',
        });
      }

      const insertRow = {
        organizationId: orgId,
        name: parsed.data.name,
        docType: parsed.data.docType ?? 'NDA',
        googleDocId,
        placeholderMap: parsed.data.placeholderMap ?? {},
        isDefault: parsed.data.isDefault ?? false,
      };

      const { data, error } = await supabase
        .from('LegalDocTemplate')
        .insert(insertRow)
        .select('*')
        .single();
      if (error) throw error;

      res.status(201).json(data);
    } catch (err) {
      log.error('POST /api/legal-document-templates error', err);
      res.status(500).json({ error: 'Failed to create template' });
    }
  },
);

// ============================================================
// PATCH /legal-document-templates/:id — admin only
// ============================================================

router.patch(
  '/legal-document-templates/:id',
  requireMinimumRole(ROLES.ADMIN),
  async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params;
      const parsed = patchBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
      }

      const { data: existing, error: existsErr } = await supabase
        .from('LegalDocTemplate')
        .select('id, organizationId')
        .eq('id', id)
        .maybeSingle();
      if (existsErr) throw existsErr;
      if (!existing || existing.organizationId !== orgId) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const updatePayload: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
      if (parsed.data.docType !== undefined) updatePayload.docType = parsed.data.docType;
      if (parsed.data.placeholderMap !== undefined) {
        updatePayload.placeholderMap = parsed.data.placeholderMap;
      }
      if (parsed.data.isDefault !== undefined) updatePayload.isDefault = parsed.data.isDefault;
      if (parsed.data.googleDocUrlOrId !== undefined) {
        const next = extractGoogleDocId(parsed.data.googleDocUrlOrId);
        if (!next) {
          return res.status(400).json({
            error: 'Invalid Google Doc URL or ID',
            code: 'INVALID_DOC_ID',
          });
        }
        updatePayload.googleDocId = next;
      }
      updatePayload.updatedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('LegalDocTemplate')
        .update(updatePayload)
        .eq('id', id)
        .eq('organizationId', orgId)
        .select('*')
        .single();
      if (error) throw error;

      res.json(data);
    } catch (err) {
      log.error('PATCH /api/legal-document-templates/:id error', err);
      res.status(500).json({ error: 'Failed to update template' });
    }
  },
);

// ============================================================
// DELETE /legal-document-templates/:id — admin only
// ============================================================

router.delete(
  '/legal-document-templates/:id',
  requireMinimumRole(ROLES.ADMIN),
  async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params;

      const { data: existing, error: existsErr } = await supabase
        .from('LegalDocTemplate')
        .select('id, organizationId')
        .eq('id', id)
        .maybeSingle();
      if (existsErr) throw existsErr;
      if (!existing || existing.organizationId !== orgId) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const { error } = await supabase
        .from('LegalDocTemplate')
        .delete()
        .eq('id', id)
        .eq('organizationId', orgId);
      if (error) throw error;

      res.status(204).send();
    } catch (err) {
      log.error('DELETE /api/legal-document-templates/:id error', err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  },
);

export default router;
