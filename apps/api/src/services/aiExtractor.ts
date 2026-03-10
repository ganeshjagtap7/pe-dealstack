import { z } from 'zod';
import { getExtractionModel, isLLMAvailable } from './llm.js';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { log } from '../utils/logger.js';

// Format a value in millions to human-readable form with smart units
function formatExtractedValue(valueInMillions: number): string {
  const abs = Math.abs(valueInMillions);
  const sign = valueInMillions < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}M`;
  if (abs * 1000 >= 1) return `${sign}$${(abs * 1000).toFixed(1)}K`;
  return `${sign}$${(abs * 1000000).toFixed(0)}`;
}

// ─── Zod Schema for Structured Output ──────────────────────────────

const ExtractionOutputSchema = z.object({
  companyName: z.object({
    value: z.string().nullable(),
    confidence: z.number().min(0).max(100),
    source: z.string().optional(),
  }).describe('Company name extracted from document'),
  industry: z.object({
    value: z.string().nullable(),
    confidence: z.number().min(0).max(100),
    source: z.string().optional(),
  }).describe('Industry classification'),
  description: z.object({
    value: z.string(),
    confidence: z.number().min(0).max(100),
  }).describe('2-3 sentence business description'),
  revenue: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
    source: z.string().optional(),
  }).describe('Annual revenue in millions USD'),
  ebitda: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
    source: z.string().optional(),
  }).describe('EBITDA in millions USD'),
  ebitdaMargin: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
  }).describe('EBITDA margin as percentage'),
  revenueGrowth: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
    source: z.string().optional(),
  }).describe('YoY revenue growth percentage'),
  employees: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
  }).describe('Employee count'),
  foundedYear: z.object({
    value: z.number().nullable(),
    confidence: z.number().min(0).max(100),
  }).describe('Year company was founded'),
  headquarters: z.object({
    value: z.string().nullable(),
    confidence: z.number().min(0).max(100),
  }).describe('City, State or City, Country'),
  keyRisks: z.array(z.string()).describe('3-5 key investment risks'),
  investmentHighlights: z.array(z.string()).describe('3-5 positive investment points'),
  summary: z.string().describe('3-4 sentence executive summary'),
});

// ─── TypeScript Interfaces (unchanged for backward compat) ─────────

export interface ExtractedField<T> {
  value: T;
  confidence: number;
  source?: string;
}

export interface ExtractedDealData {
  companyName: ExtractedField<string | null>;
  industry: ExtractedField<string | null>;
  description: ExtractedField<string>;
  revenue: ExtractedField<number | null>;
  ebitda: ExtractedField<number | null>;
  ebitdaMargin: ExtractedField<number | null>;
  revenueGrowth: ExtractedField<number | null>;
  employees: ExtractedField<number | null>;
  foundedYear: ExtractedField<number | null>;
  headquarters: ExtractedField<string | null>;
  keyRisks: string[];
  investmentHighlights: string[];
  summary: string;
  overallConfidence: number;
  needsReview: boolean;
  reviewReasons: string[];
}

export interface LegacyExtractedDealData {
  companyName: string | null;
  industry: string | null;
  description: string;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  revenueGrowth: number | null;
  keyRisks: string[];
  investmentHighlights: string[];
  summary: string;
}

// ─── System Prompt ────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a senior private equity analyst with expertise in analyzing CIMs, teasers, and financial documents. Your task is to extract key business and financial data with HIGH ACCURACY.

CRITICAL INSTRUCTIONS:
1. Only extract data that is EXPLICITLY stated in the document
2. For each data point, provide a confidence score (0-100):
   - 90-100: Data is explicitly stated with clear context
   - 70-89: Data is clearly implied or calculated from stated figures
   - 50-69: Data is inferred from partial information
   - 0-49: Data is estimated or uncertain
3. Include a source quote for each extraction when confidence is below 90
4. Financial figures MUST be in millions USD - convert if necessary
5. If you cannot find data, set value to null with confidence 0

COMMON PATTERNS TO LOOK FOR:
- Revenue: "revenue of $X", "sales of $X", "top-line of $X", "$X in revenue"
- EBITDA: "EBITDA of $X", "Adjusted EBITDA", "run-rate EBITDA"
- Company Name: Usually in header, "Company Overview", or "About [Company]"
- Industry: Look for sector descriptions, market focus, business type

FINANCIAL CONVERSION (always convert to millions USD):
- "50 million" or "$50M" or "$50,000,000" = 50
- "1.5 billion" or "$1.5B" = 1500
- "$500,000" or "500K" = 0.5
- "$38,200" or "$38.2K" = 0.0382
- "$6,000" = 0.006
- "$1,800" = 0.0018
- "$500" = 0.0005
- Remove commas and convert to number
- IMPORTANT: Small values are valid! Do NOT round small amounts to 0 or null.`;

/**
 * Extract structured deal data from document text using AI
 * Uses LangChain withStructuredOutput() for type-safe Zod-validated extraction
 */
export async function extractDealDataFromText(text: string): Promise<ExtractedDealData | null> {
  if (!isLLMAvailable()) {
    log.warn('AI extraction skipped: no LLM provider configured');
    return null;
  }

  if (!text || text.trim().length < 100) {
    log.warn('AI extraction skipped: text too short');
    return null;
  }

  try {
    const truncatedText = text.slice(0, 20000);
    log.debug('AI extraction starting (structured output)', { textLength: truncatedText.length });

    const model = getExtractionModel(3000);
    const structuredModel = model.withStructuredOutput(ExtractionOutputSchema);

    const extracted = await structuredModel.invoke([
      new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
      new HumanMessage(`Analyze this document and extract business/financial data with confidence scores:\n\n${truncatedText}`),
    ]);

    // Build result with proper defaults
    const result: ExtractedDealData = {
      companyName: normalizeField(extracted.companyName, null),
      industry: normalizeField(extracted.industry, null),
      description: normalizeField(extracted.description, 'No description available'),
      revenue: normalizeNumericField(extracted.revenue),
      ebitda: normalizeNumericField(extracted.ebitda),
      ebitdaMargin: normalizeNumericField(extracted.ebitdaMargin),
      revenueGrowth: normalizeNumericField(extracted.revenueGrowth),
      employees: normalizeNumericField(extracted.employees),
      foundedYear: normalizeNumericField(extracted.foundedYear),
      headquarters: normalizeField(extracted.headquarters, null),
      keyRisks: Array.isArray(extracted.keyRisks) ? extracted.keyRisks : [],
      investmentHighlights: Array.isArray(extracted.investmentHighlights) ? extracted.investmentHighlights : [],
      summary: extracted.summary || 'Unable to generate summary from document',
      overallConfidence: 0,
      needsReview: false,
      reviewReasons: [],
    };

    // Calculate overall confidence and determine if review is needed
    const confidenceScores: number[] = [];
    const reviewReasons: string[] = [];

    if (result.companyName.confidence < 70) {
      reviewReasons.push(`Company name uncertain (${result.companyName.confidence}% confidence)`);
    }
    if (result.companyName.value) confidenceScores.push(result.companyName.confidence);

    if (result.industry.confidence < 70) {
      reviewReasons.push(`Industry uncertain (${result.industry.confidence}% confidence)`);
    }
    if (result.industry.value) confidenceScores.push(result.industry.confidence);

    if (result.revenue.value !== null) {
      if (result.revenue.confidence < 70) {
        reviewReasons.push(`Revenue uncertain: ${formatExtractedValue(result.revenue.value)} (${result.revenue.confidence}% confidence)`);
      }
      confidenceScores.push(result.revenue.confidence);
    }

    if (result.ebitda.value !== null) {
      if (result.ebitda.confidence < 70) {
        reviewReasons.push(`EBITDA uncertain: ${formatExtractedValue(result.ebitda.value)} (${result.ebitda.confidence}% confidence)`);
      }
      confidenceScores.push(result.ebitda.confidence);
    }

    result.overallConfidence = confidenceScores.length > 0
      ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
      : 0;

    result.needsReview = reviewReasons.length > 0 || result.overallConfidence < 70;
    result.reviewReasons = reviewReasons;

    log.debug('AI extraction completed (structured output)', {
      companyName: result.companyName.value,
      overallConfidence: result.overallConfidence,
      needsReview: result.needsReview,
    });

    return result;
  } catch (error) {
    log.error('AI extraction error', error);
    return null;
  }
}

/**
 * Convert new format to legacy format for backward compatibility
 */
export function toLegacyFormat(data: ExtractedDealData): LegacyExtractedDealData {
  return {
    companyName: data.companyName.value,
    industry: data.industry.value,
    description: data.description.value,
    revenue: data.revenue.value,
    ebitda: data.ebitda.value,
    ebitdaMargin: data.ebitdaMargin.value,
    revenueGrowth: data.revenueGrowth.value,
    keyRisks: data.keyRisks,
    investmentHighlights: data.investmentHighlights,
    summary: data.summary,
  };
}

// Helper functions
function normalizeField<T>(field: any, defaultValue: T): ExtractedField<T> {
  if (!field || typeof field !== 'object') {
    return { value: defaultValue, confidence: 0 };
  }
  return {
    value: field.value ?? defaultValue,
    confidence: typeof field.confidence === 'number' ? field.confidence : 0,
    source: field.source,
  };
}

function normalizeNumericField(field: any): ExtractedField<number | null> {
  if (!field || typeof field !== 'object') {
    return { value: null, confidence: 0 };
  }
  const value = typeof field.value === 'number' ? field.value : null;
  return {
    value,
    confidence: typeof field.confidence === 'number' ? field.confidence : 0,
    source: field.source,
  };
}
