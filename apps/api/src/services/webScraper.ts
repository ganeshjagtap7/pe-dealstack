import { log } from '../utils/logger.js';

export async function scrapeWebsite(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PE-DealStack/1.0)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('Website scrape failed', { url, status: response.status });
      return null;
    }

    const html = await response.text();

    // Strip HTML to plain text
    const text = html
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
      .trim();

    return text.slice(0, 15000); // Limit to 15k chars
  } catch (error) {
    log.error('Web scraping error', { url, error: (error as Error).message });
    return null;
  }
}
