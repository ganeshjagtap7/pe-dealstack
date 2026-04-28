import { Router } from 'express';
import { supabase } from '../supabase.js';
import { extractDealDataFromText, ExtractedDealData } from '../services/aiExtractor.js';
import { embedDocument } from '../rag.js';
import { log } from '../utils/logger.js';
import { extractTextFromWord } from '../services/documentParser.js';
import { extractTextFromExcel, isExcelFile } from '../services/excelFinancialExtractor.js';
import { deepExtract, isDeepExtractionAvailable, DeepExtractionResult } from '../services/langExtractClient.js';
import { AuditLog } from '../services/auditLog.js';
import { validateFinancials } from '../services/financialValidator.js';
import { mergeIntoExistingDeal, getIconForIndustry } from '../services/dealMerger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { extractTextFromPDF, upload } from './ingest-shared.js';
import { resolveUserId } from './notifications.js';
import { extractText } from '../services/extraction/textExtractor.js';

const router = Router();

// Transform deep extraction result into ExtractedDealData format
function transformDeepResultToExtractedDealData(result: DeepExtractionResult): ExtractedDealData {
  const d = result.dealData;
  const highConf = 85; // Deep extraction yields high confidence
  return {
    companyName: { value: d.companyName, confidence: d.companyName ? highConf : 0 },
    industry: { value: d.industry, confidence: d.industry ? highConf : 0 },
    description: { value: [d.companyName, d.industry].filter(Boolean).join(' — ') || 'Extracted via deep analysis', confidence: highConf },
    currency: (d as any).currency || 'USD',
    revenue: { value: d.revenue, confidence: d.revenue != null ? highConf : 0 },
    ebitda: { value: d.ebitda, confidence: d.ebitda != null ? highConf : 0 },
    ebitdaMargin: { value: d.ebitdaMargin, confidence: d.ebitdaMargin != null ? highConf : 0 },
    dealSize: { value: (d as any).dealSize || null, confidence: (d as any).dealSize != null ? highConf : 0 },
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

// POST /api/ingest - Upload document and auto-create deal
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const orgId = getOrgId(req);
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
      log.debug('Step 1: Extracting text from PDF using enhanced extractor');
      try {
        // Save buffer to temp file for textExtractor (it expects file path)
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `ingest_${Date.now()}_${file.originalname}`);
        fs.writeFileSync(tempFilePath, file.buffer);

        // Use enhanced textExtractor with scanned PDF detection and Vision fallback
        const textResult = await extractText(tempFilePath, mimeType);
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        if (textResult) {
          extractedText = textResult.text.replace(/\u0000/g, '');
          numPages = textResult.metadata.pageCount || 1;
          log.debug('PDF extracted with enhanced extractor', { 
            numPages, 
            charCount: extractedText.length,
            extractionMethod: textResult.metadata.extractionMethod,
            isScanned: textResult.metadata.isScanned 
          });
        } else {
          return res.status(400).json({ error: 'Failed to extract text from PDF - file may be corrupted or password-protected' });
        }
      } catch (pdfError: any) {
        log.error('PDF extraction error with enhanced extractor', pdfError);
        // Fallback to simple extraction
        log.debug('Falling back to simple PDF extraction');
        const extraction = await extractTextFromPDF(file.buffer);
        if (extraction) {
          extractedText = extraction.text.replace(/\u0000/g, '');
          numPages = extraction.numPages;
          log.debug('PDF extracted with fallback', { numPages, charCount: extractedText.length });
        } else {
          return res.status(400).json({ error: 'Failed to extract text from PDF - file may be corrupted, password-protected, or scanned without OCR' });
        }
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
    } else if (isExcelFile(mimeType, documentName)) {
      log.debug('Step 1: Extracting text from Excel');
      extractedText = extractTextFromExcel(file.buffer);
      if (!extractedText || extractedText.trim().length < 50) {
        return res.status(400).json({ error: 'Excel file appears empty or has no readable data' });
      }
      log.debug('Excel extracted', { charCount: extractedText.length });
    } else if (mimeType === 'text/csv' || mimeType === 'application/csv' || documentName.toLowerCase().endsWith('.csv')) {
      log.debug('Step 1: Reading CSV file');
      extractedText = file.buffer.toString('utf-8');
      if (!extractedText || extractedText.trim().length < 50) {
        return res.status(400).json({ error: 'CSV file appears empty or has no readable data' });
      }
      log.debug('CSV extracted', { charCount: extractedText.length });
    } else {
      return res.status(400).json({
        error: 'Unsupported file type for auto-deal creation',
        supported: ['PDF (.pdf)', 'Word (.docx, .doc)', 'Excel (.xlsx, .xls)', 'CSV (.csv)', 'Text (.txt)'],
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

    // Check if updating an existing deal or creating a new one
    const targetDealId = req.body.dealId;
    let deal: any;
    let company: any;
    let isUpdate = false;

    if (targetDealId) {
      // ─── Update Existing Deal path ───
      log.info('Ingest into existing deal', { dealId: targetDealId });
      const result = await mergeIntoExistingDeal(targetDealId, aiData, req.user?.id, documentName);
      deal = result.deal;
      company = deal.company;
      isUpdate = true;
    } else {
      // ─── Create New Deal path (original flow) ───
      log.debug('Step 3: Creating/finding company');
      const companyName = aiData.companyName.value || `Company from ${documentName}`;

      const { data: existingCompany } = await supabase
        .from('Company')
        .select('id, name')
        .ilike('name', companyName)
        .eq('organizationId', orgId)
        .single();

      if (existingCompany) {
        company = existingCompany;
        log.debug('Found existing company', { name: company.name, id: company.id });
      } else {
        const { data: newCompany, error: companyError } = await supabase
          .from('Company')
          .insert({
            name: companyName,
            industry: aiData.industry.value,
            description: aiData.description.value,
            organizationId: orgId,
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

      log.debug('Step 4: Creating deal');
      const dealIcon = getIconForIndustry(aiData.industry.value);
      const dealStatus = aiData.needsReview ? 'PENDING_REVIEW' : 'ACTIVE';

      // User-provided deal context (optional fields from ingest form)
      const userSource = req.body?.source || null;
      const userThesis = req.body?.userThesis || null;
      const userPriority = req.body?.priority || 'MEDIUM';
      const rawTimeline = req.body?.targetTimeline || null;
      const userConcerns = req.body?.concerns || null;

      // Convert timeline string ("30 days", "6 months") to ISO date
      let userTimeline: string | null = null;
      if (rawTimeline) {
        const now = new Date();
        const match = rawTimeline.match(/^(\d+)\s*(day|month|year)s?$/i);
        if (match) {
          const amount = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          if (unit === 'day') now.setDate(now.getDate() + amount);
          else if (unit === 'month') now.setMonth(now.getMonth() + amount);
          else if (unit === 'year') now.setFullYear(now.getFullYear() + amount);
          userTimeline = now.toISOString().split('T')[0];
        }
      }

      const { data: newDeal, error: dealError } = await supabase
        .from('Deal')
        .insert({
          name: companyName,
          companyId: company.id,
          organizationId: orgId,
          stage: 'INITIAL_REVIEW',
          status: dealStatus,
          industry: aiData.industry.value,
          description: aiData.description.value,
          revenue: aiData.revenue.value,
          ebitda: aiData.ebitda.value,
          dealSize: aiData.dealSize?.value || null,
          aiThesis: userThesis || aiData.summary,
          icon: dealIcon,
          ...(userSource ? { source: userSource } : {}),
          lastDocument: documentName,
          lastDocumentUpdated: new Date().toISOString(),
          extractionConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
          aiRisks: { keyRisks: aiData.keyRisks || [], investmentHighlights: aiData.investmentHighlights || [] },
          ...(userTimeline ? { targetCloseDate: userTimeline } : {}),
          ...(userConcerns ? { customFields: { concerns: userConcerns } } : {}),
        })
        .select('id, name, stage, status, industry, revenue, ebitda, dealSize, aiThesis, icon, extractionConfidence, needsReview, reviewReasons, aiRisks')
        .single();

      if (dealError) {
        log.error('Deal creation error', dealError);
        throw dealError;
      }
      deal = newDeal;
      log.info('Deal created', { name: deal.name, id: deal.id, status: dealStatus });
    }

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
      // Store the storage path (not full URL) — signed URLs generated on demand
      fileUrl = filePath;
      log.debug('File uploaded to storage', { storagePath: filePath });
    }

    // Step 6: Create document record with confidence data
    log.debug('Step 6: Creating document record');

    let docType = 'OTHER';
    const lowerName = documentName.toLowerCase();
    if (lowerName.includes('cim') || lowerName.includes('confidential')) docType = 'CIM';
    else if (lowerName.includes('teaser')) docType = 'TEASER';
    else if (lowerName.includes('financial') || lowerName.includes('model')) docType = 'FINANCIALS';
    else if (lowerName.includes('loi') || lowerName.includes('letter')) docType = 'LOI';
    else if (lowerName.includes('due diligence') || lowerName.includes('dd')) docType = 'DD_REPORT';

    // Auto-assign to a VDR folder based on document type
    let ingestFolderId: string | null = null;
    const folderPatterns: Record<string, RegExp> = {
      CIM: /financ|cim/i,
      FINANCIALS: /financ/i,
      LEGAL: /legal/i,
      LOI: /legal|commercial/i,
      DD_REPORT: /due\s*diligence|dd/i,
    };
    const folderPattern = folderPatterns[docType];
    if (folderPattern) {
      const { data: folders } = await supabase
        .from('Folder')
        .select('id, name')
        .eq('dealId', deal.id)
        .order('name', { ascending: true });
      if (folders && folders.length > 0) {
        const match = folders.find((f: any) => folderPattern.test(f.name));
        ingestFolderId = match?.id || folders[0]?.id || null;
      }
    } else {
      const { data: folders } = await supabase
        .from('Folder')
        .select('id')
        .eq('dealId', deal.id)
        .order('name', { ascending: true })
        .limit(1);
      ingestFolderId = folders?.[0]?.id || null;
    }

    const { data: document, error: docError } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        folderId: ingestFolderId,
        name: documentName,
        type: docType,
        fileUrl,
        fileSize: file.size,
        mimeType,
        extractedData: {
          companyName: aiData.companyName,
          industry: aiData.industry,
          description: aiData.description,
          revenue: aiData.revenue,
          ebitda: aiData.ebitda,
          ebitdaMargin: aiData.ebitdaMargin,
          dealSize: aiData.dealSize,
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
        confidence: aiData.overallConfidence / 100,
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

    // Step 8: Log activity (only for new deals — merge already logs)
    if (!isUpdate) {
      await supabase.from('Activity').insert({
        dealId: deal.id,
        type: 'DEAL_CREATED',
        title: `Deal created from ${docType}`,
        description: aiData.needsReview
          ? `New deal "${deal.name}" created with ${aiData.overallConfidence}% confidence - NEEDS REVIEW`
          : `New deal "${deal.name}" auto-created with ${aiData.overallConfidence}% confidence`,
        metadata: {
          documentId: document.id,
          documentType: docType,
          overallConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
        },
      });

      // Auto-assign creator as analyst (only for new deals)
      if (req.user?.id) {
        const internalUserId = await resolveUserId(req.user.id);
        if (internalUserId) {
          await supabase.from('DealTeamMember').insert({
            dealId: deal.id,
            userId: internalUserId,
            role: 'MEMBER',
          }).then(({ error }) => { if (error) log.warn('Auto-assign analyst failed', error); });
        }
      }
    }

    // Audit log
    await AuditLog.aiIngest(req, documentName, deal.id);

    // Auto-trigger multi-doc analysis if 2+ documents exist
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

    log.info('Ingest complete', { dealId: deal.id, isUpdate });

    res.status(isUpdate ? 200 : 201).json({
      success: true,
      isUpdate,
      deal: {
        ...deal,
        company: company || deal.company,
      },
      document,
      extraction: {
        companyName: aiData.companyName,
        industry: aiData.industry,
        currency: aiData.currency || 'USD',
        revenue: aiData.revenue,
        ebitda: aiData.ebitda,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });
  } catch (error: any) {
    log.error('Ingest error - full stack:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details
    });
    res.status(500).json({ error: 'Failed to process document', details: error.message });
  }
});

export default router;
