// ─── AI Agent Routes ────────────────────────────────────────────────
// Endpoints for Contact Enrichment, Meeting Prep, Signal Monitor,
// and Smart Email Drafting agents.

import { Router } from 'express';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { classifyAIError, classifyAIErrorObject } from '../utils/aiErrors.js';
import { getOrgId, verifyDealAccess, verifyContactAccess } from '../middleware/orgScope.js';
import { supabase } from '../supabase.js';

// Agent imports
import { runContactEnrichment } from '../services/agents/contactEnrichment/index.js';
import { generateMeetingPrep } from '../services/agents/meetingPrep/index.js';
import { runSignalMonitor } from '../services/agents/signalMonitor/index.js';
import { generateEmailDraft, getEmailTemplates } from '../services/agents/emailDrafter/index.js';
import { runNdaRedlineAgent } from '../services/agents/ndaRedlineAgent/index.js';
import { runTeaserFilterAgent } from '../services/agents/teaserFilterAgent/index.js';

// Document text extraction (in-memory, no DB persist) for the Criteria Engine
// dropzone. Reuses the same PDF + DOCX pipeline the deal-intake flow uses.
import { upload, extractTextFromPDF } from './ingest-shared.js';
import { extractTextFromWord } from '../services/documentParser.js';

const router = Router();

// ─── Contact Enrichment ───────────────────────────────────────────

const enrichContactSchema = z.object({
  contactId: z.string().uuid(),
});

// POST /api/ai/enrich-contact - Enrich a contact with AI
router.post('/ai/enrich-contact', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { contactId } = enrichContactSchema.parse(req.body);

    // Fetch contact
    const { data: contact, error } = await supabase
      .from('Contact')
      .select('id, firstName, lastName, email, company, title')
      .eq('id', contactId)
      .eq('organizationId', orgId)
      .single();

    if (error || !contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    log.info('Enriching contact', { contactId, name: `${contact.firstName} ${contact.lastName}` });

    const result = await runContactEnrichment({
      contactId: contact.id,
      organizationId: orgId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      company: contact.company,
      title: contact.title,
    });

    res.json(result);
  } catch (error: any) {
    log.error('Contact enrichment error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── Meeting Prep ─────────────────────────────────────────────────

const meetingPrepSchema = z.object({
  dealId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  meetingTopic: z.string().optional(),
  meetingDate: z.string().optional(),
});

// POST /api/ai/meeting-prep - Generate meeting prep brief
router.post('/ai/meeting-prep', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const input = meetingPrepSchema.parse(req.body);

    // Verify deal belongs to user's org
    const deal = await verifyDealAccess(input.dealId, orgId);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Verify contact if provided
    if (input.contactId) {
      const contact = await verifyContactAccess(input.contactId, orgId);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
    }

    log.info('Generating meeting prep', { dealId: input.dealId });

    const brief = await generateMeetingPrep({
      dealId: input.dealId,
      contactId: input.contactId,
      organizationId: orgId,
      meetingTopic: input.meetingTopic,
      meetingDate: input.meetingDate,
    });

    res.json(brief);
  } catch (error: any) {
    log.error('Meeting prep error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── Deal Signal Monitor ─────────────────────────────────────────

// POST /api/ai/scan-signals - Scan portfolio for deal signals
router.post('/ai/scan-signals', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    log.info('Scanning deal signals', { orgId });

    const result = await runSignalMonitor(orgId);

    res.json(result);
  } catch (error: any) {
    log.error('Signal scan error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── Smart Email Drafting ─────────────────────────────────────────

const emailDraftSchema = z.object({
  dealId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  purpose: z.string().min(5).max(500),
  context: z.string().optional(),
  templateId: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'formal', 'direct', 'warm']).optional(),
});

// GET /api/ai/email-templates - List available email templates
router.get('/ai/email-templates', (_req, res) => {
  res.json({ templates: getEmailTemplates() });
});

// POST /api/ai/draft-email - Generate a smart email draft
router.post('/ai/draft-email', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const input = emailDraftSchema.parse(req.body);

    // Verify deal belongs to user's org (if provided)
    if (input.dealId) {
      const deal = await verifyDealAccess(input.dealId, orgId);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
    }

    // Verify contact belongs to user's org (if provided)
    if (input.contactId) {
      const contact = await verifyContactAccess(input.contactId, orgId);
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
    }

    log.info('Drafting email', { purpose: input.purpose, dealId: input.dealId });

    const result = await generateEmailDraft({
      organizationId: orgId,
      dealId: input.dealId || null,
      contactId: input.contactId || null,
      purpose: input.purpose,
      context: input.context,
      templateId: input.templateId || null,
      tone: input.tone,
    });

    res.json(result);
  } catch (error: any) {
    log.error('Email draft error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── NDA Red-Line ─────────────────────────────────────────────────

const ndaRedlineSchema = z.object({
  firmCriteria: z.string().min(20).max(20000),
  counterpartyNdaText: z.string().max(200000).optional(),
  documentId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
}).refine(d => !!d.counterpartyNdaText || !!d.documentId, {
  message: 'Provide either counterpartyNdaText or documentId',
});

// POST /api/ai/redline-nda - Red-line a counterparty NDA against firm criteria
router.post('/ai/redline-nda', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const input = ndaRedlineSchema.parse(req.body);

    if (input.dealId) {
      const deal = await verifyDealAccess(input.dealId, orgId);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
    }

    let counterpartyNdaText = input.counterpartyNdaText || '';
    if (input.documentId) {
      const { data: doc, error } = await supabase
        .from('Document')
        .select('id, dealId, extractedText, name')
        .eq('id', input.documentId)
        .single();
      if (error || !doc) return res.status(404).json({ error: 'Document not found' });
      // org-scope through the deal
      if (doc.dealId) {
        const deal = await verifyDealAccess(doc.dealId, orgId);
        if (!deal) return res.status(403).json({ error: 'Document not in your organization' });
      }
      if (!doc.extractedText) {
        return res.status(400).json({ error: 'Document has no extracted text yet — try again in a moment or paste the NDA inline.' });
      }
      counterpartyNdaText = doc.extractedText;
    }

    log.info('Red-lining NDA', { orgId, dealId: input.dealId, documentId: input.documentId });

    const result = await runNdaRedlineAgent({
      organizationId: orgId,
      firmCriteria: input.firmCriteria,
      counterpartyNdaText,
      dealId: input.dealId || null,
      documentId: input.documentId || null,
    });

    res.json(result);
  } catch (error: any) {
    log.error('NDA red-line error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── Teaser Go/No-Go Filter ───────────────────────────────────────

const teaserFilterSchema = z.object({
  investmentCriteria: z.string().min(20).max(20000),
  teaserText: z.string().max(200000).optional(),
  documentId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
}).refine(d => !!d.teaserText || !!d.documentId, {
  message: 'Provide either teaserText or documentId',
});

// POST /api/ai/filter-teaser - Triage a teaser/CIM against firm investment criteria
router.post('/ai/filter-teaser', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const input = teaserFilterSchema.parse(req.body);

    if (input.dealId) {
      const deal = await verifyDealAccess(input.dealId, orgId);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
    }

    let teaserText = input.teaserText || '';
    if (input.documentId) {
      const { data: doc, error } = await supabase
        .from('Document')
        .select('id, dealId, extractedText, name')
        .eq('id', input.documentId)
        .single();
      if (error || !doc) return res.status(404).json({ error: 'Document not found' });
      if (doc.dealId) {
        const deal = await verifyDealAccess(doc.dealId, orgId);
        if (!deal) return res.status(403).json({ error: 'Document not in your organization' });
      }
      if (!doc.extractedText) {
        return res.status(400).json({ error: 'Document has no extracted text yet — try again in a moment or paste the teaser inline.' });
      }
      teaserText = doc.extractedText;
    }

    log.info('Filtering teaser', { orgId, dealId: input.dealId, documentId: input.documentId });

    const result = await runTeaserFilterAgent({
      organizationId: orgId,
      investmentCriteria: input.investmentCriteria,
      teaserText,
      dealId: input.dealId || null,
      documentId: input.documentId || null,
    });

    res.json(result);
  } catch (error: any) {
    log.error('Teaser filter error', error);
    const { statusCode, userMessage } = classifyAIErrorObject(error);
    res.status(statusCode).json({ error: userMessage });
  }
});

// ─── Document Text Extract (Criteria Engine dropzone) ─────────────
// Stateless: extract text from a PDF/DOCX upload and return it. No
// Document row is created. Used by /criteria/teaser-filter and
// /criteria/nda-redline so users can drop a CIM/NDA instead of pasting.

router.post('/ai/extract-document', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const PDF = 'application/pdf';
    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const DOC = 'application/msword';

    let text: string | null = null;
    if (file.mimetype === PDF) {
      const extraction = await extractTextFromPDF(file.buffer, file.originalname);
      text = extraction?.text ?? null;
    } else if (file.mimetype === DOCX || file.mimetype === DOC) {
      text = await extractTextFromWord(file.buffer);
    } else {
      return res.status(400).json({ error: 'Only PDF and Word (.pdf, .docx, .doc) are supported here.' });
    }

    if (!text || text.trim().length < 20) {
      return res.status(422).json({
        error: 'We could not extract usable text from this file. It may be scanned or image-only — try pasting the text directly.',
      });
    }

    res.json({
      filename: file.originalname,
      sizeBytes: file.size,
      text,
      chars: text.length,
    });
  } catch (error: any) {
    log.error('extract-document error', error);
    res.status(500).json({ error: 'Could not read the file — please try again or paste the text.' });
  }
});

export default router;
