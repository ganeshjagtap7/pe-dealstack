import { openai, isAIEnabled } from '../openai.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import type { ExtractedDealData } from './aiExtractor.js';

interface DocumentSummary {
  id: string;
  name: string;
  type: string;
  extractedText: string;
  extractedData: any;
  confidence: number;
}

export interface MultiDocResult {
  mergedData: Record<string, any>;
  conflicts: Array<{
    field: string;
    documents: Array<{ docName: string; value: any; confidence: number }>;
    resolved: any;
    resolution: string;
  }>;
  gapsFilled: Array<{
    field: string;
    filledFrom: string;
    value: any;
  }>;
  documentContributions: Array<{
    docName: string;
    fieldsContributed: string[];
  }>;
  synthesis: Record<string, any> | null;
}

const TRACKED_FIELDS = [
  'companyName', 'industry', 'revenue', 'ebitda',
  'ebitdaMargin', 'employees', 'foundedYear', 'headquarters',
];

/**
 * Detect conflicts across multiple documents for the same deal.
 * Two documents conflict when they report different values for the same field.
 * Resolves by highest confidence score.
 */
export function detectConflicts(
  documents: DocumentSummary[],
): MultiDocResult['conflicts'] {
  const fieldValues: Record<string, Array<{ docName: string; value: any; confidence: number }>> = {};

  for (const doc of documents) {
    if (!doc.extractedData) continue;
    for (const field of TRACKED_FIELDS) {
      const fieldData = doc.extractedData[field];
      if (fieldData?.value !== null && fieldData?.value !== undefined) {
        if (!fieldValues[field]) fieldValues[field] = [];
        fieldValues[field].push({
          docName: doc.name,
          value: fieldData.value,
          confidence: fieldData.confidence || 50,
        });
      }
    }
  }

  const conflicts: MultiDocResult['conflicts'] = [];

  for (const [field, values] of Object.entries(fieldValues)) {
    if (values.length < 2) continue;

    const uniqueValues = [...new Set(values.map(v => JSON.stringify(v.value)))];
    if (uniqueValues.length > 1) {
      const sortedByConfidence = [...values].sort((a, b) => b.confidence - a.confidence);
      conflicts.push({
        field,
        documents: values,
        resolved: sortedByConfidence[0].value,
        resolution: 'highest_confidence',
      });
    }
  }

  return conflicts;
}

/**
 * Find data gaps that one document fills where others are missing.
 */
export function findGapsFilled(
  documents: DocumentSummary[],
): MultiDocResult['gapsFilled'] {
  const gapsFilled: MultiDocResult['gapsFilled'] = [];
  const allFieldValues: Record<string, Array<{ docName: string; value: any }>> = {};

  for (const doc of documents) {
    if (!doc.extractedData) continue;
    for (const field of TRACKED_FIELDS) {
      const fieldData = doc.extractedData[field];
      if (fieldData?.value !== null && fieldData?.value !== undefined) {
        if (!allFieldValues[field]) allFieldValues[field] = [];
        allFieldValues[field].push({ docName: doc.name, value: fieldData.value });
      }
    }
  }

  // A gap is filled when only ONE document has the value (others are missing it)
  for (const [field, values] of Object.entries(allFieldValues)) {
    if (values.length === 1 && documents.length >= 2) {
      gapsFilled.push({
        field,
        filledFrom: values[0].docName,
        value: values[0].value,
      });
    }
  }

  return gapsFilled;
}

/**
 * Get which fields each document contributed.
 */
export function getDocumentContributions(
  documents: DocumentSummary[],
): MultiDocResult['documentContributions'] {
  return documents.map(doc => ({
    docName: doc.name,
    fieldsContributed: TRACKED_FIELDS.filter(f =>
      doc.extractedData?.[f]?.value !== null && doc.extractedData?.[f]?.value !== undefined
    ),
  }));
}

/**
 * Build combined document text for AI synthesis.
 */
export function buildCombinedText(documents: DocumentSummary[]): string {
  let combinedText = `=== MULTI-DOCUMENT DEAL ANALYSIS ===\n`;
  combinedText += `Total documents: ${documents.length}\n\n`;

  for (const doc of documents) {
    combinedText += `--- DOCUMENT: ${doc.name} (Type: ${doc.type}, Confidence: ${((doc.confidence || 0) * 100).toFixed(0)}%) ---\n`;
    const excerpt = (doc.extractedText || '').slice(0, 5000);
    combinedText += excerpt + '\n\n';
  }

  return combinedText;
}

/**
 * Analyze all documents for a deal together, resolving conflicts and filling gaps.
 * Requires at least 2 documents. Uses AI to synthesize insights across documents.
 */
export async function analyzeMultipleDocuments(dealId: string): Promise<MultiDocResult | null> {
  // Fetch all documents for this deal
  const { data: documents, error } = await supabase
    .from('Document')
    .select('id, name, type, extractedText, extractedData, confidence')
    .eq('dealId', dealId)
    .order('createdAt', { ascending: true });

  if (error || !documents || documents.length < 2) {
    log.info('Multi-doc analysis skipped: need 2+ documents', { dealId, count: documents?.length });
    return null;
  }

  log.info('Starting multi-doc analysis', { dealId, documentCount: documents.length });

  const conflicts = detectConflicts(documents);
  const gapsFilled = findGapsFilled(documents);
  const documentContributions = getDocumentContributions(documents);

  // Try AI synthesis if available
  let synthesis: Record<string, any> | null = null;

  if (isAIEnabled() && openai) {
    const combinedText = buildCombinedText(documents);

    const synthesisPrompt = `You are a PE analyst reviewing ${documents.length} documents for the same deal.

Resolve any conflicting data points across documents. For each conflict:
- Prefer the most specific/detailed source
- Prefer the most recent document
- Flag unresolvable conflicts

Also identify any data gaps that one document fills where another is missing.

Respond in JSON format:
{
  "synthesizedCompanyName": "...",
  "synthesizedIndustry": "...",
  "synthesizedRevenue": number or null,
  "synthesizedEbitda": number or null,
  "synthesizedDescription": "...",
  "keyInsightsAcrossDocuments": ["..."],
  "unresolvedConflicts": ["..."],
  "overallAssessment": "..."
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: synthesisPrompt },
          { role: 'user', content: combinedText.slice(0, 30000) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      synthesis = JSON.parse(response.choices[0]?.message?.content || '{}');

      // Update deal with synthesized data
      const updateData: Record<string, any> = {};
      if (synthesis?.synthesizedDescription) updateData.description = synthesis.synthesizedDescription;
      if (synthesis?.overallAssessment) updateData.aiThesis = synthesis.overallAssessment;
      updateData.metadata = {
        multiDocAnalysis: {
          documentCount: documents.length,
          analyzedAt: new Date().toISOString(),
          conflicts: conflicts.length,
          keyInsights: synthesis?.keyInsightsAcrossDocuments,
          unresolvedConflicts: synthesis?.unresolvedConflicts,
        },
      };

      await supabase.from('Deal').update(updateData).eq('id', dealId);
    } catch (aiError) {
      log.error('Multi-doc AI synthesis error', aiError);
      // Continue without AI synthesis — conflict detection still works
    }
  } else {
    log.info('Multi-doc analysis: AI not available, returning conflict detection only');
  }

  log.info('Multi-doc analysis complete', {
    dealId,
    documents: documents.length,
    conflicts: conflicts.length,
    gapsFilled: gapsFilled.length,
  });

  return {
    mergedData: synthesis || {},
    conflicts,
    gapsFilled,
    documentContributions,
    synthesis,
  };
}
