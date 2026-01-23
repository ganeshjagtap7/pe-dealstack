import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createDealSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  stage: z.string().default('INITIAL_REVIEW'),
  status: z.string().default('ACTIVE'),
  irrProjected: z.number().optional(),
  mom: z.number().optional(),
  ebitda: z.number().optional(),
  revenue: z.number().optional(),
  industry: z.string().optional(),
  dealSize: z.number().optional(),
  description: z.string().optional(),
  aiThesis: z.string().optional(),
  icon: z.string().optional(),
});

const updateDealSchema = createDealSchema.partial();

// GET /api/deals - Get all deals with company info
router.get('/', async (req, res) => {
  try {
    const { stage, status, industry } = req.query;

    let query = supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .order('updatedAt', { ascending: false });

    if (stage) query = query.eq('stage', stage);
    if (status) query = query.eq('status', status);
    if (industry) query = query.ilike('industry', `%${industry}%`);

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get single deal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// POST /api/deals - Create new deal
router.post('/', async (req, res) => {
  try {
    const data = createDealSchema.parse(req.body);

    let companyId = data.companyId;

    // Create company if it doesn't exist
    if (!companyId && data.companyName) {
      const { data: company, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: data.companyName,
          industry: data.industry,
        })
        .select()
        .single();

      if (companyError) throw companyError;
      companyId = company.id;
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID or name is required' });
    }

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: data.name,
        companyId,
        stage: data.stage,
        status: data.status,
        irrProjected: data.irrProjected,
        mom: data.mom,
        ebitda: data.ebitda,
        revenue: data.revenue,
        industry: data.industry,
        dealSize: data.dealSize,
        description: data.description,
        aiThesis: data.aiThesis,
        icon: data.icon || 'business_center',
      })
      .select(`
        *,
        company:Company(*)
      `)
      .single();

    if (dealError) throw dealError;

    // Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'STATUS_UPDATED',
      title: 'Deal Created',
      description: `New deal "${deal.name}" created`,
    });

    res.status(201).json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// PATCH /api/deals/:id - Update deal
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateDealSchema.parse(req.body);

    // Get existing deal
    const { data: existingDeal, error: fetchError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Update deal
    const { data: deal, error: updateError } = await supabase
      .from('Deal')
      .update({
        ...data,
        companyId: undefined, // Don't allow changing company
      })
      .eq('id', id)
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .single();

    if (updateError) throw updateError;

    // Log stage change
    if (data.stage && data.stage !== existingDeal.stage) {
      await supabase.from('Activity').insert({
        dealId: deal.id,
        type: 'STAGE_CHANGED',
        title: `Stage changed to ${data.stage}`,
        description: `Deal stage changed from ${existingDeal.stage} to ${data.stage}`,
      });
    }

    res.json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id - Delete deal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Deal')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// GET /api/deals/stats/summary - Get deal statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { count: total } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true });

    const { count: active } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE');

    const { count: passed } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PASSED');

    // Get deals by stage
    const { data: deals } = await supabase
      .from('Deal')
      .select('stage')
      .eq('status', 'ACTIVE');

    const byStage = deals?.reduce((acc: any, deal) => {
      acc[deal.stage] = (acc[deal.stage] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total: total || 0,
      active: active || 0,
      passed: passed || 0,
      byStage: Object.entries(byStage || {}).map(([stage, count]) => ({ stage, count })),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
