// apps/api/src/services/webSearch.ts
import { log } from '../utils/logger.js';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// Rotate user agents to reduce fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/**
 * Search DuckDuckGo and extract result snippets.
 * Tries Lite endpoint first, falls back to HTML endpoint.
 * No API key required.
 */
export async function searchWeb(query: string, maxResults = 8): Promise<SearchResult[]> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  // Attempt 1: DDG Lite
  let results = await fetchDDGLite(query, maxResults, ua);
  if (results.length > 0) return results;

  // Attempt 2: DDG HTML (fallback — different endpoint may not be rate-limited)
  results = await fetchDDGHtml(query, maxResults, ua);
  if (results.length > 0) return results;

  // Attempt 3: Retry Lite after 2s delay with different UA
  await new Promise(r => setTimeout(r, 2000));
  const ua2 = USER_AGENTS[(USER_AGENTS.indexOf(ua) + 1) % USER_AGENTS.length];
  results = await fetchDDGLite(query, maxResults, ua2);

  return results;
}

async function fetchDDGLite(query: string, maxResults: number, ua: string): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': ua, 'Accept': 'text/html' },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return [];

    const html = await response.text();
    return parseLiteResults(html, maxResults);
  } catch (error) {
    log.warn('DDG Lite search failed', { query, error: (error as Error).message });
    return [];
  }
}

async function fetchDDGHtml(query: string, maxResults: number, ua: string): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return [];

    const html = await response.text();
    return parseHtmlResults(html, maxResults);
  } catch (error) {
    log.warn('DDG HTML search failed', { query, error: (error as Error).message });
    return [];
  }
}

function parseLiteResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkMatches = [...html.matchAll(/<a[^>]*class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];
  const snippetMatches = [...html.matchAll(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi)];

  for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
    let resultUrl = linkMatches[i][1] || '';
    const title = decodeEntities(linkMatches[i][2].replace(/<[^>]+>/g, '').trim());
    const snippet = snippetMatches[i]
      ? decodeEntities(snippetMatches[i][1].replace(/<[^>]+>/g, '').trim())
      : '';
    resultUrl = extractRealUrl(resultUrl);
    if (title || snippet) results.push({ title, snippet, url: resultUrl });
  }
  return results;
}

function parseHtmlResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split(/class="result results_links/g).slice(1);

  for (const block of blocks) {
    if (results.length >= maxResults) break;
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch ? decodeEntities(snippetMatch[1].replace(/<[^>]+>/g, '').trim()) : '';
    const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    let resultUrl = hrefMatch ? hrefMatch[1] : '';
    resultUrl = extractRealUrl(resultUrl);
    if (title || snippet) results.push({ title, snippet, url: resultUrl });
  }
  return results;
}

function extractRealUrl(url: string): string {
  if (url.includes('uddg=')) {
    const match = url.match(/uddg=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return url;
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
