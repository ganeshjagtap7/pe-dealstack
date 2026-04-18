/**
 * PE OS — URL Validation & Normalization Helpers
 *
 * Shared utilities for validating LinkedIn, social media, and website URLs.
 * Handles country subdomains (in.linkedin.com, uk.linkedin.com),
 * protocol normalization, and SSRF prevention.
 */

/**
 * Normalize a URL — add https:// if missing, trim whitespace.
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized) return '';
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  // Validate it's a real URL
  try {
    new URL(normalized);
  } catch {
    return '';
  }
  return normalized;
}

/**
 * Check if a URL is a valid LinkedIn profile URL.
 * Accepts all LinkedIn subdomains: www, in, uk, de, fr, br, etc.
 * Accepts /in/ (personal) and /company/ (company page) paths.
 */
export function isLinkedInUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    // Accept any subdomain of linkedin.com
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('linkedin.com')) return false;
    // Must have /in/ or /company/ path
    return /^\/(in|company)\/[^/?#]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Extract LinkedIn profile slug from URL.
 * "https://in.linkedin.com/in/devlikesbizness" → "devlikesbizness"
 * "linkedin.com/company/pocket-fund" → "pocket-fund"
 */
export function extractLinkedInSlug(url: string): string | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const match = normalized.match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
  return match ? match[2] : null;
}

/**
 * Check if a URL points to a private/internal IP (SSRF prevention).
 */
export function isPrivateUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return true; // Invalid URLs are treated as private
  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    );
  } catch {
    return true;
  }
}

/**
 * Extract the base domain from a URL, stripping subdomains.
 * "https://www.pocket-fund.com/about" → "pocket-fund.com"
 * "https://in.linkedin.com/in/dev" → "linkedin.com"
 */
export function extractBaseDomain(url: string): string {
  const normalized = normalizeUrl(url);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    const parts = parsed.hostname.split('.');
    // Handle domains like co.uk, com.au etc.
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

/**
 * Extract a readable name from a domain.
 * "pocket-fund.com" → "Pocket-fund"
 * "www.meridian.com" → "Meridian"
 */
export function extractNameFromDomain(url: string): string {
  const domain = extractBaseDomain(url);
  if (!domain) return '';
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Check if a URL is a known social media domain.
 */
export function isSocialMediaUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  try {
    const domain = extractBaseDomain(normalized);
    const socialDomains = [
      'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
      'tiktok.com', 'threads.net', 'reddit.com',
    ];
    return socialDomains.includes(domain);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is high-value for scraping (articles, press, databases).
 */
export function isHighValueUrl(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  const domain = extractBaseDomain(normalized);
  const path = new URL(normalized).pathname.toLowerCase();

  // High value domains
  const highValueDomains = [
    'crunchbase.com', 'pitchbook.com', 'wellfound.com',
    'techcrunch.com', 'forbes.com', 'bloomberg.com',
    'businessinsider.com', 'axios.com', 'pehub.com',
  ];
  if (highValueDomains.includes(domain)) return true;

  // High value paths (on any domain)
  const highValuePaths = ['/blog/', '/news/', '/press/', '/article/', '/story/', '/post/'];
  if (highValuePaths.some(p => path.includes(p))) return true;

  // Skip social media, PDFs, search pages
  if (isSocialMediaUrl(url)) return false;
  if (path.endsWith('.pdf')) return false;
  if (domain === 'google.com' || domain === 'duckduckgo.com') return false;

  return false;
}
