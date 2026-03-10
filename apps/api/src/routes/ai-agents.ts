// ─── AI Agent Routes ────────────────────────────────────────────────
// Endpoints for Contact Enrichment, Meeting Prep, Signal Monitor,
// and Smart Email Drafting agents.

import { Router } from 'express';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { supabase } from '../supabase.js';

// Agent imports
import { runContactEnrichment } from '../services/agents/contactEnrichment/index.js';
import { generateMeetingPrep } from '../services/agents/meetingPrep/index.js';
import { runSignalMonitor } from '../services/agents/signalMonitor/index.js';
import { generateEmailDraft, getEmailTemplates } from '../services/agents/emailDrafter/index.js';

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
    res.status(500).json({ error: 'Failed to enrich contact' });
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
    res.status(500).json({ error: 'Failed to generate meeting prep' });
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
    res.status(500).json({ error: 'Failed to scan signals' });
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
    res.status(500).json({ error: 'Failed to draft email' });
  }
});

export default router;
