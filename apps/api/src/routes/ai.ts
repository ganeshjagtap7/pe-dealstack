import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled, DEAL_ANALYSIS_SYSTEM_PROMPT, generateDealContext } from '../openai.js';
import { z } from 'zod';
import multer from 'multer';
import { createRequire } from 'module';
import { extractDealDataFromText, ExtractedDealData } from '../services/aiExtractor.js';
import { validateFile, sanitizeFilename, isPotentiallyDangerous, ALLOWED_MIME_TYPES } from '../services/fileValidator.js';
import { AuditLog } from '../services/auditLog.js';
import { AICache } from '../services/aiCache.js';
import { log } from '../utils/logger.js';
import { createNotification, notifyDealTeam, resolveUserId } from './notifications.js';

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
      model: 'gpt-4o',
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

    // Save messages to database
    const userId = req.user?.id || null;

    // Save user message
    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'user',
      content: message,
    });

    // Save assistant response
    await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'assistant',
      content: response,
      metadata: { model: 'gpt-4o' },
    });

    res.json({
      response,
      model: 'gpt-4o',
      dealId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Error in AI chat', error);
    res.status(500).json({ error: 'Failed to process AI chat' });
  }
});

// GET /api/deals/:dealId/chat/history - Get chat history for a deal
router.get('/deals/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const { data: messages, error } = await supabase
      .from('ChatMessage')
      .select('id, role, content, metadata, createdAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      messages: messages || [],
      dealId,
      count: messages?.length || 0,
    });
  } catch (error) {
    log.error('Error fetching chat history', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// DELETE /api/deals/:dealId/chat/history - Clear chat history for a deal
router.delete('/deals/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;

    const { error } = await supabase
      .from('ChatMessage')
      .delete()
      .eq('dealId', dealId);

    if (error) throw error;

    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    log.error('Error clearing chat history', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// POST /api/deals/:dealId/generate-thesis - Generate AI investment thesis
// Query params: ?refresh=true to bypass cache
router.post('/deals/:dealId/generate-thesis', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    // Check cache first (unless refresh requested)
    if (!forceRefresh) {
      const cached = await AICache.getThesis(dealId);
      if (cached.hit && cached.data) {
        log.debug('Thesis served from cache', { dealId });
        return res.json({
          thesis: cached.data,
          dealId,
          cached: true,
          cacheAge: cached.age,
        });
      }
    }

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

    log.info('Generating thesis for deal', { dealId, forceRefresh });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: DEAL_ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const thesis = completion.choices[0]?.message?.content || 'Unable to generate thesis.';

    // Store in cache
    await AICache.setThesis(dealId, thesis);

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'STATUS_UPDATED',
      title: 'AI Thesis Generated',
      description: forceRefresh ? 'Investment thesis regenerated by AI' : 'Investment thesis automatically generated by AI',
      metadata: { type: 'thesis_generation', refresh: forceRefresh },
    });

    // Notify team: thesis generated (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        notifyDealTeam(dealId, 'AI_INSIGHT', `AI thesis generated for "${deal.name}"`, undefined, internalId || undefined);
      }).catch(err => log.error('Notification error (thesis)', err));
    }

    res.json({
      thesis,
      dealId,
      cached: false,
    });
  } catch (error) {
    log.error('Error generating thesis', error);
    res.status(500).json({ error: 'Failed to generate thesis' });
  }
});

// POST /api/deals/:dealId/analyze-risks - Analyze deal risks
// Query params: ?refresh=true to bypass cache
router.post('/deals/:dealId/analyze-risks', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { dealId } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    // Check cache first (unless refresh requested)
    if (!forceRefresh) {
      const cached = await AICache.getRisks(dealId);
      if (cached.hit && cached.data) {
        log.debug('Risks served from cache', { dealId });
        return res.json({
          risks: cached.data,
          dealId,
          cached: true,
          cacheAge: cached.age,
        });
      }
    }

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

    log.info('Analyzing risks for deal', { dealId, forceRefresh });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
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

    // Store in cache
    await AICache.setRisks(dealId, risks);

    // Notify team: risk analysis complete (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        notifyDealTeam(dealId, 'AI_INSIGHT', `Risk analysis completed for "${deal.name}"`, undefined, internalId || undefined);
      }).catch(err => log.error('Notification error (risks)', err));
    }

    res.json({
      risks,
      dealId,
      cached: false,
    });
  } catch (error) {
    log.error('Error analyzing risks', error);
    res.status(500).json({ error: 'Failed to analyze risks' });
  }
});

// GET /api/ai/status - Check AI service status
router.get('/ai/status', (req, res) => {
  res.json({
    enabled: isAIEnabled(),
    model: 'gpt-4o',
  });
});

// GET /api/deals/:dealId/ai-cache - Get cache stats for a deal
router.get('/deals/:dealId/ai-cache', async (req, res) => {
  try {
    const { dealId } = req.params;
    const stats = await AICache.getStats(dealId);
    res.json(stats);
  } catch (error) {
    log.error('Error getting cache stats', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// DELETE /api/deals/:dealId/ai-cache - Invalidate cache for a deal
router.delete('/deals/:dealId/ai-cache', async (req, res) => {
  try {
    const { dealId } = req.params;
    await AICache.invalidate(dealId);
    res.json({ success: true, message: 'Cache invalidated' });
  } catch (error) {
    log.error('Error invalidating cache', error);
    res.status(500).json({ error: 'Failed to invalidate cache' });
  }
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
    log.info('AI Ingest processing file', { filename: safeName, mimeType: file.mimetype });

    // Extract text from PDF
    let extractedText = '';
    let numPages = 0;

    if (file.mimetype === 'application/pdf') {
      try {
        const pdfData = await pdfParse(file.buffer);
        extractedText = pdfData.text?.replace(/\u0000/g, '') || '';
        numPages = pdfData.numpages || 1;
        log.info('PDF text extracted', { textLength: extractedText.length, numPages });
      } catch (pdfError) {
        log.error('PDF extraction error', pdfError);
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
    log.info('Starting AI extraction');
    const extractedData = await extractDealDataFromText(extractedText);

    if (!extractedData) {
      return res.status(500).json({
        error: 'AI extraction failed',
        message: 'Could not extract deal information from document',
      });
    }

    // Create or find company (use .value for new format with confidence scores)
    let companyId: string | null = null;
    const companyName = extractedData.companyName.value;
    const industryValue = extractedData.industry.value;
    const descriptionValue = extractedData.description.value;
    const revenueValue = extractedData.revenue.value;
    const ebitdaValue = extractedData.ebitda.value;

    if (companyName) {
      // Check if company already exists
      const { data: existingCompany } = await supabase
        .from('Company')
        .select('id')
        .ilike('name', companyName)
        .single();

      if (existingCompany) {
        companyId = existingCompany.id;
      } else {
        // Create new company
        const { data: newCompany, error: companyError } = await supabase
          .from('Company')
          .insert({
            name: companyName,
            industry: industryValue,
            description: descriptionValue,
          })
          .select()
          .single();

        if (companyError) {
          log.error('Error creating company', companyError);
        } else {
          companyId = newCompany.id;
        }
      }
    }

    // Create the deal
    const dealName = companyName
      ? `Project ${companyName.charAt(0).toUpperCase()}${Math.random().toString(36).substring(2, 5)}`
      : `New Opportunity - ${new Date().toLocaleDateString()}`;

    // Determine status based on confidence
    const dealStatus = extractedData.needsReview ? 'PENDING_REVIEW' : 'ACTIVE';

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: dealName,
        companyId,
        stage: 'INITIAL_REVIEW',
        status: dealStatus,
        industry: industryValue,
        revenue: revenueValue,
        ebitda: ebitdaValue,
        description: descriptionValue,
        aiThesis: extractedData.summary,
        icon: 'business_center',
        priority: 'MEDIUM',
        source: `AI Ingest: ${safeName}`,
        extractionConfidence: extractedData.overallConfidence,
        needsReview: extractedData.needsReview,
        reviewReasons: extractedData.reviewReasons,
      })
      .select()
      .single();

    if (dealError) {
      log.error('Error creating deal', dealError);
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
        status: extractedData.needsReview ? 'pending_review' : 'analyzed',
        confidence: extractedData.overallConfidence / 100,
        aiAnalyzedAt: new Date().toISOString(),
      })
      .select()
      .single();

    // Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DOCUMENT_UPLOADED',
      title: 'Deal Created via AI Ingestion',
      description: extractedData.needsReview
        ? `AI analyzed "${safeName}" with ${extractedData.overallConfidence}% confidence - NEEDS REVIEW`
        : `AI analyzed "${safeName}" and created deal "${dealName}" with ${extractedData.overallConfidence}% confidence`,
      metadata: {
        documentId: document?.id,
        companyName: companyName,
        companyConfidence: extractedData.companyName.confidence,
        industry: industryValue,
        industryConfidence: extractedData.industry.confidence,
        overallConfidence: extractedData.overallConfidence,
        needsReview: extractedData.needsReview,
        numPages,
        textLength: extractedText.length,
      },
    });

    // Audit log
    await AuditLog.aiIngest(req, safeName, deal.id);

    // Notify: deal created via AI ingest (fire-and-forget)
    if (req.user?.id) {
      resolveUserId(req.user.id).then(internalId => {
        if (internalId) {
          createNotification({
            userId: internalId,
            type: 'AI_INSIGHT',
            title: `Deal created via AI: ${deal.name}`,
            message: `${extractedData.overallConfidence}% confidence from "${safeName}"`,
            dealId: deal.id,
          });
        }
      }).catch(err => log.error('Notification error (ingest)', err));
    }

    log.info('AI Ingest complete', { dealId: deal.id, filename: safeName, confidence: extractedData.overallConfidence });

    res.status(201).json({
      success: true,
      deal: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        industry: deal.industry,
      },
      company: companyName ? {
        id: companyId,
        name: companyName,
      } : null,
      document: document ? {
        id: document.id,
        name: document.name,
      } : null,
      extraction: {
        companyName: extractedData.companyName,
        industry: extractedData.industry,
        revenue: extractedData.revenue,
        ebitda: extractedData.ebitda,
        summary: extractedData.summary,
        keyRisks: extractedData.keyRisks,
        investmentHighlights: extractedData.investmentHighlights,
        overallConfidence: extractedData.overallConfidence,
        needsReview: extractedData.needsReview,
        reviewReasons: extractedData.reviewReasons,
      },
    });
  } catch (error) {
    log.error('AI Ingest error', error);
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
    log.error('AI Extract error', error);
    res.status(500).json({ error: 'Failed to extract data' });
  }
});

// POST /api/portfolio/chat - AI-powered portfolio assistant for dashboard
router.post('/portfolio/chat', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch portfolio summary data
    const { data: deals } = await supabase
      .from('Deal')
      .select('id, name, stage, status, industry, revenue, ebitda, dealSize, irrProjected, mom, aiThesis, createdAt, updatedAt')
      .order('updatedAt', { ascending: false });

    // Build portfolio context
    const activeDeals = deals?.filter(d => d.status !== 'PASSED' && d.stage !== 'CLOSED_LOST') || [];
    const totalDeals = deals?.length || 0;
    const totalRevenue = activeDeals.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const totalEbitda = activeDeals.reduce((sum, d) => sum + (d.ebitda || 0), 0);
    const avgIRR = activeDeals.filter(d => d.irrProjected).reduce((sum, d, _, arr) => sum + (d.irrProjected || 0) / arr.length, 0);

    // Group by stage
    const stageCount: Record<string, number> = {};
    activeDeals.forEach(d => {
      stageCount[d.stage] = (stageCount[d.stage] || 0) + 1;
    });

    // Group by industry
    const industryCount: Record<string, number> = {};
    activeDeals.forEach(d => {
      if (d.industry) {
        industryCount[d.industry] = (industryCount[d.industry] || 0) + 1;
      }
    });

    const portfolioContext = `
PORTFOLIO SUMMARY:
- Total Deals: ${totalDeals} (${activeDeals.length} active)
- Total Revenue: $${totalRevenue.toFixed(1)}M
- Total EBITDA: $${totalEbitda.toFixed(1)}M
- Average Projected IRR: ${avgIRR.toFixed(1)}%

DEALS BY STAGE:
${Object.entries(stageCount).map(([stage, count]) => `- ${stage}: ${count}`).join('\n')}

DEALS BY INDUSTRY:
${Object.entries(industryCount).map(([industry, count]) => `- ${industry}: ${count}`).join('\n')}

RECENT DEALS (Top 10):
${activeDeals.slice(0, 10).map(d => `- ${d.name} (${d.industry || 'N/A'}): ${d.stage}, Revenue $${d.revenue || 0}M, EBITDA $${d.ebitda || 0}M${d.aiThesis ? ` | Thesis: ${d.aiThesis.substring(0, 100)}...` : ''}`).join('\n')}
`;

    const systemPrompt = `You are an AI portfolio assistant for a Private Equity firm. You have access to the firm's current deal pipeline and portfolio data. Answer questions about the portfolio, provide insights, and help with analysis.

Be concise but insightful. Use specific numbers from the data when relevant. If asked about a specific deal, reference it by name. If you don't have enough information, say so.

Today's date: ${new Date().toLocaleDateString()}`;

    log.info('Portfolio AI query', { query: message.substring(0, 50) });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${portfolioContext}\n\nUser Question: ${message}` },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || 'Unable to generate response.';

    // Extract relevant deals mentioned (simple matching)
    const mentionedDeals = activeDeals.filter(d =>
      response.toLowerCase().includes(d.name.toLowerCase())
    ).slice(0, 3);

    res.json({
      response,
      context: {
        totalDeals,
        activeDeals: activeDeals.length,
        avgIRR: avgIRR.toFixed(1),
      },
      relatedDeals: mentionedDeals.map(d => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        industry: d.industry,
        revenue: d.revenue,
      })),
    });
  } catch (error) {
    log.error('Portfolio chat error', error);
    res.status(500).json({ error: 'Failed to process portfolio query' });
  }
});

// GET /api/ai/market-sentiment - AI-powered market sentiment based on user's deal sectors
router.get('/ai/market-sentiment', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    // Check cache first (cache for 5 minutes)
    const cacheKey = 'market-sentiment';
    const cached = await AICache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch user's active deals to understand their focus sectors
    const { data: deals } = await supabase
      .from('Deal')
      .select('id, name, industry, stage, status, dealSize')
      .neq('status', 'PASSED')
      .order('updatedAt', { ascending: false })
      .limit(20);

    // Extract unique industries from deals
    const industries = [...new Set(deals?.map(d => d.industry).filter(Boolean) || [])];

    // If no deals, use default sectors
    const focusSectors = industries.length > 0
      ? industries.slice(0, 5)
      : ['Technology', 'Healthcare', 'Financial Services', 'Consumer', 'Industrial'];

    // Build context about the portfolio
    const activeDeals = deals?.filter(d => d.status !== 'PASSED') || [];
    const dealsByStage: Record<string, number> = {};
    activeDeals.forEach(d => {
      dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1;
    });

    const portfolioContext = `
Current Portfolio:
- ${activeDeals.length} active deals
- Focus sectors: ${focusSectors.join(', ')}
- Pipeline breakdown: ${Object.entries(dealsByStage).map(([k, v]) => `${k}: ${v}`).join(', ')}
`;

    // Generate market sentiment using OpenAI
    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a private equity market analyst. Generate a brief, actionable market sentiment analysis for a PE firm focused on specific sectors. Be concise and data-driven. Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.

Return a JSON object with this exact structure:
{
  "headline": "One sentence market headline (max 100 chars)",
  "analysis": "2-3 sentences of market analysis mentioning specific sectors",
  "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
  "confidenceScore": 0-100,
  "recommendation": "One specific actionable recommendation",
  "indicators": [
    { "name": "indicator name", "trend": "up" | "down" | "stable", "detail": "short detail" }
  ],
  "topSector": "The most promising sector right now",
  "riskFactor": "One key risk to watch"
}`
        },
        {
          role: 'user',
          content: `Generate market sentiment analysis for a PE firm with this portfolio focus:
${portfolioContext}

Focus your analysis on these sectors: ${focusSectors.join(', ')}

Consider current market conditions, M&A activity, valuation trends, and macro factors. Make it specific and actionable.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let sentimentData;

    try {
      sentimentData = JSON.parse(responseText);
    } catch {
      log.error('Failed to parse market sentiment JSON', { response: responseText });
      sentimentData = {
        headline: 'Market analysis temporarily unavailable',
        analysis: 'Unable to generate analysis at this time.',
        sentiment: 'NEUTRAL',
        confidenceScore: 50,
        recommendation: 'Review your pipeline and prioritize active deals.',
        indicators: [],
        topSector: focusSectors[0] || 'Technology',
        riskFactor: 'Market volatility',
      };
    }

    // Add metadata
    const result = {
      ...sentimentData,
      generatedAt: new Date().toISOString(),
      focusSectors,
      activeDealsCount: activeDeals.length,
    };

    // Cache for 5 minutes
    await AICache.set(cacheKey, result, 5 * 60 * 1000);

    log.info('Market sentiment generated', { sectors: focusSectors, sentiment: sentimentData.sentiment });
    res.json(result);
  } catch (error) {
    log.error('Market sentiment error', error);
    res.status(500).json({ error: 'Failed to generate market sentiment' });
  }
});

export default router;
