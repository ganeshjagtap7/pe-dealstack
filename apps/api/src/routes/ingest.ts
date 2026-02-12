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
import { scrapeWebsite } from '../services/webScraper.js';

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
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, Word, Text'));
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

    // Step 6: Trigger RAG embedding in background
    if (text.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, text)
        .then(result => {
          if (result.success) log.debug('RAG embedding complete', { chunkCount: result.chunkCount });
          else log.error('RAG embedding failed', result.error);
        })
        .catch(err => log.error('RAG embedding error', err));
    }

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

// ─── Website URL Scraping ─────────────────────────────────────

const urlIngestSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  companyName: z.string().optional(),
});

// POST /api/ingest/url — Create deal from company website
router.post('/url', async (req, res) => {
  try {
    const validation = urlIngestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { url, companyName: userCompanyName } = validation.data;
    log.info('URL ingest starting', { url });

    // Step 1: Scrape the website
    const scrapedText = await scrapeWebsite(url);
    if (!scrapedText || scrapedText.length < 100) {
      return res.status(400).json({ error: 'Could not extract enough content from this website' });
    }

    log.debug('Scraped website', { url, charCount: scrapedText.length });

    // Step 2: AI extraction
    const aiData = await extractDealDataFromText(scrapedText);
    if (!aiData) {
      return res.status(400).json({ error: 'Could not extract deal data from website content' });
    }

    // Override company name if user provided one
    if (userCompanyName) {
      aiData.companyName.value = userCompanyName;
      aiData.companyName.confidence = 100;
    }

    // Step 3: Create or find company
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
      })
      .select()
      .single();

    if (dealError) throw dealError;

    // Step 5: Create document record
    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: `Website scrape — ${url}`,
        type: 'OTHER',
        extractedText: scrapedText,
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
        mimeType: 'text/html',
      })
      .select()
      .single();

    // Step 6: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: 'Deal created from website scrape',
      description: aiData.needsReview
        ? `"${companyName}" extracted from ${url} with ${aiData.overallConfidence}% confidence — NEEDS REVIEW`
        : `"${companyName}" auto-created from ${url} with ${aiData.overallConfidence}% confidence`,
      metadata: {
        sourceType: 'web_scrape',
        url,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });

    // Step 7: Trigger RAG embedding in background
    if (scrapedText.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, scrapedText)
        .then(result => {
          if (result.success) log.debug('RAG embedding complete', { chunkCount: result.chunkCount });
          else log.error('RAG embedding failed', result.error);
        })
        .catch(err => log.error('RAG embedding error', err));
    }

    log.info('URL ingest complete', { dealId: deal.id, url });

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
      source: { type: 'web_scrape', url },
    });
  } catch (error) {
    log.error('URL ingest error', error);
    res.status(500).json({ error: 'Failed to process URL' });
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
