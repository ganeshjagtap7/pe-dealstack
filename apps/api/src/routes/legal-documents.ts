// ─── /api/legal-documents + /api/deals/:dealId/legal-documents ───
// LegalDocument routes — Phase 2 (in-app HTML).
//
// Endpoints (mounted at /api in app.ts):
//   GET    /legal-documents?docType=NDA           — cross-deal, org-scoped
//   GET    /deals/:dealId/legal-documents         — per-deal
//   POST   /deals/:dealId/legal-documents         — create from template
//   PATCH  /legal-documents/:id                   — update fields incl. content
//   DELETE /legal-documents/:id                   — soft delete (metadata.deletedAt)
//   POST   /legal-documents/:id/send              — Resend .docx delivery
//
// Soft delete: metadata->>'deletedAt'. GET lists exclude soft-deleted rows.
// Joined Deal alias mirrors graphs.ts so the frontend contract is shared.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import {
  sanitiseLegalDocHtml,
} from '../services/legalDocParseService.js';
import {
  substituteTokens,
  type LegalDocTokenValues,
} from '../services/legalDocSubstituteService.js';
import {
  sendLegalDocument,
  LegalDocSendError,
} from '../services/legalDocSendService.js';

const router = Router();

// ============================================================
// Validation
// ============================================================

const DOC_TYPES = [
  'NDA', 'LOI', 'TERM_SHEET', 'DEFINITIVE_AGREEMENT', 'SIDE_LETTER', 'OTHER',
] as const;
const STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED'] as const;

const listQuerySchema = z.object({
  docType: z.enum(DOC_TYPES).optional(),
});

const createBodySchema = z.object({
  templateId: z.string().min(1),
  title: z.string().min(1).max(500),
  counterpartyName: z.string().max(500).optional(),
  counterpartyEmail: z.string().email().max(500).optional(),
  counterpartyAddress: z.string().max(2000).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  jurisdiction: z.string().max(500).optional(),
});

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    status: z.enum(STATUSES).optional(),
    counterpartyName: z.string().max(500).nullable().optional(),
    counterpartyEmail: z.string().email().max(500).nullable().optional(),
    counterpartyAddress: z.string().max(2000).nullable().optional(),
    jurisdiction: z.string().max(500).nullable().optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    signedAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    content: z.string().max(2_000_000).nullable().optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'At least one field required' });

const sendBodySchema = z.object({
  toEmail: z.string().email().max(500).optional(),
  subject: z.string().max(500).optional(),
  message: z.string().max(20_000).optional(),
});

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

interface TemplateRow {
  id: string;
  organizationId: string;
  bodyHtml: string | null;
  docType: string;
  verifiedAt: string | null;
}

interface DealRow {
  id: string;
  name: string | null;
  // Company name lives on the separate Company table joined via Deal's FK
  // — Deal itself has no companyName column (same gotcha that broke the
  // cross-deal GET join earlier).
  company: { name: string | null } | null;
  organizationId: string;
}

interface OrgRow {
  id: string;
  name: string | null;
}

async function loadTemplate(templateId: string, orgId: string): Promise<TemplateRow | null> {
  const { data, error } = await supabase
    .from('LegalDocTemplate')
    .select('id, organizationId, bodyHtml, docType, verifiedAt')
    .eq('id', templateId)
    .eq('organizationId', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as TemplateRow | null) ?? null;
}

async function loadDeal(dealId: string, orgId: string): Promise<DealRow | null> {
  const { data, error } = await supabase
    .from('Deal')
    .select('id, name, organizationId, company:Company(name)')
    .eq('id', dealId)
    .eq('organizationId', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as DealRow | null) ?? null;
}

async function loadOrg(orgId: string): Promise<OrgRow | null> {
  const { data, error } = await supabase
    .from('Organization')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgRow | null) ?? null;
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
    // The "target" the frontend cards display is actually Company.name,
    // joined through the Deal -> Company FK that other routes also use
    // (see memos-list.ts:60 for the same pattern). We flatten the nested
    // company.name back into target before responding so the frontend
    // doesn't have to know about the second table.
    let query = supabase
      .from('LegalDocument')
      .select('*, deal:Deal(id, projectName:name, company:Company(name))')
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

    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      const dealRaw = row.deal as
        | { id: string; projectName: string | null; company?: { name: string | null } | null }
        | null;
      if (!dealRaw) return { ...row, deal: null };
      return {
        ...row,
        deal: {
          id: dealRaw.id,
          projectName: dealRaw.projectName ?? null,
          target: dealRaw.company?.name ?? null,
        },
      };
    });
    res.json(rows);
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
// POST /deals/:dealId/legal-documents — create from template
// ============================================================

router.post('/deals/:dealId/legal-documents', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { dealId } = req.params;
    const deal = await loadDeal(dealId, orgId);
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

    const template = await loadTemplate(parsed.data.templateId, orgId);
    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }
    if (!template.verifiedAt) {
      return res.status(400).json({
        error: 'Template has not been verified — admin must mark placeholders first',
        code: 'TEMPLATE_NOT_VERIFIED',
      });
    }
    if (!template.bodyHtml) {
      return res.status(400).json({
        error: 'Template has no body content',
        code: 'TEMPLATE_NOT_VERIFIED',
      });
    }

    const org = await loadOrg(orgId);
    const todayIso = new Date().toISOString().slice(0, 10);

    const tokens: LegalDocTokenValues = {
      COUNTERPARTY_NAME: parsed.data.counterpartyName,
      COUNTERPARTY_ADDRESS: parsed.data.counterpartyAddress,
      COUNTERPARTY_EMAIL: parsed.data.counterpartyEmail,
      EFFECTIVE_DATE: parsed.data.effectiveDate,
      JURISDICTION: parsed.data.jurisdiction,
      DEAL_NAME: deal.name ?? deal.company?.name ?? '',
      FIRM_NAME: org?.name ?? '',
      TODAY: todayIso,
    };
    const substituted = substituteTokens(template.bodyHtml, tokens);
    // Belt + suspenders: sanitise again after substitution — token
    // values are user input and could (in theory) inject markup.
    const content = sanitiseLegalDocHtml(substituted);

    const insertRow = {
      organizationId: orgId,
      dealId,
      createdById: internalUserId,
      docType: template.docType ?? 'NDA',
      title: parsed.data.title,
      counterpartyName: parsed.data.counterpartyName ?? null,
      counterpartyEmail: parsed.data.counterpartyEmail ?? null,
      counterpartyAddress: parsed.data.counterpartyAddress ?? null,
      jurisdiction: parsed.data.jurisdiction ?? null,
      effectiveDate: parsed.data.effectiveDate ?? null,
      status: 'DRAFT' as const,
      templateId: template.id,
      content,
      metadata: {},
    };

    const { data, error } = await supabase
      .from('LegalDocument')
      .insert(insertRow)
      .select('*')
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    log.error('POST /api/deals/:dealId/legal-documents error', err);
    res.status(500).json({ error: 'Failed to create legal document' });
  }
});

// ============================================================
// PATCH /legal-documents/:id — update fields incl. content
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
    // Sanitise content through the same allowlist used at parse time
    // so we never let raw <script> markup land on the row.
    if (typeof parsed.data.content === 'string') {
      updatePayload.content = sanitiseLegalDocHtml(parsed.data.content);
    }
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
// POST /legal-documents/:id/send — Resend .docx delivery
// ============================================================

router.post('/legal-documents/:id/send', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { id } = req.params;
    const parsed = sendBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.errors });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const internalUserId = await resolveInternalUserId(req.user.id);
    if (!internalUserId) return res.status(404).json({ error: 'User not found' });

    const result = await sendLegalDocument({
      documentId: id,
      organizationId: orgId,
      userId: internalUserId,
      toEmail: parsed.data.toEmail,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof LegalDocSendError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }
    log.error('POST /api/legal-documents/:id/send error', err);
    res.status(500).json({ error: 'Failed to send legal document' });
  }
});

export default router;
