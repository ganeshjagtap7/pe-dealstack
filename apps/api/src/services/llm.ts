// ─── Unified LLM Abstraction Layer ─────────────────────────────────
// Provides a single interface to swap between OpenAI / Gemini via config.
// Uses LangChain as the abstraction so all downstream code is model-agnostic.

import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { log } from '../utils/logger.js';
import {
  AI_MODELS,
  OPENROUTER_BASE_URL,
  OPENROUTER_HEADERS,
  isOpenRouterEnabled,
} from '../utils/aiModels.js';
import { recordUsageEvent } from './usage/trackedLLM.js';
import { enforceUserGate, UserBlockedError } from './usage/enforcement.js';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export { UserBlockedError } from './usage/enforcement.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ─────────────────────────────────────────────────

export type LLMProvider = 'openai' | 'gemini';

interface LLMConfig {
  /** Primary provider for chat/analysis */
  chatProvider: LLMProvider;
  /** Provider for fast/cheap tasks (sentiment, classification) */
  fastProvider: LLMProvider;
  /** Provider for embeddings — always Gemini (gemini-embedding-001) */
  embeddingProvider: 'gemini';
}

// Default: OpenAI for chat, OpenAI-mini for fast, Gemini for embeddings
const config: LLMConfig = {
  chatProvider: (process.env.LLM_CHAT_PROVIDER as LLMProvider) || 'openai',
  fastProvider: (process.env.LLM_FAST_PROVIDER as LLMProvider) || 'openai',
  embeddingProvider: 'gemini',
};

// ─── Model Registry ────────────────────────────────────────────────

// When OpenRouter is enabled, model strings are OpenRouter IDs
// (e.g. "anthropic/claude-sonnet-4.5") routed through the OpenAI-compatible
// ChatOpenAI client below. Otherwise we fall back to bare OpenAI model names.
const useOpenRouter = isOpenRouterEnabled();

// ─── Usage Tracking Adapter ────────────────────────────────────────

/**
 * Wrap a BaseChatModel so every LLM API call records a UsageEvent.
 *
 * Two-layer approach:
 *
 * 1. LangChain callback handler (handleLLMEnd / handleLLMError)
 *    Fires for EVERY underlying LLM call regardless of how the model is
 *    invoked — direct `.invoke()`, chained operators, or wrapped via
 *    `.withStructuredOutput(schema).invoke(input)`. This is the primary
 *    recording path for all 14 structured-output callsites.
 *
 * 2. Patched `.invoke()` — user-gate enforcement only.
 *    The gate (isBlocked check) runs synchronously before the HTTP-path
 *    model calls. For structured-output chains, the chain calls the
 *    underlying model directly and bypasses this patch — so gate
 *    enforcement for those paths is best-effort post-hoc via the
 *    runaway monitor and the existing 30s flag cache. This trade-off is
 *    acceptable because block enforcement at ingestion (HTTP middleware)
 *    already prevents the request from reaching the LLM service.
 *
 * Provider widening: includes 'gemini' so Gemini-backed models are tagged
 * correctly (previously always recorded as 'openai').
 */
function trackModel(model: BaseChatModel, operation: string, modelName: string): BaseChatModel {
  const provider: 'openrouter' | 'openai' | 'gemini' =
    (model as any).constructor?.name?.includes('Google') ? 'gemini' :
    useOpenRouter ? 'openrouter' : 'openai';

  // 1. Attach a callback handler that fires for every LLM API call,
  //    including nested calls inside withStructuredOutput chains.
  const handler: Partial<BaseCallbackHandler> = {
    name: 'usage-tracker',
    handleLLMEnd(output: any) {
      const gen0 = output?.generations?.[0]?.[0]?.message;
      const usage =
        gen0?.usage_metadata ??
        output?.llmOutput?.tokenUsage ??
        output?.llmOutput?.usage ??
        null;
      void recordUsageEvent({
        operation,
        model: modelName,
        provider,
        promptTokens:
          usage?.input_tokens ?? usage?.promptTokens ?? usage?.prompt_tokens ?? 0,
        completionTokens:
          usage?.output_tokens ?? usage?.completionTokens ?? usage?.completion_tokens ?? 0,
        status: 'success',
      });
    },
    handleLLMError(err: any) {
      void recordUsageEvent({
        operation,
        model: modelName,
        provider,
        promptTokens: 0,
        completionTokens: 0,
        status: 'error',
        metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
      });
    },
  };

  const existingCallbacks = ((model as any).callbacks as any[] | undefined) ?? [];
  (model as any).callbacks = [...existingCallbacks, handler];

  // 2. Keep the .invoke patch ONLY for the synchronous block gate.
  //    The callback handler above already records usage — we do NOT
  //    double-record from inside the patched invoke.
  const originalInvoke = model.invoke.bind(model);
  model.invoke = async (input: any, options?: any) => {
    await enforceUserGate(operation, modelName, provider);
    return originalInvoke(input, options);
  };

  return model;
}

const MODELS = {
  openai: {
    chat: process.env.LLM_CHAT_MODEL || (useOpenRouter ? AI_MODELS.TIER1 : 'gpt-4o'),
    fast: process.env.LLM_FAST_MODEL || (useOpenRouter ? AI_MODELS.TIER3 : 'gpt-4o-mini'),
    extraction: useOpenRouter ? AI_MODELS.TIER1 : 'gpt-4o',
  },
  gemini: {
    chat: 'gemini-1.5-pro',
    fast: 'gemini-1.5-flash',
    extraction: 'gemini-1.5-pro',
  },
} as const;

// ─── Factory Functions ─────────────────────────────────────────────

function createOpenAIModel(model: string, temperature = 0.7, maxTokens?: number): ChatOpenAI {
  if (useOpenRouter) {
    // Route through OpenRouter using ChatOpenAI's OpenAI-compatible client.
    // @langchain/openai v1 uses `apiKey` (not `openAIApiKey`); we also pass it
    // inside `configuration` so the underlying OpenAI SDK definitely picks it up
    // instead of falling back to the OPENAI_API_KEY env var.
    return new ChatOpenAI({
      model,
      temperature,
      maxTokens,
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: OPENROUTER_HEADERS,
      },
    });
  }
  return new ChatOpenAI({
    model,
    temperature,
    maxTokens,
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function createGeminiModel(model: string, temperature = 0.7, maxTokens?: number): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model,
    temperature,
    maxOutputTokens: maxTokens,
    apiKey: process.env.GEMINI_API_KEY,
  });
}

function createModel(
  provider: LLMProvider,
  modelName: string,
  temperature = 0.7,
  maxTokens?: number
): BaseChatModel {
  switch (provider) {
    case 'openai':
      return createOpenAIModel(modelName, temperature, maxTokens);
    case 'gemini':
      return createGeminiModel(modelName, temperature, maxTokens);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ─── Pre-built Model Instances ─────────────────────────────────────

/** Primary chat model (Claude Sonnet 4.5 via OpenRouter, or GPT-4.1 direct) — for deal analysis, chat, memos */
export function getChatModel(temperature = 0.7, maxTokens = 1500, operation?: string): BaseChatModel {
  const provider = config.chatProvider;
  const modelName = MODELS[provider].chat;
  const model = createModel(provider, modelName, temperature, maxTokens);
  if (operation) return trackModel(model, operation, modelName);
  log.warn('getChatModel called without operation label — usage will not be tracked');
  return model;
}

/** Fast/cheap model (GPT-4.1-mini via OpenRouter, or GPT-4.1-mini direct) — for sentiment, classification */
export function getFastModel(temperature = 0.7, maxTokens = 500, operation?: string): BaseChatModel {
  const provider = config.fastProvider;
  const modelName = MODELS[provider].fast;
  const model = createModel(provider, modelName, temperature, maxTokens);
  if (operation) return trackModel(model, operation, modelName);
  log.warn('getFastModel called without operation label — usage will not be tracked');
  return model;
}

/** Extraction model — low temperature for consistent structured output */
export function getExtractionModel(maxTokens = 3000, operation?: string): BaseChatModel {
  const provider = config.chatProvider;
  const modelName = MODELS[provider].extraction;
  const model = createModel(provider, modelName, 0.1, maxTokens);
  if (operation) return trackModel(model, operation, modelName);
  log.warn('getExtractionModel called without operation label — usage will not be tracked');
  return model;
}

/** Get a specific model by name (escape hatch) */
export function getModel(
  provider: LLMProvider,
  modelName: string,
  temperature = 0.7,
  maxTokens?: number
): BaseChatModel {
  return createModel(provider, modelName, temperature, maxTokens);
}

// ─── Structured Output with Fallback ───────────────────────────────
// LangChain's withStructuredOutput emits an OpenAI tool-call schema. Anthropic
// (Claude Sonnet 4.5 via OpenRouter, our Tier-1 default) sometimes rejects
// that schema after OpenRouter's translation, returning a 400 "Provider
// returned error" with no useful body. OpenAI-native models accept the same
// schema as-is. invokeStructured wraps the call once with the primary
// extraction model and retries with Tier 2 (gpt-4.1 via OpenRouter, or gpt-4o
// direct) on any error so callers don't have to duplicate the fallback.
function describeAIError(err: any): Record<string, unknown> {
  return {
    message: err?.message,
    status: err?.status,
    code: err?.code,
    providerRaw: err?.error?.metadata?.raw,
    providerMsg: err?.error?.message,
    type: err?.error?.type,
  };
}

export async function invokeStructured<T extends z.ZodTypeAny>(
  schema: T,
  messages: BaseMessage[],
  opts?: { maxTokens?: number; temperature?: number; label?: string }
): Promise<z.infer<T>> {
  const maxTokens = opts?.maxTokens ?? 2000;
  const temperature = opts?.temperature ?? 0.1;
  const label = opts?.label ?? 'invokeStructured';
  // Construct primary directly so caller's temperature is honoured. Using
  // getExtractionModel would hardcode 0.1, which is wrong for emails / meeting
  // briefs / signal analysis where higher variance is desirable.
  const primaryName = MODELS[config.chatProvider].extraction;
  try {
    const primary = createModel(config.chatProvider, primaryName, temperature, maxTokens);
    const tracked = trackModel(primary, label, primaryName);
    return await tracked.withStructuredOutput(schema).invoke(messages);
  } catch (primaryErr: any) {
    log.warn(`${label}: primary model failed, retrying with fallback`, describeAIError(primaryErr));
    const fallbackName = isOpenRouterEnabled() ? AI_MODELS.TIER2 : 'gpt-4o';
    const fallback = createModel('openai', fallbackName, temperature, maxTokens);
    const tracked = trackModel(fallback, label, fallbackName);
    return await tracked.withStructuredOutput(schema).invoke(messages);
  }
}

// ─── Availability Checks ──────────────────────────────────────────

export function isOpenAICompatibleAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY;
}

export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function isLLMAvailable(): boolean {
  return isOpenAICompatibleAvailable() || isGeminiAvailable();
}

/** Get the currently configured chat provider name */
export function getChatProviderName(): string {
  return `${config.chatProvider}/${MODELS[config.chatProvider].chat}`;
}

// ─── Logging ──────────────────────────────────────────────────────

log.info('LLM abstraction initialized', {
  chatProvider: config.chatProvider,
  chatModel: MODELS[config.chatProvider].chat,
  fastProvider: config.fastProvider,
  fastModel: MODELS[config.fastProvider].fast,
  openaiCompatibleAvailable: isOpenAICompatibleAvailable(),
  geminiAvailable: isGeminiAvailable(),
  routedThroughOpenRouter: useOpenRouter,
});
