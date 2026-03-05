// ─── Deal Chat Helpers ───────────────────────────────────────
// Constants, types, and helper functions for the deal AI chat feature.

// System prompt for deal analysis
export const DEAL_ANALYST_PROMPT = `You are DealOS AI, an expert Private Equity investment analyst assistant.

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
export const DEAL_UPDATE_TOOLS = [
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

// Minimal document type for keyword context building
export interface DocumentForContext {
  name: string;
  type: string;
  extractedText?: string | null;
}

// Type for scored document
interface ScoredDoc extends DocumentForContext {
  relevanceScore: number;
}

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
function scoreDocumentRelevance(doc: DocumentForContext, keywords: string[]): number {
  if (!doc.extractedText && !doc.name) return 0;

  const docText = `${doc.name || ''} ${doc.extractedText || ''}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
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
      score += 5;
    }
  }

  return score;
}

// Helper: Build context using keyword-based relevance (fallback when RAG not available)
export function buildKeywordContext(message: string, documents: DocumentForContext[]): string {
  const keywords = extractKeywords(message);

  const scoredDocs: ScoredDoc[] = documents.map((doc) => ({
    ...doc,
    relevanceScore: scoreDocumentRelevance(doc, keywords)
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);

  const relevantDocs = scoredDocs.filter((d) => d.relevanceScore > 0);
  const otherDocs = scoredDocs.filter((d) => d.relevanceScore === 0);

  const parts: string[] = [];
  parts.push(`(${documents.length} documents available)`);

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

// Fallback response when AI is not available
export function generateFallbackResponse(query: string, deal: any): string {
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
