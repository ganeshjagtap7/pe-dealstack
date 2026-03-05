import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled } from '../openai.js';
import { log } from '../utils/logger.js';
import { AuditLog } from '../services/auditLog.js';
import { getOrgId } from '../middleware/orgScope.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const generateSectionSchema = z.object({
  customPrompt: z.string().max(2000).optional(),
});

const chatMessageSchema = z.object({
  content: z.string().min(1),
  sectionId: z.string().uuid().optional(),
});

// ============================================================
// Shared AI Prompt
// ============================================================

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

// ============================================================
// AI Generation Routes
// ============================================================

// POST /api/memos/:id/sections/:sectionId/generate - Regenerate section with AI
router.post('/:id/sections/:sectionId/generate', async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const orgId = getOrgId(req);
    const { customPrompt } = generateSectionSchema.parse(req.body);

    if (!isAIEnabled()) {
      return res.status(503).json({ error: 'AI features are not enabled' });
    }

    // Get memo with deal context (org-scoped)
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
      .eq('organizationId', orgId)
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
      model: 'gpt-4o',
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
        aiModel: 'gpt-4o',
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
    const orgId = getOrgId(req);
    const validation = chatMessageSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.errors });
    }

    // Verify memo belongs to org
    const { data: memoCheck } = await supabase.from('Memo').select('id').eq('id', id).eq('organizationId', orgId).single();
    if (!memoCheck) return res.status(404).json({ error: 'Memo not found' });

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

    // Get recent messages for context (ascending order for chronological history)
    // Note: the user message we just saved above is included, so we fetch 11 and drop the last one
    const { data: recentMessages } = await supabase
      .from('MemoChatMessage')
      .select('role, content')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true });

    // Build context with more section detail for better AI responses
    const memoContext = [];
    memoContext.push(`Memo: ${memo?.title || 'Untitled'}`);
    memoContext.push(`Project: ${memo?.projectName || 'N/A'}`);

    if (memo?.sections) {
      memoContext.push('\nCurrent Sections:');
      memo.sections.forEach((s: any) => {
        memoContext.push(`- ${s.title}: ${s.content?.substring(0, 500) || '(empty)'}`);
      });
    }

    if (memo?.deal) {
      memoContext.push(`\nDeal: ${memo.deal.name}`);
      memoContext.push(`Industry: ${memo.deal.industry || 'N/A'}`);
      if (memo.deal.revenue) memoContext.push(`Revenue: $${memo.deal.revenue}M`);
      if (memo.deal.ebitda) memoContext.push(`EBITDA: $${memo.deal.ebitda}M`);
      if (memo.deal.dealSize) memoContext.push(`Deal Size: $${memo.deal.dealSize}M`);
    }

    // Call OpenAI
    const messages: any[] = [
      { role: 'system', content: MEMO_ANALYST_PROMPT },
      { role: 'system', content: `Memo Context:\n${memoContext.join('\n')}\n\nProvide specific, actionable responses. Reference deal data when available.` },
    ];

    // Add conversation history (exclude the just-saved user message — we add it explicitly below)
    if (recentMessages && recentMessages.length > 0) {
      const history = recentMessages.slice(0, -1).slice(-8);
      history.forEach((msg: any) => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: validation.data.content });

    const response = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    });

    const aiContent = response.choices[0].message.content;

    // Save AI response
    const { data: aiMessage, error: aiMsgError } = await supabase
      .from('MemoChatMessage')
      .insert({
        conversationId,
        role: 'assistant',
        content: aiContent,
        metadata: { model: 'gpt-4o' },
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
    const orgId = getOrgId(req);

    // Verify memo belongs to org
    const { data: memo } = await supabase.from('Memo').select('id').eq('id', id).eq('organizationId', orgId).single();
    if (!memo) return res.status(404).json({ error: 'Memo not found' });

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
