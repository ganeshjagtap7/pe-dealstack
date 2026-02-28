import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { generateFolderInsights } from '../services/folderInsightsGenerator.js';

const router = Router();

// Validation schemas
const createFolderSchema = z.object({
  dealId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isRestricted: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional(),
});

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isRestricted: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// GET /api/deals/:dealId/folders - List all folders for a deal
router.get('/deals/:dealId/folders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.params;
    const { parentId } = req.query;

    let query = supabase
      .from('Folder')
      .select(`
        *,
        FolderInsight (
          id,
          summary,
          completionPercent,
          redFlags,
          missingDocuments,
          generatedAt
        )
      `)
      .eq('dealId', dealId)
      .order('sortOrder', { ascending: true })
      .order('name', { ascending: true });

    // Filter by parent folder if specified
    if (parentId === 'null' || parentId === '') {
      query = query.is('parentId', null);
    } else if (parentId) {
      query = query.eq('parentId', parentId);
    }

    const { data: folders, error } = await query;

    if (error) throw error;

    // Get document counts for each folder
    const folderIds = folders?.map(f => f.id) || [];
    if (folderIds.length > 0) {
      const { data: counts, error: countError } = await supabase
        .from('Document')
        .select('folderId')
        .in('folderId', folderIds);

      if (!countError && counts) {
        const countMap: Record<string, number> = {};
        counts.forEach(doc => {
          if (doc.folderId) {
            countMap[doc.folderId] = (countMap[doc.folderId] || 0) + 1;
          }
        });

        folders?.forEach(folder => {
          folder.fileCount = countMap[folder.id] || 0;
        });
      }
    }

    res.json(folders || []);
  } catch (error) {
    next(error);
  }
});

// GET /api/folders/:id - Get a single folder with insights
router.get('/folders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: folder, error } = await supabase
      .from('Folder')
      .select(`
        *,
        FolderInsight (
          id,
          summary,
          completionPercent,
          redFlags,
          missingDocuments,
          generatedAt
        ),
        Document (
          id,
          name,
          type,
          fileSize,
          aiAnalysis,
          createdAt
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      throw error;
    }

    res.json(folder);
  } catch (error) {
    next(error);
  }
});

// POST /api/deals/:dealId/folders - Create a new folder
router.post('/deals/:dealId/folders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.params;
    const validation = createFolderSchema.safeParse({ ...req.body, dealId });

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const folderData = validation.data;

    // Get the max sortOrder for this deal if not specified
    if (folderData.sortOrder === undefined) {
      const { data: existing } = await supabase
        .from('Folder')
        .select('sortOrder')
        .eq('dealId', dealId)
        .is('parentId', folderData.parentId || null)
        .order('sortOrder', { ascending: false })
        .limit(1);

      folderData.sortOrder = existing && existing[0] ? existing[0].sortOrder + 1 : 0;
    }

    const { data: folder, error } = await supabase
      .from('Folder')
      .insert(folderData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/folders/:id - Update a folder
router.patch('/folders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validation = updateFolderSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { data: folder, error } = await supabase
      .from('Folder')
      .update({
        ...validation.data,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Folder not found' });
      }
      throw error;
    }

    res.json(folder);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/folders/:id - Delete a folder (and its contents)
router.delete('/folders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { cascade } = req.query;

    // Check if folder has children
    const { data: children } = await supabase
      .from('Folder')
      .select('id')
      .eq('parentId', id);

    if (children && children.length > 0 && cascade !== 'true') {
      return res.status(400).json({
        error: 'Folder has subfolders. Use cascade=true to delete all.',
        childCount: children.length
      });
    }

    // Check if folder has documents
    const { data: docs } = await supabase
      .from('Document')
      .select('id')
      .eq('folderId', id);

    if (docs && docs.length > 0 && cascade !== 'true') {
      return res.status(400).json({
        error: 'Folder has documents. Use cascade=true to delete all.',
        documentCount: docs.length
      });
    }

    // If cascade, delete children and documents first
    if (cascade === 'true') {
      // Delete documents in folder
      await supabase
        .from('Document')
        .delete()
        .eq('folderId', id);

      // Recursively delete child folders (simplified - just unset parentId)
      await supabase
        .from('Folder')
        .delete()
        .eq('parentId', id);
    }

    // Delete folder insights
    await supabase
      .from('FolderInsight')
      .delete()
      .eq('folderId', id);

    // Delete the folder
    const { error } = await supabase
      .from('Folder')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GET /api/folders/:id/insights - Get folder insights
router.get('/folders/:id/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: insights, error } = await supabase
      .from('FolderInsight')
      .select('*')
      .eq('folderId', id)
      .order('generatedAt', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'No insights found for this folder' });
      }
      throw error;
    }

    res.json(insights);
  } catch (error) {
    next(error);
  }
});

// POST /api/deals/:dealId/folders/init - Initialize default folders for a deal
router.post('/deals/:dealId/folders/init', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.params;

    // Check if deal already has folders
    const { data: existingFolders } = await supabase
      .from('Folder')
      .select('id')
      .eq('dealId', dealId)
      .limit(1);

    if (existingFolders && existingFolders.length > 0) {
      // Already has folders, return them
      const { data: folders, error } = await supabase
        .from('Folder')
        .select('*')
        .eq('dealId', dealId)
        .order('sortOrder', { ascending: true });

      if (error) throw error;
      return res.json({ created: false, folders });
    }

    // Create default VDR folders
    const defaultFolders = [
      { name: '100 Financials', sortOrder: 100, description: 'Financial statements, projections, and analysis' },
      { name: '200 Legal', sortOrder: 200, description: 'Legal documents, contracts, and agreements' },
      { name: '300 Commercial', sortOrder: 300, description: 'Commercial due diligence materials' },
      { name: '400 HR & Data', sortOrder: 400, description: 'HR documents and data room materials' },
      { name: '500 Intellectual Property', sortOrder: 500, description: 'IP documentation and patents' },
    ];

    const foldersToInsert = defaultFolders.map(folder => ({
      ...folder,
      dealId,
      parentId: null,
      isRestricted: false,
    }));

    const { data: folders, error } = await supabase
      .from('Folder')
      .insert(foldersToInsert)
      .select();

    if (error) throw error;

    res.status(201).json({ created: true, folders });
  } catch (error) {
    next(error);
  }
});

// POST /api/folders/:id/insights - Create/update folder insights
router.post('/folders/:id/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { summary, completionPercent, redFlags, missingDocuments } = req.body;

    // Upsert insight (delete old, insert new)
    await supabase
      .from('FolderInsight')
      .delete()
      .eq('folderId', id);

    const { data: insight, error } = await supabase
      .from('FolderInsight')
      .insert({
        folderId: id,
        summary,
        completionPercent: completionPercent || 0,
        redFlags: redFlags || [],
        missingDocuments: missingDocuments || [],
        generatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(insight);
  } catch (error) {
    next(error);
  }
});

// POST /api/folders/:id/generate-insights - AI-generate folder insights using GPT-4o
router.post('/folders/:id/generate-insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: folderId } = req.params;

    // 1. Get folder info + its deal
    const { data: folder, error: folderError } = await supabase
      .from('Folder')
      .select('id, name, dealId, description')
      .eq('id', folderId)
      .single();

    if (folderError || !folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // 2. Get deal context
    const { data: deal } = await supabase
      .from('Deal')
      .select('name, companyName, industry, stage, revenue, ebitda')
      .eq('id', folder.dealId)
      .single();

    // 3. Get all documents in this folder
    const { data: documents } = await supabase
      .from('Document')
      .select('id, name, mimeType, fileSize, aiAnalysis, createdAt')
      .eq('folderId', folderId)
      .order('createdAt', { ascending: false });

    // 4. Format documents for AI
    const formattedDocs = (documents || []).map(doc => {
      let sizeStr = '0 KB';
      if (doc.fileSize) {
        sizeStr = doc.fileSize >= 1024 * 1024
          ? `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(doc.fileSize / 1024)} KB`;
      }

      const mimeType = doc.mimeType || '';
      let type = 'other';
      if (mimeType.includes('pdf')) type = 'PDF';
      else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) type = 'Excel';
      else if (mimeType.includes('word') || mimeType.includes('document')) type = 'Word';

      return {
        name: doc.name,
        type,
        size: sizeStr,
        aiAnalysisSummary: doc.aiAnalysis?.description || doc.aiAnalysis?.summary || undefined,
        createdAt: doc.createdAt,
      };
    });

    // 5. Call GPT-4o to generate insights
    const insights = await generateFolderInsights(
      folder.name,
      {
        dealName: deal?.name || deal?.companyName || 'Unknown Deal',
        industry: deal?.industry || undefined,
        stage: deal?.stage || undefined,
        revenue: deal?.revenue || undefined,
        ebitda: deal?.ebitda || undefined,
      },
      formattedDocs
    );

    if (!insights) {
      return res.status(503).json({ error: 'AI insights generation unavailable. Check that OPENAI_API_KEY is configured.' });
    }

    // 6. Save to FolderInsight table (upsert: delete old, insert new)
    await supabase
      .from('FolderInsight')
      .delete()
      .eq('folderId', folderId);

    const { data: savedInsight, error: insertError } = await supabase
      .from('FolderInsight')
      .insert({
        folderId,
        summary: insights.summary,
        completionPercent: insights.completionPercent,
        redFlags: insights.redFlags,
        missingDocuments: insights.missingDocuments,
        generatedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      log.error('Failed to save folder insights', insertError);
      throw insertError;
    }

    log.info('AI folder insights generated and saved', { folderId, completionPercent: insights.completionPercent });
    res.status(201).json(savedInsight);
  } catch (error) {
    next(error);
  }
});

export default router;
