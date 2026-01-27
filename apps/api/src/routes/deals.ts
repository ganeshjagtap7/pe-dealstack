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
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().optional(),
  source: z.string().optional(),
});

const updateDealSchema = createDealSchema.partial();

const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

// GET /api/deals/stats/summary - Get deal statistics (must be before :id route)
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

    const { data: deals } = await supabase
      .from('Deal')
      .select('stage')
      .eq('status', 'ACTIVE');

    const byStage = deals?.reduce((acc: Record<string, number>, deal) => {
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

// GET /api/deals - Get all deals with company info
router.get('/', async (req, res) => {
  try {
    const { stage, status, industry, search, sortBy, sortOrder, minDealSize, maxDealSize, assignedTo, priority } = req.query;

    let query = supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        assignedUser:User!assignedTo(id, name, avatar, email),
        teamMembers:DealTeamMember(
          id,
          role,
          addedAt,
          user:User(id, name, avatar, email)
        )
      `);

    // Apply filters
    if (stage) query = query.eq('stage', stage);
    if (status) query = query.eq('status', status);
    if (industry) query = query.ilike('industry', `%${industry}%`);
    if (assignedTo) query = query.eq('assignedTo', assignedTo);
    if (priority) query = query.eq('priority', priority);

    // Deal size range filters
    if (minDealSize) query = query.gte('dealSize', Number(minDealSize));
    if (maxDealSize) query = query.lte('dealSize', Number(maxDealSize));

    // Text search across multiple fields
    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`name.ilike.${searchTerm},industry.ilike.${searchTerm},aiThesis.ilike.${searchTerm}`);
    }

    // Sorting
    const validSortFields = ['updatedAt', 'createdAt', 'dealSize', 'irrProjected', 'revenue', 'ebitda', 'name', 'priority'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'updatedAt';
    const ascending = sortOrder === 'asc';
    query = query.order(sortField, { ascending, nullsFirst: false });

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
        assignedUser:User!assignedTo(id, name, avatar, email, title),
        teamMembers:DealTeamMember(
          id,
          role,
          addedAt,
          user:User(id, name, avatar, email, title, department)
        ),
        documents:Document(
          id,
          name,
          type,
          fileUrl,
          fileSize,
          aiAnalysis,
          createdAt
        ),
        activities:Activity(
          id,
          type,
          title,
          description,
          createdAt,
          user:User!userId(id, name, avatar)
        ),
        folders:Folder(
          id,
          name,
          fileCount,
          isRestricted
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw error;
    }

    // Sort activities by date (most recent first)
    if (data?.activities) {
      data.activities.sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
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
        assignedTo: data.assignedTo,
        priority: data.priority || 'MEDIUM',
        tags: data.tags,
        targetCloseDate: data.targetCloseDate,
        source: data.source,
      })
      .select(`
        *,
        company:Company(*),
        assignedUser:User!assignedTo(id, name, avatar, email)
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

// =====================
// DEAL TEAM MANAGEMENT
// =====================

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
    console.error('Error fetching team members:', error);
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

    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error adding team member:', error);
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
    console.error('Error updating team member:', error);
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
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
