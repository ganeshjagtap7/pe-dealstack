import { Router } from 'express';
import { supabase } from '../supabase.js';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText, toLegacyFormat, ExtractedDealData } from '../services/aiExtractor.js';
import { z } from 'zod';
import { embedDocument } from '../rag.js';

// Use createRequire to load CommonJS pdf-parse v1.x module
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

// Helper function to extract text from PDF
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numPages: number } | null> {
  try {
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

// Configure multer for memory storage
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
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, Word'));
    }
  },
});

// Map document type icons
const industryIcons: Record<string, string> = {
  'Healthcare': 'monitor_heart',
  'Healthcare Services': 'monitor_heart',
  'Technology': 'memory',
  'Software': 'code',
  'SaaS': 'cloud',
  'Enterprise Software': 'cloud',
  'Cloud Infrastructure': 'cloud_queue',
  'Manufacturing': 'precision_manufacturing',
  'Industrial Manufacturing': 'precision_manufacturing',
  'Transportation': 'local_shipping',
  'Logistics': 'webhook',
  'Supply Chain': 'webhook',
  'Financial Services': 'account_balance',
  'Retail': 'storefront',
  'E-commerce': 'shopping_cart',
  'Energy': 'bolt',
  'Real Estate': 'home_work',
  'Consumer': 'shopping_bag',
  'Food & Beverage': 'restaurant',
  'Education': 'school',
};

function getIconForIndustry(industry: string | null): string {
  if (!industry) return 'business_center';

  // Check for exact match first
  if (industryIcons[industry]) return industryIcons[industry];

  // Check for partial match
  const lowerIndustry = industry.toLowerCase();
  for (const [key, icon] of Object.entries(industryIcons)) {
    if (lowerIndustry.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerIndustry)) {
      return icon;
    }
  }

  return 'business_center';
}

// POST /api/ingest - Upload document and auto-create deal
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const mimeType = file.mimetype;
    const documentName = file.originalname;

    console.log(`\n=== INGEST: Starting for ${documentName} ===`);

    // Step 1: Extract text from PDF
    let extractedText: string | null = null;
    let numPages: number | null = null;

    if (mimeType === 'application/pdf') {
      console.log('Step 1: Extracting text from PDF...');
      const extraction = await extractTextFromPDF(file.buffer);
      if (extraction) {
        extractedText = extraction.text.replace(/\u0000/g, '');
        numPages = extraction.numPages;
        console.log(`  -> Extracted ${numPages} pages, ${extractedText.length} chars`);
      } else {
        return res.status(400).json({ error: 'Failed to extract text from PDF' });
      }
    } else {
      return res.status(400).json({ error: 'Only PDF files are supported for auto-deal creation' });
    }

    // Step 2: Run AI extraction with confidence scores
    console.log('Step 2: Running AI data extraction with confidence scoring...');
    const aiData = await extractDealDataFromText(extractedText);

    if (!aiData) {
      return res.status(400).json({ error: 'AI could not extract deal data from document' });
    }

    console.log('  -> AI extraction completed:', {
      companyName: aiData.companyName.value,
      companyConfidence: aiData.companyName.confidence,
      industry: aiData.industry.value,
      industryConfidence: aiData.industry.confidence,
      revenue: aiData.revenue.value,
      revenueConfidence: aiData.revenue.confidence,
      ebitda: aiData.ebitda.value,
      ebitdaConfidence: aiData.ebitda.confidence,
      overallConfidence: aiData.overallConfidence,
      needsReview: aiData.needsReview,
    });

    // Step 3: Create or find company
    console.log('Step 3: Creating/finding company...');
    const companyName = aiData.companyName.value || `Company from ${documentName}`;

    // Check if company exists
    const { data: existingCompany } = await supabase
      .from('Company')
      .select('id, name')
      .ilike('name', companyName)
      .single();

    let company;
    if (existingCompany) {
      company = existingCompany;
      console.log(`  -> Found existing company: ${company.name} (${company.id})`);
    } else {
      // Create new company
      const { data: newCompany, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: companyName,
          industry: aiData.industry.value,
          description: aiData.description.value,
        })
        .select()
        .single();

      if (companyError) {
        console.error('Company creation error:', companyError);
        throw companyError;
      }
      company = newCompany;
      console.log(`  -> Created new company: ${company.name} (${company.id})`);
    }

    // Step 4: Create deal with review status
    console.log('Step 4: Creating deal...');
    const dealIcon = getIconForIndustry(aiData.industry.value);

    // Determine deal status based on confidence
    const dealStatus = aiData.needsReview ? 'PENDING_REVIEW' : 'ACTIVE';

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: companyName,
        companyId: company.id,
        stage: 'INITIAL_REVIEW',
        status: dealStatus,
        industry: aiData.industry.value,
        description: aiData.description.value,
        revenue: aiData.revenue.value,
        ebitda: aiData.ebitda.value,
        dealSize: aiData.revenue.value, // Use revenue as deal size estimate
        aiThesis: aiData.summary,
        icon: dealIcon,
        lastDocument: documentName,
        lastDocumentUpdated: new Date().toISOString(),
        // Store extraction metadata
        extractionConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      })
      .select()
      .single();

    if (dealError) {
      console.error('Deal creation error:', dealError);
      throw dealError;
    }
    console.log(`  -> Created deal: ${deal.name} (${deal.id}) - Status: ${dealStatus}`);

    // Step 5: Upload file to storage
    console.log('Step 5: Uploading file to storage...');
    let fileUrl = null;

    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${deal.id}/${timestamp}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.warn('Storage upload warning:', uploadError.message);
    } else {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      fileUrl = urlData?.publicUrl;
      console.log(`  -> File uploaded to: ${fileUrl}`);
    }

    // Step 6: Create document record with confidence data
    console.log('Step 6: Creating document record...');

    // Determine document type from filename
    let docType = 'OTHER';
    const lowerName = documentName.toLowerCase();
    if (lowerName.includes('cim') || lowerName.includes('confidential')) docType = 'CIM';
    else if (lowerName.includes('teaser')) docType = 'TEASER';
    else if (lowerName.includes('financial') || lowerName.includes('model')) docType = 'FINANCIALS';
    else if (lowerName.includes('loi') || lowerName.includes('letter')) docType = 'LOI';
    else if (lowerName.includes('due diligence') || lowerName.includes('dd')) docType = 'DD_REPORT';

    const { data: document, error: docError } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: documentName,
        type: docType,
        fileUrl,
        fileSize: file.size,
        mimeType,
        extractedData: {
          // Store full extraction with confidence
          companyName: aiData.companyName,
          industry: aiData.industry,
          description: aiData.description,
          revenue: aiData.revenue,
          ebitda: aiData.ebitda,
          ebitdaMargin: aiData.ebitdaMargin,
          revenueGrowth: aiData.revenueGrowth,
          employees: aiData.employees,
          foundedYear: aiData.foundedYear,
          headquarters: aiData.headquarters,
          keyRisks: aiData.keyRisks,
          investmentHighlights: aiData.investmentHighlights,
          summary: aiData.summary,
          overallConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
        },
        extractedText,
        status: aiData.needsReview ? 'pending_review' : 'analyzed',
        confidence: aiData.overallConfidence / 100, // Store as 0-1 for DB
        aiAnalyzedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (docError) {
      console.error('Document creation error:', docError);
      throw docError;
    }
    console.log(`  -> Created document: ${document.name} (${document.id})`);

    // Step 7: Trigger RAG embedding in background
    if (extractedText && extractedText.length > 0) {
      console.log('Step 7: Triggering RAG embedding...');
      embedDocument(document.id, deal.id, extractedText)
        .then(result => {
          if (result.success) {
            console.log(`  -> RAG embedding complete: ${result.chunkCount} chunks`);
          } else {
            console.error(`  -> RAG embedding failed:`, result.error);
          }
        })
        .catch(err => {
          console.error('  -> RAG embedding error:', err);
        });
    }

    // Step 8: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: `Deal created from ${docType}`,
      description: aiData.needsReview
        ? `New deal "${companyName}" created with ${aiData.overallConfidence}% confidence - NEEDS REVIEW`
        : `New deal "${companyName}" auto-created with ${aiData.overallConfidence}% confidence`,
      metadata: {
        documentId: document.id,
        documentType: docType,
        extractedCompany: aiData.companyName.value,
        companyConfidence: aiData.companyName.confidence,
        extractedIndustry: aiData.industry.value,
        industryConfidence: aiData.industry.confidence,
        extractedRevenue: aiData.revenue.value,
        revenueConfidence: aiData.revenue.confidence,
        extractedEbitda: aiData.ebitda.value,
        ebitdaConfidence: aiData.ebitda.confidence,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });

    console.log(`=== INGEST: Complete! Deal ID: ${deal.id} ===\n`);

    // Return the created deal with extraction confidence data
    res.status(201).json({
      success: true,
      deal: {
        ...deal,
        company,
      },
      document,
      extraction: {
        companyName: aiData.companyName,
        industry: aiData.industry,
        revenue: aiData.revenue,
        ebitda: aiData.ebitda,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

// GET /api/ingest/pending-review - Get deals pending manual review
router.get('/pending-review', async (req, res) => {
  try {
    const { data: deals, error } = await supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, revenue, ebitda,
        extractionConfidence, needsReview, reviewReasons,
        createdAt,
        company:Company(id, name),
        documents:Document(id, name, type, extractedData, confidence)
      `)
      .eq('needsReview', true)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json({
      count: deals?.length || 0,
      deals: deals || [],
    });
  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    res.status(500).json({ error: 'Failed to fetch pending reviews' });
  }
});

// Validation schema for review approval
const reviewApprovalSchema = z.object({
  companyName: z.string().optional(),
  industry: z.string().optional(),
  revenue: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  description: z.string().optional(),
  approved: z.boolean(),
});

// POST /api/ingest/:dealId/review - Approve or update extracted data
router.post('/:dealId/review', async (req, res) => {
  try {
    const { dealId } = req.params;
    const validation = reviewApprovalSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { companyName, industry, revenue, ebitda, description, approved } = validation.data;

    // Get current deal
    const { data: deal, error: fetchError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', dealId)
      .single();

    if (fetchError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Build update object
    const updates: Record<string, any> = {
      needsReview: false,
      reviewReasons: [],
      status: 'ACTIVE',
    };

    // Apply user corrections if provided
    if (companyName !== undefined) updates.name = companyName;
    if (industry !== undefined) updates.industry = industry;
    if (revenue !== undefined) updates.revenue = revenue;
    if (ebitda !== undefined) updates.ebitda = ebitda;
    if (description !== undefined) updates.description = description;

    // If user explicitly rejected, mark as rejected
    if (!approved) {
      updates.status = 'REJECTED';
    }

    // Update deal
    const { data: updatedDeal, error: updateError } = await supabase
      .from('Deal')
      .update(updates)
      .eq('id', dealId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update company name if changed
    if (companyName && deal.companyId) {
      await supabase
        .from('Company')
        .update({ name: companyName, industry })
        .eq('id', deal.companyId);
    }

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'DEAL_REVIEWED',
      title: approved ? 'Deal extraction approved' : 'Deal extraction rejected',
      description: approved
        ? `Manual review completed. ${companyName ? 'Company name updated.' : ''} ${industry ? 'Industry updated.' : ''}`
        : 'Deal was rejected during manual review.',
      metadata: {
        previousValues: {
          name: deal.name,
          industry: deal.industry,
          revenue: deal.revenue,
          ebitda: deal.ebitda,
        },
        newValues: updates,
        approved,
      },
    });

    res.json({
      success: true,
      deal: updatedDeal,
    });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Failed to process review' });
  }
});

// GET /api/ingest/:dealId/extraction - Get extraction details for a deal
router.get('/:dealId/extraction', async (req, res) => {
  try {
    const { dealId } = req.params;

    const { data: documents, error } = await supabase
      .from('Document')
      .select('id, name, type, extractedData, extractedText, confidence, aiAnalyzedAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const { data: deal } = await supabase
      .from('Deal')
      .select('id, name, extractionConfidence, needsReview, reviewReasons')
      .eq('id', dealId)
      .single();

    res.json({
      deal,
      documents: documents || [],
    });
  } catch (error) {
    console.error('Error fetching extraction:', error);
    res.status(500).json({ error: 'Failed to fetch extraction details' });
  }
});

export default router;
