import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { getOrgId, verifyContactAccess, verifyDealAccess } from '../middleware/orgScope.js';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(40)
    .optional(),
});

// ─── Validation Schemas ──────────────────────────────────────

const interactionTypes = ['NOTE', 'MEETING', 'CALL', 'EMAIL', 'OTHER'] as const;
const dealRoles = ['BANKER', 'ADVISOR', 'BOARD_MEMBER', 'MANAGEMENT', 'OTHER'] as const;
const relationshipTypes = ['KNOWS', 'REFERRED_BY', 'REPORTS_TO', 'COLLEAGUE', 'INTRODUCED_BY'] as const;

const createInteractionSchema = z.object({
  type: z.enum(interactionTypes).default('NOTE'),
  title: z.string().max(200).optional().or(z.literal('')),
  description: z.string().max(10000).optional().or(z.literal('')),
  date: z.string().optional(),
});

const linkDealSchema = z.object({
  dealId: z.string().uuid(),
  role: z.enum(dealRoles).default('OTHER'),
});

const createConnectionSchema = z.object({
  relatedContactId: z.string().uuid(),
  type: z.enum(relationshipTypes),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

// ─── POST /api/contacts/:id/interactions — Add interaction ──

router.post('/:id/interactions', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const validation = createInteractionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const data = validation.data;

    const { data: interaction, error } = await supabase
      .from('ContactInteraction')
      .insert({
        contactId: id,
        type: data.type,
        title: data.title || null,
        description: data.description || null,
        date: data.date || new Date().toISOString(),
        createdBy: req.user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Update lastContactedAt on the contact
    await supabase
      .from('Contact')
      .update({ lastContactedAt: data.date || new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq('id', id);

    log.info('Interaction added', { contactId: id, type: data.type });

    res.status(201).json(interaction);
  } catch (error) {
    log.error('Add interaction error', error);
    res.status(500).json({ error: 'Failed to add interaction' });
  }
});

// ─── POST /api/contacts/:id/deals — Link contact to deal ────

router.post('/:id/deals', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const validation = linkDealSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { dealId, role } = validation.data;

    // Also verify the deal belongs to the same org
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { data: link, error } = await supabase
      .from('ContactDeal')
      .insert({
        contactId: id,
        dealId,
        role,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Contact is already linked to this deal' });
      }
      throw error;
    }

    log.info('Contact linked to deal', { contactId: id, dealId, role });

    res.status(201).json(link);
  } catch (error) {
    log.error('Link deal error', error);
    res.status(500).json({ error: 'Failed to link deal' });
  }
});

// ─── DELETE /api/contacts/:contactId/deals/:dealId — Unlink ─

router.delete('/:contactId/deals/:dealId', async (req: any, res) => {
  try {
    const { contactId, dealId } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(contactId, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const { error } = await supabase
      .from('ContactDeal')
      .delete()
      .eq('contactId', contactId)
      .eq('dealId', dealId);

    if (error) throw error;

    log.info('Contact unlinked from deal', { contactId, dealId });

    res.json({ success: true });
  } catch (error) {
    log.error('Unlink deal error', error);
    res.status(500).json({ error: 'Failed to unlink deal' });
  }
});

// ─── GET /api/contacts/:id/connections — List connections (bidirectional) ─

router.get('/:id/connections', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Fetch where this contact is either side of the relationship
    // ContactRelationship table may not exist yet — return empty if so
    const { data: asSource, error: e1 } = await supabase
      .from('ContactRelationship')
      .select('*, contact:relatedContactId(id, firstName, lastName, type, company, title)')
      .eq('contactId', id);

    const { data: asTarget, error: e2 } = await supabase
      .from('ContactRelationship')
      .select('*, contact:contactId(id, firstName, lastName, type, company, title)')
      .eq('relatedContactId', id);

    // If table doesn't exist, return empty connections
    if (e1 || e2) {
      res.json({ connections: [] });
      return;
    }

    const connections = [
      ...(asSource || []).map((r: any) => ({ id: r.id, type: r.type, notes: r.notes, contact: r.contact, direction: 'outgoing' })),
      ...(asTarget || []).map((r: any) => ({ id: r.id, type: r.type, notes: r.notes, contact: r.contact, direction: 'incoming' })),
    ];

    res.json({ connections });
  } catch (error) {
    log.error('List connections error', error);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

// ─── POST /api/contacts/:id/connections — Create connection ─

router.post('/:id/connections', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const validation = createConnectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { relatedContactId, type, notes } = validation.data;

    if (relatedContactId === id) {
      return res.status(400).json({ error: 'Cannot create a connection to the same contact' });
    }

    const insertData: any = {
      contactId: id,
      relatedContactId,
      type,
      notes: notes || null,
    };
    // Only set createdBy if user ID exists — FK may fail if User table ID differs from auth ID
    if (req.user?.id) {
      insertData.createdBy = req.user.id;
    }

    const { data: connection, error } = await supabase
      .from('ContactRelationship')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      log.error('Connection insert error', { code: error.code, message: error.message, details: error.details, hint: error.hint });
      if (error.code === '23505') {
        return res.status(409).json({ error: 'This connection already exists' });
      }
      throw error;
    }

    log.info('Connection created', { contactId: id, relatedContactId, type });

    res.status(201).json(connection);
  } catch (error) {
    log.error('Create connection error', error);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// ─── DELETE /api/contacts/:id/connections/:connectionId — Remove connection ─

router.delete('/:id/connections/:connectionId', async (req: any, res) => {
  try {
    const { id, connectionId } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // SECURITY: the connection must actually reference the verified contact —
    // otherwise owning any one contact would let a user delete an arbitrary
    // ContactRelationship row by id.
    const { data: conn } = await supabase
      .from('ContactRelationship')
      .select('id, contactId, relatedContactId')
      .eq('id', connectionId)
      .single();
    if (!conn || (conn.contactId !== id && conn.relatedContactId !== id)) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const { error } = await supabase
      .from('ContactRelationship')
      .delete()
      .eq('id', connectionId);

    if (error) throw error;

    log.info('Connection removed', { connectionId });

    res.json({ success: true });
  } catch (error) {
    log.error('Delete connection error', error);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
});

// ─── GET /api/contacts/:id/email-summary — AI summary of email history ─
// Bounded, org-scoped. Returns { connected:false } (never an error) when Gmail
// isn't linked. Sub-path of /:id so it's safe from the /:id route in contacts.ts.

router.get('/:id/email-summary', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const authUserId = req.user?.id;
    if (!authUserId) {
      return res.json({ connected: false, threadCount: 0, lastContact: null, summary: '', highlights: [] });
    }

    const { getContactEmailSummary } = await import('../services/gmailContactsService.js');
    const result = await getContactEmailSummary(orgId, id, authUserId);
    res.json(result);
  } catch (error) {
    log.error('Contact email summary error', error);
    res.status(500).json({ error: 'Failed to summarize contact emails' });
  }
});

// ─── POST /api/contacts/:id/chat — Contact-scoped AI Q&A ─

router.post('/:id/chat', async (req: any, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const contactAccess = await verifyContactAccess(id, orgId);
    if (!contactAccess) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const validation = chatSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { message, history } = validation.data;
    const { chatAboutContact } = await import('../services/contactChatService.js');
    const result = await chatAboutContact(orgId, id, message, history ?? [], req.user?.id);
    res.json(result);
  } catch (error) {
    log.error('Contact chat error', error);
    res.status(500).json({ error: 'Failed to chat about contact' });
  }
});

export default router;
