// apps/api/src/services/webSearch.ts
import { log } from '../utils/logger.js';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search DuckDuckGo Lite and extract result snippets.
 * No API key required. Returns top N results.
 * Uses lite.duckduckgo.com (more reliable than html.duckduckgo.com).
 * Retries once on failure with 2s delay.
 */
export async function searchWeb(query: string, maxResults = 8): Promise<SearchResult[]> {
  const attempt = async (): Promise<SearchResult[]> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) return [];

      const html = await response.text();
      return parseLiteResults(html, maxResults);
    } catch (error) {
      log.warn('DuckDuckGo search failed', { query, error: (error as Error).message });
      return [];
    }
  };

  // First attempt
  let results = await attempt();
  if (results.length === 0) {
    // Retry once after 2s
    await new Promise(r => setTimeout(r, 2000));
    results = await attempt();
  }
  return results;
}

/**
 * Parse DuckDuckGo Lite HTML results.
 * Lite uses: <a class="result-link"> for titles, <td class="result-snippet"> for snippets.
 */
function parseLiteResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract all result links (titles)
  const linkMatches = [...html.matchAll(/<a[^>]*class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];
  // Extract all result snippets
  const snippetMatches = [...html.matchAll(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi)];

  for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
    const linkMatch = linkMatches[i];
    let resultUrl = linkMatch[1] || '';
    const title = decodeEntities(linkMatch[2].replace(/<[^>]+>/g, '').trim());
    const snippet = snippetMatches[i]
      ? decodeEntities(snippetMatches[i][1].replace(/<[^>]+>/g, '').trim())
      : '';

    // DDG lite wraps URLs in redirect — extract the actual URL
    if (resultUrl.includes('uddg=')) {
      const uddgMatch = resultUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) resultUrl = decodeURIComponent(uddgMatch[1]);
    }

    if (title || snippet) {
      results.push({ title, snippet, url: resultUrl });
    }
  }

  return results;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
