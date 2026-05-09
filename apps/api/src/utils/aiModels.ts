// ─── AI Model Tier Registry ────────────────────────────────────────
// Single source of truth for which model name each task tier uses.
// All call sites import from here instead of hardcoding 'gpt-4o' etc.
//
// Tier mapping (per architecture decision — see Peos AI Model.pdf):
//   tier 1  Claude Sonnet 4.5 (OpenRouter) / GPT-4o (direct)  → memos, deal chat, extraction, analysis, meeting prep
//   tier 2  GPT-4.1 (OpenRouter) / GPT-4o (direct)            → classification, vision, insights, signals, enrichment
//   tier 3  GPT-4.1-mini (OpenRouter) / GPT-4o-mini (direct)  → emails, search, quick tasks
//   tier 4  GPT-4.1-nano (OpenRouter) / GPT-4o-mini (direct)  → sentiment, routing
//
// Routing strategy:
//   - If OPENROUTER_API_KEY is set, the `openai` SDK in src/openai.ts is
//     pointed at openrouter.ai and the prefixed names below ("anthropic/...",
//     "openai/gpt-4.1") route through OpenRouter to the right model.
//   - If only OPENAI_API_KEY is set, the SDK hits api.openai.com directly
//     and the prefixed names would fail with "400 invalid model ID". So the
//     defaults are chosen at module-eval time based on which backend is
//     active — no call site needs to branch.
//   - Per-tier env overrides (LLM_TIER1_MODEL, ...) always win.

import dotenv from 'dotenv';
dotenv.config();

const useOpenRouter = !!process.env.OPENROUTER_API_KEY;

export const AI_MODELS = {
  /** Tier 1 — premium reasoning */
  TIER1:
    process.env.LLM_TIER1_MODEL ||
    (useOpenRouter ? 'anthropic/claude-sonnet-4.5' : 'gpt-4o'),
  /** Tier 2 — general including vision */
  TIER2:
    process.env.LLM_TIER2_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1' : 'gpt-4o'),
  /** Tier 3 — fast/cheap */
  TIER3:
    process.env.LLM_TIER3_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1-mini' : 'gpt-4o-mini'),
  /** Tier 4 — ultra-fast/cheap */
  TIER4:
    process.env.LLM_TIER4_MODEL ||
    (useOpenRouter ? 'openai/gpt-4.1-nano' : 'gpt-4o-mini'),
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

// ─── OpenRouter routing helpers ────────────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function isOpenRouterEnabled(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Headers OpenRouter recommends for attribution / rate-limit pools */
export const OPENROUTER_HEADERS = {
  'HTTP-Referer': process.env.APP_URL || 'https://lmmos.ai',
  'X-Title': 'lmmos',
};
