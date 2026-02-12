import { log } from '../utils/logger.js';

const EXTRACTOR_URL = process.env.EXTRACTOR_URL || 'http://localhost:5050';

export interface DeepExtractionResult {
  success: boolean;
  dealData: {
    companyName: string | null;
    industry: string | null;
    revenue: number | null;
    ebitda: number | null;
    ebitdaMargin: number | null;
    revenueGrowth: number | null;
    employees: number | null;
    headquarters: string | null;
    keyRisks: string[];
    investmentHighlights: string[];
    financialMetrics: any[];
    sourceGroundings: any[];
  };
  rawExtractions: any[];
  extractionCount: number;
}

export async function deepExtract(text: string): Promise<DeepExtractionResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${EXTRACTOR_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model: 'gemini-2.5-flash',
        extraction_passes: 3,
        max_workers: 10,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error('LangExtract service returned error', { status: response.status });
      return null;
    }

    return await response.json() as DeepExtractionResult;
  } catch (error) {
    log.warn('LangExtract service unavailable, will fallback', error as Error);
    return null;
  }
}

export async function isExtractorHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${EXTRACTOR_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export function isDeepExtractionAvailable(): boolean {
  return !!process.env.EXTRACTOR_URL;
}
