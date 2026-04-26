// apps/api/src/services/agents/firmResearchAgent/nodes/scrape.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { scrapePageText } from '../../../companyResearcher.js';
import { log } from '../../../../utils/logger.js';
import { normalizeUrl, isPrivateUrl } from '../../../../utils/urlHelpers.js';

const SUBPAGES = [
  '/about', '/about-us', '/team', '/our-team', '/strategy',
  '/portfolio', '/investments', '/sectors', '/contact', '/news',
];

const MAX_TOTAL_CHARS = 20000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'scrape', message, detail };
}

export async function scrapeNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.websiteUrl) {
    steps.push(step('No website URL provided, skipping scrape'));
    return { steps, sources: [] };
  }

  const baseUrl = normalizeUrl(state.websiteUrl);
  if (!baseUrl || isPrivateUrl(baseUrl)) {
    steps.push(step('Invalid or private URL, skipping scrape'));
    return { steps, sources: [] };
  }

  steps.push(step('Starting website scrape', baseUrl));

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), NODE_TIMEOUT_MS)
  );

  const scrapePromise = async (): Promise<{ text: string; sources: string[] }> => {
    const sources: string[] = [];
    let allText = '';

    // Scrape homepage first
    const homepageText = await scrapePageText(baseUrl);
    if (homepageText && homepageText.length > 100) {
      allText += `=== HOMEPAGE ===\n${homepageText}\n\n`;
      sources.push('website:/');
    }

    // Scrape subpages in parallel batches of 4
    const batchSize = 4;
    for (let i = 0; i < SUBPAGES.length; i += batchSize) {
      if (allText.length >= MAX_TOTAL_CHARS) break;
      const batch = SUBPAGES.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (path) => {
          try {
            const pageUrl = new URL(path, baseUrl).href;
            const text = await scrapePageText(pageUrl);
            return { path, text };
          } catch {
            return { path, text: null };
          }
        })
      );

      for (const { path, text } of results) {
        if (text && text.length > 200 && allText.length < MAX_TOTAL_CHARS) {
          allText += `=== ${path.toUpperCase()} PAGE ===\n${text}\n\n`;
          sources.push(`website:${path}`);
        }
      }
    }

    return { text: allText.slice(0, MAX_TOTAL_CHARS), sources };
  };

  const result = await Promise.race([scrapePromise(), timeoutPromise]);

  if (!result) {
    steps.push(step('Scrape timed out after 15s'));
    return { websiteText: '', steps, sources: [] };
  }

  steps.push(step(`Scraped ${result.sources.length} pages`, `${result.text.length} chars total`));
  log.info('Firm research: scrape complete', {
    url: baseUrl,
    pages: result.sources.length,
    chars: result.text.length,
  });

  return {
    websiteText: result.text,
    sources: result.sources,
    steps,
  };
}
