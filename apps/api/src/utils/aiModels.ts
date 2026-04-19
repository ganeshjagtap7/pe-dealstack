// ─── AI Model Tier Registry ────────────────────────────────────────
// Single source of truth for which model name each task tier uses.
// All call sites import from here instead of hardcoding 'gpt-4o' etc.
//
// Tier mapping (per architecture decision — see Peos AI Model.pdf):
//   tier 1  Claude Sonnet 4.5  → memos, deal chat, extraction, analysis, meeting prep
//   tier 2  GPT-4.1            → classification, vision, insights, signals, enrichment
//   tier 3  GPT-4.1-mini       → emails, search, quick tasks
//   tier 4  GPT-4.1-nano       → sentiment, routing
//
// Routed via OpenRouter (OpenAI-compatible API) when OPENROUTER_API_KEY is set.

import dotenv from 'dotenv';
dotenv.config();

export const AI_MODELS = {
  /** Tier 1 — premium reasoning (Claude Sonnet 4.5) */
  TIER1: process.env.LLM_TIER1_MODEL || 'anthropic/claude-sonnet-4.5',
  /** Tier 2 — general (GPT-4.1) including vision */
  TIER2: process.env.LLM_TIER2_MODEL || 'openai/gpt-4.1',
  /** Tier 3 — fast/cheap (GPT-4.1-mini) */
  TIER3: process.env.LLM_TIER3_MODEL || 'openai/gpt-4.1-mini',
  /** Tier 4 — ultra-fast/cheap (GPT-4.1-nano) */
  TIER4: process.env.LLM_TIER4_MODEL || 'openai/gpt-4.1-nano',
} as const;

// ─── Semantic aliases — use these in call sites ────────────────────

/** Memos, deal chat, financial extraction, analysis */
export const MODEL_REASONING = AI_MODELS.TIER1;

/** Vision (image understanding), classification, document insights */
export const MODEL_VISION = AI_MODELS.TIER2;
export const MODEL_CLASSIFICATION = AI_MODELS.TIER2;
export const MODEL_INSIGHTS = AI_MODELS.TIER2;

/** Emails, search, quick narrative summaries */
export const MODEL_FAST = AI_MODELS.TIER3;

/** Sentiment, routing — cheapest */
export const MODEL_NANO = AI_MODELS.TIER4;

// ─── OpenRouter routing helpers ────────────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouterEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Headers OpenRouter recommends for attribution / rate-limit pools */
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': process.env.APP_URL || 'https://pe-dealstack.local',
  'X-Title': 'PE OS',
};
