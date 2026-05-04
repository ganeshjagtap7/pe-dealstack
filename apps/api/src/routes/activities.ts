import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import { createNotification } from './notifications.js';

const router = Router();

// Escape user-provided strings before embedding them in a RegExp.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse @<full name> mentions from free-form note text. Mirrors the client
// insertion rule (deal-overview.tsx insertMention): the @ must sit at
// start-of-string or after whitespace, followed by the user's exact display
// name and a word-boundary delimiter. We resolve names against the org's
// User table — the client doesn't send mentioned-id metadata.
function parseMentions(
  text: string,
  orgUsers: Array<{ id: string; name: string | null }>,
): Set<string> {
  const matched = new Set<string>();
  if (!text) return matched;
  // Sort by name length DESC so "@Aditya Negi" wins over "@Aditya" when the
  // user typed the longer form (avoids false positives on the shorter name).
  const sorted = [...orgUsers]
    .filter((u): u is { id: string; name: string } => Boolean(u.name && u.name.trim()))
    .sort((a, b) => b.name.length - a.name.length);
  let remaining = text;
  for (const u of sorted) {
    const re = new RegExp(`(?:^|\\s)@${escapeRegex(u.name)}(?=\\s|$|[^\\w])`);
    if (re.test(remaining)) {
      matched.add(u.id);
      // Strip the matched span so a longer-name match doesn't double-count
      // a shorter-name suffix (e.g. matching "@Aditya" inside "@Aditya Negi").
      remaining = remaining.replace(re, ' ');
    }
  }
  return matched;
}

// Query parameter schemas
const activitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const recentActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Validation schemas
const createActivitySchema = z.object({
  type: z.enum([
    'DOCUMENT_UPLOADED',
    'STAGE_CHANGED',
    'NOTE_ADDED',
    'MEETING_SCHEDULED',
    'CALL_LOGGED',
    'EMAIL_SENT',
    'STATUS_UPDATED'
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// GET /api/deals/:dealId/activities - List activities for a deal
router.get('/deals/:dealId/activities', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { limit, offset } = activitiesQuerySchema.parse(req.query);

    const { data, error, count } = await supabase
      .from('Activity')
      .select('*', { count: 'exact' })
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    log.error('Error fetching activities', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/deals/:dealId/activities - Create activity for a deal
router.post('/deals/:dealId/activities', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const data = createActivitySchema.parse(req.body);

    // Verify deal exists
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select('id, name')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { data: activity, error } = await supabase
      .from('Activity')
      .insert({
        dealId,
        type: data.type,
        title: data.title,
        description: data.description,
        metadata: data.metadata,
      })
      .select()
      .single();

    if (error) throw error;

    // @-mention notifications. Activity insert is the source of truth for
    // notes; the client doesn't send mentioned-id metadata so we resolve
    // names against the org User table here. Fire-and-forget — the activity
    // POST shouldn't block on notification fan-out.
    if (data.description) {
      (async () => {
        try {
          const { data: orgUsers } = await supabase
            .from('User')
            .select('id, name')
            .eq('organizationId', orgId);
          const mentioned = parseMentions(data.description as string, orgUsers || []);
          if (mentioned.size === 0) return;
          const snippet = (data.description as string).slice(0, 200);
          await Promise.all(
            Array.from(mentioned).map((userId) =>
              createNotification({
                userId,
                type: 'MENTION',
                title: `You were mentioned in "${deal.name}"`,
                message: snippet,
                dealId,
              }).catch((err) => log.error('Mention notification failed', err)),
            ),
          );
        } catch (err) {
          log.error('Mention parsing failed', err);
        }
      })();
    }

    res.status(201).json(activity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error creating activity', error);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// GET /api/activities/:id - Get single activity
router.get('/activities/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Activity')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Activity not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    log.error('Error fetching activity', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// DELETE /api/activities/:id - Delete activity
router.delete('/activities/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Activity')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    log.error('Error deleting activity', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// GET /api/activities/recent - Get recent activities across all deals
router.get('/activities/recent', async (req, res) => {
  try {
    const { limit } = recentActivitiesQuerySchema.parse(req.query);

    const { data, error } = await supabase
      .from('Activity')
      .select(`
        *,
        deal:Deal(id, name, icon, industry)
      `)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Error fetching recent activities', error);
    res.status(500).json({ error: 'Failed to fetch recent activities' });
  }
});

export default router;
