import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';

const router = Router();

// ─── Validation Schemas ──────────────────────────────────────

const contactTypes = ['BANKER', 'ADVISOR', 'EXECUTIVE', 'LP', 'LEGAL', 'OTHER'] as const;
const interactionTypes = ['NOTE', 'MEETING', 'CALL', 'EMAIL', 'OTHER'] as const;
const dealRoles = ['BANKER', 'ADVISOR', 'BOARD_MEMBER', 'MANAGEMENT', 'OTHER'] as const;

const createContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  title: z.string().max(100).optional().or(z.literal('')),
  company: z.string().max(200).optional().or(z.literal('')),
  type: z.enum(contactTypes).default('OTHER'),
  linkedinUrl: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(5000).optional().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const updateContactSchema = createContactSchema.partial();

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

const relationshipTypes = ['KNOWS', 'REFERRED_BY', 'REPORTS_TO', 'COLLEAGUE', 'INTRODUCED_BY'] as const;

const createConnectionSchema = z.object({
  relatedContactId: z.string().uuid(),
  type: z.enum(relationshipTypes),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

const contactsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  type: z.enum(contactTypes).optional(),
  company: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  sortBy: z.enum(['name', 'company', 'lastContactedAt', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const importContactsSchema = z.object({
  contacts: z.array(createContactSchema).min(1).max(500),
});

// ─── GET /api/contacts — List contacts with filters ─────────

router.get('/', async (req: any, res) => {
  try {
    const query = contactsQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: query.error.errors });
    }

    const { search, type, company, tag, sortBy, sortOrder, limit = 50, offset = 0 } = query.data;

    let q = supabase
      .from('Contact')
      .select('*, ContactDeal(count)', { count: 'exact' });

    if (type) q = q.eq('type', type);
    if (company) q = q.ilike('company', `%${company}%`);
    if (tag) q = q.contains('tags', [tag]);

    if (search) {
      q = q.or(`firstName.ilike.%${search}%,lastName.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }

    // Sorting
    if (sortBy === 'name') {
      q = q.order('lastName', { ascending: sortOrder !== 'desc' })
           .order('firstName', { ascending: sortOrder !== 'desc' });
    } else if (sortBy === 'company') {
      q = q.order('company', { ascending: sortOrder !== 'desc', nullsFirst: false });
    } else if (sortBy === 'lastContactedAt') {
      q = q.order('lastContactedAt', { ascending: sortOrder === 'asc', nullsFirst: false });
    } else {
      q = q.order('createdAt', { ascending: false });
    }

    q = q.range(offset, offset + limit - 1);

    const { data: contacts, error, count } = await q;

    if (error) throw error;

    res.json({
      contacts: contacts || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    log.error('List contacts error', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

// ─── GET /api/contacts/:id — Get contact with details ───────

router.get('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;

    const { data: contact, error } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Fetch interactions
    const { data: interactions } = await supabase
      .from('ContactInteraction')
      .select('*')
      .eq('contactId', id)
      .order('date', { ascending: false });

    // Fetch linked deals
    const { data: contactDeals } = await supabase
      .from('ContactDeal')
      .select('*, Deal(id, name, stage, status, industry, icon)')
      .eq('contactId', id)
      .order('createdAt', { ascending: false });

    res.json({
      ...contact,
      interactions: interactions || [],
      linkedDeals: (contactDeals || []).map((cd: any) => ({
        ...cd.Deal,
        linkRole: cd.role,
        linkedAt: cd.createdAt,
      })),
    });
  } catch (error) {
    log.error('Get contact error', error);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// ─── POST /api/contacts — Create contact ────────────────────

router.post('/', async (req: any, res) => {
  try {
    const validation = createContactSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const data = validation.data;

    const { data: contact, error } = await supabase
      .from('Contact')
      .insert({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        title: data.title || null,
        company: data.company || null,
        type: data.type,
        linkedinUrl: data.linkedinUrl || null,
        notes: data.notes || null,
        tags: data.tags || [],
        createdBy: req.user?.id,
      })
      .select()
      .single();

    if (error) {
      log.error('Supabase insert error', { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return res.status(500).json({ error: 'Failed to create contact', details: error.message });
    }

    log.info('Contact created', { contactId: contact.id, name: `${data.firstName} ${data.lastName}` });

    res.status(201).json(contact);
  } catch (error: any) {
    log.error('Create contact error', error);
    res.status(500).json({ error: 'Failed to create contact', details: error?.message });
  }
});

// ─── PATCH /api/contacts/:id — Update contact ───────────────

router.patch('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const validation = updateContactSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    const data = validation.data;

    if (data.firstName !== undefined) updates.firstName = data.firstName;
    if (data.lastName !== undefined) updates.lastName = data.lastName;
    if (data.email !== undefined) updates.email = data.email || null;
    if (data.phone !== undefined) updates.phone = data.phone || null;
    if (data.title !== undefined) updates.title = data.title || null;
    if (data.company !== undefined) updates.company = data.company || null;
    if (data.type !== undefined) updates.type = data.type;
    if (data.linkedinUrl !== undefined) updates.linkedinUrl = data.linkedinUrl || null;
    if (data.notes !== undefined) updates.notes = data.notes || null;
    if (data.tags !== undefined) updates.tags = data.tags;

    const { data: contact, error } = await supabase
      .from('Contact')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    log.info('Contact updated', { contactId: id });

    res.json(contact);
  } catch (error) {
    log.error('Update contact error', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// ─── DELETE /api/contacts/:id — Delete contact ──────────────

router.delete('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Contact')
      .delete()
      .eq('id', id);

    if (error) throw error;

    log.info('Contact deleted', { contactId: id });

    res.json({ success: true });
  } catch (error) {
    log.error('Delete contact error', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ─── POST /api/contacts/:id/interactions — Add interaction ──

router.post('/:id/interactions', async (req: any, res) => {
  try {
    const { id } = req.params;
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
    const validation = linkDealSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { dealId, role } = validation.data;

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

// ─── POST /api/contacts/import — Bulk import contacts ───────

router.post('/import', async (req: any, res) => {
  try {
    const validation = importContactsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { contacts } = validation.data;
    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const c of contacts) {
      const { error } = await supabase
        .from('Contact')
        .insert({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email || null,
          phone: c.phone || null,
          title: c.title || null,
          company: c.company || null,
          type: c.type || 'OTHER',
          linkedinUrl: c.linkedinUrl || null,
          notes: c.notes || null,
          tags: c.tags || [],
          createdBy: req.user?.id,
        });

      if (error) {
        results.failed++;
        results.errors.push(`${c.firstName} ${c.lastName}: ${error.message}`);
      } else {
        results.success++;
      }
    }

    log.info('Contacts import complete', { total: contacts.length, success: results.success, failed: results.failed });

    res.status(201).json({
      success: true,
      imported: results.success,
      failed: results.failed,
      errors: results.errors,
    });
  } catch (error) {
    log.error('Import contacts error', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

// ─── GET /api/contacts/insights/timeline — Recent interactions across all contacts ─

router.get('/insights/timeline', async (req: any, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const { data: interactions, error } = await supabase
      .from('ContactInteraction')
      .select('*, Contact:contactId(id, firstName, lastName, type, company)')
      .order('date', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ interactions: interactions || [] });
  } catch (error) {
    log.error('Timeline error', error);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});

// ─── GET /api/contacts/insights/duplicates — Find duplicate contacts ─

router.get('/insights/duplicates', async (req: any, res) => {
  try {
    const { data: contacts, error } = await supabase
      .from('Contact')
      .select('id, firstName, lastName, email, company, type')
      .order('firstName', { ascending: true });

    if (error) throw error;

    const duplicates: { key: string; reason: string; contacts: any[] }[] = [];
    const emailMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();

    for (const c of contacts || []) {
      // Group by email
      if (c.email) {
        const key = c.email.toLowerCase().trim();
        if (!emailMap.has(key)) emailMap.set(key, []);
        emailMap.get(key)!.push(c);
      }
      // Group by full name
      const nameKey = `${(c.firstName || '').toLowerCase().trim()} ${(c.lastName || '').toLowerCase().trim()}`;
      if (nameKey.trim()) {
        if (!nameMap.has(nameKey)) nameMap.set(nameKey, []);
        nameMap.get(nameKey)!.push(c);
      }
    }

    // Collect email duplicates
    for (const [email, group] of emailMap) {
      if (group.length > 1) {
        duplicates.push({ key: email, reason: 'Same email', contacts: group });
      }
    }

    // Collect name duplicates (only if not already caught by email)
    const seenIds = new Set(duplicates.flatMap(d => d.contacts.map((c: any) => c.id)));
    for (const [name, group] of nameMap) {
      if (group.length > 1 && !group.every((c: any) => seenIds.has(c.id))) {
        duplicates.push({ key: name, reason: 'Same name', contacts: group });
      }
    }

    res.json({ duplicates, count: duplicates.length });
  } catch (error) {
    log.error('Duplicates error', error);
    res.status(500).json({ error: 'Failed to check duplicates' });
  }
});

// ─── GET /api/contacts/insights/stale — Contacts needing attention ─

router.get('/insights/stale', async (req: any, res) => {
  try {
    const daysThreshold = Number(req.query.days) || 30;
    const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000).toISOString();

    // Contacts where lastContactedAt is before cutoff or null
    const { data: staleContacted, error: err1 } = await supabase
      .from('Contact')
      .select('id, firstName, lastName, type, company, email, lastContactedAt')
      .lt('lastContactedAt', cutoff)
      .order('lastContactedAt', { ascending: true })
      .limit(20);

    const { data: neverContacted, error: err2 } = await supabase
      .from('Contact')
      .select('id, firstName, lastName, type, company, email, lastContactedAt, createdAt')
      .is('lastContactedAt', null)
      .order('createdAt', { ascending: true })
      .limit(20);

    if (err1) throw err1;
    if (err2) throw err2;

    const stale = [
      ...(neverContacted || []).map((c: any) => ({ ...c, reason: 'Never contacted' })),
      ...(staleContacted || []).map((c: any) => ({ ...c, reason: `No contact in ${Math.floor((Date.now() - new Date(c.lastContactedAt).getTime()) / 86400000)} days` })),
    ];

    res.json({ contacts: stale, threshold: daysThreshold });
  } catch (error) {
    log.error('Stale contacts error', error);
    res.status(500).json({ error: 'Failed to check stale contacts' });
  }
});

// ─── GET /api/contacts/insights/scores — Relationship strength scores ─

router.get('/insights/scores', async (req: any, res) => {
  try {
    // Fetch all contacts
    const { data: contacts, error: cErr } = await supabase
      .from('Contact')
      .select('id, lastContactedAt');
    if (cErr) throw cErr;

    // Count interactions per contact
    const { data: interactions, error: iErr } = await supabase
      .from('ContactInteraction')
      .select('contactId');
    if (iErr) throw iErr;

    // Count linked deals per contact
    const { data: dealLinks, error: dErr } = await supabase
      .from('ContactDeal')
      .select('contactId');
    if (dErr) throw dErr;

    const interactionCounts: Record<string, number> = {};
    for (const i of interactions || []) {
      interactionCounts[i.contactId] = (interactionCounts[i.contactId] || 0) + 1;
    }

    const dealCounts: Record<string, number> = {};
    for (const d of dealLinks || []) {
      dealCounts[d.contactId] = (dealCounts[d.contactId] || 0) + 1;
    }

    const now = Date.now();
    const scores: Record<string, any> = {};

    for (const c of contacts || []) {
      // Recency score (0-40)
      let recency = 0;
      if (c.lastContactedAt) {
        const days = (now - new Date(c.lastContactedAt).getTime()) / 86400000;
        if (days <= 7) recency = 40;
        else if (days <= 14) recency = 35;
        else if (days <= 30) recency = 28;
        else if (days <= 60) recency = 18;
        else if (days <= 90) recency = 10;
        else if (days <= 180) recency = 5;
      }

      // Frequency score (0-40)
      const iCount = interactionCounts[c.id] || 0;
      let frequency = 0;
      if (iCount >= 20) frequency = 40;
      else if (iCount >= 12) frequency = 35;
      else if (iCount >= 8) frequency = 28;
      else if (iCount >= 5) frequency = 22;
      else if (iCount >= 3) frequency = 15;
      else if (iCount >= 1) frequency = 8;

      // Deals score (0-20)
      const dCount = dealCounts[c.id] || 0;
      let deals = 0;
      if (dCount >= 4) deals = 20;
      else if (dCount >= 3) deals = 16;
      else if (dCount >= 2) deals = 12;
      else if (dCount >= 1) deals = 8;

      const score = recency + frequency + deals;
      let label = 'Cold';
      if (score > 75) label = 'Strong';
      else if (score > 50) label = 'Active';
      else if (score > 25) label = 'Warm';

      scores[c.id] = { score, label, breakdown: { recency, frequency, deals } };
    }

    res.json({ scores });
  } catch (error) {
    log.error('Scores error', error);
    res.status(500).json({ error: 'Failed to compute scores' });
  }
});

// ─── GET /api/contacts/insights/network — Network overview stats ─

router.get('/insights/network', async (req: any, res) => {
  try {
    const { data: contacts, error: cErr } = await supabase
      .from('Contact')
      .select('id, firstName, lastName, type, company');
    if (cErr) throw cErr;

    const { data: connections, error: rErr } = await supabase
      .from('ContactRelationship')
      .select('contactId, relatedContactId');
    if (rErr) throw rErr;

    const { data: dealLinks, error: dErr } = await supabase
      .from('ContactDeal')
      .select('contactId');
    if (dErr) throw dErr;

    // Type breakdown
    const byType: Record<string, number> = {};
    for (const c of contacts || []) {
      byType[c.type] = (byType[c.type] || 0) + 1;
    }

    // Count connections + deals per contact
    const linkCount: Record<string, number> = {};
    for (const r of connections || []) {
      linkCount[r.contactId] = (linkCount[r.contactId] || 0) + 1;
      linkCount[r.relatedContactId] = (linkCount[r.relatedContactId] || 0) + 1;
    }
    for (const d of dealLinks || []) {
      linkCount[d.contactId] = (linkCount[d.contactId] || 0) + 1;
    }

    // Top 5 most connected
    const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));
    const ranked = Object.entries(linkCount)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([id, total]) => {
        const c = contactMap.get(id) || {} as any;
        return {
          id,
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          type: c.type || 'OTHER',
          company: c.company || '',
          totalLinks: total,
        };
      });

    res.json({
      totalContacts: (contacts || []).length,
      byType,
      totalConnections: (connections || []).length,
      mostConnected: ranked,
    });
  } catch (error) {
    log.error('Network stats error', error);
    res.status(500).json({ error: 'Failed to load network stats' });
  }
});

// ─── GET /api/contacts/:id/connections — List connections (bidirectional) ─

router.get('/:id/connections', async (req: any, res) => {
  try {
    const { id } = req.params;

    // Fetch where this contact is either side of the relationship
    const { data: asSource, error: e1 } = await supabase
      .from('ContactRelationship')
      .select('*, contact:relatedContactId(id, firstName, lastName, type, company, title)')
      .eq('contactId', id);

    const { data: asTarget, error: e2 } = await supabase
      .from('ContactRelationship')
      .select('*, contact:contactId(id, firstName, lastName, type, company, title)')
      .eq('relatedContactId', id);

    if (e1) throw e1;
    if (e2) throw e2;

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
    const validation = createConnectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { relatedContactId, type, notes } = validation.data;

    if (relatedContactId === id) {
      return res.status(400).json({ error: 'Cannot create a connection to the same contact' });
    }

    const { data: connection, error } = await supabase
      .from('ContactRelationship')
      .insert({
        contactId: id,
        relatedContactId,
        type,
        notes: notes || null,
        createdBy: req.user?.id,
      })
      .select()
      .single();

    if (error) {
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
    const { connectionId } = req.params;

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

export default router;
