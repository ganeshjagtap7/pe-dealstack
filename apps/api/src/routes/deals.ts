import { Router } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { searchDocumentChunks, buildRAGContext } from '../rag.js';
import { isGeminiEnabled } from '../gemini.js';

const router = Router();

// Validation schemas
const createDealSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  stage: z.string().default('INITIAL_REVIEW'),
  status: z.string().default('ACTIVE'),
  irrProjected: z.number().optional(),
  mom: z.number().optional(),
  ebitda: z.number().optional(),
  revenue: z.number().optional(),
  industry: z.string().optional(),
  dealSize: z.number().optional(),
  description: z.string().optional(),
  aiThesis: z.string().optional(),
  icon: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().optional(),
  source: z.string().optional(),
});

const updateDealSchema = createDealSchema.partial();

const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

// GET /api/deals/stats/summary - Get deal statistics (must be before :id route)
router.get('/stats/summary', async (req, res) => {
  try {
    const { count: total } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true });

    const { count: active } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ACTIVE');

    const { count: passed } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PASSED');

    const { data: deals } = await supabase
      .from('Deal')
      .select('stage')
      .eq('status', 'ACTIVE');

    const byStage = deals?.reduce((acc: Record<string, number>, deal) => {
      acc[deal.stage] = (acc[deal.stage] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total: total || 0,
      active: active || 0,
      passed: passed || 0,
      byStage: Object.entries(byStage || {}).map(([stage, count]) => ({ stage, count })),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/deals - Get all deals with company info
router.get('/', async (req, res) => {
  try {
    const { stage, status, industry, search, sortBy, sortOrder, minDealSize, maxDealSize, assignedTo, priority } = req.query;

    let query = supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        assignedUser:User!assignedTo(id, name, avatar, email),
        teamMembers:DealTeamMember(
          id,
          role,
          addedAt,
          user:User(id, name, avatar, email)
        )
      `);

    // Apply filters
    if (stage) query = query.eq('stage', stage);
    if (status) query = query.eq('status', status);
    if (industry) query = query.ilike('industry', `%${industry}%`);
    if (assignedTo) query = query.eq('assignedTo', assignedTo);
    if (priority) query = query.eq('priority', priority);

    // Deal size range filters
    if (minDealSize) query = query.gte('dealSize', Number(minDealSize));
    if (maxDealSize) query = query.lte('dealSize', Number(maxDealSize));

    // Text search across multiple fields
    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`name.ilike.${searchTerm},industry.ilike.${searchTerm},aiThesis.ilike.${searchTerm}`);
    }

    // Sorting
    const validSortFields = ['updatedAt', 'createdAt', 'dealSize', 'irrProjected', 'revenue', 'ebitda', 'name', 'priority'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'updatedAt';
    const ascending = sortOrder === 'asc';
    query = query.order(sortField, { ascending, nullsFirst: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get single deal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('Deal')
      .select(`
        *,
        company:Company(*),
        assignedUser:User!assignedTo(id, name, avatar, email, title),
        teamMembers:DealTeamMember(
          id,
          role,
          addedAt,
          user:User(id, name, avatar, email, title, department)
        ),
        documents:Document(
          id,
          name,
          type,
          fileUrl,
          fileSize,
          aiAnalysis,
          createdAt
        ),
        activities:Activity(
          id,
          type,
          title,
          description,
          createdAt,
          user:User!userId(id, name, avatar)
        ),
        folders:Folder(
          id,
          name,
          fileCount,
          isRestricted
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw error;
    }

    // Sort activities by date (most recent first)
    if (data?.activities) {
      data.activities.sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// POST /api/deals - Create new deal (requires DEAL_CREATE permission)
router.post('/', requirePermission(PERMISSIONS.DEAL_CREATE), async (req, res) => {
  try {
    const data = createDealSchema.parse(req.body);

    let companyId = data.companyId;

    // Create company if it doesn't exist
    if (!companyId && data.companyName) {
      const { data: company, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: data.companyName,
          industry: data.industry,
        })
        .select()
        .single();

      if (companyError) throw companyError;
      companyId = company.id;
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID or name is required' });
    }

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: data.name,
        companyId,
        stage: data.stage,
        status: data.status,
        irrProjected: data.irrProjected,
        mom: data.mom,
        ebitda: data.ebitda,
        revenue: data.revenue,
        industry: data.industry,
        dealSize: data.dealSize,
        description: data.description,
        aiThesis: data.aiThesis,
        icon: data.icon || 'business_center',
        assignedTo: data.assignedTo,
        priority: data.priority || 'MEDIUM',
        tags: data.tags,
        targetCloseDate: data.targetCloseDate,
        source: data.source,
      })
      .select(`
        *,
        company:Company(*),
        assignedUser:User!assignedTo(id, name, avatar, email)
      `)
      .single();

    if (dealError) throw dealError;

    // Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'STATUS_UPDATED',
      title: 'Deal Created',
      description: `New deal "${deal.name}" created`,
    });

    // Audit log
    await AuditLog.dealCreated(req, deal.id, deal.name);

    res.status(201).json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// PATCH /api/deals/:id - Update deal
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateDealSchema.parse(req.body);

    // Get existing deal
    const { data: existingDeal, error: fetchError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Update deal
    const { data: deal, error: updateError } = await supabase
      .from('Deal')
      .update({
        ...data,
        companyId: undefined, // Don't allow changing company
      })
      .eq('id', id)
      .select(`
        *,
        company:Company(*),
        documents:Document(*),
        activities:Activity(*)
      `)
      .single();

    if (updateError) throw updateError;

    // Log stage change
    if (data.stage && data.stage !== existingDeal.stage) {
      await supabase.from('Activity').insert({
        dealId: deal.id,
        type: 'STAGE_CHANGED',
        title: `Stage changed to ${data.stage}`,
        description: `Deal stage changed from ${existingDeal.stage} to ${data.stage}`,
      });
    }

    // Audit log
    await AuditLog.dealUpdated(req, deal.id, deal.name, data);

    res.json(deal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/:id - Delete deal (requires DEAL_DELETE permission)
router.delete('/:id', requirePermission(PERMISSIONS.DEAL_DELETE), async (req, res) => {
  try {
    const { id } = req.params;

    // Get deal name before deleting for audit log
    const { data: deal } = await supabase
      .from('Deal')
      .select('name')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('Deal')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log
    await AuditLog.dealDeleted(req, id, deal?.name || 'Unknown');

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// =====================
// DEAL TEAM MANAGEMENT
// =====================

// GET /api/deals/:id/team - Get team members for a deal
router.get('/:id/team', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('DealTeamMember')
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title, department)
      `)
      .eq('dealId', id)
      .order('addedAt', { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/deals/:id/team - Add team member to deal
router.post('/:id/team', async (req, res) => {
  try {
    const { id } = req.params;
    const data = addTeamMemberSchema.parse(req.body);

    // Check if already a team member
    const { data: existing } = await supabase
      .from('DealTeamMember')
      .select('id')
      .eq('dealId', id)
      .eq('userId', data.userId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    const { data: member, error } = await supabase
      .from('DealTeamMember')
      .insert({
        dealId: id,
        userId: data.userId,
        role: data.role,
      })
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title)
      `)
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from('Activity').insert({
      dealId: id,
      userId: data.userId,
      type: 'TEAM_MEMBER_ADDED',
      title: `Team member added`,
      description: `Added as ${data.role}`,
    });

    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// PATCH /api/deals/:dealId/team/:memberId - Update team member role
router.patch('/:dealId/team/:memberId', async (req, res) => {
  try {
    const { dealId, memberId } = req.params;
    const { role } = req.body;

    if (!['LEAD', 'MEMBER', 'VIEWER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: member, error } = await supabase
      .from('DealTeamMember')
      .update({ role })
      .eq('id', memberId)
      .eq('dealId', dealId)
      .select(`
        id,
        role,
        addedAt,
        user:User(id, name, avatar, email, title)
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team member not found' });
      }
      throw error;
    }

    res.json(member);
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// DELETE /api/deals/:dealId/team/:memberId - Remove team member
router.delete('/:dealId/team/:memberId', async (req, res) => {
  try {
    const { dealId, memberId } = req.params;

    const { error } = await supabase
      .from('DealTeamMember')
      .delete()
      .eq('id', memberId)
      .eq('dealId', dealId);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ============================================================
// Deal AI Chat
// ============================================================

// Import OpenAI for chat functionality
import { openai, isAIEnabled } from '../openai.js';

// System prompt for deal analysis
const DEAL_ANALYST_PROMPT = `You are DealOS AI, an expert Private Equity investment analyst assistant.

Your role is to help investment professionals analyze deals by providing:
- Financial analysis (EBITDA, revenue, margins, multiples)
- Deal evaluation and risk assessment
- Investment thesis development
- Due diligence insights
- Market and competitive analysis

**IMPORTANT**: You have access to the full contents of uploaded documents in the deal context below.
When answering questions:
- Reference specific information from the documents
- Quote relevant passages when appropriate
- Cite which document the information comes from (e.g., "According to the Teaser Deck...")
- If information isn't in the documents, say so clearly

Guidelines:
- Be concise but thorough
- Use specific numbers and data from documents when available
- Highlight both opportunities and risks
- Use professional financial terminology
- Format responses with clear structure (bullet points, sections)`;

// Helper: Extract keywords from a question for document relevance scoring
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
    'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
    'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'i', 'tell', 'give', 'show']);

  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

// Helper: Score document relevance based on question keywords
function scoreDocumentRelevance(doc: any, keywords: string[]): number {
  if (!doc.extractedText && !doc.name) return 0;

  const docText = `${doc.name || ''} ${doc.extractedText || ''}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    // Count occurrences of keyword in document
    const regex = new RegExp(keyword, 'gi');
    const matches = docText.match(regex);
    if (matches) {
      score += matches.length;
    }
  }

  // Boost score if keyword appears in document name
  const docName = (doc.name || '').toLowerCase();
  for (const keyword of keywords) {
    if (docName.includes(keyword)) {
      score += 5; // Name matches are more valuable
    }
  }

  return score;
}

// Helper: Build context using keyword-based relevance (fallback when RAG not available)
function buildKeywordContext(message: string, documents: any[]): string {
  const keywords = extractKeywords(message);

  // Score and sort documents by relevance to the question
  const scoredDocs = documents.map((doc: any) => ({
    ...doc,
    relevanceScore: scoreDocumentRelevance(doc, keywords)
  })).sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

  // Separate highly relevant docs from others
  const relevantDocs = scoredDocs.filter((d: any) => d.relevanceScore > 0);
  const otherDocs = scoredDocs.filter((d: any) => d.relevanceScore === 0);

  const parts: string[] = [];
  parts.push(`(${documents.length} documents available)`);

  // Add relevant documents first with more context (3000 chars each)
  if (relevantDocs.length > 0) {
    parts.push(`\n[MOST RELEVANT TO YOUR QUESTION]`);
    relevantDocs.forEach((doc: any) => {
      parts.push(`\n### ${doc.name} (${doc.type})`);
      if (doc.extractedText) {
        const textLength = Math.min(doc.extractedText.length, 3000);
        parts.push(doc.extractedText.substring(0, textLength));
        if (doc.extractedText.length > textLength) {
          parts.push(`... [truncated, ${doc.extractedText.length - textLength} more chars]`);
        }
      } else {
        parts.push('(No text extracted from this document)');
      }
    });
  }

  // Add other documents with less context (1000 chars each)
  if (otherDocs.length > 0) {
    parts.push(`\n[OTHER AVAILABLE DOCUMENTS]`);
    otherDocs.forEach((doc: any) => {
      parts.push(`\n### ${doc.name} (${doc.type})`);
      if (doc.extractedText) {
        const textLength = Math.min(doc.extractedText.length, 1000);
        parts.push(doc.extractedText.substring(0, textLength));
        if (doc.extractedText.length > textLength) {
          parts.push(`... [truncated, ${doc.extractedText.length - textLength} more chars]`);
        }
      } else {
        parts.push('(No text extracted from this document)');
      }
    });
  }

  return parts.join('\n');
}

// POST /api/deals/:dealId/chat - Send a message to AI about this deal
router.post('/:dealId/chat', async (req, res) => {
  console.log(`[CHAT] Received chat request for deal ${req.params.dealId}`);
  console.log(`[CHAT] OpenAI enabled: ${isAIEnabled()}, openai client: ${!!openai}`);

  try {
    const { dealId } = req.params;
    const { message, history = [] } = req.body;
    const user = (req as any).user;

    console.log(`[CHAT] Message: "${message?.substring(0, 50)}..."`);

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get deal with context
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, dealSize, revenue, ebitda,
        irrProjected, mom, aiThesis, description,
        company:Company(id, name, description, industry),
        documents:Document(id, name, type, extractedText, embeddingStatus)
      `)
      .eq('id', dealId)
      .single();

    if (dealError) {
      if (dealError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw dealError;
    }

    // Build deal context
    const contextParts = [`Deal: ${deal.name}`];
    contextParts.push(`Stage: ${deal.stage}`);
    if (deal.industry) contextParts.push(`Industry: ${deal.industry}`);
    if (deal.dealSize) contextParts.push(`Deal Size: $${deal.dealSize}M`);
    if (deal.revenue) contextParts.push(`Revenue: $${deal.revenue}M`);
    if (deal.ebitda) contextParts.push(`EBITDA: $${deal.ebitda}M`);
    if (deal.irrProjected) contextParts.push(`Projected IRR: ${deal.irrProjected}%`);
    if (deal.mom) contextParts.push(`MoM: ${deal.mom}x`);
    if (deal.aiThesis) contextParts.push(`\nInvestment Thesis: ${deal.aiThesis}`);

    const company = deal.company as any;
    if (company) {
      contextParts.push(`\nCompany: ${company.name}`);
      if (company.description) contextParts.push(`Description: ${company.description}`);
    }

    // Use RAG for semantic document search if Gemini is enabled
    let documentContext = '';
    if (deal.documents?.length > 0) {
      if (isGeminiEnabled()) {
        // Use RAG: semantic search over document chunks
        console.log(`[RAG] Searching document chunks for deal ${dealId}...`);
        const searchResults = await searchDocumentChunks(message, dealId, 10, 0.4);

        if (searchResults.length > 0) {
          console.log(`[RAG] Found ${searchResults.length} relevant chunks`);
          documentContext = buildRAGContext(searchResults, deal.documents);
        } else {
          // Fallback to keyword-based if no semantic matches
          console.log(`[RAG] No semantic matches, falling back to keyword search`);
          documentContext = buildKeywordContext(message, deal.documents);
        }
      } else {
        // Fallback to keyword-based relevance when Gemini not available
        documentContext = buildKeywordContext(message, deal.documents);
      }
    } else {
      documentContext = '(No documents uploaded to this deal yet)';
    }

    contextParts.push(`\n--- DOCUMENT CONTENTS ---`);
    contextParts.push(documentContext);

    const dealContext = contextParts.join('\n');

    // Check if AI is enabled
    if (!isAIEnabled() || !openai) {
      // Return fallback response
      return res.json({
        response: generateFallbackResponse(message, deal),
        model: 'fallback',
      });
    }

    // Build messages for OpenAI
    const messages: any[] = [
      { role: 'system', content: DEAL_ANALYST_PROMPT },
      { role: 'system', content: `Current Deal Context:\n${dealContext}` },
    ];

    // Add conversation history (last 10 messages)
    history.slice(-10).forEach((msg: any) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI
    console.log(`[CHAT] Calling OpenAI with ${messages.length} messages...`);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    console.log(`[CHAT] OpenAI response received`);
    const aiResponse = completion.choices[0]?.message?.content || 'I apologize, I was unable to generate a response.';

    // Log AI chat activity
    await AuditLog.aiChat(req, `Deal: ${deal.name}`);

    res.json({
      response: aiResponse,
      model: 'gpt-4-turbo-preview',
    });
  } catch (error) {
    console.error('Error in deal chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Fallback response when AI is not available
function generateFallbackResponse(query: string, deal: any): string {
  const queryLower = query.toLowerCase();

  if (queryLower.includes('risk')) {
    return `**Risk Analysis for ${deal.name}:**

Based on available information:
1. **Market Risk**: ${deal.industry || 'Industry'} sector dynamics
2. **Financial Risk**: ${deal.irrProjected ? `${deal.irrProjected}% projected IRR` : 'IRR not calculated'}
3. **Execution Risk**: Review operational capabilities

*Enable OpenAI API for detailed AI-powered analysis.*`;
  }

  if (queryLower.includes('thesis') || queryLower.includes('investment')) {
    return deal.aiThesis || `**Investment Considerations for ${deal.name}:**

- Stage: ${deal.stage}
- Industry: ${deal.industry || 'N/A'}
- Deal Size: ${deal.dealSize ? `$${deal.dealSize}M` : 'N/A'}
- Projected Returns: ${deal.mom ? `${deal.mom}x MoM` : 'N/A'}

*Upload documents and enable AI for a comprehensive thesis.*`;
  }

  if (queryLower.includes('financial') || queryLower.includes('metric') || queryLower.includes('number')) {
    return `**${deal.name} Financial Summary:**

- Deal Size: ${deal.dealSize ? `$${deal.dealSize}M` : 'Not specified'}
- Revenue: ${deal.revenue ? `$${deal.revenue}M` : 'Not available'}
- EBITDA: ${deal.ebitda ? `$${deal.ebitda}M` : 'Not available'}
- Projected IRR: ${deal.irrProjected ? `${deal.irrProjected}%` : 'Not calculated'}
- MoM: ${deal.mom ? `${deal.mom}x` : 'Not specified'}`;
  }

  return `I can help you analyze **${deal.name}**. Try asking about:

• "What are the key risks?"
• "Summarize the financial metrics"
• "Generate an investment thesis"
• "What documents are available?"

*Note: Enable OpenAI API for full AI-powered analysis.*`;
}

export default router;
