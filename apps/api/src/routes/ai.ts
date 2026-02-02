import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled, DEAL_ANALYSIS_SYSTEM_PROMPT, generateDealContext } from '../openai.js';
import { z } from 'zod';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText, ExtractedDealData } from '../services/aiExtractor.js';
import { validateFile, sanitizeFilename, isPotentiallyDangerous, ALLOWED_MIME_TYPES } from '../services/fileValidator.js';
import { AuditLog } from '../services/auditLog.js';

// Use createRequire to load CommonJS pdf-parse module
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const router = Router();

// Validation schemas
const chatMessageSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

// POST /api/deals/:dealId/chat - Chat with AI about a deal
router.post('/deals/:dealId/chat', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const { message, history = [] } = chatMessageSchema.parse(req.body);

    // Fetch deal data for context
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
      { role: 'system', content: `Current Deal Context:\n${generateDealContext(deal)}` },
    ];

    // Add conversation history
    history.forEach((msg: any) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI
    const completion = await openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || 'No response generated.';

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'NOTE_ADDED',
      title: 'AI Chat Query',
      description: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      metadata: { type: 'ai_chat' },
    });

    res.json({
      response,
      model: 'gpt-4-turbo-preview',
      dealId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error in AI chat:', error);
    res.status(500).json({ error: 'Failed to process AI chat' });
  }
});

// POST /api/deals/:dealId/generate-thesis - Generate AI investment thesis
router.post('/deals/:dealId/generate-thesis', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;

    // Fetch deal data
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const prompt = `Based on the following deal information, generate a concise investment thesis (2-3 sentences) that highlights the key opportunity and any notable risks or considerations.

Deal Information:
${generateDealContext(deal)}

Generate a professional investment thesis that a PE analyst would write. Be specific about the opportunity and any flags that need attention.`;

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const thesis = completion.choices[0]?.message?.content || 'Unable to generate thesis.';

    // Update deal with new thesis
    const { error: updateError } = await supabase
      .from('Deal')
      .update({ aiThesis: thesis })
      .eq('id', dealId);

    if (updateError) {
      console.error('Error updating thesis:', updateError);
    }

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'STATUS_UPDATED',
      title: 'AI Thesis Generated',
      description: 'Investment thesis automatically generated by AI',
      metadata: { type: 'thesis_generation' },
    });

    res.json({
      thesis,
      dealId,
      updated: !updateError,
    });
  } catch (error) {
    console.error('Error generating thesis:', error);
    res.status(500).json({ error: 'Failed to generate thesis' });
  }
});

// POST /api/deals/:dealId/analyze-risks - Analyze deal risks
router.post('/deals/:dealId/analyze-risks', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;

    // Fetch deal data
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const prompt = `Analyze the following deal and identify the top 3-5 key risks that an investor should consider. For each risk, provide a severity level (High/Medium/Low) and a brief mitigation suggestion.

Deal Information:
${generateDealContext(deal)}

Format your response as a JSON array of risk objects with fields: title, description, severity, mitigation`;

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    let risks;
    try {
      const content = completion.choices[0]?.message?.content || '{"risks":[]}';
      const parsed = JSON.parse(content);
      risks = parsed.risks || parsed;
    } catch {
      risks = [{ title: 'Analysis Error', description: 'Could not parse risk analysis', severity: 'Medium' }];
    }

    res.json({
      risks,
      dealId,
    });
  } catch (error) {
    console.error('Error analyzing risks:', error);
    res.status(500).json({ error: 'Failed to analyze risks' });
  }
});

// GET /api/ai/status - Check AI service status
router.get('/ai/status', (req, res) => {
  res.json({
    enabled: isAIEnabled(),
    model: 'gpt-4-turbo-preview',
  });
});

// POST /api/ai/ingest - Ingest a document and create a deal from AI-extracted data
router.post('/ai/ingest', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file
    const validation = validateFile(file.buffer, file.originalname, file.mimetype);
    if (!validation.isValid) {
      return res.status(400).json({ error: 'File validation failed', details: validation.error });
    }

    if (isPotentiallyDangerous(file.buffer, file.originalname)) {
      return res.status(400).json({ error: 'File appears to contain unsafe content' });
    }

    // Check AI availability
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured. Cannot process document.',
      });
    }

    const safeName = validation.sanitizedFilename || sanitizeFilename(file.originalname);
    console.log(`AI Ingest: Processing file ${safeName} (${file.mimetype})`);

    // Extract text from PDF
    let extractedText = '';
    let numPages = 0;

    if (file.mimetype === 'application/pdf') {
      try {
        const pdfData = await pdfParse(file.buffer);
        extractedText = pdfData.text?.replace(/\u0000/g, '') || '';
        numPages = pdfData.numpages || 1;
        console.log(`Extracted ${extractedText.length} chars from ${numPages} pages`);
      } catch (pdfError) {
        console.error('PDF extraction error:', pdfError);
        return res.status(400).json({ error: 'Failed to extract text from PDF' });
      }
    } else {
      // For non-PDF files, attempt text extraction or return error
      return res.status(400).json({
        error: 'Only PDF files are supported for AI ingestion at this time',
      });
    }

    if (extractedText.length < 100) {
      return res.status(400).json({
        error: 'Insufficient text content',
        message: 'Document does not contain enough text for AI analysis',
      });
    }

    // Extract deal data using AI
    console.log('Starting AI extraction...');
    const extractedData = await extractDealDataFromText(extractedText);

    if (!extractedData) {
      return res.status(500).json({
        error: 'AI extraction failed',
        message: 'Could not extract deal information from document',
      });
    }

    // Create or find company
    let companyId: string | null = null;
    if (extractedData.companyName) {
      // Check if company already exists
      const { data: existingCompany } = await supabase
        .from('Company')
        .select('id')
        .ilike('name', extractedData.companyName)
        .single();

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        // Create new company
        const { data: newCompany, error: companyError } = await supabase
          .from('Company')
          .insert({
            name: extractedData.companyName,
            industry: extractedData.industry,
            description: extractedData.description,
          })
          .select()
          .single();

        if (companyError) {
          console.error('Error creating company:', companyError);
        } else {
          companyId = newCompany.id;
        }
      }
    }

    // Create the deal
    const dealName = extractedData.companyName
      ? `Project ${extractedData.companyName.charAt(0).toUpperCase()}${Math.random().toString(36).substring(2, 5)}`
      : `New Opportunity - ${new Date().toLocaleDateString()}`;

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: dealName,
        companyId,
        stage: 'INITIAL_REVIEW',
        status: 'ACTIVE',
        industry: extractedData.industry,
        revenue: extractedData.revenue,
        ebitda: extractedData.ebitda,
        description: extractedData.description,
        aiThesis: extractedData.summary,
        icon: 'business_center',
        priority: 'MEDIUM',
        source: `AI Ingest: ${safeName}`,
      })
      .select()
      .single();

    if (dealError) {
      console.error('Error creating deal:', dealError);
      return res.status(500).json({ error: 'Failed to create deal from extracted data' });
    }

    // Upload document to storage and create document record
    const timestamp = Date.now();
    const filePath = `${deal.id}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    let fileUrl = null;
    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      fileUrl = urlData?.publicUrl;
    }

    // Create document record
    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: safeName,
        type: 'CIM',
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        extractedText,
        extractedData,
        status: 'analyzed',
        confidence: 0.85,
        aiAnalyzedAt: new Date().toISOString(),
      })
      .select()
      .single();

    // Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DOCUMENT_UPLOADED',
      title: 'Deal Created via AI Ingestion',
      description: `AI analyzed "${safeName}" and created deal "${dealName}" with extracted company information`,
      metadata: {
        documentId: document?.id,
        companyName: extractedData.companyName,
        industry: extractedData.industry,
        numPages,
        textLength: extractedText.length,
      },
    });

    // Audit log
    await AuditLog.aiIngest(req, safeName, deal.id);

    console.log(`AI Ingest complete: Created deal ${deal.id} from ${safeName}`);

    res.status(201).json({
      success: true,
      deal: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        industry: deal.industry,
      },
      company: extractedData.companyName ? {
        id: companyId,
        name: extractedData.companyName,
      } : null,
      document: document ? {
        id: document.id,
        name: document.name,
      } : null,
      extracted: {
        companyName: extractedData.companyName,
        industry: extractedData.industry,
        revenue: extractedData.revenue,
        ebitda: extractedData.ebitda,
        summary: extractedData.summary,
        keyRisks: extractedData.keyRisks,
        investmentHighlights: extractedData.investmentHighlights,
      },
    });
  } catch (error) {
    console.error('AI Ingest error:', error);
    res.status(500).json({ error: 'Failed to process AI ingestion' });
  }
});

// POST /api/ai/extract - Extract data from document without creating a deal (preview)
router.post('/ai/extract', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file
    const validation = validateFile(file.buffer, file.originalname, file.mimetype);
    if (!validation.isValid) {
      return res.status(400).json({ error: 'File validation failed', details: validation.error });
    }

    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    // Extract text from PDF only
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const pdfData = await pdfParse(file.buffer);
    const extractedText = pdfData.text?.replace(/\u0000/g, '') || '';

    if (extractedText.length < 100) {
      return res.status(400).json({ error: 'Insufficient text content' });
    }

    // Extract deal data
    const extractedData = await extractDealDataFromText(extractedText);

    if (!extractedData) {
      return res.status(500).json({ error: 'AI extraction failed' });
    }

    res.json({
      success: true,
      filename: validation.sanitizedFilename || file.originalname,
      numPages: pdfData.numpages || 1,
      textLength: extractedText.length,
      extracted: extractedData,
    });
  } catch (error) {
    console.error('AI Extract error:', error);
    res.status(500).json({ error: 'Failed to extract data' });
  }
});

export default router;
