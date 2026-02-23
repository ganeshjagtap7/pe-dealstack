import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { z } from 'zod';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { searchDocumentChunks, buildRAGContext } from '../rag.js';
import { isGeminiEnabled } from '../gemini.js';
import { log } from '../utils/logger.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import type { OpenAIMessage, SortableByDate } from '../types/index.js';

const router = Router();

// Validation schemas
const createDealSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  stage: z.string().default('INITIAL_REVIEW'),
  status: z.string().default('ACTIVE'),
  irrProjected: z.number().nullable().optional(),
  mom: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  dealSize: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  aiThesis: z.string().nullable().optional(),
  icon: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

const updateDealSchema = createDealSchema.partial();

const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

// Query parameter schemas
const dealsQuerySchema = z.object({
  stage: z.enum(['INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED',
    'LOI_SUBMITTED', 'NEGOTIATION', 'CLOSING', 'PASSED',
    'CLOSED_WON', 'CLOSED_LOST']).optional(),
  status: z.enum(['ACTIVE', 'PROCESSING', 'PASSED', 'ARCHIVED']).optional(),
  industry: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'dealSize', 'irrProjected', 'revenue', 'ebitda', 'name', 'priority']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  minDealSize: z.coerce.number().positive().optional(),
  maxDealSize: z.coerce.number().positive().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const chatHistoryQuerySchema = paginationSchema;

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
    log.error('Error fetching stats', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/deals - Get all deals with company info
router.get('/', async (req, res) => {
  try {
    const params = dealsQuerySchema.parse(req.query);

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
    if (params.stage) query = query.eq('stage', params.stage);
    if (params.status) query = query.eq('status', params.status);
    if (params.industry) query = query.ilike('industry', `%${params.industry}%`);
    if (params.assignedTo) query = query.eq('assignedTo', params.assignedTo);
    if (params.priority) query = query.eq('priority', params.priority);

    // Deal size range filters
    if (params.minDealSize) query = query.gte('dealSize', params.minDealSize);
    if (params.maxDealSize) query = query.lte('dealSize', params.maxDealSize);

    // Text search across multiple fields
    if (params.search) {
      const searchTerm = `%${params.search}%`;
      query = query.or(`name.ilike.${searchTerm},industry.ilike.${searchTerm},aiThesis.ilike.${searchTerm}`);
    }

    // Sorting
    const sortField = params.sortBy || 'updatedAt';
    const ascending = params.sortOrder === 'asc';
    query = query.order(sortField, { ascending, nullsFirst: false });

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    log.error('Error fetching deals', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/:id - Get single deal
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
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
        throw new NotFoundError('Deal');
      }
      throw error;
    }

    // Sort activities by date (most recent first)
    if (data?.activities) {
      data.activities.sort((a: SortableByDate, b: SortableByDate) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    res.json(data);
  } catch (error) {
    next(error);
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
    log.error('Error creating deal', error);
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

    // Optimistic locking: if client sends lastKnownUpdatedAt, verify no concurrent edit
    if (req.body.lastKnownUpdatedAt) {
      const clientTimestamp = new Date(req.body.lastKnownUpdatedAt).getTime();
      const serverTimestamp = new Date(existingDeal.updatedAt).getTime();
      if (clientTimestamp < serverTimestamp) {
        return res.status(409).json({
          error: 'Deal was modified by another user. Please refresh and try again.',
          updatedAt: existingDeal.updatedAt,
        });
      }
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
    log.error('Error updating deal', error);
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

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Delete child records in correct order (FK constraints don't have ON DELETE CASCADE)
    // 1. DocumentChunk (references Document and Deal)
    await supabase.from('DocumentChunk').delete().eq('dealId', id);

    // 2. Documents (references Deal and Folder)
    await supabase.from('Document').delete().eq('dealId', id);

    // 3. FolderInsight (references Folder — get folder IDs first)
    const { data: folders } = await supabase.from('Folder').select('id').eq('dealId', id);
    if (folders && folders.length > 0) {
      const folderIds = folders.map(f => f.id);
      for (const fId of folderIds) {
        await supabase.from('FolderInsight').delete().eq('folderId', fId);
      }
    }

    // 4. Folders
    await supabase.from('Folder').delete().eq('dealId', id);

    // 5. ChatMessage (references Deal)
    await supabase.from('ChatMessage').delete().eq('dealId', id);

    // 6. Conversation (references Deal)
    await supabase.from('Conversation').delete().eq('dealId', id);

    // 7. Activity (references Deal)
    await supabase.from('Activity').delete().eq('dealId', id);

    // 8. DealTeamMember (references Deal)
    await supabase.from('DealTeamMember').delete().eq('dealId', id);

    // 9. Memo (references Deal) — delete sections first
    const { data: memos } = await supabase.from('Memo').select('id').eq('dealId', id);
    if (memos && memos.length > 0) {
      for (const m of memos) {
        await supabase.from('MemoSection').delete().eq('memoId', m.id);
      }
    }
    await supabase.from('Memo').delete().eq('dealId', id);

    // 10. Notification (references Deal)
    await supabase.from('Notification').delete().eq('dealId', id);

    // Finally, delete the deal itself
    const { error } = await supabase
      .from('Deal')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log
    await AuditLog.dealDeleted(req, id, deal?.name || 'Unknown');

    log.info('Deal deleted with cascade', { dealId: id, dealName: deal.name });
    res.status(204).send();
  } catch (error) {
    log.error('Error deleting deal', error);
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
    log.error('Error fetching team members', error);
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
    log.error('Error adding team member', error);
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
    log.error('Error updating team member', error);
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
    log.error('Error removing team member', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ============================================================
// Multi-Document Analysis
// ============================================================

import { analyzeMultipleDocuments } from '../services/multiDocAnalyzer.js';

// POST /api/deals/:id/analyze — Run multi-document analysis
router.post('/:id/analyze', async (req: any, res) => {
  try {
    const dealId = req.params.id;

    // Verify deal exists
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select('id, name')
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const result = await analyzeMultipleDocuments(dealId);

    if (!result) {
      return res.status(400).json({ error: 'Multi-doc analysis requires at least 2 documents for this deal.' });
    }

    // Log activity
    await supabase.from('Activity').insert({
      dealId,
      type: 'AI_ANALYSIS',
      title: 'Multi-document analysis completed',
      description: `Analyzed ${result.documentContributions.length} documents. Found ${result.conflicts.length} conflicts, ${result.gapsFilled.length} gaps filled.`,
    });

    // Audit log
    await AuditLog.log(req, {
      action: 'AI_ANALYSIS',
      resourceType: 'DEAL',
      resourceId: dealId,
      resourceName: deal.name,
      description: `Multi-doc analysis: ${result.documentContributions.length} docs, ${result.conflicts.length} conflicts`,
    });

    res.json({ success: true, analysis: result });
  } catch (error) {
    log.error('Multi-doc analysis error', error);
    res.status(500).json({ error: 'Failed to run multi-document analysis' });
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

**DEAL UPDATES**: You can help users update deal fields. When a user asks to change the lead partner, analyst, deal source, or other deal fields, use the update_deal_field function. Available team members and their roles are provided in the context.

**ACTIONS**: When a user wants to perform an action that requires navigation, use the suggest_action function:
- "create memo", "write memo", "draft IC memo", "start memo" → use suggest_action with action_type: "create_memo"
- "open data room", "view documents", "see files" → use suggest_action with action_type: "open_data_room"
- "upload a document", "add a file" → use suggest_action with action_type: "upload_document"
Always provide a helpful response explaining what you'll help them do, then call the suggest_action function to show an action button.

Guidelines:
- Be concise but thorough
- Use specific numbers and data from documents when available
- Highlight both opportunities and risks
- Use professional financial terminology
- Format responses with clear structure (bullet points, sections)`;

// OpenAI tools for deal updates and actions
const DEAL_UPDATE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'update_deal_field',
      description: 'Update a field on the current deal. Use this when the user asks to change lead partner, analyst, deal source, or other deal properties.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['leadPartner', 'analyst', 'source', 'priority', 'industry', 'description'],
            description: 'The field to update'
          },
          value: {
            type: 'string',
            description: 'The new value for the field. For leadPartner/analyst, use the user ID.'
          },
          userName: {
            type: 'string',
            description: 'For leadPartner/analyst updates, the name of the user being assigned (for confirmation message)'
          }
        },
        required: ['field', 'value']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'suggest_action',
      description: 'Suggest a navigation or action when the user wants to create something, go to another page, or perform an action. Use this for: creating memos, opening data room, uploading documents, viewing specific pages.',
      parameters: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            enum: ['create_memo', 'open_data_room', 'upload_document', 'view_financials', 'change_stage'],
            description: 'The type of action to suggest'
          },
          label: {
            type: 'string',
            description: 'The button label text (e.g., "Create Investment Memo", "Open Data Room")'
          },
          description: {
            type: 'string',
            description: 'A brief explanation of what will happen when the user clicks the button'
          }
        },
        required: ['action_type', 'label']
      }
    }
  }
];

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

// Minimal document type for keyword context building
interface DocumentForContext {
  name: string;
  type: string;
  extractedText?: string | null;
}

// Type for scored document
interface ScoredDoc extends DocumentForContext {
  relevanceScore: number;
}

// Helper: Score document relevance based on question keywords
function scoreDocumentRelevance(doc: DocumentForContext, keywords: string[]): number {
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
function buildKeywordContext(message: string, documents: DocumentForContext[]): string {
  const keywords = extractKeywords(message);

  // Score and sort documents by relevance to the question
  const scoredDocs: ScoredDoc[] = documents.map((doc) => ({
    ...doc,
    relevanceScore: scoreDocumentRelevance(doc, keywords)
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Separate highly relevant docs from others
  const relevantDocs = scoredDocs.filter((d) => d.relevanceScore > 0);
  const otherDocs = scoredDocs.filter((d) => d.relevanceScore === 0);

  const parts: string[] = [];
  parts.push(`(${documents.length} documents available)`);

  // Add relevant documents first with more context (3000 chars each)
  if (relevantDocs.length > 0) {
    parts.push(`\n[MOST RELEVANT TO YOUR QUESTION]`);
    relevantDocs.forEach((doc) => {
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
    otherDocs.forEach((doc) => {
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
  log.debug('Chat request received', { dealId: req.params.dealId, aiEnabled: isAIEnabled() });

  try {
    const { dealId } = req.params;
    const { message, history = [] } = req.body;
    const user = req.user;

    log.debug('Chat message', { messagePreview: message?.substring(0, 50) });

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get deal with context including team members
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, dealSize, revenue, ebitda,
        irrProjected, mom, aiThesis, description, source,
        company:Company(id, name, description, industry),
        documents:Document(id, name, type, extractedText, embeddingStatus),
        teamMembers:DealTeamMember(
          id,
          role,
          user:User(id, name, email, title)
        )
      `)
      .eq('id', dealId)
      .single();

    if (dealError) {
      if (dealError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw dealError;
    }

    // Fetch available users for assignment
    const { data: availableUsers } = await supabase
      .from('User')
      .select('id, name, email, title, role')
      .order('name');

    // Build deal context
    const contextParts = [`Deal: ${deal.name}`];
    contextParts.push(`Stage: ${deal.stage}`);
    if (deal.industry) contextParts.push(`Industry: ${deal.industry}`);
    if (deal.dealSize) contextParts.push(`Deal Size: $${deal.dealSize}M`);
    if (deal.revenue) contextParts.push(`Revenue: $${deal.revenue}M`);
    if (deal.ebitda) contextParts.push(`EBITDA: $${deal.ebitda}M`);
    if (deal.irrProjected) contextParts.push(`Projected IRR: ${deal.irrProjected}%`);
    if (deal.mom) contextParts.push(`MoM: ${deal.mom}x`);
    if (deal.source) contextParts.push(`Deal Source: ${deal.source}`);
    if (deal.aiThesis) contextParts.push(`\nInvestment Thesis: ${deal.aiThesis}`);

    // Add current team members
    const teamMembers = deal.teamMembers as any[];
    if (teamMembers && teamMembers.length > 0) {
      contextParts.push(`\n--- CURRENT TEAM ---`);
      const leadPartner = teamMembers.find((m: any) => m.role === 'LEAD');
      const analysts = teamMembers.filter((m: any) => m.role === 'MEMBER');
      if (leadPartner?.user) {
        contextParts.push(`Lead Partner: ${leadPartner.user.name} (ID: ${leadPartner.user.id})`);
      }
      if (analysts.length > 0) {
        analysts.forEach((a: any) => {
          if (a.user) contextParts.push(`Analyst: ${a.user.name} (ID: ${a.user.id})`);
        });
      }
    }

    // Add available users for assignment
    if (availableUsers && availableUsers.length > 0) {
      contextParts.push(`\n--- AVAILABLE TEAM MEMBERS ---`);
      availableUsers.forEach((u: any) => {
        contextParts.push(`- ${u.name} (ID: ${u.id}, ${u.title || u.role || 'Team Member'})`);
      });
    }

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
        log.debug('RAG searching document chunks', { dealId });
        const searchResults = await searchDocumentChunks(message, dealId, 10, 0.4);

        if (searchResults.length > 0) {
          log.debug('RAG found relevant chunks', { count: searchResults.length });
          documentContext = buildRAGContext(searchResults, deal.documents);
        } else {
          // Fallback to keyword-based if no semantic matches
          log.debug('RAG no semantic matches, falling back to keyword search');
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
    const messages: OpenAIMessage[] = [
      { role: 'system', content: DEAL_ANALYST_PROMPT },
      { role: 'system', content: `Current Deal Context:\n${dealContext}` },
    ];

    // Add conversation history (last 10 messages)
    history.slice(-10).forEach((msg: OpenAIMessage) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI with function calling
    log.debug('Calling OpenAI', { messageCount: messages.length });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      tools: DEAL_UPDATE_TOOLS,
      tool_choice: 'auto',
      max_tokens: 1500,
      temperature: 0.7,
    });

    log.debug('OpenAI response received');
    const responseMessage = completion.choices[0]?.message;

    // Check if AI wants to call a function
    let updatedFields: any[] = [];
    let suggestedAction: any = null;

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      for (const toolCall of responseMessage.tool_calls) {
        // Skip if not a function call (type guard for TypeScript)
        if (!('function' in toolCall) || !toolCall.function) continue;

        // Handle suggest_action tool
        if (toolCall.function.name === 'suggest_action') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            log.debug('Processing suggest_action', args);

            // Build the action URL based on action_type
            let url = '';
            switch (args.action_type) {
              case 'create_memo':
                url = `/memo-builder.html?dealId=${dealId}&project=${encodeURIComponent(deal.name)}`;
                break;
              case 'open_data_room':
                url = `/vdr.html?dealId=${dealId}`;
                break;
              case 'upload_document':
                url = `/vdr.html?dealId=${dealId}&action=upload`;
                break;
              case 'view_financials':
                url = `/deal.html?id=${dealId}#financials`;
                break;
              case 'change_stage':
                url = `/deal.html?id=${dealId}&action=change_stage`;
                break;
            }

            suggestedAction = {
              type: args.action_type,
              label: args.label,
              description: args.description,
              url,
            };
          } catch (parseError) {
            log.error('Error processing suggest_action', parseError);
          }
          continue; // Skip the rest for this tool call
        }

        if (toolCall.function.name === 'update_deal_field') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const { field, value, userName } = args;

            log.debug('Processing deal update', { field, value, userName });

            // Handle team member updates (leadPartner, analyst)
            if (field === 'leadPartner' || field === 'analyst') {
              const role = field === 'leadPartner' ? 'LEAD' : 'MEMBER';

              // Check if user is already a team member
              const { data: existingMember } = await supabase
                .from('DealTeamMember')
                .select('id')
                .eq('dealId', dealId)
                .eq('userId', value)
                .single();

              if (existingMember) {
                // Update their role
                await supabase
                  .from('DealTeamMember')
                  .update({ role })
                  .eq('id', existingMember.id);
              } else {
                // Add as new team member
                await supabase
                  .from('DealTeamMember')
                  .insert({
                    dealId,
                    userId: value,
                    role,
                  });
              }

              // Update Deal's updatedAt timestamp
              await supabase
                .from('Deal')
                .update({ updatedAt: new Date().toISOString() })
                .eq('id', dealId);

              // Log activity
              await supabase.from('Activity').insert({
                dealId,
                type: 'TEAM_MEMBER_ADDED',
                title: `${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'} Updated`,
                description: `${userName || 'Team member'} assigned as ${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'}`,
              });

              updatedFields.push({ field, value, userName, success: true });
            } else {
              // Handle other field updates (source, priority, industry, description)
              const updateData: any = {};
              updateData[field] = value;
              updateData.updatedAt = new Date().toISOString();

              await supabase
                .from('Deal')
                .update(updateData)
                .eq('id', dealId);

              // Log activity
              await supabase.from('Activity').insert({
                dealId,
                type: 'STATUS_UPDATED',
                title: `${field.charAt(0).toUpperCase() + field.slice(1)} Updated`,
                description: `Changed to: ${value}`,
              });

              updatedFields.push({ field, value, success: true });
            }
          } catch (parseError) {
            log.error('Error processing tool call', parseError);
            updatedFields.push({ field: 'unknown', success: false, error: 'Failed to process update' });
          }
        }
      }

      // Get a follow-up response from AI confirming the update
      messages.push({
        role: 'assistant',
        content: responseMessage.content || '',
        tool_calls: responseMessage.tool_calls as any,
      } as any);

      // Add tool results
      for (const toolCall of responseMessage.tool_calls) {
        // Skip if not a function call
        if (!('function' in toolCall) || !toolCall.function) continue;
        const update = updatedFields.find(u => u.field === JSON.parse(toolCall.function.arguments).field);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(update || { success: true }),
        } as any);
      }

      // Get final response
      const followUp = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = followUp.choices[0]?.message?.content || 'Update completed successfully.';

      // Save messages to database for history
      const userId = req.user?.id || null;
      log.debug('Saving chat messages (with updates) to database', { dealId, userId });

      const { error: userMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'user',
        content: message,
      });
      if (userMsgError) {
        log.error('Failed to save user message (with updates)', userMsgError);
      }

      const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'assistant',
        content: aiResponse,
        metadata: { model: 'gpt-4-turbo-preview', updates: updatedFields },
      });
      if (aiMsgError) {
        log.error('Failed to save AI message (with updates)', aiMsgError);
      }

      // Log AI chat activity
      await AuditLog.aiChat(req, `Deal: ${deal.name} (with updates)`);

      return res.json({
        response: aiResponse,
        model: 'gpt-4-turbo-preview',
        updates: updatedFields,
        ...(suggestedAction && { action: suggestedAction }),
      });
    }

    // If only suggest_action was called (no field updates), return the AI's message with the action
    if (suggestedAction && updatedFields.length === 0) {
      const aiResponse = responseMessage?.content || 'Here\'s what I can help you with:';

      // Save messages to database
      const userId = req.user?.id || null;
      log.debug('Saving chat messages (with action) to database', { dealId, userId });

      const { error: userMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'user',
        content: message,
      });
      if (userMsgError) {
        log.error('Failed to save user message (with action)', userMsgError);
      }

      const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'assistant',
        content: aiResponse,
        metadata: { model: 'gpt-4-turbo-preview', action: suggestedAction },
      });
      if (aiMsgError) {
        log.error('Failed to save AI message (with action)', aiMsgError);
      }

      await AuditLog.aiChat(req, `Deal: ${deal.name} (with action)`);

      return res.json({
        response: aiResponse,
        model: 'gpt-4-turbo-preview',
        action: suggestedAction,
      });
    }

    const aiResponse = responseMessage?.content || 'I apologize, I was unable to generate a response.';

    // Save messages to database for history
    const userId = req.user?.id || null;
    log.debug('Saving chat messages to database', { dealId, userId });

    const { error: userMsgError } = await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'user',
      content: message,
    });
    if (userMsgError) {
      log.error('Failed to save user message', userMsgError);
    }

    const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
      dealId,
      userId,
      role: 'assistant',
      content: aiResponse,
      metadata: { model: 'gpt-4-turbo-preview' },
    });
    if (aiMsgError) {
      log.error('Failed to save AI message', aiMsgError);
    }

    // Log AI chat activity
    await AuditLog.aiChat(req, `Deal: ${deal.name}`);

    res.json({
      response: aiResponse,
      model: 'gpt-4-turbo-preview',
      ...(suggestedAction && { action: suggestedAction }),
    });
  } catch (error) {
    log.error('Error in deal chat', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// GET /api/deals/:dealId/chat/history - Get chat history for a deal
router.get('/:dealId/chat/history', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { limit = 50, offset = 0 } = chatHistoryQuerySchema.parse(req.query);

    log.debug('Fetching chat history', { dealId, limit, offset });

    const { data: messages, error } = await supabase
      .from('ChatMessage')
      .select('id, role, content, metadata, createdAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Database error fetching chat history', { error, dealId });
      throw error;
    }

    log.debug('Chat history fetched', { dealId, count: messages?.length || 0 });

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
router.delete('/:dealId/chat/history', async (req, res) => {
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
