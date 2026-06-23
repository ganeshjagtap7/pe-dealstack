// ─── AI Model Tier Registry ────────────────────────────────────────
// Single source of truth for which model name each task tier uses.
// All call sites import from here instead of hardcoding 'gpt-4o' etc.
//
// Tier mapping (per architecture decision — see Peos AI Model.pdf):
//   tier 1  Claude Sonnet 4.5 (Anthropic direct) / GPT-4o (OpenAI direct) → memos, deal chat, extraction, analysis, meeting prep
//   tier 2  GPT-4.1 (OpenAI direct or OpenRouter)       → classification, vision, insights, signals, enrichment
//   tier 3  GPT-4.1-mini (OpenAI direct or OpenRouter)  → emails, search, quick tasks
//   tier 4  GPT-4.1-nano (OpenAI direct or OpenRouter)  → sentiment, routing
//
// Routing strategy (direct providers preferred; OpenRouter is fallback-only):
//   - Tier 1 prefers Anthropic direct (claude-sonnet-4-6) via @langchain/anthropic
//     when ANTHROPIC_API_KEY is set. Falls back to OpenAI direct ('gpt-4o') when
//     only OPENAI_API_KEY is set. Falls back to OpenRouter ('anthropic/claude-sonnet-4.6')
//     only when neither anthropic nor openai keys are present but OPENROUTER_API_KEY is.
//   - Tier 2-4 prefer OpenAI direct (the gpt-4.1 family: gpt-4.1 / -mini / -nano)
//     whenever OPENAI_API_KEY is set. They route through OpenRouter ("openai/gpt-4.1"
//     plus the SDK base-URL swap in src/openai.ts) ONLY when no direct OpenAI key
//     exists — otherwise OpenRouter's separate credit balance 402s ("Insufficient
//     credits") even while the OpenAI key is healthy. gpt-4.1 (not gpt-4o) is the
//     direct tier-2 model because financial extraction needs a 32K completion
//     budget that gpt-4o (16,384 cap) can't serve.
//   - Per-tier env overrides (LLM_TIER1_MODEL, ...) always win.

import dotenv from 'dotenv';
dotenv.config();

const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
// Single source of truth for routing — prefer direct OpenAI whenever
// OPENAI_API_KEY is present (see isOpenRouterEnabled below). Used both for the
// tier model names here and the SDK base-URL swap in src/openai.ts, so they
// can never disagree about which provider a call lands on.
const useOpenRouter = isOpenRouterEnabled();

export const AI_MODELS = {
  /** Tier 1 — premium reasoning */
  TIER1:
    process.env.LLM_TIER1_MODEL ||
    (hasAnthropic
      ? 'claude-sonnet-4-6'
      : useOpenRouter
        ? 'anthropic/claude-sonnet-4.6'
        : 'gpt-4o'),
  /** Tier 2 — general including vision. Direct path uses gpt-4.1 (NOT gpt-4o):
   *  it supports a 32K-token completion budget that financial extraction needs
   *  for wide monthly grids. gpt-4o caps completions at 16,384 and 400s on the
   *  32K request (see services/financialClassifier.ts). */
  TIER2:
    process.env.LLM_TIER2_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1' : 'gpt-4.1'),
  /** Tier 3 — fast/cheap */
  TIER3:
    process.env.LLM_TIER3_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1-mini' : 'gpt-4.1-mini'),
  /** Tier 4 — ultra-fast/cheap */
  TIER4:
    process.env.LLM_TIER4_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1-nano' : 'gpt-4.1-nano'),
} as const;

// ─── Semantic aliases — use these in call sites ────────────────────

/** Memos, deal chat, financial extraction, analysis */
export const MODEL_REASONING = AI_MODELS.TIER1;

/** Classification, document insights, vision (image understanding) */
export const MODEL_CLASSIFICATION = AI_MODELS.TIER2;
export const MODEL_INSIGHTS = AI_MODELS.TIER2;

/** Emails, search, quick narrative summaries */
export const MODEL_FAST = AI_MODELS.TIER3;

/** Sentiment, routing — cheapest */
export const MODEL_NANO = AI_MODELS.TIER4;

// ─── Provider availability helpers ─────────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouterEnabled(): boolean {
  // OpenRouter is a fallback gateway only: prefer direct OpenAI whenever
  // OPENAI_API_KEY is set. Routing tier 2-4 traffic through OpenRouter bills
  // its separate credit balance and 402s ("Insufficient credits") even when
  // the OpenAI key is healthy — so only fall back to it when there is NO
  // direct OpenAI key to use.
  return !!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY;
}

/**
 * True when ANTHROPIC_API_KEY is present. When true, tier-1 callsites
 * (deal chat, memos, extraction reasoning) route through @langchain/anthropic
 * directly instead of OpenRouter or OpenAI.
 */
export function isAnthropicEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Headers OpenRouter recommends for attribution / rate-limit pools */
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': process.env.APP_URL || 'https://lmmos.ai',
  'X-Title': 'lmmos',
};
