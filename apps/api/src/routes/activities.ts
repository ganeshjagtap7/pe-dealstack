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

// Compute the display string the mention picker would insert for a user.
// Mirrors fetchMentionUsers in deal-overview.tsx: prefer User.name, fall
// back to the email-prefix, then "Unknown". Without this fallback, users
// whose name is NULL never match server-side even though the picker
// happily inserts `@<email-prefix> ` for them.
function mentionDisplayName(u: { name: string | null; email: string | null }): string | null {
  const name = u.name?.trim();
  if (name) return name;
  const prefix = u.email?.split('@')[0]?.trim();
  if (prefix) return prefix;
  return null;
}

// Parse @<display name> mentions from free-form note text. Mirrors the
// client insertion rule (deal-overview.tsx insertMention): the @ must sit
// at start-of-string or after whitespace, followed by the user's display
// name and a word-boundary delimiter. We resolve display names against
// the org's User table — the client doesn't send mentioned-id metadata.
function parseMentions(
  text: string,
  orgUsers: Array<{ id: string; name: string | null; email: string | null }>,
): Set<string> {
  const matched = new Set<string>();
  if (!text) return matched;
  // Sort by display-name length DESC so "@Aditya Negi" wins over "@Aditya"
  // when the user typed the longer form (avoids false positives on the
  // shorter name).
  const sorted = orgUsers
    .map((u) => ({ id: u.id, displayName: mentionDisplayName(u) }))
    .filter((u): u is { id: string; displayName: string } => u.displayName !== null)
    .sort((a, b) => b.displayName.length - a.displayName.length);
  let remaining = text;
  for (const u of sorted) {
    // Case-insensitive — the picker preserves DB case but users sometimes
    // hand-type a mention with different casing.
    const re = new RegExp(`(?:^|\\s)@${escapeRegex(u.displayName)}(?=\\s|$|[^\\w])`, 'i');
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
    // names against the org User table here. Awaited (not fire-and-forget)
    // because Vercel's serverless runtime can freeze the function once the
    // response is sent, dropping pending promises — that's why the previous
    // post-response IIFE never reached the Notification insert. Failures
    // are logged but never fail the request: the activity itself succeeded.
    if (data.description) {
      try {
        const { data: orgUsers } = await supabase
          .from('User')
          .select('id, name, email')
          .eq('organizationId', orgId);
        const candidates = (orgUsers || []).map((u) => ({
          id: u.id as string,
          name: (u.name as string | null) ?? null,
          email: (u.email as string | null) ?? null,
        }));
        log.info('Mention scan: orgUsers fetched', {
          dealId,
          orgId,
          count: candidates.length,
          displayNames: candidates.map((u) => mentionDisplayName(u)).filter(Boolean),
        });
        const mentioned = parseMentions(data.description as string, candidates);
        log.info('Mention scan: parseMentions done', {
          dealId,
          descriptionPreview: (data.description as string).slice(0, 120),
          matched: mentioned.size,
          userIds: Array.from(mentioned),
        });
        if (mentioned.size > 0) {
          const snippet = (data.description as string).slice(0, 200);
          const results = await Promise.all(
            Array.from(mentioned).map((userId) =>
              createNotification({
                userId,
                type: 'MENTION',
                title: `You were mentioned in "${deal.name}"`,
                message: snippet,
                dealId,
              }).catch((err) => {
                log.error('Mention notification failed', err);
                return null;
              }),
            ),
          );
          const created = results.filter((r) => r !== null).length;
          log.info('Mention scan: notifications created', { dealId, attempted: mentioned.size, created });
        }
      } catch (err) {
        log.error('Mention parsing failed', err);
      }
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
