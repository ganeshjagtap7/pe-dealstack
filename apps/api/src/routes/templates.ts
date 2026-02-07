import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['INVESTMENT_MEMO', 'CHECKLIST', 'OUTREACH']).default('INVESTMENT_MEMO'),
  isGoldStandard: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  permissions: z.enum(['FIRM_WIDE', 'PARTNERS_ONLY', 'ANALYSTS_ONLY']).optional().default('FIRM_WIDE'),
});

const updateTemplateSchema = createTemplateSchema.partial();

const createSectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  aiEnabled: z.boolean().optional().default(false),
  aiPrompt: z.string().optional(),
  mandatory: z.boolean().optional().default(false),
  requiresApproval: z.boolean().optional().default(false),
  sortOrder: z.number().optional(),
});

const updateSectionSchema = createSectionSchema.partial();

const reorderSectionsSchema = z.object({
  sections: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number(),
  })),
});

// ============================================================
// Template CRUD Routes
// ============================================================

// GET /api/templates - List all templates
router.get('/', async (req, res) => {
  try {
    const { category, isActive, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('MemoTemplate')
      .select(`
        *,
        sections:MemoTemplateSection(id, title, description, aiEnabled, mandatory, sortOrder),
        createdByUser:User!MemoTemplate_createdBy_fkey(name, email)
      `)
      .order('usageCount', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    // Apply filters
    if (category) query = query.eq('category', category);
    if (isActive !== undefined) query = query.eq('isActive', isActive === 'true');

    const { data: templates, error } = await query;

    if (error) {
      // If table doesn't exist, return empty array with helpful message
      if (error.code === '42P01') {
        return res.json([]);
      }
      throw error;
    }

    // Sort sections by sortOrder
    templates?.forEach((template: any) => {
      if (template.sections) {
        template.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      }
    });

    res.json(templates || []);
  } catch (error) {
    log.error('Error fetching templates', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// GET /api/templates/:id - Get single template with all sections
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: template, error } = await supabase
      .from('MemoTemplate')
      .select(`
        *,
        sections:MemoTemplateSection(*),
        createdByUser:User!MemoTemplate_createdBy_fkey(name, email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Template not found' });
      }
      throw error;
    }

    // Sort sections by sortOrder
    if (template.sections) {
      template.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    }

    res.json(template);
  } catch (error) {
    log.error('Error fetching template', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// POST /api/templates - Create new template
router.post('/', async (req, res) => {
  try {
    const user = req.user;
    const validation = createTemplateSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const templateData = {
      ...validation.data,
      createdBy: user?.id,
      usageCount: 0,
    };

    const { data: template, error } = await supabase
      .from('MemoTemplate')
      .insert(templateData)
      .select()
      .single();

    if (error) throw error;

    // Create default section
    const defaultSection = {
      templateId: template.id,
      title: 'Executive Summary',
      description: 'High-level overview of the investment opportunity.',
      aiEnabled: true,
      mandatory: true,
      sortOrder: 0,
    };

    await supabase.from('MemoTemplateSection').insert(defaultSection);

    // Fetch the template with sections
    const { data: fullTemplate } = await supabase
      .from('MemoTemplate')
      .select(`*, sections:MemoTemplateSection(*)`)
      .eq('id', template.id)
      .single();

    // Audit log
    await AuditLog.log(req, {
      action: 'TEMPLATE_CREATED',
      resourceType: 'MemoTemplate',
      resourceId: template.id,
      metadata: { name: template.name },
    });

    res.status(201).json(fullTemplate);
  } catch (error) {
    log.error('Error creating template', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// PATCH /api/templates/:id - Update template
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = updateTemplateSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const updateData = {
      ...validation.data,
      updatedAt: new Date().toISOString(),
    };

    const { data: template, error } = await supabase
      .from('MemoTemplate')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(template);
  } catch (error) {
    log.error('Error updating template', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/templates/:id - Delete template
router.delete('/:id', requirePermission(PERMISSIONS.MEMO_DELETE), async (req, res) => {
  try {
    const { id } = req.params;

    // Get template name before deleting for audit log
    const { data: template } = await supabase
      .from('MemoTemplate')
      .select('name')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('MemoTemplate')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log
    await AuditLog.log(req, {
      action: 'TEMPLATE_DELETED',
      resourceType: 'MemoTemplate',
      resourceId: id,
      metadata: { name: template?.name },
    });

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting template', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// POST /api/templates/:id/duplicate - Duplicate a template
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { name } = req.body;

    // Get original template with sections
    const { data: original, error: fetchError } = await supabase
      .from('MemoTemplate')
      .select(`*, sections:MemoTemplateSection(*)`)
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Create new template
    const { data: newTemplate, error: createError } = await supabase
      .from('MemoTemplate')
      .insert({
        name: name || `${original.name} (Copy)`,
        description: original.description,
        category: original.category,
        isGoldStandard: false,
        isActive: true,
        permissions: original.permissions,
        createdBy: user?.id,
        usageCount: 0,
      })
      .select()
      .single();

    if (createError) throw createError;

    // Duplicate sections
    if (original.sections?.length > 0) {
      const newSections = original.sections.map((section: any) => ({
        templateId: newTemplate.id,
        title: section.title,
        description: section.description,
        aiEnabled: section.aiEnabled,
        aiPrompt: section.aiPrompt,
        mandatory: section.mandatory,
        requiresApproval: section.requiresApproval,
        sortOrder: section.sortOrder,
      }));

      await supabase.from('MemoTemplateSection').insert(newSections);
    }

    // Fetch complete new template
    const { data: fullTemplate } = await supabase
      .from('MemoTemplate')
      .select(`*, sections:MemoTemplateSection(*)`)
      .eq('id', newTemplate.id)
      .single();

    res.status(201).json(fullTemplate);
  } catch (error) {
    log.error('Error duplicating template', error);
    res.status(500).json({ error: 'Failed to duplicate template' });
  }
});

// POST /api/templates/:id/use - Use template (increment usage count)
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    // Increment usage count
    const { data: template, error } = await supabase
      .rpc('increment_template_usage', { template_id: id });

    // Fallback if RPC doesn't exist
    if (error) {
      const { data: current } = await supabase
        .from('MemoTemplate')
        .select('usageCount')
        .eq('id', id)
        .single();

      await supabase
        .from('MemoTemplate')
        .update({ usageCount: (current?.usageCount || 0) + 1 })
        .eq('id', id);
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error incrementing template usage', error);
    res.status(500).json({ error: 'Failed to update template usage' });
  }
});

// ============================================================
// Section Routes
// ============================================================

// GET /api/templates/:id/sections - Get all sections for a template
router.get('/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: sections, error } = await supabase
      .from('MemoTemplateSection')
      .select('*')
      .eq('templateId', id)
      .order('sortOrder', { ascending: true });

    if (error) throw error;

    res.json(sections || []);
  } catch (error) {
    log.error('Error fetching template sections', error);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// POST /api/templates/:id/sections - Add section to template
router.post('/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = createSectionSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Get max sortOrder
    const { data: existingSections } = await supabase
      .from('MemoTemplateSection')
      .select('sortOrder')
      .eq('templateId', id)
      .order('sortOrder', { ascending: false })
      .limit(1);

    const maxSortOrder = existingSections?.[0]?.sortOrder ?? -1;

    const sectionData = {
      ...validation.data,
      templateId: id,
      sortOrder: validation.data.sortOrder ?? maxSortOrder + 1,
    };

    const { data: section, error } = await supabase
      .from('MemoTemplateSection')
      .insert(sectionData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(section);
  } catch (error) {
    log.error('Error creating template section', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/templates/:id/sections/:sectionId - Update section
router.patch('/:id/sections/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const validation = updateSectionSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const { data: section, error } = await supabase
      .from('MemoTemplateSection')
      .update(validation.data)
      .eq('id', sectionId)
      .select()
      .single();

    if (error) throw error;

    res.json(section);
  } catch (error) {
    log.error('Error updating template section', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/templates/:id/sections/:sectionId - Delete section
router.delete('/:id/sections/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;

    const { error } = await supabase
      .from('MemoTemplateSection')
      .delete()
      .eq('id', sectionId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting template section', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// POST /api/templates/:id/sections/reorder - Reorder sections
router.post('/:id/sections/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = reorderSectionsSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Update each section's sortOrder
    const updates = validation.data.sections.map(({ id: sectionId, sortOrder }) =>
      supabase
        .from('MemoTemplateSection')
        .update({ sortOrder })
        .eq('id', sectionId)
    );

    await Promise.all(updates);

    // Fetch updated sections
    const { data: sections } = await supabase
      .from('MemoTemplateSection')
      .select('*')
      .eq('templateId', id)
      .order('sortOrder', { ascending: true });

    res.json(sections);
  } catch (error) {
    log.error('Error reordering template sections', error);
    res.status(500).json({ error: 'Failed to reorder sections' });
  }
});

export default router;
