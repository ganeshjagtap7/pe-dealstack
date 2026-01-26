import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import multer from 'multer';

const router = Router();

// Configure multer for memory storage (we'll upload to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-outlook',
      'message/rfc822',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, CSV, Word, Email'));
    }
  },
});

// Document type enum
const documentTypes = ['CIM', 'TEASER', 'FINANCIALS', 'LEGAL', 'NDA', 'LOI', 'EMAIL', 'OTHER'] as const;

// Validation schemas
const createDocumentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(documentTypes).default('OTHER'),
  extractedData: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const updateDocumentSchema = createDocumentSchema.partial();

// GET /api/deals/:dealId/documents - List documents for a deal
router.get('/deals/:dealId/documents', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { type } = req.query;

    let query = supabase
      .from('Document')
      .select('*')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/deals/:dealId/documents - Upload document
router.post('/deals/:dealId/documents', upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.params;
    const file = req.file;

    // Verify deal exists
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select('id, name')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    let fileUrl = null;
    let fileSize = null;
    let mimeType = null;
    let documentName = req.body.name;

    // If file is provided, upload to Supabase Storage
    if (file) {
      fileSize = file.size;
      mimeType = file.mimetype;
      documentName = documentName || file.originalname;

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${dealId}/${timestamp}_${sanitizedName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        // Continue without file URL if storage fails (bucket might not exist)
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
        fileUrl = urlData?.publicUrl;
      }
    }

    // Determine document type from filename if not provided
    let docType = req.body.type || 'OTHER';
    if (docType === 'OTHER' && documentName) {
      const lowerName = documentName.toLowerCase();
      if (lowerName.includes('cim') || lowerName.includes('confidential')) docType = 'CIM';
      else if (lowerName.includes('teaser')) docType = 'TEASER';
      else if (lowerName.includes('financial') || lowerName.includes('model')) docType = 'FINANCIALS';
      else if (lowerName.includes('legal') || lowerName.includes('dd')) docType = 'LEGAL';
      else if (lowerName.includes('nda')) docType = 'NDA';
      else if (lowerName.includes('loi') || lowerName.includes('letter')) docType = 'LOI';
      else if (lowerName.includes('email') || lowerName.endsWith('.msg')) docType = 'EMAIL';
    }

    // Create document record
    const { data: document, error: docError } = await supabase
      .from('Document')
      .insert({
        dealId,
        name: documentName,
        type: docType,
        fileUrl,
        fileSize,
        mimeType,
        extractedData: req.body.extractedData ? JSON.parse(req.body.extractedData) : null,
        confidence: req.body.confidence ? parseFloat(req.body.confidence) : null,
      })
      .select()
      .single();

    if (docError) throw docError;

    // Update deal's lastDocument field
    await supabase
      .from('Deal')
      .update({
        lastDocument: documentName,
        lastDocumentUpdated: new Date().toISOString(),
      })
      .eq('id', dealId);

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'DOCUMENT_UPLOADED',
      title: `Document uploaded: ${documentName}`,
      description: `${docType} document uploaded`,
      metadata: { documentId: document.id, documentType: docType },
    });

    res.status(201).json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/:id - Get single document
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// PATCH /api/documents/:id - Update document metadata
router.patch('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateDocumentSchema.parse(req.body);

    const { data: document, error } = await supabase
      .from('Document')
      .update(data)
      .eq('id', id)
      .select()
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
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
        // Extract path from URL
        const url = new URL(doc.fileUrl);
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/documents\/(.+)/);
        if (pathMatch) {
          await supabase.storage.from('documents').remove([pathMatch[1]]);
        }
      } catch (storageError) {
        console.error('Error deleting from storage:', storageError);
        // Continue even if storage deletion fails
      }
    }

    // Delete document record
    const { error } = await supabase
      .from('Document')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// GET /api/documents/:id/download - Get signed download URL
router.get('/documents/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

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

    // For public buckets, just return the URL
    // For private buckets, generate a signed URL
    res.json({
      url: doc.fileUrl,
      name: doc.name,
    });
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

export default router;
