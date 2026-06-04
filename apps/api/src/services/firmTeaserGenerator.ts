// ─── Firm Teaser Generator ───────────────────────────────────────────
// Claude-facing half of the firm-teaser feature: builds the deal-context +
// prompts and calls the model, parsing the response defensively. Kept separate
// from firmTeaserService.ts (config + DB) to stay under the file-size cap.

import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { anthropic, isClaudeEnabled } from './anthropic.js';
import { formatDealHeadline } from '../utils/financialFormat.js';
import type { TeaserCriterion, TeaserFit, TeaserVerdict } from './firmTeaserTypes.js';

// ─── Constants (no magic strings) ───────────────────────────────────

export const TEASER_MODEL = 'claude-sonnet-4-6';
const TEASER_MAX_TOKENS = 700;
const VALID_VERDICTS: ReadonlySet<string> = new Set(['fit', 'partial', 'miss']);

// Deal fields pulled for the teaser context — mirrors deals-chat-ai.ts so the
// rendered numbers honour the stored unit scale via formatDealHeadline.
export const DEAL_SELECT = `
  id, name, stage, status, industry, dealSize, revenue, ebitda,
  currency, cachedRevenue, cachedEbitda, cachedEbitdaMargin,
  cachedPeriod, cachedCurrency,
  irrProjected, mom, aiThesis, description, source, organizationId,
  company:Company(id, name, description)
`;

export interface DealRow {
  id: string;
  name: string;
  stage?: string | null;
  status?: string | null;
  industry?: string | null;
  dealSize?: number | null;
  revenue?: number | null;
  ebitda?: number | null;
  currency?: string | null;
  cachedRevenue?: number | null;
  cachedEbitda?: number | null;
  cachedEbitdaMargin?: number | null;
  cachedPeriod?: string | null;
  cachedCurrency?: string | null;
  irrProjected?: number | null;
  mom?: number | null;
  aiThesis?: string | null;
  description?: string | null;
  source?: string | null;
  organizationId?: string | null;
  company?:
    | { name?: string | null; description?: string | null }
    | { name?: string | null; description?: string | null }[]
    | null;
}

/** Shape of a settings-config preview profile (no id/updatedAt required). */
export type PreviewProfile = {
  name?: string;
  systemPrompt: string;
  criteria: TeaserCriterion[];
};

/** Load the org-scoped deal row used to build a teaser. Throws if not found. */
export async function loadDealForTeaser(dealId: string, orgId: string): Promise<DealRow> {
  const { data: deal, error } = await supabase
    .from('Deal')
    .select(DEAL_SELECT)
    .eq('id', dealId)
    .eq('organizationId', orgId)
    .single();

  if (error || !deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }
  return deal as unknown as DealRow;
}

// ─── Deal context ───────────────────────────────────────────────────

/** Normalize Supabase's company join (object or single-element array). */
function getCompany(deal: DealRow): { name?: string | null; description?: string | null } | null {
  const c = deal.company;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

/** Build a compact deal-context string for the teaser prompt. */
function buildDealContext(deal: DealRow): string {
  const parts = [`Deal: ${deal.name}`];
  if (deal.stage || deal.status) parts.push(`Stage: ${deal.stage ?? '—'}, Status: ${deal.status ?? '—'}`);
  if (deal.industry) parts.push(`Industry: ${deal.industry}`);

  const headline = formatDealHeadline(deal);
  if (headline.dealSize) parts.push(`Deal Size: ${headline.dealSize}`);
  if (headline.revenue) {
    const periodNote = headline.cachedPeriod ? ` (${headline.cachedPeriod})` : '';
    parts.push(`Revenue: ${headline.revenue}${periodNote}`);
  }
  if (headline.ebitda) {
    const periodNote = headline.cachedPeriod ? ` (${headline.cachedPeriod})` : '';
    parts.push(`EBITDA: ${headline.ebitda}${periodNote}`);
  }
  if (headline.ebitdaMargin) parts.push(`EBITDA Margin: ${headline.ebitdaMargin}`);
  if (deal.irrProjected != null) parts.push(`Projected IRR: ${deal.irrProjected}%`);
  if (deal.mom != null) parts.push(`MoM: ${deal.mom}x`);
  if (deal.source) parts.push(`Deal Source: ${deal.source}`);
  if (deal.aiThesis) parts.push(`Investment Thesis: ${deal.aiThesis}`);

  const company = getCompany(deal);
  if (company?.name) parts.push(`Company: ${company.name}`);
  if (company?.description) parts.push(`Description: ${company.description}`);

  return parts.join('\n');
}

/** Render the profile's criteria as "label: value" lines for the prompt. */
function renderCriteria(criteria: TeaserCriterion[]): string {
  if (!criteria?.length) return '(no specific criteria provided)';
  return criteria.map((c) => `- ${c.label}: ${c.value}`).join('\n');
}

// ─── Response parsing ───────────────────────────────────────────────

/** Strip ```json fences and trim, so JSON.parse sees clean text. */
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}

/** Coerce an unknown parsed value into a typed TeaserFit[]. */
function coerceFits(raw: unknown): TeaserFit[] {
  if (!Array.isArray(raw)) return [];
  const out: TeaserFit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const criterion = typeof obj.criterion === 'string' ? obj.criterion : '';
    const verdictRaw = typeof obj.verdict === 'string' ? obj.verdict.toLowerCase() : '';
    const verdict = (VALID_VERDICTS.has(verdictRaw) ? verdictRaw : 'partial') as TeaserVerdict;
    const note = typeof obj.note === 'string' ? obj.note : '';
    if (!criterion && !note) continue;
    out.push({ criterion, verdict, note });
  }
  return out;
}

/** Extract concatenated text from an Anthropic messages.create response. */
function extractResponseText(content: Array<{ type: string; text?: string }>): string {
  let text = '';
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') text += block.text;
  }
  return text;
}

// ─── Generation ─────────────────────────────────────────────────────

interface GenerateArgs {
  deal: DealRow;
  profile: PreviewProfile;
  today: string;
}

/**
 * Build the system + user prompts and call Claude. Returns the parsed headline +
 * fits. Parses defensively — on JSON-parse failure, falls back to using the raw
 * text as the headline rather than throwing.
 *
 * `today` MUST be computed at call time (new Date()) and injected into the
 * system prompt — there is a standing repo rule that the model never infers the
 * current date itself.
 */
export async function generateTeaser({
  deal,
  profile,
  today,
}: GenerateArgs): Promise<{ headline: string; fits: TeaserFit[] }> {
  if (!isClaudeEnabled() || !anthropic) {
    throw new Error('Claude is not enabled (ANTHROPIC_API_KEY missing)');
  }

  const profileName = profile.name?.trim() || 'Investment Profile';
  const system = [
    `Today's date is ${today}.`,
    '',
    'You are an internal private-equity analyst writing a short TRIAGE teaser for',
    'your own deal team. The teaser explains how a target company fits one of the',
    `firm's named investment-criteria profiles — and the catch. This is INTERNAL`,
    'triage voice ("why this fits us, and the catch"), NOT outbound marketing.',
    '',
    `=== INVESTMENT PROFILE: ${profileName} ===`,
    profile.systemPrompt?.trim() || '(no additional profile guidance provided)',
    '',
    'Profile criteria to assess:',
    renderCriteria(profile.criteria),
    '',
    'Assess the deal against EACH criterion above. For each, decide a verdict of',
    '"fit" (clearly meets it), "partial" (partially / unclear), or "miss" (clearly',
    'fails it) and write a short, specific note grounded in the deal data.',
    '',
    'Then write ONE punchy headline (a single sentence) that names the STRONGEST',
    'fit AND the main catch — e.g. "Fits your B2B SaaS focus and $25-75M check band,',
    'but priced at 9x EBITDA vs your usual 6-7x." Be concrete; cite the deal numbers',
    'when relevant. Do not invent data that is not provided.',
    '',
    'Return STRICT JSON only — no prose, no markdown fences — in exactly this shape:',
    '{"headline": string, "fits": [{"criterion": string, "verdict": "fit"|"partial"|"miss", "note": string}]}',
  ].join('\n');

  const content = `Here is the deal to assess against the "${profileName}" profile:\n\n${buildDealContext(deal)}`;

  const response = await anthropic.messages.create({
    model: TEASER_MODEL,
    max_tokens: TEASER_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content }],
  });

  const rawText = extractResponseText(response.content as Array<{ type: string; text?: string }>);
  const cleaned = stripJsonFences(rawText);

  if (!cleaned) {
    log.warn('firmTeaser: empty Claude response', { dealId: deal.id });
    return { headline: 'Teaser unavailable — empty model response.', fits: [] };
  }

  try {
    const parsed = JSON.parse(cleaned) as { headline?: unknown; fits?: unknown };
    const headline =
      typeof parsed.headline === 'string' && parsed.headline.trim()
        ? parsed.headline.trim()
        : rawText.trim();
    return { headline, fits: coerceFits(parsed.fits) };
  } catch (err) {
    // Defensive fallback — never throw on a parse miss; surface the raw text.
    log.warn('firmTeaser: JSON parse failed, falling back to raw text', {
      dealId: deal.id,
      error: err instanceof Error ? err.message : String(err),
      sample: cleaned.slice(0, 200),
    });
    return { headline: rawText.trim(), fits: [] };
  }
}
