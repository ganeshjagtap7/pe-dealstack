import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { log } from '../utils/logger.js';

const router = Router();

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
    const { limit = 50, offset = 0 } = req.query;

    const { data, error, count } = await supabase
      .from('Activity')
      .select('*', { count: 'exact' })
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      limit: Number(limit),
      offset: Number(offset),
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
    const { limit = 20 } = req.query;

    const { data, error } = await supabase
      .from('Activity')
      .select(`
        *,
        deal:Deal(id, name, icon, industry)
      `)
      .order('createdAt', { ascending: false })
      .limit(Number(limit));

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Error fetching recent activities', error);
    res.status(500).json({ error: 'Failed to fetch recent activities' });
  }
});

export default router;
