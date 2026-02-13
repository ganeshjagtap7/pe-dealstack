import { log } from '../utils/logger.js';

export interface ResearchResult {
  companyWebsite: {
    aboutText: string | null;
    teamText: string | null;
    productText: string | null;
    scrapedPages: string[];
  };
  enrichedData: {
    description?: string;
    foundedYear?: number;
    headquarters?: string;
    employeeCount?: number;
    website?: string;
    linkedinUrl?: string;
    keyPeople?: Array<{ name: string; title: string }>;
  };
}

/**
 * Scrape a single page and return cleaned text.
 * Has 8s timeout. Strips boilerplate (nav, header, footer, scripts).
 */
export async function scrapePageText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PE-DealStack/1.0; +https://dealstack.ai)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return null;
  }
}

/**
 * Research a company by scraping multiple pages from their website.
 * Tries common page paths: /about, /team, /products, /company, etc.
 * Scrapes in parallel batches of 4 with 8s timeout per page.
 */
export async function researchCompany(baseUrl: string): Promise<ResearchResult> {
  log.info('Starting company research', { baseUrl });

  // Normalize URL
  let url = baseUrl.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  if (url.endsWith('/')) url = url.slice(0, -1);

  const pagePaths = [
    '',             // Homepage
    '/about',
    '/about-us',
    '/company',
    '/team',
    '/our-team',
    '/leadership',
    '/products',
    '/services',
    '/what-we-do',
  ];

  const results: Record<string, string> = {};
  const scrapedPages: string[] = [];

  // Scrape pages in parallel (max 4 concurrent)
  const batchSize = 4;
  for (let i = 0; i < pagePaths.length; i += batchSize) {
    const batch = pagePaths.slice(i, i + batchSize);
    const promises = batch.map(async (path) => {
      const fullUrl = `${url}${path}`;
      const text = await scrapePageText(fullUrl);
      if (text && text.length > 200) {
        results[path || '/'] = text;
        scrapedPages.push(fullUrl);
      }
    });
    await Promise.all(promises);
  }

  log.info('Company research complete', {
    baseUrl,
    pagesScraped: scrapedPages.length,
    totalChars: Object.values(results).reduce((sum, t) => sum + t.length, 0),
  });

  return {
    companyWebsite: {
      aboutText: results['/about'] || results['/about-us'] || results['/company'] || null,
      teamText: results['/team'] || results['/our-team'] || results['/leadership'] || null,
      productText: results['/products'] || results['/services'] || results['/what-we-do'] || null,
      scrapedPages,
    },
    enrichedData: {
      website: url,
    },
  };
}

/**
 * Build a comprehensive research text from scraped pages for AI extraction.
 * Combines about, products, and team sections with clear labels.
 */
export function buildResearchText(research: ResearchResult): string {
  let text = '';

  if (research.companyWebsite.aboutText) {
    text += `=== ABOUT THE COMPANY ===\n${research.companyWebsite.aboutText}\n\n`;
  }
  if (research.companyWebsite.productText) {
    text += `=== PRODUCTS/SERVICES ===\n${research.companyWebsite.productText}\n\n`;
  }
  if (research.companyWebsite.teamText) {
    text += `=== LEADERSHIP TEAM ===\n${research.companyWebsite.teamText}\n\n`;
  }

  return text;
}
