import { openai, isAIEnabled } from '../openai.js';

// Schema for extracted deal data with confidence scores
export interface ExtractedField<T> {
  value: T;
  confidence: number; // 0-100
  source?: string; // Quote from document supporting extraction
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
  overallConfidence: number; // Average confidence score
  needsReview: boolean; // True if any key field has low confidence
  reviewReasons: string[]; // Why review is needed
}

// Legacy interface for backwards compatibility
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

Return JSON with this exact structure:
{
  "companyName": {
    "value": string or null,
    "confidence": number (0-100),
    "source": "quote from document if confidence < 90"
  },
  "industry": {
    "value": string or null (e.g., "Healthcare Services", "Enterprise Software", "Industrial Manufacturing"),
    "confidence": number (0-100),
    "source": "quote if needed"
  },
  "description": {
    "value": string - 2-3 sentence business description,
    "confidence": number (0-100)
  },
  "revenue": {
    "value": number or null - Annual revenue in millions USD,
    "confidence": number (0-100),
    "source": "quote showing revenue figure"
  },
  "ebitda": {
    "value": number or null - EBITDA in millions USD,
    "confidence": number (0-100),
    "source": "quote showing EBITDA"
  },
  "ebitdaMargin": {
    "value": number or null - EBITDA margin as percentage (e.g., 25.5 means 25.5%),
    "confidence": number (0-100)
  },
  "revenueGrowth": {
    "value": number or null - YoY revenue growth percentage,
    "confidence": number (0-100),
    "source": "quote if available"
  },
  "employees": {
    "value": number or null - Employee count,
    "confidence": number (0-100)
  },
  "foundedYear": {
    "value": number or null - Year company was founded,
    "confidence": number (0-100)
  },
  "headquarters": {
    "value": string or null - City, State or City, Country,
    "confidence": number (0-100)
  },
  "keyRisks": ["risk 1", "risk 2", ...] - 3-5 key investment risks,
  "investmentHighlights": ["highlight 1", ...] - 3-5 positive investment points,
  "summary": string - 3-4 sentence executive summary of the opportunity
}

COMMON PATTERNS TO LOOK FOR:
- Revenue: "revenue of $X", "sales of $X", "top-line of $X", "$X in revenue"
- EBITDA: "EBITDA of $X", "Adjusted EBITDA", "run-rate EBITDA"
- Company Name: Usually in header, "Company Overview", or "About [Company]"
- Industry: Look for sector descriptions, market focus, business type

FINANCIAL CONVERSION:
- "50 million" or "$50M" or "$50,000,000" = 50
- "1.5 billion" or "$1.5B" = 1500
- Remove commas and convert to number`;

/**
 * Extract structured deal data from document text using AI
 * Returns data with confidence scores for manual review
 */
export async function extractDealDataFromText(text: string): Promise<ExtractedDealData | null> {
  if (!isAIEnabled() || !openai) {
    console.warn('AI extraction skipped: OpenAI not configured');
    return null;
  }

  if (!text || text.trim().length < 100) {
    console.warn('AI extraction skipped: Text too short for meaningful analysis');
    return null;
  }

  try {
    // Use more text for better extraction (up to 20,000 chars)
    const truncatedText = text.slice(0, 20000);

    console.log(`[AI Extraction] Starting for ${truncatedText.length} characters...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Analyze this document and extract business/financial data with confidence scores:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Very low for consistency
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[AI Extraction] Failed: No response content');
      return null;
    }

    const extracted = JSON.parse(content);

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

    // Check critical fields
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
        reviewReasons.push(`Revenue uncertain: $${result.revenue.value}M (${result.revenue.confidence}% confidence)`);
      }
      confidenceScores.push(result.revenue.confidence);
    }

    if (result.ebitda.value !== null) {
      if (result.ebitda.confidence < 70) {
        reviewReasons.push(`EBITDA uncertain: $${result.ebitda.value}M (${result.ebitda.confidence}% confidence)`);
      }
      confidenceScores.push(result.ebitda.confidence);
    }

    // Calculate average confidence
    result.overallConfidence = confidenceScores.length > 0
      ? Math.round(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length)
      : 0;

    result.needsReview = reviewReasons.length > 0 || result.overallConfidence < 70;
    result.reviewReasons = reviewReasons;

    console.log('[AI Extraction] Completed:', {
      companyName: result.companyName.value,
      companyConfidence: result.companyName.confidence,
      industry: result.industry.value,
      industryConfidence: result.industry.confidence,
      revenue: result.revenue.value,
      revenueConfidence: result.revenue.confidence,
      ebitda: result.ebitda.value,
      ebitdaConfidence: result.ebitda.confidence,
      overallConfidence: result.overallConfidence,
      needsReview: result.needsReview,
      reviewReasons: result.reviewReasons,
    });

    return result;
  } catch (error) {
    console.error('[AI Extraction] Error:', error);
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
