import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { generateAllSections, COMPREHENSIVE_IC_SECTIONS, STANDARD_IC_SECTIONS, SEARCH_FUND_SECTIONS, SCREENING_NOTE_SECTIONS } from '../services/agents/memoAgent/index.js';
import { isLLMAvailable } from '../services/llm.js';
import { classifyAIError } from '../utils/aiErrors.js';

// Sub-routers
import memoSectionsRouter from './memos-sections.js';
import memoChatRouter from './memos-chat.js';

const router = Router();

// Mount sub-routers
router.use('/', memoSectionsRouter);
router.use('/', memoChatRouter);

// ============================================================
// Validation Schemas
// ============================================================

const createMemoSchema = z.object({
  title: z.string().min(1),
  projectName: z.string().optional(),
  dealId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().optional(),
  type: z.enum(['IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM']).default('IC_MEMO'),
  status: z.enum(['DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED']).default('DRAFT'),
  sponsor: z.string().optional(),
  memoDate: z.string().optional(),
  autoGenerate: z.boolean().optional().default(false),
  templatePreset: z.enum(['comprehensive', 'standard', 'search_fund', 'screening']).optional(),
});

// Map template section titles to memo section types
const SECTION_TYPE_MAP: Record<string, string> = {
  'executive summary': 'EXECUTIVE_SUMMARY',
  'company overview': 'COMPANY_OVERVIEW',
  'business overview': 'COMPANY_OVERVIEW',
  'financial performance': 'FINANCIAL_PERFORMANCE',
  'financial analysis': 'FINANCIAL_PERFORMANCE',
  'market analysis': 'MARKET_DYNAMICS',
  'market dynamics': 'MARKET_DYNAMICS',
  'competitive landscape': 'COMPETITIVE_LANDSCAPE',
  'risk assessment': 'RISK_ASSESSMENT',
  'deal structure': 'DEAL_STRUCTURE',
  'valuation': 'DEAL_STRUCTURE',
  'value creation': 'VALUE_CREATION',
  'exit strategy': 'EXIT_STRATEGY',
  'recommendation': 'RECOMMENDATION',
  'appendix': 'APPENDIX',
  'unit economics': 'FINANCIAL_PERFORMANCE',
  'brand analysis': 'COMPANY_OVERVIEW',
  'strategic rationale': 'EXECUTIVE_SUMMARY',
  'situation overview': 'EXECUTIVE_SUMMARY',
  'turnaround plan': 'VALUE_CREATION',
};

const updateMemoSchema = createMemoSchema.partial();

const memosQuerySchema = z.object({
  dealId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED']).optional(),
  type: z.enum(['IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================================
// Memo CRUD Routes
// ============================================================

// GET /api/memos/debug - Check if Memo table exists (dev only)
router.get('/debug', async (req, res) => {
  try {
    // Try a simple select
    const { data, error } = await supabase
      .from('Memo')
      .select('id')
      .limit(1);

    if (error) {
      return res.json({
        tableExists: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        solution: 'Run the SQL migration in Supabase: apps/api/prisma/migrations/add_memo_tables.sql'
      });
    }

    res.json({
      tableExists: true,
      rowCount: data?.length || 0,
      message: 'Memo table is accessible'
    });
  } catch (err: any) {
    res.status(500).json({
      tableExists: false,
      error: err.message,
    });
  }
});

// GET /api/memos - List all memos
router.get('/', async (req, res) => {
  try {
    const params = memosQuerySchema.parse(req.query);
    const orgId = getOrgId(req);

    let query = supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(id, type, title, sortOrder, aiGenerated),
        deal:Deal(id, name, company:Company(name))
      `)
      .eq('organizationId', orgId)
      .order('updatedAt', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1);

    // Apply filters
    if (params.dealId) query = query.eq('dealId', params.dealId);
    if (params.status) query = query.eq('status', params.status);
    if (params.type) query = query.eq('type', params.type);

    const { data: memos, error } = await query;

    if (error) throw error;

    res.json(memos || []);
  } catch (error) {
    log.error('Error fetching memos', error);
    res.status(500).json({ error: 'Failed to fetch memos' });
  }
});

// GET /api/memos/:id - Get single memo with all sections
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: memo, error } = await supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(*),
        deal:Deal(
          id, name, stage, status, industry, dealSize, revenue, ebitda, irrProjected, mom,
          company:Company(id, name, description),
          documents:Document(id, name, type, fileUrl)
        ),
        conversations:MemoConversation(
          id,
          updatedAt,
          messages:MemoChatMessage(id, role, content, createdAt)
        )
      `)
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Memo not found' });
      }
      throw error;
    }

    // Sort sections by sortOrder
    if (memo.sections) {
      memo.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    }

    // Sort conversation messages by createdAt
    if (memo.conversations) {
      memo.conversations.forEach((conv: any) => {
        if (conv.messages) {
          conv.messages.sort((a: any, b: any) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
      });
    }

    res.json(memo);
  } catch (error) {
    log.error('Error fetching memo', error);
    res.status(500).json({ error: 'Failed to fetch memo' });
  }
});

// POST /api/memos - Create new memo
router.post('/', async (req, res) => {
  try {
    const user = req.user;
    const orgId = getOrgId(req);
    log.debug('Memo create started', { userId: user?.id });

    const validation = createMemoSchema.safeParse(req.body);

    if (!validation.success) {
      log.debug('Memo validation failed', { errors: validation.error.errors });
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Strip templateId, autoGenerate, templatePreset from memoData (not Memo table columns)
    const { templateId, autoGenerate, templatePreset, ...memoFields } = validation.data;
    const memoData = {
      ...memoFields,
      createdBy: user?.id,
      lastEditedBy: user?.id,
      organizationId: orgId,
    };

    const { data: memo, error } = await supabase
      .from('Memo')
      .insert(memoData)
      .select()
      .single();

    if (error) {
      throw error;
    }
    log.debug('Memo created', { memoId: memo.id, templateId });

    // Create sections from template or use defaults
    let usedTemplate = false;
    if (templateId) {
      const { data: templateSections, error: tplError } = await supabase
        .from('MemoTemplateSection')
        .select('*')
        .eq('templateId', templateId)
        .order('sortOrder', { ascending: true });

      if (!tplError && templateSections && templateSections.length > 0) {
        const sections = templateSections.map((ts: any, idx: number) => ({
          memoId: memo.id,
          type: SECTION_TYPE_MAP[ts.title.toLowerCase()] || 'CUSTOM',
          title: ts.title,
          sortOrder: ts.sortOrder ?? idx,
          aiPrompt: ts.aiPrompt || null,
        }));

        const { error: sectionsError } = await supabase.from('MemoSection').insert(sections);
        if (sectionsError) throw sectionsError;

        usedTemplate = true;

        // Increment template usage count
        const { data: tpl } = await supabase
          .from('MemoTemplate')
          .select('usageCount')
          .eq('id', templateId)
          .single();
        if (tpl) {
          await supabase
            .from('MemoTemplate')
            .update({ usageCount: (tpl.usageCount || 0) + 1 })
            .eq('id', templateId);
        }

        log.debug('Memo created from template', { memoId: memo.id, templateId, sectionCount: sections.length });
      }
    }

    // Fall back to default sections for IC_MEMO if no template was used
    if (!usedTemplate && memo.type === 'IC_MEMO') {
      const defaultSections = [
        { memoId: memo.id, type: 'EXECUTIVE_SUMMARY', title: 'Executive Summary', sortOrder: 0 },
        { memoId: memo.id, type: 'FINANCIAL_PERFORMANCE', title: 'Financial Performance', sortOrder: 1 },
        { memoId: memo.id, type: 'MARKET_DYNAMICS', title: 'Market Dynamics', sortOrder: 2 },
        { memoId: memo.id, type: 'RISK_ASSESSMENT', title: 'Risk Assessment', sortOrder: 3 },
        { memoId: memo.id, type: 'DEAL_STRUCTURE', title: 'Deal Structure', sortOrder: 4 },
      ];

      const { error: sectionsError } = await supabase.from('MemoSection').insert(defaultSections);
      if (sectionsError) throw sectionsError;
    }

    // Auto-generate section content if requested and AI is available
    let generationStatus = null;

    if (autoGenerate && memoFields.dealId && isLLMAvailable()) {
      try {
        const presetMap: Record<string, any> = {
          comprehensive: COMPREHENSIVE_IC_SECTIONS,
          standard: STANDARD_IC_SECTIONS,
          search_fund: SEARCH_FUND_SECTIONS,
          screening: SCREENING_NOTE_SECTIONS,
        };
        const sectionTypes = templatePreset ? presetMap[templatePreset] : undefined;
        const { sections: generated } = await generateAllSections(memoFields.dealId, orgId, sectionTypes);

        let completed = 0;
        const errors: string[] = [];
        for (const gen of generated) {
          const { data: existingSection } = await supabase
            .from('MemoSection')
            .select('id')
            .eq('memoId', memo.id)
            .eq('type', gen.type)
            .single();

          if (existingSection) {
            const updateData: any = {
              content: gen.content,
              aiGenerated: gen.aiGenerated,
              aiModel: gen.aiModel,
              updatedAt: new Date().toISOString(),
            };
            if (gen.tableData) updateData.tableData = gen.tableData;
            if (gen.chartConfig) updateData.chartConfig = gen.chartConfig;
            await supabase.from('MemoSection').update(updateData).eq('id', existingSection.id);
            completed++;
          }
        }
        generationStatus = { completed, total: generated.length, errors };
      } catch (error: any) {
        log.error('Auto-generation failed', { memoId: memo.id, error: error.message });
        generationStatus = { completed: 0, total: 0, errors: [error.message] };
      }
    }

    // Fetch the memo with sections
    const { data: fullMemo, error: fetchError } = await supabase
      .from('Memo')
      .select(`*, sections:MemoSection(*)`)
      .eq('id', memo.id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Audit log
    await AuditLog.memoCreated(req, memo.id, memo.title);
    log.debug('Memo created successfully', { memoId: memo.id });

    res.status(201).json({
      ...fullMemo,
      ...(generationStatus && { generationStatus }),
    });
  } catch (error: any) {
    log.error('Error creating memo', error);
    // Return detailed error in development for debugging
    const errorMessage = error?.message || 'Unknown error';
    const errorDetails = {
      message: errorMessage,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    };
    log.error('Memo create error', undefined, errorDetails);
    res.status(500).json({
      error: `Failed to create memo: ${errorMessage}`,
      debug: errorDetails
    });
  }
});

// PATCH /api/memos/:id - Update memo
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const orgId = getOrgId(req);
    const validation = updateMemoSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const updateData = {
      ...validation.data,
      lastEditedBy: user?.id,
      updatedAt: new Date().toISOString(),
    };

    const { data: memo, error } = await supabase
      .from('Memo')
      .update(updateData)
      .eq('id', id)
      .eq('organizationId', orgId)
      .select()
      .single();

    if (error) throw error;

    res.json(memo);
  } catch (error) {
    log.error('Error updating memo', error);
    res.status(500).json({ error: 'Failed to update memo' });
  }
});

// DELETE /api/memos/:id - Delete memo (requires MEMO_DELETE permission)
router.delete('/:id', requirePermission(PERMISSIONS.MEMO_DELETE), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    // Get memo title before deleting for audit log
    const { data: memo } = await supabase
      .from('Memo')
      .select('title')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    const { error } = await supabase
      .from('Memo')
      .delete()
      .eq('id', id)
      .eq('organizationId', orgId);

    if (error) throw error;

    // Audit log
    await AuditLog.memoDeleted(req, id, memo?.title || 'Untitled');

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting memo', error);
    res.status(500).json({ error: 'Failed to delete memo' });
  }
});

// POST /api/memos/:id/generate-all - Regenerate all sections
router.post('/:id/generate-all', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: memo } = await supabase
      .from('Memo')
      .select('id, dealId')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (!memo) return res.status(404).json({ error: 'Memo not found' });
    if (!memo.dealId) return res.status(400).json({ error: 'Memo has no associated deal' });
    if (!isLLMAvailable()) return res.status(503).json({ error: 'AI service unavailable' });

    const { sections: generated } = await generateAllSections(memo.dealId, orgId);

    let completed = 0;
    for (const gen of generated) {
      const { data: existing } = await supabase
        .from('MemoSection')
        .select('id')
        .eq('memoId', id)
        .eq('type', gen.type)
        .single();

      const updateData: any = {
        content: gen.content,
        aiGenerated: gen.aiGenerated,
        aiModel: gen.aiModel,
        updatedAt: new Date().toISOString(),
      };
      if (gen.tableData) updateData.tableData = gen.tableData;
      if (gen.chartConfig) updateData.chartConfig = gen.chartConfig;

      if (existing) {
        await supabase.from('MemoSection').update(updateData).eq('id', existing.id);
      } else {
        await supabase.from('MemoSection').insert({
          memoId: id, type: gen.type, title: gen.title,
          sortOrder: (gen as any).sortOrder || completed + 1,
          status: 'DRAFT', ...updateData,
        });
      }
      completed++;
    }

    res.json({ success: true, completed, total: generated.length });
  } catch (error: any) {
    log.error('Generate-all failed', error);
    res.status(500).json({ error: classifyAIError(error.message || 'Failed to regenerate memo') });
  }
});

export default router;
