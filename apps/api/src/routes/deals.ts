import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { getOrgId } from '../middleware/orgScope.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import type { SortableByDate } from '../types/index.js';
import { createNotification, notifyDealTeam, resolveUserId } from './notifications.js';
import { generateFollowUpQuestions } from '../services/followUpQuestions.js';

// Sub-routers
import dealsTeamRouter from './deals-team.js';
import dealsAnalysisRouter from './deals-analysis.js';
import dealsChatRouter from './deals-chat.js';

const router = Router();

// Mount sub-routers
router.use('/', dealsTeamRouter);
router.use('/', dealsAnalysisRouter);
router.use('/', dealsChatRouter);

// Validation schemas
const createDealSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  stage: z.string().default('INITIAL_REVIEW'),
  status: z.string().default('ACTIVE'),
  irrProjected: z.number().nullable().optional(),
  mom: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  dealSize: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  aiThesis: z.string().nullable().optional(),
  icon: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  currency: z.string().optional().default('USD'),
  customFields: z.record(z.string(), z.any()).optional().default({}),
});

const updateDealSchema = createDealSchema.partial();

// Query parameter schemas
const dealsQuerySchema = z.object({
  stage: z.enum(['INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED',
    'LOI_SUBMITTED', 'NEGOTIATION', 'CLOSING', 'PASSED',
    'CLOSED_WON', 'CLOSED_LOST']).optional(),
  status: z.enum(['ACTIVE', 'PROCESSING', 'PASSED', 'ARCHIVED']).optional(),
  industry: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'dealSize', 'irrProjected', 'revenue', 'ebitda', 'name', 'priority']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  minDealSize: z.coerce.number().positive().optional(),
  maxDealSize: z.coerce.number().positive().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

// GET /api/deals/stats/summary - Get deal statistics (must be before :id route)
router.get('/stats/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const { count: total } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('organizationId', orgId);

    const { count: active } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('organizationId', orgId)
      .eq('status', 'ACTIVE');

    const { count: passed } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('organizationId', orgId)
      .eq('status', 'PASSED');

    const { data: deals } = await supabase
      .from('Deal')
      .select('stage')
      .eq('organizationId', orgId)
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
    log.error('Error fetching stats', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/deals - Get all deals with company info
router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const params = dealsQuerySchema.parse(req.query);

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
      `)
      .eq('organizationId', orgId);

    // Apply filters
    if (params.stage) query = query.eq('stage', params.stage);
    if (params.status) query = query.eq('status', params.status);
    if (params.industry) query = query.ilike('industry', `%${params.industry}%`);
    if (params.assignedTo) query = query.eq('assignedTo', params.assignedTo);
    if (params.priority) query = query.eq('priority', params.priority);

    // Deal size range filters
    if (params.minDealSize) query = query.gte('dealSize', params.minDealSize);
    if (params.maxDealSize) query = query.lte('dealSize', params.maxDealSize);

    // Text search across multiple fields
    if (params.search) {
      const searchTerm = `%${params.search}%`;
      query = query.or(`name.ilike.${searchTerm},industry.ilike.${searchTerm},aiThesis.ilike.${searchTerm}`);
    }

    // Sorting
    const sortField = params.sortBy || 'updatedAt';
    const ascending = params.sortOrder === 'asc';
    query = query.order(sortField, { ascending, nullsFirst: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    log.error('Error fetching deals', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get single deal
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

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
      .eq('organizationId', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Deal');
      }
      throw error;
    }

    // Sort activities by date (most recent first)
    if (data?.activities) {
      data.activities.sort((a: SortableByDate, b: SortableByDate) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

// POST /api/deals - Create new deal (requires DEAL_CREATE permission)
router.post('/', requirePermission(PERMISSIONS.DEAL_CREATE), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const data = createDealSchema.parse(req.body);

    let companyId = data.companyId;

    // Create company if it doesn't exist
    if (!companyId && data.companyName) {
      const { data: company, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: data.companyName,
          industry: data.industry,
          organizationId: orgId,
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
        customFields: data.customFields || {},
        organizationId: orgId,
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

    // Audit log
    await AuditLog.dealCreated(req, deal.id, deal.name);

    // Notify: deal created (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        if (internalId) {
          createNotification({
            userId: internalId,
            type: 'DEAL_UPDATE',
            title: `New deal created: ${deal.name}`,
            dealId: deal.id,
          });
        }
      }).catch(err => log.error('Notification error (deal create)', err));
    }

    // Auto-archive sample deals when user creates their first real deal
    if (!data.tags?.includes('sample')) {
      void supabase
        .from('Deal')
        .update({ status: 'ARCHIVED' })
        .eq('organizationId', orgId)
        .contains('tags', ['sample'])
        .then(({ error: archiveErr }) => {
          if (archiveErr) log.error('Failed to archive sample deal', archiveErr);
          else log.info('Sample deal archived after real deal creation', { orgId });
        }, () => {}); // Fire-and-forget
    }

    res.status(201).json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error creating deal', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// POST /api/deals/:id/follow-up-questions - Generate AI follow-up questions
router.post('/:id/follow-up-questions', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    // Verify deal access
    const { data: deal } = await supabase
      .from('Deal')
      .select('id')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const extraction = req.body.extraction || req.body;
    const questions = await generateFollowUpQuestions(extraction);
    res.json({ questions });
  } catch (error) {
    log.error('Follow-up questions error', error);
    res.status(500).json({ error: 'Failed to generate follow-up questions' });
  }
});

// PATCH /api/deals/:id - Update deal
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const data = updateDealSchema.parse(req.body);

    // Get existing deal (scoped to org)
    const { data: existingDeal, error: fetchError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (fetchError || !existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Optimistic locking
    if (req.body.lastKnownUpdatedAt) {
      const clientTimestamp = new Date(req.body.lastKnownUpdatedAt).getTime();
      const serverTimestamp = new Date(existingDeal.updatedAt).getTime();
      if (clientTimestamp < serverTimestamp) {
        return res.status(409).json({
          error: 'Deal was modified by another user. Please refresh and try again.',
          updatedAt: existingDeal.updatedAt,
        });
      }
    }

    // Update deal
    const { data: deal, error: updateError } = await supabase
      .from('Deal')
      .update({
        ...data,
        companyId: undefined,
      })
      .eq('id', id)
      .eq('organizationId', orgId)
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

    // Audit log
    await AuditLog.dealUpdated(req, deal.id, deal.name, data);

    // Notify team: deal updated (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        const stageChanged = data.stage && data.stage !== existingDeal.stage;
        const title = stageChanged
          ? `Deal "${deal.name}" stage changed to ${data.stage}`
          : `Deal "${deal.name}" was updated`;
        notifyDealTeam(deal.id, 'DEAL_UPDATE', title, undefined, internalId || undefined);
      }).catch(err => log.error('Notification error (deal update)', err));
    }

    res.json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error updating deal', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id - Delete deal (requires DEAL_DELETE permission)
router.delete('/:id', requirePermission(PERMISSIONS.DEAL_DELETE), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: deal } = await supabase
      .from('Deal')
      .select('name')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Delete child records in correct order (FK constraints don't have ON DELETE CASCADE)
    await supabase.from('DocumentChunk').delete().eq('dealId', id);
    await supabase.from('Document').delete().eq('dealId', id);

    const { data: folders } = await supabase.from('Folder').select('id').eq('dealId', id);
    if (folders && folders.length > 0) {
      const folderIds = folders.map(f => f.id);
      for (const fId of folderIds) {
        await supabase.from('FolderInsight').delete().eq('folderId', fId);
      }
    }

    await supabase.from('Folder').delete().eq('dealId', id);
    await supabase.from('ChatMessage').delete().eq('dealId', id);
    await supabase.from('Conversation').delete().eq('dealId', id);
    await supabase.from('Activity').delete().eq('dealId', id);
    await supabase.from('DealTeamMember').delete().eq('dealId', id);

    const { data: memos } = await supabase.from('Memo').select('id').eq('dealId', id);
    if (memos && memos.length > 0) {
      for (const m of memos) {
        await supabase.from('MemoSection').delete().eq('memoId', m.id);
      }
    }
    await supabase.from('Memo').delete().eq('dealId', id);
    await supabase.from('Notification').delete().eq('dealId', id);

    // Finally, delete the deal itself
    const { error } = await supabase
      .from('Deal')
      .delete()
      .eq('id', id)
      .eq('organizationId', orgId);

    if (error) throw error;

    await AuditLog.dealDeleted(req, id, deal?.name || 'Unknown');

    log.info('Deal deleted with cascade', { dealId: id, dealName: deal.name });
    res.status(204).send();
  } catch (error) {
    log.error('Error deleting deal', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

export default router;
