import { openai, isAIEnabled } from '../openai.js';

// Schema for extracted deal data
export interface ExtractedDealData {
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

const EXTRACTION_SYSTEM_PROMPT = `You are a senior private equity analyst. Analyze this document and extract key business and financial data. Return valid JSON matching the specified schema. If data is not found, use null for optional fields or empty arrays for list fields.

Return JSON with exactly this structure:
{
  "companyName": string or null - The company name mentioned in the document,
  "industry": string or null - The industry/sector (e.g., "Healthcare", "Technology", "Manufacturing"),
  "description": string - A 1-2 sentence description of what the company does,
  "revenue": number or null - Annual revenue in millions USD (e.g., 50 means $50M),
  "ebitda": number or null - EBITDA in millions USD,
  "ebitdaMargin": number or null - EBITDA margin as percentage (e.g., 25 means 25%),
  "revenueGrowth": number or null - Year-over-year revenue growth as percentage,
  "keyRisks": string[] - List of 2-5 key risks or concerns,
  "investmentHighlights": string[] - List of 2-5 positive investment highlights,
  "summary": string - A 2-3 sentence executive summary of the investment opportunity
}

Important:
- Extract only what is explicitly stated or clearly implied in the document
- For financial figures, convert to millions USD if given in other units
- If the document doesn't contain enough information, still provide a summary based on what's available
- Be concise and professional in your descriptions`;

/**
 * Extract structured deal data from document text using AI
 * @param text - The extracted text from the document
 * @returns Extracted deal data or null if extraction fails
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
    // Truncate text to first 15,000 characters to stay within token limits
    const truncatedText = text.slice(0, 15000);

    console.log(`Starting AI extraction for ${truncatedText.length} characters...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Analyze this document and extract the key business and financial data:\n\n${truncatedText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for more consistent extraction
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('AI extraction failed: No response content');
      return null;
    }

    const extracted = JSON.parse(content) as ExtractedDealData;

    // Validate required fields have at least default values
    const result: ExtractedDealData = {
      companyName: extracted.companyName || null,
      industry: extracted.industry || null,
      description: extracted.description || 'No description available',
      revenue: typeof extracted.revenue === 'number' ? extracted.revenue : null,
      ebitda: typeof extracted.ebitda === 'number' ? extracted.ebitda : null,
      ebitdaMargin: typeof extracted.ebitdaMargin === 'number' ? extracted.ebitdaMargin : null,
      revenueGrowth: typeof extracted.revenueGrowth === 'number' ? extracted.revenueGrowth : null,
      keyRisks: Array.isArray(extracted.keyRisks) ? extracted.keyRisks : [],
      investmentHighlights: Array.isArray(extracted.investmentHighlights) ? extracted.investmentHighlights : [],
      summary: extracted.summary || 'Unable to generate summary from document',
    };

    console.log('AI extraction completed successfully:', {
      companyName: result.companyName,
      industry: result.industry,
      hasFinancials: result.revenue !== null || result.ebitda !== null,
      risksCount: result.keyRisks.length,
      highlightsCount: result.investmentHighlights.length,
    });

    return result;
  } catch (error) {
    console.error('AI extraction error:', error);
    return null;
  }
}
