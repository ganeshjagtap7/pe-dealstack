import { Router } from 'express';
import { supabase } from '../supabase.js';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText } from '../services/aiExtractor.js';

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
  'Cloud Infrastructure': 'cloud_queue',
  'Manufacturing': 'precision_manufacturing',
  'Transportation': 'local_shipping',
  'Logistics': 'webhook',
  'Supply Chain': 'webhook',
  'Financial Services': 'account_balance',
  'Retail': 'storefront',
  'E-commerce': 'shopping_cart',
  'Energy': 'bolt',
  'Real Estate': 'home_work',
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

    // Step 2: Run AI extraction
    console.log('Step 2: Running AI data extraction...');
    const aiData = await extractDealDataFromText(extractedText);

    if (!aiData) {
      return res.status(400).json({ error: 'AI could not extract deal data from document' });
    }

    console.log('  -> AI extraction completed:', {
      companyName: aiData.companyName,
      industry: aiData.industry,
      revenue: aiData.revenue,
      ebitda: aiData.ebitda,
    });

    // Step 3: Create or find company
    console.log('Step 3: Creating/finding company...');
    const companyName = aiData.companyName || `Company from ${documentName}`;

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
          industry: aiData.industry,
          description: aiData.description,
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

    // Step 4: Create deal
    console.log('Step 4: Creating deal...');
    const dealIcon = getIconForIndustry(aiData.industry);

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: companyName,
        companyId: company.id,
        stage: 'INITIAL_REVIEW',
        status: 'ACTIVE',
        industry: aiData.industry,
        description: aiData.description,
        revenue: aiData.revenue,
        ebitda: aiData.ebitda,
        dealSize: aiData.revenue, // Use revenue as deal size estimate
        aiThesis: aiData.summary,
        icon: dealIcon,
        lastDocument: documentName,
        lastDocumentUpdated: new Date().toISOString(),
      })
      .select()
      .single();

    if (dealError) {
      console.error('Deal creation error:', dealError);
      throw dealError;
    }
    console.log(`  -> Created deal: ${deal.name} (${deal.id})`);

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

    // Step 6: Create document record
    console.log('Step 6: Creating document record...');

    // Determine document type from filename
    let docType = 'OTHER';
    const lowerName = documentName.toLowerCase();
    if (lowerName.includes('cim') || lowerName.includes('confidential')) docType = 'CIM';
    else if (lowerName.includes('teaser')) docType = 'TEASER';
    else if (lowerName.includes('financial') || lowerName.includes('model')) docType = 'FINANCIALS';

    const { data: document, error: docError } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: documentName,
        type: docType,
        fileUrl,
        fileSize: file.size,
        mimeType,
        extractedData: aiData,
        extractedText,
        status: 'analyzed',
        confidence: 0.85,
        aiAnalyzedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (docError) {
      console.error('Document creation error:', docError);
      throw docError;
    }
    console.log(`  -> Created document: ${document.name} (${document.id})`);

    // Step 7: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: `Deal created from ${docType}`,
      description: `New deal "${companyName}" auto-created from uploaded document with AI-extracted data`,
      metadata: {
        documentId: document.id,
        documentType: docType,
        extractedCompany: aiData.companyName,
        extractedIndustry: aiData.industry,
        extractedRevenue: aiData.revenue,
        extractedEbitda: aiData.ebitda,
      },
    });

    console.log(`=== INGEST: Complete! Deal ID: ${deal.id} ===\n`);

    // Return the created deal with extracted data
    res.status(201).json({
      success: true,
      deal: {
        ...deal,
        company,
      },
      document,
      extractedData: aiData,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

export default router;
