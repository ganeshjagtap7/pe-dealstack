import { Router } from 'express';
import { supabase } from '../supabase.js';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText, toLegacyFormat, ExtractedDealData } from '../services/aiExtractor.js';
import { z } from 'zod';
import { embedDocument } from '../rag.js';
import { log } from '../utils/logger.js';
import { extractTextFromWord } from '../services/documentParser.js';
import { parseExcelToDealRows } from '../services/excelParser.js';
import { deepExtract, isDeepExtractionAvailable, DeepExtractionResult } from '../services/langExtractClient.js';
import { researchCompany, buildResearchText } from '../services/companyResearcher.js';
import { AuditLog } from '../services/auditLog.js';
import { validateFinancials } from '../services/financialValidator.js';
import { parseEmailFile, buildDealTextFromEmail } from '../services/emailParser.js';

// Transform deep extraction result into ExtractedDealData format
function transformDeepResultToExtractedDealData(result: DeepExtractionResult): ExtractedDealData {
  const d = result.dealData;
  const highConf = 85; // Deep extraction yields high confidence
  return {
    companyName: { value: d.companyName, confidence: d.companyName ? highConf : 0 },
    industry: { value: d.industry, confidence: d.industry ? highConf : 0 },
    description: { value: [d.companyName, d.industry].filter(Boolean).join(' — ') || 'Extracted via deep analysis', confidence: highConf },
    revenue: { value: d.revenue, confidence: d.revenue != null ? highConf : 0 },
    ebitda: { value: d.ebitda, confidence: d.ebitda != null ? highConf : 0 },
    ebitdaMargin: { value: d.ebitdaMargin, confidence: d.ebitdaMargin != null ? highConf : 0 },
    revenueGrowth: { value: d.revenueGrowth, confidence: d.revenueGrowth != null ? highConf : 0 },
    employees: { value: d.employees, confidence: d.employees != null ? highConf : 0 },
    foundedYear: { value: null, confidence: 0 },
    headquarters: { value: d.headquarters, confidence: d.headquarters ? highConf : 0 },
    keyRisks: d.keyRisks || [],
    investmentHighlights: d.investmentHighlights || [],
    summary: `Deep extraction found ${result.extractionCount} data points`,
    overallConfidence: highConf,
    needsReview: !d.companyName,
    reviewReasons: !d.companyName ? ['Company name not found in deep extraction'] : [],
  };
}

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
    log.error('PDF extraction error', error);
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
      'text/plain',
    ];
    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.endsWith('.eml') ||
        file.mimetype === 'message/rfc822') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, Word, Text, Email (.eml)'));
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

    log.info('Ingest starting', { documentName });

    // Step 1: Extract text from document
    let extractedText: string | null = null;
    let numPages: number | null = null;

    if (mimeType === 'application/pdf') {
      log.debug('Step 1: Extracting text from PDF');
      const extraction = await extractTextFromPDF(file.buffer);
      if (extraction) {
        extractedText = extraction.text.replace(/\u0000/g, '');
        numPages = extraction.numPages;
        log.debug('PDF extracted', { numPages, charCount: extractedText.length });
      } else {
        return res.status(400).json({ error: 'Failed to extract text from PDF' });
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      log.debug('Step 1: Extracting text from Word document');
      extractedText = await extractTextFromWord(file.buffer);
      if (!extractedText) {
        return res.status(400).json({ error: 'Failed to extract text from Word document' });
      }
      log.debug('Word extracted', { charCount: extractedText.length });
    } else if (mimeType === 'text/plain') {
      log.debug('Step 1: Reading plain text file');
      extractedText = file.buffer.toString('utf-8');
      if (!extractedText || extractedText.trim().length < 50) {
        return res.status(400).json({ error: 'Text file is too short or empty' });
      }
    } else {
      return res.status(400).json({
        error: 'Unsupported file type for auto-deal creation',
        supported: ['PDF (.pdf)', 'Word (.docx, .doc)', 'Text (.txt)'],
      });
    }

    // Step 2: Run AI extraction with confidence scores
    // Smart routing: use deep extraction for long documents (>50k chars) if available
    const shouldUseDeepExtraction =
      extractedText.length > 50000 && isDeepExtractionAvailable();

    let aiData: ExtractedDealData | null = null;

    if (shouldUseDeepExtraction) {
      log.info('Using deep extraction for long document', { textLength: extractedText.length });
      const deepResult = await deepExtract(extractedText);

      if (deepResult?.success) {
        aiData = transformDeepResultToExtractedDealData(deepResult);
        log.info('Deep extraction succeeded', { extractionCount: deepResult.extractionCount });
      } else {
        log.warn('Deep extraction failed, falling back to standard extraction');
        aiData = await extractDealDataFromText(extractedText);
      }
    } else {
      log.debug('Step 2: Running AI data extraction');
      aiData = await extractDealDataFromText(extractedText);
    }

    if (!aiData) {
      return res.status(400).json({ error: 'AI could not extract deal data from document' });
    }

    log.debug('AI extraction completed', {
      companyName: aiData.companyName.value,
      companyConfidence: aiData.companyName.confidence,
      industry: aiData.industry.value,
      overallConfidence: aiData.overallConfidence,
      needsReview: aiData.needsReview,
    });

    // Financial validation
    const financialCheck = validateFinancials({
      revenue: aiData.revenue.value,
      ebitda: aiData.ebitda.value,
      ebitdaMargin: aiData.ebitdaMargin?.value,
      revenueGrowth: aiData.revenueGrowth?.value,
      employees: aiData.employees?.value,
    });
    if (!financialCheck.isValid) {
      aiData.needsReview = true;
      aiData.reviewReasons = [...(aiData.reviewReasons || []), ...financialCheck.warnings];
    }

    // Step 3: Create or find company
    log.debug('Step 3: Creating/finding company');
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
      log.debug('Found existing company', { name: company.name, id: company.id });
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
        log.error('Company creation error', companyError);
        throw companyError;
      }
      company = newCompany;
      log.debug('Created new company', { name: company.name, id: company.id });
    }

    // Step 4: Create deal with review status
    log.debug('Step 4: Creating deal');
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
        aiRisks: { keyRisks: aiData.keyRisks || [], investmentHighlights: aiData.investmentHighlights || [] },
      })
      .select()
      .single();

    if (dealError) {
      log.error('Deal creation error', dealError);
      throw dealError;
    }
    log.info('Deal created', { name: deal.name, id: deal.id, status: dealStatus });

    // Step 5: Upload file to storage
    log.debug('Step 5: Uploading file to storage');
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
      log.warn('Storage upload warning', { error: uploadError.message });
    } else {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      fileUrl = urlData?.publicUrl;
      log.debug('File uploaded', { fileUrl });
    }

    // Step 6: Create document record with confidence data
    log.debug('Step 6: Creating document record');

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
      log.error('Document creation error', docError);
      throw docError;
    }
    log.debug('Created document', { name: document.name, id: document.id });

    // Step 7: Trigger RAG embedding in background
    if (extractedText && extractedText.length > 0) {
      log.debug('Step 7: Triggering RAG embedding');
      embedDocument(document.id, deal.id, extractedText)
        .then(result => {
          if (result.success) {
            log.debug('RAG embedding complete', { chunkCount: result.chunkCount });
          } else {
            log.error('RAG embedding failed', result.error);
          }
        })
        .catch(err => {
          log.error('RAG embedding error', err);
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

    // Step 9: Auto-assign creator as analyst
    if (req.user?.id) {
      await supabase.from('DealTeamMember').insert({
        dealId: deal.id,
        userId: req.user.id,
        role: 'MEMBER',
      });
    }

    // Step 10: Audit log
    await AuditLog.aiIngest(req, documentName, deal.id);

    // Step 11: Auto-trigger multi-doc analysis if 2+ documents exist
    const { count: docCount } = await supabase
      .from('Document')
      .select('id', { count: 'exact', head: true })
      .eq('dealId', deal.id);

    if (docCount && docCount >= 2) {
      import('../services/multiDocAnalyzer.js')
        .then(({ analyzeMultipleDocuments }) =>
          analyzeMultipleDocuments(deal.id)
        )
        .then(result => {
          if (result) log.info('Auto multi-doc analysis complete', { dealId: deal.id, conflicts: result.conflicts.length });
        })
        .catch(err => log.error('Auto multi-doc analysis failed', err));
    }

    log.info('Ingest complete', { dealId: deal.id });

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
    log.error('Ingest error', error);
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
    log.error('Error fetching pending reviews', error);
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

    // Audit log
    await AuditLog.dealUpdated(req, dealId, updatedDeal.name || deal.name, {
      action: approved ? 'APPROVED' : 'REJECTED',
      previousValues: { name: deal.name, industry: deal.industry, revenue: deal.revenue, ebitda: deal.ebitda },
      newValues: updates,
    });

    res.json({
      success: true,
      deal: updatedDeal,
    });
  } catch (error) {
    log.error('Review error', error);
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
    log.error('Error fetching extraction', error);
    res.status(500).json({ error: 'Failed to fetch extraction details' });
  }
});

// ─── Text Ingestion ───────────────────────────────────────────

const textIngestSchema = z.object({
  text: z.string().min(50, 'Text must be at least 50 characters'),
  sourceName: z.string().optional(),
  sourceType: z.enum(['email', 'note', 'slack', 'whatsapp', 'other']).optional(),
});

// POST /api/ingest/text — Create deal from raw pasted text
router.post('/text', async (req, res) => {
  try {
    const validation = textIngestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { text, sourceName, sourceType } = validation.data;
    log.info('Text ingest starting', { textLength: text.length, sourceType });

    // Step 1: Extract data using existing AI extractor
    const aiData = await extractDealDataFromText(text);
    if (!aiData) {
      return res.status(400).json({ error: 'Could not extract deal data from text. Try providing more detail.' });
    }

    // Financial validation
    const financialCheck = validateFinancials({
      revenue: aiData.revenue.value,
      ebitda: aiData.ebitda.value,
      ebitdaMargin: aiData.ebitdaMargin?.value,
      revenueGrowth: aiData.revenueGrowth?.value,
      employees: aiData.employees?.value,
    });
    if (!financialCheck.isValid) {
      aiData.needsReview = true;
      aiData.reviewReasons = [...(aiData.reviewReasons || []), ...financialCheck.warnings];
    }

    // Step 2: Create or find company
    const companyName = aiData.companyName.value || 'Unknown Company';
    const { data: existingCompany } = await supabase
      .from('Company')
      .select('id, name')
      .ilike('name', companyName)
      .single();

    let company;
    if (existingCompany) {
      company = existingCompany;
      log.debug('Found existing company', { name: company.name });
    } else {
      const { data: newCompany, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: companyName,
          industry: aiData.industry.value,
          description: aiData.description.value,
        })
        .select()
        .single();
      if (companyError) throw companyError;
      company = newCompany;
      log.debug('Created company', { name: company.name });
    }

    // Step 3: Create deal
    const dealIcon = getIconForIndustry(aiData.industry.value);
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
        dealSize: aiData.revenue.value,
        aiThesis: aiData.summary,
        icon: dealIcon,
        extractionConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
        aiRisks: { keyRisks: aiData.keyRisks || [], investmentHighlights: aiData.investmentHighlights || [] },
      })
      .select()
      .single();

    if (dealError) throw dealError;

    // Step 4: Create document record for text source
    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: sourceName || `${sourceType || 'Text'} input - ${new Date().toLocaleDateString()}`,
        type: 'OTHER',
        extractedText: text,
        extractedData: {
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
        status: aiData.needsReview ? 'pending_review' : 'analyzed',
        confidence: aiData.overallConfidence / 100,
        aiAnalyzedAt: new Date().toISOString(),
        mimeType: 'text/plain',
      })
      .select()
      .single();

    // Step 5: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: `Deal created from ${sourceType || 'text'} input`,
      description: aiData.needsReview
        ? `"${companyName}" extracted with ${aiData.overallConfidence}% confidence — NEEDS REVIEW`
        : `"${companyName}" auto-created with ${aiData.overallConfidence}% confidence`,
      metadata: {
        sourceType,
        sourceName,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });

    // Step 6: Auto-assign creator as analyst
    if (req.user?.id) {
      await supabase.from('DealTeamMember').insert({
        dealId: deal.id,
        userId: req.user.id,
        role: 'MEMBER',
      });
    }

    // Step 7: Trigger RAG embedding in background
    if (text.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, text)
        .then(result => {
          if (result.success) log.debug('RAG embedding complete', { chunkCount: result.chunkCount });
          else log.error('RAG embedding failed', result.error);
        })
        .catch(err => log.error('RAG embedding error', err));
    }

    // Audit log
    await AuditLog.aiIngest(req, sourceName || `${sourceType || 'text'} input`, deal.id);

    log.info('Text ingest complete', { dealId: deal.id, confidence: aiData.overallConfidence });

    res.status(201).json({
      success: true,
      deal: { ...deal, company },
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
    log.error('Text ingest error', error);
    res.status(500).json({ error: 'Failed to process text input' });
  }
});

// ─── Website URL Research (Multi-Page Scraping) ──────────────

const urlResearchSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  companyName: z.string().optional(),
  autoCreateDeal: z.boolean().optional().default(true),
});

// POST /api/ingest/url — Research company from website URL (scrapes multiple pages)
router.post('/url', async (req, res) => {
  try {
    const validation = urlResearchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { url, companyName: userCompanyName, autoCreateDeal } = validation.data;
    log.info('URL research starting', { url });

    // Step 1: Research company (scrapes multiple pages in parallel)
    const research = await researchCompany(url);
    const researchText = buildResearchText(research);

    if (researchText.length < 100) {
      return res.status(400).json({
        error: 'Could not extract enough content from website',
        pagesAttempted: research.companyWebsite.scrapedPages.length,
      });
    }

    log.debug('Company research complete', {
      url,
      pagesScraped: research.companyWebsite.scrapedPages.length,
      charCount: researchText.length,
    });

    // Step 2: AI extraction from combined research text
    const aiData = await extractDealDataFromText(researchText);
    if (!aiData) {
      return res.status(400).json({ error: 'AI could not extract deal data from website content' });
    }

    // Override company name if user provided one
    if (userCompanyName) {
      aiData.companyName.value = userCompanyName;
      aiData.companyName.confidence = 100;
    }

    // Financial validation
    const financialCheck = validateFinancials({
      revenue: aiData.revenue.value,
      ebitda: aiData.ebitda.value,
      ebitdaMargin: aiData.ebitdaMargin?.value,
      revenueGrowth: aiData.revenueGrowth?.value,
      employees: aiData.employees?.value,
    });
    if (!financialCheck.isValid) {
      aiData.needsReview = true;
      aiData.reviewReasons = [...(aiData.reviewReasons || []), ...financialCheck.warnings];
    }

    // If preview-only mode, return extraction without creating deal
    if (!autoCreateDeal) {
      return res.json({
        success: true,
        extraction: {
          companyName: aiData.companyName,
          industry: aiData.industry,
          revenue: aiData.revenue,
          ebitda: aiData.ebitda,
          overallConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
        },
        research: {
          pagesScraped: research.companyWebsite.scrapedPages,
          textLength: researchText.length,
        },
      });
    }

    // Step 3: Create or find company
    const companyName = aiData.companyName.value || userCompanyName || 'Unknown Company';
    const { data: existingCompany } = await supabase
      .from('Company')
      .select('id, name')
      .ilike('name', companyName)
      .single();

    let company;
    if (existingCompany) {
      company = existingCompany;
      log.debug('Found existing company', { name: company.name });
    } else {
      const { data: newCompany, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: companyName,
          industry: aiData.industry.value,
          description: aiData.description.value,
        })
        .select()
        .single();
      if (companyError) throw companyError;
      company = newCompany;
      log.debug('Created company', { name: company.name });
    }

    // Step 4: Create deal
    const dealIcon = getIconForIndustry(aiData.industry.value);
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
        dealSize: aiData.revenue.value,
        aiThesis: aiData.summary,
        icon: dealIcon,
        extractionConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
        aiRisks: { keyRisks: aiData.keyRisks || [], investmentHighlights: aiData.investmentHighlights || [] },
        source: 'web_research',
      })
      .select()
      .single();

    if (dealError) throw dealError;

    // Step 5: Generate formatted Deal Overview and store as document
    const overviewSections: string[] = [];
    overviewSections.push(`# Deal Overview: ${companyName}\n`);

    if (aiData.description.value) {
      overviewSections.push(`## Company Profile`);
      overviewSections.push(aiData.description.value);
    }

    const details: string[] = [];
    if (aiData.industry.value) details.push(`- **Industry:** ${aiData.industry.value}`);
    if (aiData.headquarters?.value) details.push(`- **Headquarters:** ${aiData.headquarters.value}`);
    if (aiData.foundedYear?.value) details.push(`- **Founded:** ${aiData.foundedYear.value}`);
    if (aiData.employees?.value) details.push(`- **Employees:** ~${aiData.employees.value.toLocaleString()}`);
    details.push(`- **Website:** ${url}`);
    if (details.length > 1) {
      overviewSections.push(`\n## Key Details\n${details.join('\n')}`);
    }

    if (aiData.summary) {
      overviewSections.push(`\n## Investment Thesis\n${aiData.summary}`);
    }

    const financials: string[] = [];
    if (aiData.revenue.value != null) financials.push(`- **Revenue:** $${aiData.revenue.value}M`);
    if (aiData.ebitda.value != null) financials.push(`- **EBITDA:** $${aiData.ebitda.value}M`);
    if (aiData.ebitdaMargin?.value != null) financials.push(`- **EBITDA Margin:** ${aiData.ebitdaMargin.value}%`);
    if (aiData.revenueGrowth?.value != null) financials.push(`- **Revenue Growth:** ${aiData.revenueGrowth.value}% YoY`);
    if (financials.length > 0) {
      overviewSections.push(`\n## Financial Highlights\n${financials.join('\n')}`);
    }

    if (aiData.investmentHighlights?.length > 0) {
      overviewSections.push(`\n## Investment Highlights\n${aiData.investmentHighlights.map((h: string, i: number) => `${i + 1}. ${h}`).join('\n')}`);
    }

    if (aiData.keyRisks?.length > 0) {
      overviewSections.push(`\n## Key Risks\n${aiData.keyRisks.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`);
    }

    overviewSections.push(`\n---\n*Generated from web research of ${url}*`);
    overviewSections.push(`*${research.companyWebsite.scrapedPages.length} pages analyzed · ${aiData.overallConfidence}% confidence*`);

    const overviewText = overviewSections.join('\n');

    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: `Deal Overview — ${companyName}.md`,
        type: 'OTHER',
        fileSize: Buffer.byteLength(overviewText, 'utf8'),
        extractedText: researchText,
        extractedData: {
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
        aiAnalysis: overviewText,
        status: aiData.needsReview ? 'pending_review' : 'analyzed',
        confidence: aiData.overallConfidence / 100,
        aiAnalyzedAt: new Date().toISOString(),
        mimeType: 'text/markdown',
        metadata: {
          sourceUrl: url,
          pagesScraped: research.companyWebsite.scrapedPages,
        },
      })
      .select()
      .single();

    // Step 6: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: 'Deal created from web research',
      description: aiData.needsReview
        ? `"${companyName}" researched from ${url} (${research.companyWebsite.scrapedPages.length} pages) with ${aiData.overallConfidence}% confidence — NEEDS REVIEW`
        : `"${companyName}" auto-created from ${url} (${research.companyWebsite.scrapedPages.length} pages) with ${aiData.overallConfidence}% confidence`,
      metadata: {
        sourceType: 'web_research',
        url,
        pagesScraped: research.companyWebsite.scrapedPages,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });

    // Step 7: Auto-assign creator as analyst
    if (req.user?.id) {
      await supabase.from('DealTeamMember').insert({
        dealId: deal.id,
        userId: req.user.id,
        role: 'MEMBER',
      });
    }

    // Step 8: RAG embed research text in background
    if (researchText.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, researchText)
        .then(result => {
          if (result.success) log.debug('Research RAG embedding complete', { chunkCount: result.chunkCount });
          else log.error('Research RAG embedding failed', result.error);
        })
        .catch(err => log.error('Research RAG embedding error', err));
    }

    // Audit log
    await AuditLog.aiIngest(req, `Web Research — ${url}`, deal.id);

    log.info('URL research ingest complete', {
      dealId: deal.id,
      url,
      pagesScraped: research.companyWebsite.scrapedPages.length,
    });

    res.status(201).json({
      success: true,
      deal: { ...deal, company },
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
      research: {
        pagesScraped: research.companyWebsite.scrapedPages,
        textLength: researchText.length,
      },
    });
  } catch (error) {
    log.error('URL research error', error);
    res.status(500).json({ error: 'Failed to research company' });
  }
});

// ─── Email Parsing & Auto-Ingest ──────────────────────────────

// POST /api/ingest/email — Parse uploaded .eml file into a deal
router.post('/email', upload.single('file'), async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No email file provided' });

    if (!file.originalname.endsWith('.eml') && file.mimetype !== 'message/rfc822') {
      return res.status(400).json({ error: 'File must be .eml format' });
    }

    log.info('Email ingest starting', { filename: file.originalname });

    // Step 1: Parse email
    const emailData = await parseEmailFile(file.buffer);
    if (!emailData) {
      return res.status(400).json({ error: 'Failed to parse email file' });
    }

    // Step 2: Build text for AI extraction
    const dealText = buildDealTextFromEmail(emailData);
    if (dealText.length < 100) {
      return res.status(400).json({ error: 'Email has insufficient content for deal extraction' });
    }

    // Step 3: AI extraction
    const aiData = await extractDealDataFromText(dealText);
    if (!aiData) {
      return res.status(400).json({ error: 'Could not extract deal data from email' });
    }

    // Step 4: Financial validation
    const financialCheck = validateFinancials({
      revenue: aiData.revenue.value,
      ebitda: aiData.ebitda.value,
      ebitdaMargin: aiData.ebitdaMargin?.value,
      revenueGrowth: aiData.revenueGrowth?.value,
      employees: aiData.employees?.value,
    });
    if (!financialCheck.isValid) {
      aiData.needsReview = true;
      aiData.reviewReasons = [...(aiData.reviewReasons || []), ...financialCheck.warnings];
    }

    // Step 5: Create or find company
    const companyName = aiData.companyName.value || emailData.subject;
    const { data: existingCompany } = await supabase
      .from('Company')
      .select('id, name')
      .ilike('name', companyName)
      .single();

    let company;
    if (existingCompany) {
      company = existingCompany;
    } else {
      const { data: newCompany, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: companyName,
          industry: aiData.industry.value,
          description: aiData.description.value,
        })
        .select()
        .single();
      if (companyError) throw companyError;
      company = newCompany;
    }

    // Step 6: Create deal
    const dealIcon = getIconForIndustry(aiData.industry.value);
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
        dealSize: aiData.revenue.value,
        aiThesis: aiData.summary,
        icon: dealIcon,
        extractionConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
        aiRisks: { keyRisks: aiData.keyRisks || [], investmentHighlights: aiData.investmentHighlights || [] },
        source: 'email',
      })
      .select()
      .single();

    if (dealError) throw dealError;

    // Step 7: Create document record for email body
    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: `Email — ${emailData.subject}`,
        type: 'OTHER',
        extractedText: dealText,
        extractedData: {
          companyName: aiData.companyName,
          industry: aiData.industry,
          description: aiData.description,
          revenue: aiData.revenue,
          ebitda: aiData.ebitda,
          ebitdaMargin: aiData.ebitdaMargin,
          revenueGrowth: aiData.revenueGrowth,
          employees: aiData.employees,
          summary: aiData.summary,
          overallConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
        },
        status: aiData.needsReview ? 'pending_review' : 'analyzed',
        confidence: aiData.overallConfidence / 100,
        aiAnalyzedAt: new Date().toISOString(),
        mimeType: 'message/rfc822',
      })
      .select()
      .single();

    // Step 8: Process PDF attachments
    const processedAttachments: string[] = [];
    for (const att of emailData.attachments) {
      if (att.contentType === 'application/pdf' && att.size < 50 * 1024 * 1024) {
        try {
          const pdfData = await extractTextFromPDF(att.content);
          if (pdfData?.text) {
            await supabase.from('Document').insert({
              dealId: deal.id,
              name: att.filename,
              type: 'OTHER',
              extractedText: pdfData.text,
              mimeType: 'application/pdf',
              status: 'pending_analysis',
            });
            processedAttachments.push(att.filename);

            // RAG embed the attachment in background
            embedDocument(deal.id + '-' + att.filename, deal.id, pdfData.text)
              .catch(err => log.error('Attachment RAG error', err));
          }
        } catch (err) {
          log.warn('Attachment processing failed', { filename: att.filename, error: err });
        }
      }
    }

    // Step 9: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: 'Deal created from email',
      description: `From: ${emailData.from}\nSubject: ${emailData.subject}`,
      metadata: {
        emailFrom: emailData.from,
        emailSubject: emailData.subject,
        emailDate: emailData.date,
        attachmentsProcessed: processedAttachments,
      },
    });

    // Step 10: Auto-assign creator as analyst
    if (req.user?.id) {
      await supabase.from('DealTeamMember').insert({
        dealId: deal.id,
        userId: req.user.id,
        role: 'MEMBER',
      });
    }

    // Step 11: RAG embed email body in background
    if (dealText.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, dealText)
        .catch(err => log.error('Email RAG embedding error', err));
    }

    // Step 11: Audit log
    await AuditLog.aiIngest(req, `Email — ${emailData.subject}`, deal.id);

    log.info('Email ingest complete', {
      dealId: deal.id,
      companyName,
      confidence: aiData.overallConfidence,
      attachments: processedAttachments.length,
    });

    res.status(201).json({
      success: true,
      deal,
      extraction: aiData,
      email: {
        subject: emailData.subject,
        from: emailData.from,
        date: emailData.date,
        attachmentsProcessed: processedAttachments.length,
        attachmentNames: processedAttachments,
      },
    });
  } catch (error) {
    log.error('Email ingest error', error);
    res.status(500).json({ error: 'Failed to process email' });
  }
});

// ─── Excel/CSV Bulk Import ────────────────────────────────────

// POST /api/ingest/bulk — Import deals from Excel/CSV
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (
      !file.mimetype.includes('spreadsheet') &&
      !file.mimetype.includes('excel') &&
      !file.mimetype.includes('csv')
    ) {
      return res.status(400).json({ error: 'File must be Excel (.xlsx) or CSV (.csv)' });
    }

    log.info('Bulk ingest starting', { filename: file.originalname });

    const dealRows = parseExcelToDealRows(file.buffer);
    if (dealRows.length === 0) {
      return res.status(400).json({
        error: 'No valid deals found in file. Ensure you have a column named "Company" or "Company Name".',
        hint: 'Supported columns: Company Name, Industry, Revenue, EBITDA, Stage, Description, Notes',
      });
    }

    if (dealRows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 deals per import. Split your file.' });
    }

    const results: { success: any[]; failed: any[]; total: number } = {
      success: [],
      failed: [],
      total: dealRows.length,
    };

    for (const row of dealRows) {
      try {
        // Deduplicate company
        const { data: existing } = await supabase
          .from('Company')
          .select('id, name')
          .ilike('name', row.companyName)
          .single();

        let company;
        if (existing) {
          company = existing;
        } else {
          const { data: newCo, error } = await supabase
            .from('Company')
            .insert({
              name: row.companyName,
              industry: row.industry,
              description: row.description,
            })
            .select()
            .single();
          if (error) throw error;
          company = newCo;
        }

        // Create deal
        const { data: deal, error: dealErr } = await supabase
          .from('Deal')
          .insert({
            name: row.companyName,
            companyId: company.id,
            stage: row.stage || 'INITIAL_REVIEW',
            status: 'ACTIVE',
            industry: row.industry,
            description: row.description || row.notes,
            revenue: row.revenue,
            ebitda: row.ebitda,
            icon: getIconForIndustry(row.industry || null),
            extractionConfidence: 100, // Manual import = high confidence
          })
          .select()
          .single();

        if (dealErr) throw dealErr;
        results.success.push({ companyName: row.companyName, dealId: deal.id });
      } catch (err) {
        log.warn('Row import failed', { companyName: row.companyName, error: (err as any).message });
        results.failed.push({ companyName: row.companyName, error: (err as any).message });
      }
    }

    // Audit log for bulk import
    await AuditLog.log(req, {
      action: 'AI_INGEST',
      resourceType: 'DEAL',
      description: `Bulk import: ${results.success.length} deals imported, ${results.failed.length} failed`,
      metadata: {
        source: 'bulk_import',
        filename: file.originalname,
        total: results.total,
        imported: results.success.length,
        failed: results.failed.length,
      },
    });

    log.info('Bulk ingest complete', {
      total: results.total,
      success: results.success.length,
      failed: results.failed.length,
    });

    res.status(201).json({
      success: true,
      summary: {
        total: results.total,
        imported: results.success.length,
        failed: results.failed.length,
        deals: results.success,
        errors: results.failed,
      },
    });
  } catch (error) {
    log.error('Bulk ingest error', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

export default router;
