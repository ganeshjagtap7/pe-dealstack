import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText } from '../services/aiExtractor.js';
import { AuditLog } from '../services/auditLog.js';
import { validateFile, sanitizeFilename, isPotentiallyDangerous, ALLOWED_MIME_TYPES, FILE_SIZE_LIMITS } from '../services/fileValidator.js';
import { embedDocument } from '../rag.js';

// Use createRequire to load CommonJS pdf-parse v1.x module
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

// Helper function to extract text from PDF
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numPages: number } | null> {
  try {
    // pdf-parse v1.x: just call the function with the buffer
    const data = await pdfParse(buffer);
    return {
      text: data.text || '',
      numPages: data.numpages || 1,
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return null;
  }
}

// Configure multer for memory storage (we'll upload to Supabase)
// Initial filter based on MIME type, deep validation happens after upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (individual limits applied after)
    files: 1, // Single file upload only
  },
  fileFilter: (req, file, cb) => {
    // Basic MIME type check - deep validation with magic bytes happens after
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, CSV, Word, Email, Images'));
    }
  },
});

// Document type enum
const documentTypes = ['CIM', 'TEASER', 'FINANCIALS', 'LEGAL', 'NDA', 'LOI', 'EMAIL', 'PDF', 'EXCEL', 'DOC', 'OTHER'] as const;

// Validation schemas
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

// GET /api/deals/:dealId/documents - List documents for a deal
router.get('/deals/:dealId/documents', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { type, folderId, tags, search } = req.query;

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
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/folders/:folderId/documents - List documents in a folder
router.get('/folders/:folderId/documents', async (req, res) => {
  try {
    const { folderId } = req.params;
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
    console.error('Error fetching folder documents:', error);
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

    // If file is provided, validate and upload to Supabase Storage
    if (file) {
      // Deep file validation with magic bytes verification
      const validation = validateFile(file.buffer, file.originalname, file.mimetype);
      if (!validation.isValid) {
        console.warn(`File validation failed for ${file.originalname}: ${validation.error}`);
        return res.status(400).json({
          error: 'File validation failed',
          details: validation.error,
        });
      }

      // Additional check for potentially dangerous content
      if (isPotentiallyDangerous(file.buffer, file.originalname)) {
        console.warn(`Potentially dangerous file detected: ${file.originalname}`);
        return res.status(400).json({
          error: 'File validation failed',
          details: 'File appears to contain executable or script content',
        });
      }

      fileSize = file.size;
      mimeType = file.mimetype;
      // Use sanitized filename from validation
      const safeName = validation.sanitizedFilename || sanitizeFilename(file.originalname);
      documentName = documentName || safeName;

      // Generate unique filename with sanitization
      const timestamp = Date.now();
      const filePath = `${dealId}/${timestamp}_${safeName}`;

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

    // Parse optional fields
    let aiAnalysis = null;
    if (req.body.aiAnalysis) {
      try {
        aiAnalysis = typeof req.body.aiAnalysis === 'string'
          ? JSON.parse(req.body.aiAnalysis)
          : req.body.aiAnalysis;
      } catch (e) {
        // Ignore parse errors
      }
    }

    let tags: string[] = [];
    if (req.body.tags) {
      tags = typeof req.body.tags === 'string'
        ? req.body.tags.split(',').map((t: string) => t.trim())
        : req.body.tags;
    }

    // Extract text from PDF if applicable
    let extractedText: string | null = null;
    let extractionStatus = 'pending';
    let numPages: number | null = null;
    let aiExtractedData: Record<string, any> | null = null;

    if (file && mimeType === 'application/pdf') {
      extractionStatus = 'processing';
      console.log(`Starting PDF extraction for: ${documentName}`);

      const extraction = await extractTextFromPDF(file.buffer);
      if (extraction) {
        // Remove null characters that PostgreSQL can't store
        extractedText = extraction.text.replace(/\u0000/g, '');
        numPages = extraction.numPages;
        extractionStatus = 'completed';
        console.log(`PDF extraction completed: ${numPages} pages, ${extractedText.length} chars`);

        // Run AI extraction on the extracted text
        try {
          console.log(`Starting AI data extraction for: ${documentName}`);
          const aiData = await extractDealDataFromText(extractedText);
          if (aiData) {
            aiExtractedData = aiData;
            extractionStatus = 'analyzed';
            console.log(`AI extraction completed for: ${documentName}`, {
              companyName: aiData.companyName,
              industry: aiData.industry,
            });
          } else {
            console.log(`AI extraction returned no data for: ${documentName}`);
          }
        } catch (aiError) {
          // Log AI error but don't fail the upload - text extraction still worked
          console.error(`AI extraction failed for ${documentName}:`, aiError);
        }
      } else {
        extractionStatus = 'failed';
        console.log(`PDF extraction failed for: ${documentName}`);
      }
    } else if (file) {
      // Non-PDF files don't need text extraction
      extractionStatus = 'completed';
    }

    // Create document record
    // Use AI extracted data if available, otherwise fall back to request body
    const extractedDataToSave = aiExtractedData
      || (req.body.extractedData ? JSON.parse(req.body.extractedData) : null);

    const { data: document, error: docError } = await supabase
      .from('Document')
      .insert({
        dealId,
        folderId: req.body.folderId || null,
        uploadedBy: req.body.uploadedBy || null,
        name: documentName,
        type: docType,
        fileUrl,
        fileSize,
        mimeType,
        extractedData: extractedDataToSave,
        extractedText,
        status: extractionStatus,
        confidence: aiExtractedData ? 0.85 : (req.body.confidence ? parseFloat(req.body.confidence) : null),
        aiAnalysis,
        aiAnalyzedAt: aiExtractedData ? new Date().toISOString() : (aiAnalysis ? new Date().toISOString() : null),
        tags: tags.length > 0 ? tags : null,
        isHighlighted: req.body.isHighlighted === 'true' || req.body.isHighlighted === true,
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
    let activityDescription = `${docType} document uploaded`;
    if (extractedText && aiExtractedData) {
      activityDescription = `${docType} document uploaded, processed (${numPages} pages), and AI-analyzed`;
    } else if (extractedText) {
      activityDescription = `${docType} document uploaded and processed (${numPages} pages extracted)`;
    }

    await supabase.from('Activity').insert({
      dealId,
      type: 'DOCUMENT_UPLOADED',
      title: `Document uploaded: ${documentName}`,
      description: activityDescription,
      metadata: {
        documentId: document.id,
        documentType: docType,
        extractionStatus,
        numPages,
        textLength: extractedText?.length || 0,
        aiExtracted: !!aiExtractedData,
        extractedCompany: aiExtractedData?.companyName || null,
        extractedIndustry: aiExtractedData?.industry || null,
      },
    });

    // Audit log
    await AuditLog.documentUploaded(req, document.id, documentName, dealId);

    // Trigger RAG embedding in background (don't block response)
    if (extractedText && extractedText.length > 0) {
      console.log(`[RAG] Starting document embedding for: ${documentName}`);
      embedDocument(document.id, dealId, extractedText)
        .then(result => {
          if (result.success) {
            console.log(`[RAG] Embedded document ${documentName}: ${result.chunkCount} chunks`);
          } else {
            console.error(`[RAG] Failed to embed document ${documentName}:`, result.error);
          }
        })
        .catch(err => {
          console.error(`[RAG] Embedding error for ${documentName}:`, err);
        });
    }

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

    // Audit log
    await AuditLog.documentDeleted(req, id, doc.name);

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
