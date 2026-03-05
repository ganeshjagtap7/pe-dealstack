import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { createNotification } from './notifications.js';

const router = Router();

// Validation schemas
const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

// GET /api/deals/:id/team - Get team members for a deal
router.get('/:id/team', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('DealTeamMember')
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title, department)
      `)
      .eq('dealId', id)
      .order('addedAt', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Error fetching team members', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/deals/:id/team - Add team member to deal
router.post('/:id/team', async (req, res) => {
  try {
    const { id } = req.params;
    const data = addTeamMemberSchema.parse(req.body);

    // Check if already a team member
    const { data: existing } = await supabase
      .from('DealTeamMember')
      .select('id')
      .eq('dealId', id)
      .eq('userId', data.userId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    const { data: member, error } = await supabase
      .from('DealTeamMember')
      .insert({
        dealId: id,
        userId: data.userId,
        role: data.role,
      })
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title)
      `)
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('Activity').insert({
      dealId: id,
      userId: data.userId,
      type: 'TEAM_MEMBER_ADDED',
      title: `Team member added`,
      description: `Added as ${data.role}`,
    });

    // Notify the new team member (fire-and-forget)
    const { data: dealInfo } = await supabase.from('Deal').select('name').eq('id', id).single();
    createNotification({
      userId: data.userId,
      type: 'DEAL_UPDATE',
      title: `You were added to "${dealInfo?.name || 'a deal'}" as ${data.role}`,
      dealId: id,
    }).catch(err => log.error('Notification error (team member added)', err));

    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error adding team member', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// PATCH /api/deals/:dealId/team/:memberId - Update team member role
router.patch('/:dealId/team/:memberId', async (req, res) => {
  try {
    const { dealId, memberId } = req.params;
    const { role } = req.body;

    if (!['LEAD', 'MEMBER', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: member, error } = await supabase
      .from('DealTeamMember')
      .update({ role })
      .eq('id', memberId)
      .eq('dealId', dealId)
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team member not found' });
      }
      throw error;
    }

    res.json(member);
  } catch (error) {
    log.error('Error updating team member', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// DELETE /api/deals/:dealId/team/:memberId - Remove team member
router.delete('/:dealId/team/:memberId', async (req, res) => {
  try {
    const { dealId, memberId } = req.params;

    const { error } = await supabase
      .from('DealTeamMember')
      .delete()
      .eq('id', memberId)
      .eq('dealId', dealId);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    log.error('Error removing team member', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
