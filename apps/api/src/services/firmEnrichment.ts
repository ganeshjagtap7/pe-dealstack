import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from './llm.js';
import { scrapeWebsite } from './webScraper.js';
import { log } from '../utils/logger.js';

// Structured output schema for GPT-4o extraction
const FirmProfileSchema = z.object({
  description: z.string().describe('1-2 sentence summary of the firm'),
  strategy: z.string().describe('Investment strategy (e.g., buyout, growth equity, venture, search fund)'),
  sectors: z.array(z.string()).describe('Industry sectors the firm focuses on'),
  checkSizeRange: z.string().optional().describe('Typical check size or fund size range (e.g., "$50M-$200M")'),
  aum: z.string().optional().describe('Assets under management if mentioned'),
  teamSize: z.string().optional().describe('Approximate team size if mentioned'),
  headquarters: z.string().optional().describe('Location / HQ if mentioned'),
  portfolioExamples: z.array(z.string()).optional().describe('Names of portfolio companies if mentioned'),
  investmentCriteria: z.string().optional().describe('What they look for in deals'),
  foundedYear: z.string().optional().describe('Year founded if mentioned'),
});

export type FirmProfile = z.infer<typeof FirmProfileSchema>;

export interface EnrichmentInput {
  websiteUrl?: string;
  linkedinUrl?: string;
  firmName?: string;
}

export interface EnrichmentResult {
  success: boolean;
  profile: FirmProfile | null;
  sources: string[];
  error?: string;
}

/**
 * Enrich a firm profile by scraping their website and using GPT-4o
 * to extract structured information about the firm.
 */
export async function enrichFirmProfile(input: EnrichmentInput): Promise<EnrichmentResult> {
  const sources: string[] = [];
  let websiteText = '';
  let linkedinContext = '';

  // 1. Scrape website
  if (input.websiteUrl) {
    const url = normalizeUrl(input.websiteUrl);
    const text = await scrapeWebsite(url);
    if (text) {
      websiteText = text;
      sources.push('website');
      log.info('Firm enrichment: website scraped', { url, chars: text.length });
    }

    // Also try /about and /team pages
    for (const path of ['/about', '/about-us', '/team', '/our-team', '/strategy']) {
      try {
        const pageUrl = new URL(path, url).href;
        const pageText = await scrapeWebsite(pageUrl);
        if (pageText && pageText.length > 200) {
          websiteText += '\n\n--- ' + path.toUpperCase() + ' PAGE ---\n' + pageText;
          sources.push(`website${path}`);
        }
      } catch {
        // Skip invalid URLs
      }
    }
  }

  // 2. LinkedIn context (can't scrape, but include URL for GPT training data inference)
  if (input.linkedinUrl) {
    linkedinContext = `LinkedIn profile URL: ${input.linkedinUrl}`;
    sources.push('linkedin_url');
  }

  // 3. If no content at all, return early
  if (!websiteText && !linkedinContext) {
    return {
      success: false,
      profile: null,
      sources: [],
      error: 'Could not fetch website content. Please check the URL.',
    };
  }

  // 4. Send to GPT-4o for structured extraction
  try {
    const model = getChatModel(0.1, 2000);
    const structuredModel = model.withStructuredOutput(FirmProfileSchema);

    const systemPrompt = `You are a private equity research analyst. Extract structured information about an investment firm from their website content.

Rules:
- Only include information that is clearly stated or strongly implied in the source text.
- For sectors, use standard PE categories: Healthcare, Industrials, Software, Consumer, Financial, Tech-enabled services, Energy, Real Estate, Infrastructure, etc.
- For strategy, use standard terms: Buyout, Growth Equity, Venture Capital, Search Fund, Mezzanine, Distressed, Credit, Multi-Strategy, etc.
- If information is not found, leave the field empty or omit it.
- Be concise and factual.`;

    const userPrompt = `Extract the firm profile for "${input.firmName || 'this firm'}" from the following sources:

${websiteText ? `=== WEBSITE CONTENT ===\n${websiteText.slice(0, 12000)}` : ''}

${linkedinContext ? `\n=== LINKEDIN ===\n${linkedinContext}` : ''}

Extract: description, strategy, sectors, check size, AUM, team size, HQ, portfolio examples, investment criteria, founded year.`;

    const result = await structuredModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    log.info('Firm enrichment: GPT extraction complete', {
      firmName: input.firmName,
      sectors: result.sectors?.length,
      strategy: result.strategy,
    });

    return { success: true, profile: result as FirmProfile, sources };
  } catch (error) {
    log.error('Firm enrichment: GPT extraction failed', {
      error: (error as Error).message,
    });
    return {
      success: false,
      profile: null,
      sources,
      error: 'AI extraction failed. Your data has been saved — we\'ll try again later.',
    };
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}
