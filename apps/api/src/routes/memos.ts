import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled } from '../openai.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createMemoSchema = z.object({
  title: z.string().min(1),
  projectName: z.string().optional(),
  dealId: z.string().uuid().nullable().optional(),
  type: z.enum(['IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM']).default('IC_MEMO'),
  status: z.enum(['DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED']).default('DRAFT'),
  sponsor: z.string().optional(),
  memoDate: z.string().optional(),
});

const updateMemoSchema = createMemoSchema.partial();

const createSectionSchema = z.object({
  type: z.enum([
    'EXECUTIVE_SUMMARY',
    'COMPANY_OVERVIEW',
    'FINANCIAL_PERFORMANCE',
    'MARKET_DYNAMICS',
    'COMPETITIVE_LANDSCAPE',
    'RISK_ASSESSMENT',
    'DEAL_STRUCTURE',
    'VALUE_CREATION',
    'EXIT_STRATEGY',
    'RECOMMENDATION',
    'APPENDIX',
    'CUSTOM'
  ]),
  title: z.string().min(1),
  content: z.string().optional(),
  aiGenerated: z.boolean().optional().default(false),
  sortOrder: z.number().optional(),
  citations: z.array(z.any()).optional(),
  tableData: z.any().optional(),
  chartConfig: z.any().optional(),
});

const updateSectionSchema = createSectionSchema.partial();

const reorderSectionsSchema = z.object({
  sections: z.array(z.object({
    id: z.string().uuid(),
    sortOrder: z.number(),
  })),
});

const chatMessageSchema = z.object({
  content: z.string().min(1),
  sectionId: z.string().uuid().optional(),
});

const memosQuerySchema = z.object({
  dealId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED']).optional(),
  type: z.enum(['IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const generateSectionSchema = z.object({
  customPrompt: z.string().max(2000).optional(),
});

// ============================================================
// Memo CRUD Routes
// ============================================================

// GET /api/memos/debug - Check if Memo table exists (dev only)
router.get('/debug', async (req, res) => {
  try {
    // Try a simple select
    const { data, error } = await supabase
      .from('Memo')
      .select('id')
      .limit(1);

    if (error) {
      return res.json({
        tableExists: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        solution: 'Run the SQL migration in Supabase: apps/api/prisma/migrations/add_memo_tables.sql'
      });
    }

    res.json({
      tableExists: true,
      rowCount: data?.length || 0,
      message: 'Memo table is accessible'
    });
  } catch (err: any) {
    res.status(500).json({
      tableExists: false,
      error: err.message,
    });
  }
});

// GET /api/memos - List all memos
router.get('/', async (req, res) => {
  try {
    const params = memosQuerySchema.parse(req.query);
    const user = req.user;

    let query = supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(id, type, title, sortOrder, aiGenerated),
        deal:Deal(id, name, company:Company(name))
      `)
      .order('updatedAt', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1);

    // Apply filters
    if (params.dealId) query = query.eq('dealId', params.dealId);
    if (params.status) query = query.eq('status', params.status);
    if (params.type) query = query.eq('type', params.type);

    const { data: memos, error } = await query;

    if (error) throw error;

    res.json(memos || []);
  } catch (error) {
    log.error('Error fetching memos', error);
    res.status(500).json({ error: 'Failed to fetch memos' });
  }
});

// GET /api/memos/:id - Get single memo with all sections
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: memo, error } = await supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(*),
        deal:Deal(
          id, name, stage, status, industry, dealSize, revenue, ebitda, irrProjected, mom,
          company:Company(id, name, description),
          documents:Document(id, name, type, fileUrl)
        ),
        conversations:MemoConversation(
          id,
          updatedAt,
          messages:MemoChatMessage(id, role, content, createdAt)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Memo not found' });
      }
      throw error;
    }

    // Sort sections by sortOrder
    if (memo.sections) {
      memo.sections.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    }

    // Sort conversation messages by createdAt
    if (memo.conversations) {
      memo.conversations.forEach((conv: any) => {
        if (conv.messages) {
          conv.messages.sort((a: any, b: any) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
      });
    }

    res.json(memo);
  } catch (error) {
    log.error('Error fetching memo', error);
    res.status(500).json({ error: 'Failed to fetch memo' });
  }
});

// POST /api/memos - Create new memo
router.post('/', async (req, res) => {
  try {
    const user = req.user;
    log.debug('Memo create started', { userId: user?.id });

    const validation = createMemoSchema.safeParse(req.body);

    if (!validation.success) {
      log.debug('Memo validation failed', { errors: validation.error.errors });
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const memoData = {
      ...validation.data,
      createdBy: user?.id,
      lastEditedBy: user?.id,
    };

    const { data: memo, error } = await supabase
      .from('Memo')
      .insert(memoData)
      .select()
      .single();

    if (error) {
      throw error;
    }
    log.debug('Memo created', { memoId: memo.id });

    // Create default sections if IC_MEMO type
    if (memo.type === 'IC_MEMO') {
      const defaultSections = [
        { memoId: memo.id, type: 'EXECUTIVE_SUMMARY', title: 'Executive Summary', sortOrder: 0 },
        { memoId: memo.id, type: 'FINANCIAL_PERFORMANCE', title: 'Financial Performance', sortOrder: 1 },
        { memoId: memo.id, type: 'MARKET_DYNAMICS', title: 'Market Dynamics', sortOrder: 2 },
        { memoId: memo.id, type: 'RISK_ASSESSMENT', title: 'Risk Assessment', sortOrder: 3 },
        { memoId: memo.id, type: 'DEAL_STRUCTURE', title: 'Deal Structure', sortOrder: 4 },
      ];

      const { error: sectionsError } = await supabase.from('MemoSection').insert(defaultSections);
      if (sectionsError) {
        throw sectionsError;
      }
    }

    // Fetch the memo with sections
    const { data: fullMemo, error: fetchError } = await supabase
      .from('Memo')
      .select(`*, sections:MemoSection(*)`)
      .eq('id', memo.id)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Audit log
    await AuditLog.memoCreated(req, memo.id, memo.title);
    log.debug('Memo created successfully', { memoId: memo.id });

    res.status(201).json(fullMemo);
  } catch (error: any) {
    log.error('Error creating memo', error);
    // Return detailed error in development for debugging
    const errorMessage = error?.message || 'Unknown error';
    const errorDetails = {
      message: errorMessage,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    };
    log.error('Memo create error', undefined, errorDetails);
    res.status(500).json({
      error: `Failed to create memo: ${errorMessage}`,
      debug: errorDetails
    });
  }
});

// PATCH /api/memos/:id - Update memo
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const validation = updateMemoSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const updateData = {
      ...validation.data,
      lastEditedBy: user?.id,
      updatedAt: new Date().toISOString(),
    };

    const { data: memo, error } = await supabase
      .from('Memo')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(memo);
  } catch (error) {
    log.error('Error updating memo', error);
    res.status(500).json({ error: 'Failed to update memo' });
  }
});

// DELETE /api/memos/:id - Delete memo (requires MEMO_DELETE permission)
router.delete('/:id', requirePermission(PERMISSIONS.MEMO_DELETE), async (req, res) => {
  try {
    const { id } = req.params;

    // Get memo title before deleting for audit log
    const { data: memo } = await supabase
      .from('Memo')
      .select('title')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('Memo')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log
    await AuditLog.memoDeleted(req, id, memo?.title || 'Untitled');

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting memo', error);
    res.status(500).json({ error: 'Failed to delete memo' });
  }
});

// ============================================================
// Section Routes
// ============================================================

// GET /api/memos/:id/sections - Get all sections for a memo
router.get('/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: sections, error } = await supabase
      .from('MemoSection')
      .select('*')
      .eq('memoId', id)
      .order('sortOrder', { ascending: true });

    if (error) throw error;

    res.json(sections || []);
  } catch (error) {
    log.error('Error fetching sections', error);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

// POST /api/memos/:id/sections - Add section
router.post('/:id/sections', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = createSectionSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Get max sortOrder
    const { data: existingSections } = await supabase
      .from('MemoSection')
      .select('sortOrder')
      .eq('memoId', id)
      .order('sortOrder', { ascending: false })
      .limit(1);

    const maxSortOrder = existingSections?.[0]?.sortOrder ?? -1;

    const sectionData = {
      ...validation.data,
      memoId: id,
      sortOrder: validation.data.sortOrder ?? maxSortOrder + 1,
    };

    const { data: section, error } = await supabase
      .from('MemoSection')
      .insert(sectionData)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(section);
  } catch (error) {
    log.error('Error creating section', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/memos/:id/sections/:sectionId - Update section
router.patch('/:id/sections/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const validation = updateSectionSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    const { data: section, error } = await supabase
      .from('MemoSection')
      .update(validation.data)
      .eq('id', sectionId)
      .select()
      .single();

    if (error) throw error;

    res.json(section);
  } catch (error) {
    log.error('Error updating section', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/memos/:id/sections/:sectionId - Delete section
router.delete('/:id/sections/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;

    const { error } = await supabase
      .from('MemoSection')
      .delete()
      .eq('id', sectionId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting section', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// POST /api/memos/:id/sections/reorder - Reorder sections
router.post('/:id/sections/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = reorderSectionsSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Update each section's sortOrder
    const updates = validation.data.sections.map(({ id: sectionId, sortOrder }) =>
      supabase
        .from('MemoSection')
        .update({ sortOrder })
        .eq('id', sectionId)
    );

    await Promise.all(updates);

    // Fetch updated sections
    const { data: sections } = await supabase
      .from('MemoSection')
      .select('*')
      .eq('memoId', id)
      .order('sortOrder', { ascending: true });

    res.json(sections);
  } catch (error) {
    log.error('Error reordering sections', error);
    res.status(500).json({ error: 'Failed to reorder sections' });
  }
});

// ============================================================
// AI Generation Routes
// ============================================================

// System prompt for memo generation
const MEMO_ANALYST_PROMPT = `You are a senior Private Equity investment analyst creating investment committee materials.

Your role is to:
1. Generate professional, data-driven investment memo sections
2. Cite specific documents and page numbers when making claims
3. Present balanced analysis with both opportunities and risks
4. Use PE/finance terminology appropriately
5. Structure content with clear headers, bullet points, and tables

When generating sections:
- Executive Summary: 3-4 paragraphs, key thesis, deal highlights, recommendation
- Financial Performance: Include revenue trends, EBITDA margins, growth rates with specific numbers
- Market Dynamics: TAM/SAM analysis, competitive positioning, industry trends
- Risk Assessment: Categorize as High/Medium/Low with mitigations
- Deal Structure: Terms, valuation multiples, returns analysis

Always format output as HTML that can be rendered in a document. Use <p>, <ul>, <li>, <strong> tags.
Include citation placeholders like [Source: CIM p.XX] for data points.`;

// POST /api/memos/:id/sections/:sectionId/generate - Regenerate section with AI
router.post('/:id/sections/:sectionId/generate', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { customPrompt } = generateSectionSchema.parse(req.body);

    if (!isAIEnabled()) {
      return res.status(503).json({ error: 'AI features are not enabled' });
    }

    // Get memo with deal context
    const { data: memo, error: memoError } = await supabase
      .from('Memo')
      .select(`
        *,
        deal:Deal(
          id, name, stage, industry, dealSize, revenue, ebitda, irrProjected, mom,
          company:Company(name, description),
          documents:Document(name, type, extractedText)
        )
      `)
      .eq('id', id)
      .single();

    if (memoError) throw memoError;

    // Get section
    const { data: section, error: sectionError } = await supabase
      .from('MemoSection')
      .select('*')
      .eq('id', sectionId)
      .single();

    if (sectionError) throw sectionError;

    // Build context
    const contextParts = [];
    contextParts.push(`## Memo: ${memo.title}`);
    contextParts.push(`Project: ${memo.projectName || 'N/A'}`);

    if (memo.deal) {
      contextParts.push(`\n## Deal Information`);
      contextParts.push(`Name: ${memo.deal.name}`);
      contextParts.push(`Industry: ${memo.deal.industry || 'N/A'}`);
      contextParts.push(`Stage: ${memo.deal.stage}`);
      if (memo.deal.revenue) contextParts.push(`Revenue: $${memo.deal.revenue}M`);
      if (memo.deal.ebitda) contextParts.push(`EBITDA: $${memo.deal.ebitda}M`);
      if (memo.deal.dealSize) contextParts.push(`Deal Size: $${memo.deal.dealSize}M`);
      if (memo.deal.irrProjected) contextParts.push(`Projected IRR: ${memo.deal.irrProjected}%`);
      if (memo.deal.mom) contextParts.push(`MoM: ${memo.deal.mom}x`);

      if (memo.deal.company) {
        contextParts.push(`\nCompany: ${memo.deal.company.name}`);
        if (memo.deal.company.description) {
          contextParts.push(`Description: ${memo.deal.company.description}`);
        }
      }

      if (memo.deal.documents?.length > 0) {
        contextParts.push(`\n## Available Documents`);
        memo.deal.documents.forEach((doc: any) => {
          contextParts.push(`- ${doc.name} (${doc.type})`);
          if (doc.extractedText) {
            contextParts.push(`  Content preview: ${doc.extractedText.substring(0, 500)}...`);
          }
        });
      }
    }

    const context = contextParts.join('\n');

    // Build section-specific prompt
    const sectionPrompt = customPrompt ||
      `Generate content for the "${section.title}" section of this investment committee memo.
      Section type: ${section.type}
      Current content: ${section.content || '(empty)'}

      Please generate comprehensive, professional content appropriate for this section.`;

    // Call OpenAI
    const response = await openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: MEMO_ANALYST_PROMPT },
        { role: 'system', content: `Context:\n${context}` },
        { role: 'user', content: sectionPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const generatedContent = response.choices[0].message.content;

    // Update section
    const { data: updatedSection, error: updateError } = await supabase
      .from('MemoSection')
      .update({
        content: generatedContent,
        aiGenerated: true,
        aiModel: 'gpt-4-turbo-preview',
        aiPrompt: sectionPrompt,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', sectionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Audit log AI generation
    await AuditLog.aiGenerate(req, section.title, id);

    res.json(updatedSection);
  } catch (error) {
    log.error('Error generating section', error);
    res.status(500).json({ error: 'Failed to generate section content' });
  }
});

// ============================================================
// Chat Routes
// ============================================================

// POST /api/memos/:id/chat - Send message to AI assistant
router.post('/:id/chat', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const validation = chatMessageSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    if (!isAIEnabled()) {
      // Return a fallback response
      return res.json({
        role: 'assistant',
        content: `<p>AI features are currently disabled. To enable AI, please set the OPENAI_API_KEY environment variable.</p>
        <p>In the meantime, I can help you navigate the memo builder interface. What would you like to know?</p>`,
        timestamp: new Date().toISOString(),
      });
    }

    // Get or create conversation
    let { data: existingConversation } = await supabase
      .from('MemoConversation')
      .select('id')
      .eq('memoId', id)
      .eq('userId', user?.id)
      .order('updatedAt', { ascending: false })
      .limit(1)
      .single();

    let conversationId: string;

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('MemoConversation')
        .insert({ memoId: id, userId: user?.id })
        .select()
        .single();

      if (convError || !newConv) throw convError || new Error('Failed to create conversation');
      conversationId = newConv.id;
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('MemoChatMessage')
      .insert({
        conversationId,
        role: 'user',
        content: validation.data.content,
      });

    if (userMsgError) throw userMsgError;

    // Get memo context
    const { data: memo } = await supabase
      .from('Memo')
      .select(`
        *,
        sections:MemoSection(*),
        deal:Deal(
          name, stage, industry, dealSize, revenue, ebitda,
          company:Company(name),
          documents:Document(name, type)
        )
      `)
      .eq('id', id)
      .single();

    // Get recent messages for context
    const { data: recentMessages } = await supabase
      .from('MemoChatMessage')
      .select('role, content')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: false })
      .limit(10);

    // Build context
    const memoContext = [];
    memoContext.push(`Memo: ${memo?.title || 'Untitled'}`);
    memoContext.push(`Project: ${memo?.projectName || 'N/A'}`);

    if (memo?.sections) {
      memoContext.push('\nCurrent Sections:');
      memo.sections.forEach((s: any) => {
        memoContext.push(`- ${s.title}: ${s.content?.substring(0, 200) || '(empty)'}...`);
      });
    }

    if (memo?.deal) {
      memoContext.push(`\nDeal: ${memo.deal.name}`);
      memoContext.push(`Industry: ${memo.deal.industry || 'N/A'}`);
    }

    // Call OpenAI
    const messages: any[] = [
      { role: 'system', content: MEMO_ANALYST_PROMPT },
      { role: 'system', content: `Memo Context:\n${memoContext.join('\n')}` },
    ];

    // Add recent messages (reversed to chronological order)
    if (recentMessages) {
      recentMessages.reverse().slice(0, 8).forEach((msg: any) => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: validation.data.content });

    const response = await openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiContent = response.choices[0].message.content;

    // Save AI response
    const { data: aiMessage, error: aiMsgError } = await supabase
      .from('MemoChatMessage')
      .insert({
        conversationId,
        role: 'assistant',
        content: aiContent,
        metadata: { model: 'gpt-4-turbo-preview' },
      })
      .select()
      .single();

    if (aiMsgError) throw aiMsgError;

    // Update conversation timestamp
    await supabase
      .from('MemoConversation')
      .update({ updatedAt: new Date().toISOString() })
      .eq('id', conversationId);

    // Audit log AI chat
    await AuditLog.aiChat(req, `Memo: ${memo?.title || id}`);

    res.json({
      id: aiMessage.id,
      role: 'assistant',
      content: aiContent,
      timestamp: aiMessage.createdAt,
    });
  } catch (error) {
    log.error('Error in chat', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// GET /api/memos/:id/conversations - Get chat history
router.get('/:id/conversations', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const { data: conversations, error } = await supabase
      .from('MemoConversation')
      .select(`
        id,
        title,
        updatedAt,
        messages:MemoChatMessage(id, role, content, createdAt)
      `)
      .eq('memoId', id)
      .order('updatedAt', { ascending: false });

    if (error) throw error;

    // Sort messages within each conversation
    conversations?.forEach((conv: any) => {
      if (conv.messages) {
        conv.messages.sort((a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
    });

    res.json(conversations || []);
  } catch (error) {
    log.error('Error fetching conversations', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

export default router;
