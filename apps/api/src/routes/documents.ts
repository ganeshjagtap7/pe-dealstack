import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess, verifyDocumentAccess, verifyFolderAccess } from '../middleware/orgScope.js';
import { getSignedDownloadUrl, extractStoragePath } from '../utils/storage.js';

// Sub-routers
import documentsUploadRouter from './documents-upload.js';
import documentsSharingRouter from './documents-sharing.js';

const router = Router();

// Mount sub-routers
router.use('/', documentsUploadRouter);
router.use('/', documentsSharingRouter);

// ─── Validation Schemas ─────────────────────────────────────────

// Document type enum
const documentTypes = ['CIM', 'TEASER', 'FINANCIALS', 'LEGAL', 'NDA', 'LOI', 'EMAIL', 'PDF', 'EXCEL', 'DOC', 'OTHER'] as const;

const createDocumentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(documentTypes).default('OTHER'),
  folderId: z.string().uuid().optional().nullable(),
  extractedData: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  aiAnalysis: z.object({
    type: z.string(),
    label: z.string(),
    description: z.string(),
    color: z.string(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  isHighlighted: z.boolean().optional(),
});

const updateDocumentSchema = createDocumentSchema.partial();

const documentsQuerySchema = z.object({
  type: z.enum(documentTypes).optional(),
  folderId: z.string().optional(),
  tags: z.string().max(500).optional(),
  search: z.string().max(200).optional(),
});

// ─── GET /api/deals/:dealId/documents — List documents for a deal ───

router.get('/deals/:dealId/documents', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const { type, folderId, tags, search } = documentsQuerySchema.parse(req.query);

    let query = supabase
      .from('Document')
      .select(`
        *,
        uploader:User!uploadedBy(id, name, avatar),
        folder:Folder!folderId(id, name)
      `)
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    if (folderId) {
      if (folderId === 'null') {
        query = query.is('folderId', null);
      } else {
        query = query.eq('folderId', folderId);
      }
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Filter by tags if provided (client-side for now)
    let filteredData = data || [];
    if (tags) {
      const tagArray = (tags as string).split(',');
      filteredData = filteredData.filter((doc: any) =>
        doc.tags && tagArray.some((tag: string) => doc.tags.includes(tag))
      );
    }

    res.json(filteredData);
  } catch (error) {
    log.error('Error fetching documents', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ─── GET /api/folders/:folderId/documents — List documents in a folder ───

router.get('/folders/:folderId/documents', async (req, res) => {
  try {
    const { folderId } = req.params;
    const orgId = getOrgId(req);
    const folderAccess = await verifyFolderAccess(folderId, orgId);
    if (!folderAccess) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const { type, search } = req.query;

    let query = supabase
      .from('Document')
      .select(`
        *,
        uploader:User!uploadedBy(id, name, avatar)
      `)
      .eq('folderId', folderId)
      .order('createdAt', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    log.error('Error fetching folder documents', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ─── GET /api/documents/:id — Get single document ───

router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const docAccess = await verifyDocumentAccess(id, orgId);
    if (!docAccess) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { data, error } = await supabase
      .from('Document')
      .select(`
        *,
        deal:Deal(id, name, stage)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Document not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    log.error('Error fetching document', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ─── PATCH /api/documents/:id — Update document metadata ───

router.patch('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const docAccess = await verifyDocumentAccess(id, orgId);
    if (!docAccess) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const data = updateDocumentSchema.parse(req.body);

    // Add updatedAt timestamp
    const updateData: any = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    // If aiAnalysis is provided, update aiAnalyzedAt
    if (data.aiAnalysis) {
      updateData.aiAnalyzedAt = new Date().toISOString();
    }

    const { data: document, error } = await supabase
      .from('Document')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        uploader:User!uploadedBy(id, name, avatar),
        folder:Folder!folderId(id, name)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Document not found' });
      }
      throw error;
    }

    res.json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error updating document', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ─── DELETE /api/documents/:id — Delete document ───

router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const docAccess = await verifyDocumentAccess(id, orgId);
    if (!docAccess) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get document to find file path
    const { data: doc, error: fetchError } = await supabase
      .from('Document')
      .select('fileUrl, dealId, name')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Document not found' });
      }
      throw fetchError;
    }

    // Delete from storage if file exists
    if (doc.fileUrl) {
      try {
        const storagePath = extractStoragePath(doc.fileUrl);
        await supabase.storage.from('documents').remove([storagePath]);
      } catch (storageError) {
        log.error('Error deleting from storage', storageError);
        // Continue even if storage deletion fails
      }
    }

    // Delete document record
    const { error } = await supabase
      .from('Document')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log
    await AuditLog.documentDeleted(req, id, doc.name);

    res.status(204).send();
  } catch (error) {
    log.error('Error deleting document', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ─── GET /api/documents/:id/download — Get signed download URL ───

router.get('/documents/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const docAccess = await verifyDocumentAccess(id, orgId);
    if (!docAccess) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { data: doc, error: fetchError } = await supabase
      .from('Document')
      .select('fileUrl, name')
      .eq('id', id)
      .single();

    if (fetchError || !doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!doc.fileUrl) {
      return res.status(404).json({ error: 'No file associated with this document' });
    }

    // Generate a time-limited signed URL (1 hour expiry)
    const signedUrl = await getSignedDownloadUrl(doc.fileUrl);
    if (!signedUrl) {
      return res.status(500).json({ error: 'Failed to generate download URL' });
    }

    // Audit log: track document access
    AuditLog.documentDownloaded(req, id, doc.name).catch(() => {});

    res.json({
      url: signedUrl,
      name: doc.name,
    });
  } catch (error) {
    log.error('Error getting download URL', error);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

export default router;
