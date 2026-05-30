// ─── /api/legal-documents + /api/deals/:dealId/legal-documents ───
// LegalDocument routes — NDA library v1 (extensible to other doc types).
//
// Endpoints (mounted at /api in app.ts):
//   GET    /legal-documents?docType=NDA           — cross-deal, org-scoped
//   GET    /deals/:dealId/legal-documents         — per-deal
//   POST   /deals/:dealId/legal-documents         — create (template or blank)
//   PATCH  /legal-documents/:id                   — update metadata (no Doc mutation)
//   DELETE /legal-documents/:id                   — soft delete (metadata.deletedAt)
//   POST   /legal-documents/:id/reshare           — re-apply Drive ACLs from deal team
//
// Soft delete: we set metadata.deletedAt on the row and leave the
// underlying Google Doc untouched. GET lists exclude soft-deleted rows.
//
// Pattern parity with routes/graphs.ts: zod validation, getOrgId from
// the middleware, raw-array list responses, isMissingTableError empty-
// list fallback so the UI doesn't blow up before the migration is run.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import {
  createDocument,
  reshareDocument,
  LegalDocError,
  type CreateDocumentInput,
} from '../services/legalDocService.js';

const router = Router();

// ============================================================
// Validation
// ============================================================

const DOC_TYPES = ['NDA', 'LOI', 'TERM_SHEET', 'DEFINITIVE_AGREEMENT', 'SIDE_LETTER', 'OTHER'] as const;
const STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED'] as const;

const listQuerySchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
});

const createBodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('fromTemplate'),
    templateId: z.string().min(1),
    title: z.string().min(1).max(500),
    counterpartyName: z.string().max(500).optional(),
    counterpartyEmail: z.string().email().max(500).optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    mode: z.literal('blank'),
    title: z.string().min(1).max(500),
    docType: z.enum(DOC_TYPES).optional(),
    counterpartyName: z.string().max(500).optional(),
    counterpartyEmail: z.string().email().max(500).optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
]);

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    status: z.enum(STATUSES).optional(),
    counterpartyName: z.string().max(500).nullable().optional(),
    counterpartyEmail: z.string().email().max(500).nullable().optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    signedAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'At least one field required' });

function isMissingTableError(error: { code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205';
}

async function resolveInternalUserId(authId: string): Promise<string | null> {
  const { data } = await supabase
    .from('User')
    .select('id')
    .eq('authId', authId)
    .single();
  return data?.id ?? null;
}

// ============================================================
// GET /legal-documents — cross-deal list, org-scoped
// ============================================================

router.get('/legal-documents', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
    }

    // Aliased Deal join so the wire shape matches the frontend contract
    // (LegalDocumentWithDeal.deal in apps/web-next, mirrors GraphWithDeal).
    let query = supabase
      .from('LegalDocument')
      .select('*, deal:Deal(id, projectName:name, target:companyName)')
      .eq('organizationId', orgId)
      .is('metadata->>deletedAt', null)
      .order('updatedAt', { ascending: false });

    if (parsed.data.docType) {
      query = query.eq('docType', parsed.data.docType);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw error;
    }

    res.json(data ?? []);
  } catch (err) {
    log.error('GET /api/legal-documents error', err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
});

// ============================================================
// GET /deals/:dealId/legal-documents — per-deal list
// ============================================================

router.get('/deals/:dealId/legal-documents', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { dealId } = req.params;
    const deal = await verifyDealAccess(dealId, orgId);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
    }

    let query = supabase
      .from('LegalDocument')
      .select('*')
      .eq('organizationId', orgId)
      .eq('dealId', dealId)
      .is('metadata->>deletedAt', null)
      .order('updatedAt', { ascending: false });

    if (parsed.data.docType) {
      query = query.eq('docType', parsed.data.docType);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return res.json([]);
      throw error;
    }

    res.json(data ?? []);
  } catch (err) {
    log.error('GET /api/deals/:dealId/legal-documents error', err);
    res.status(500).json({ error: 'Failed to fetch legal documents' });
  }
});

// ============================================================
// POST /deals/:dealId/legal-documents — create
// ============================================================

router.post('/deals/:dealId/legal-documents', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { dealId } = req.params;
    const deal = await verifyDealAccess(dealId, orgId);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const internalUserId = await resolveInternalUserId(req.user.id);
    if (!internalUserId) return res.status(404).json({ error: 'User not found' });

    const result = await createDocument(parsed.data as CreateDocumentInput, {
      organizationId: orgId,
      dealId,
      internalUserId,
    });

    // Re-read the row so the client gets the full server-shaped record,
    // including the trigger-updated timestamps and any metadata fields.
    const { data, error } = await supabase
      .from('LegalDocument')
      .select('*')
      .eq('id', result.id)
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof LegalDocError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }
    log.error('POST /api/deals/:dealId/legal-documents error', err);
    res.status(500).json({ error: 'Failed to create legal document' });
  }
});

// ============================================================
// PATCH /legal-documents/:id — update metadata only (no Doc mutation)
// ============================================================

router.patch('/legal-documents/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { id } = req.params;
    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    const { data: existing, error: existsErr } = await supabase
      .from('LegalDocument')
      .select('id, organizationId')
      .eq('id', id)
      .maybeSingle();
    if (existsErr) throw existsErr;
    if (!existing || existing.organizationId !== orgId) {
      return res.status(404).json({ error: 'Legal document not found' });
    }

    const updatePayload: Record<string, unknown> = { ...parsed.data };
    updatePayload.updatedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('LegalDocument')
      .update(updatePayload)
      .eq('id', id)
      .eq('organizationId', orgId)
      .select('*')
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    log.error('PATCH /api/legal-documents/:id error', err);
    res.status(500).json({ error: 'Failed to update legal document' });
  }
});

// ============================================================
// DELETE /legal-documents/:id — soft delete
// ============================================================

router.delete('/legal-documents/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { id } = req.params;

    const { data: existing, error: existsErr } = await supabase
      .from('LegalDocument')
      .select('id, organizationId, metadata')
      .eq('id', id)
      .maybeSingle();
    if (existsErr) throw existsErr;
    if (!existing || existing.organizationId !== orgId) {
      return res.status(404).json({ error: 'Legal document not found' });
    }

    const nextMetadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      deletedAt: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('LegalDocument')
      .update({ metadata: nextMetadata, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('organizationId', orgId);
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    log.error('DELETE /api/legal-documents/:id error', err);
    res.status(500).json({ error: 'Failed to delete legal document' });
  }
});

// ============================================================
// POST /legal-documents/:id/reshare — re-apply Drive ACLs
// ============================================================

router.post('/legal-documents/:id/reshare', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { id } = req.params;
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const internalUserId = await resolveInternalUserId(req.user.id);
    if (!internalUserId) return res.status(404).json({ error: 'User not found' });

    const result = await reshareDocument({
      internalUserId,
      organizationId: orgId,
      documentId: id,
    });
    res.json({ ok: true, granted: result.granted, failures: result.failures });
  } catch (err) {
    if (err instanceof LegalDocError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }
    log.error('POST /api/legal-documents/:id/reshare error', err);
    res.status(500).json({ error: 'Failed to reshare legal document' });
  }
});

export default router;
