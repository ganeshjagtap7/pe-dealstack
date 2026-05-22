// ─── Unified LLM Abstraction Layer ─────────────────────────────────
// Provides a single interface to swap between Anthropic / OpenAI / Gemini.
// Uses LangChain as the abstraction so all downstream code is model-agnostic.

import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import { log } from '../utils/logger.js';
import {
  AI_MODELS,
  OPENROUTER_BASE_URL,
  OPENROUTER_HEADERS,
  isOpenRouterEnabled,
  isAnthropicEnabled,
} from '../utils/aiModels.js';
import { recordUsageEvent } from './usage/trackedLLM.js';
import { enforceUserGate, UserBlockedError } from './usage/enforcement.js';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export { UserBlockedError } from './usage/enforcement.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ─────────────────────────────────────────────────

export type LLMProvider = 'openai' | 'gemini' | 'anthropic';

interface LLMConfig {
  /** Primary provider for chat/analysis */
  chatProvider: LLMProvider;
  /** Provider for fast/cheap tasks (sentiment, classification) */
  fastProvider: LLMProvider;
  /** Provider for embeddings — always Gemini (gemini-embedding-001) */
  embeddingProvider: 'gemini';
}

// Default chat provider cascade:
//   1. LLM_CHAT_PROVIDER env override always wins.
//   2. If ANTHROPIC_API_KEY is set → 'anthropic' (Claude direct).
//   3. Otherwise fall back to 'openai' (which itself may route to OpenRouter
//      or api.openai.com depending on OPENROUTER_API_KEY presence — see
//      createOpenAIModel below).
// The fast provider stays on 'openai' by default since Anthropic's haiku
// pricing isn't economical for tier-3/4 traffic and the user only flagged
// tier 1 routing.
const config: LLMConfig = {
  chatProvider:
    (process.env.LLM_CHAT_PROVIDER as LLMProvider) ||
    (isAnthropicEnabled() ? 'anthropic' : 'openai'),
  fastProvider: (process.env.LLM_FAST_PROVIDER as LLMProvider) || 'openai',
  embeddingProvider: 'gemini',
};

// ─── Model Registry ────────────────────────────────────────────────

// When OpenRouter is enabled (and Anthropic direct is NOT), model strings are
// OpenRouter IDs (e.g. "anthropic/claude-sonnet-4.5") routed through the
// OpenAI-compatible ChatOpenAI client below. Otherwise we fall back to bare
// OpenAI model names.
const useOpenRouter = isOpenRouterEnabled();
const useAnthropic = isAnthropicEnabled();

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
 * Provider widening: includes 'gemini' and 'anthropic' so Gemini- and
 * Anthropic-backed models are tagged correctly (previously always recorded
 * as 'openai').
 */
type UsageProviderTag = 'openrouter' | 'openai' | 'gemini' | 'anthropic';

/**
 * Build a usage-tracking callback handler. Pass at construction time via
 * the model's `callbacks` config, NOT mutated after construction —
 * mutation doesn't propagate through `bindTools()` / `withStructuredOutput()`
 * which is exactly the path LangGraph's createReactAgent uses, and silently
 * swallowed our tracking for every deal-chat / agent invocation.
 */
function makeUsageHandler(
  operation: string,
  modelName: string,
  provider: UsageProviderTag,
): Partial<BaseCallbackHandler> {
  return {
    name: 'usage-tracker',
    // IMPORTANT: return the promise (not `void`). LangChain awaits handleLLMEnd
    // before continuing the agent loop, so the Supabase insert completes before
    // the lambda freezes. Fire-and-forget here drops the insert on Vercel.
    async handleLLMEnd(output: any): Promise<void> {
      const gen0 = output?.generations?.[0]?.[0]?.message;
      const usage =
        gen0?.usage_metadata ??
        output?.llmOutput?.tokenUsage ??
        output?.llmOutput?.usage ??
        null;
      await recordUsageEvent({
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
    async handleLLMError(err: any): Promise<void> {
      await recordUsageEvent({
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
}

// ─── Automatic Anthropic → OpenAI fallback ─────────────────────────
// When tier-1 is Anthropic direct and the API rejects a call due to credit
// exhaustion, rate limiting, overload, or auth failure, swap to OpenAI
// direct (gpt-4o) transparently so the user's request still completes.
// Hooks at the BaseChatModel.invoke layer so it covers:
//   - direct .invoke() callers (route handlers, signal analyzers, etc.),
//   - LangGraph createReactAgent loops (dealChatAgent — each iteration
//     hits the patched .invoke on the primary), and
//   - withStructuredOutput() / .bindTools() chains, which ultimately call
//     into the same .invoke under the hood.
// invokeStructured() has its own explicit primary→fallback retry so we
// don't apply the wrapper there (no double-fallback chain).

const FALLBACK_TRIGGER_HTTP_STATUSES = new Set([401, 402, 403, 429, 529]);
const FALLBACK_TRIGGER_MESSAGE_HINTS = [
  'credit balance',
  'credit_balance',
  'quota exceeded',
  'insufficient quota',
  'insufficient_credit',
  'billing',
  'payment required',
  'organization is restricted',
];

function shouldFallbackToOpenAI(err: any): boolean {
  if (!err) return false;
  // Anthropic SDK error envelopes vary — pull from multiple paths.
  const status = err?.status ?? err?.statusCode ?? err?.error?.status;
  const errType = err?.error?.type ?? err?.error?.error?.type ?? err?.type;
  const message = String(
    err?.message ?? err?.error?.message ?? err?.error?.error?.message ?? ''
  ).toLowerCase();

  // Typed Anthropic errors first (most reliable signal).
  if (errType === 'rate_limit_error') return true;
  if (errType === 'overloaded_error') return true;
  if (errType === 'authentication_error') return true;
  if (errType === 'permission_error') return true;

  // HTTP status fallback.
  if (typeof status === 'number' && FALLBACK_TRIGGER_HTTP_STATUSES.has(status)) {
    return true;
  }

  // Anthropic's "credit balance too low" surfaces as a 400 with type
  // invalid_request_error — only HTTP status can't catch it, so message-
  // sniff. Cheap allowlist; if it ever drifts we add to the list.
  if (FALLBACK_TRIGGER_MESSAGE_HINTS.some((hint) => message.includes(hint))) {
    return true;
  }

  return false;
}

/**
 * Wrap a primary chat model with lazy OpenAI fallback. Patches `.invoke`
 * (which BaseChatModel's bindTools / withStructuredOutput / agent loops
 * all bottom out into) so a shouldFallbackToOpenAI() error transparently
 * retries against the fallback model with the same input + options.
 * `buildFallback` is a thunk so we only pay the construction cost when an
 * actual fallback is needed.
 */
function wrapWithFallback(
  primary: BaseChatModel,
  buildFallback: () => BaseChatModel,
  label: string,
  fallbackName: string,
): BaseChatModel {
  let fallback: BaseChatModel | null = null;
  let pendingBoundTools: { tools: unknown; kwargs?: unknown } | null = null;

  // bindTools (when present) returns a NEW RunnableBinding that wraps the
  // primary — calls to that binding's .invoke eventually hit primary.invoke
  // with the tools merged into options.tools, so the patched .invoke below
  // sees them. We additionally remember the tools so a freshly-built
  // fallback can be pre-bound symmetrically (some providers ignore tools
  // passed in options and require an explicit bindTools call).
  const origBindTools: ((tools: unknown, kwargs?: unknown) => unknown) | undefined =
    typeof (primary as any).bindTools === 'function'
      ? (primary as any).bindTools.bind(primary)
      : undefined;
  if (origBindTools) {
    (primary as any).bindTools = (tools: unknown, kwargs?: unknown) => {
      pendingBoundTools = { tools, kwargs };
      // Reset so the next ensureFallback() call rebuilds with the new tools.
      fallback = null;
      return origBindTools(tools, kwargs);
    };
  }

  const ensureFallback = (): BaseChatModel => {
    if (fallback) return fallback;
    let built = buildFallback();
    if (pendingBoundTools && typeof (built as any).bindTools === 'function') {
      built = (built as any).bindTools(
        pendingBoundTools.tools,
        pendingBoundTools.kwargs,
      ) as BaseChatModel;
    }
    fallback = built;
    return fallback;
  };

  const origInvoke = primary.invoke.bind(primary);
  primary.invoke = async (input: any, options?: any) => {
    try {
      return await origInvoke(input, options);
    } catch (err: any) {
      if (!shouldFallbackToOpenAI(err)) throw err;
      log.warn(
        `${label}: primary model errored, transparent fallback to ${fallbackName}`,
        describeAIError(err),
      );
      const fb = ensureFallback();
      return await fb.invoke(input, options);
    }
  };

  return primary;
}

/**
 * Add the synchronous block gate to a model. Patches `.invoke` so direct
 * `.invoke()` calls run `enforceUserGate` first. Tracking itself is now
 * handled via construction-time callbacks (see makeUsageHandler).
 */
function trackModel(model: BaseChatModel, operation: string, modelName: string): BaseChatModel {
  const ctorName = (model as any).constructor?.name ?? '';
  const provider: UsageProviderTag =
    ctorName.includes('Google') ? 'gemini' :
    ctorName.includes('Anthropic') ? 'anthropic' :
    useOpenRouter ? 'openrouter' : 'openai';

  const originalInvoke = model.invoke.bind(model);
  model.invoke = async (input: any, options?: any) => {
    await enforceUserGate(operation, modelName, provider);
    return originalInvoke(input, options);
  };

  return model;
}

function providerFor(provider: LLMProvider): UsageProviderTag {
  if (provider === 'gemini') return 'gemini';
  if (provider === 'anthropic') return 'anthropic';
  return useOpenRouter ? 'openrouter' : 'openai';
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
  anthropic: {
    // Claude Sonnet 4.5 — current tier-1 reasoning model (knowledge cutoff Jan 2026).
    chat: process.env.LLM_CHAT_MODEL || 'claude-sonnet-4-5',
    // Claude Haiku 4.5 — fast/cheap option. Use the dated alias for stability.
    fast: process.env.LLM_FAST_MODEL || 'claude-haiku-4-5-20251001',
    extraction: 'claude-sonnet-4-5',
  },
} as const;

// ─── Factory Functions ─────────────────────────────────────────────

function createOpenAIModel(
  model: string,
  temperature = 0.7,
  maxTokens?: number,
  callbacks?: Partial<BaseCallbackHandler>[],
): ChatOpenAI {
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
      ...(callbacks && callbacks.length > 0 ? { callbacks } : {}),
    });
  }
  return new ChatOpenAI({
    model,
    temperature,
    maxTokens,
    apiKey: process.env.OPENAI_API_KEY,
    ...(callbacks && callbacks.length > 0 ? { callbacks } : {}),
  });
}

function createGeminiModel(
  model: string,
  temperature = 0.7,
  maxTokens?: number,
  callbacks?: Partial<BaseCallbackHandler>[],
): ChatGoogleGenerativeAI {
  return new ChatGoogleGenerativeAI({
    model,
    temperature,
    maxOutputTokens: maxTokens,
    apiKey: process.env.GEMINI_API_KEY,
    ...(callbacks && callbacks.length > 0 ? { callbacks } : {}),
  });
}

function createAnthropicModel(
  model: string,
  temperature = 0.7,
  maxTokens?: number,
  callbacks?: Partial<BaseCallbackHandler>[],
): ChatAnthropic {
  // ChatAnthropic v1.x accepts both `anthropicApiKey` and `apiKey`; pass the
  // modern `apiKey` plus the legacy alias to be safe across minor versions.
  // maxTokens defaults to 1024 in ChatAnthropic if undefined; we surface it
  // explicitly so callers' explicit value (e.g. 2500 for dealChat) is honoured.
  return new ChatAnthropic({
    model,
    temperature,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    apiKey: process.env.ANTHROPIC_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ...(callbacks && callbacks.length > 0 ? { callbacks } : {}),
  });
}

function createModel(
  provider: LLMProvider,
  modelName: string,
  temperature = 0.7,
  maxTokens?: number,
  callbacks?: Partial<BaseCallbackHandler>[],
): BaseChatModel {
  switch (provider) {
    case 'openai':
      return createOpenAIModel(modelName, temperature, maxTokens, callbacks);
    case 'gemini':
      return createGeminiModel(modelName, temperature, maxTokens, callbacks);
    case 'anthropic':
      return createAnthropicModel(modelName, temperature, maxTokens, callbacks);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
    }
  }
}

// ─── Pre-built Model Instances ─────────────────────────────────────

/**
 * Build a tier-1 OpenAI fallback model for `wrapWithFallback`. Used only
 * when primary is Anthropic AND OpenAI is configured. Mirrors temperature
 * / maxTokens of the primary so output shape stays consistent on retry.
 */
function buildTier1OpenAIFallback(
  operation: string,
  temperature: number,
  maxTokens: number,
): { model: BaseChatModel; modelName: string } | null {
  if (!process.env.OPENAI_API_KEY) return null;
  const fallbackName = 'gpt-4o';
  const callbacks = [makeUsageHandler(operation, fallbackName, providerFor('openai'))];
  const built = createModel('openai', fallbackName, temperature, maxTokens, callbacks);
  return { model: trackModel(built, operation, fallbackName), modelName: fallbackName };
}

/** Primary chat model — Claude Sonnet 4.5 (Anthropic direct) by default,
 *  with transparent OpenAI fallback when Anthropic returns credit/rate/
 *  auth/overload errors (see wrapWithFallback). */
export function getChatModel(temperature = 0.7, maxTokens = 1500, operation?: string): BaseChatModel {
  const provider = config.chatProvider;
  const modelName = MODELS[provider].chat;
  if (!operation) {
    log.warn('getChatModel called without operation label — usage will not be tracked');
    return createModel(provider, modelName, temperature, maxTokens);
  }
  const callbacks = [makeUsageHandler(operation, modelName, providerFor(provider))];
  const model = createModel(provider, modelName, temperature, maxTokens, callbacks);
  const tracked = trackModel(model, operation, modelName);
  // Only wrap when primary is Anthropic AND OpenAI is configured — the
  // wrapper costs nothing when never triggered, but skipping it avoids
  // patching .invoke on non-Anthropic primaries where the fallback would
  // never apply anyway.
  if (provider === 'anthropic' && process.env.OPENAI_API_KEY) {
    return wrapWithFallback(
      tracked,
      () => {
        const fb = buildTier1OpenAIFallback(operation, temperature, maxTokens);
        if (!fb) throw new Error('OpenAI fallback unavailable (OPENAI_API_KEY missing at fallback time)');
        return fb.model;
      },
      operation,
      'gpt-4o',
    );
  }
  return tracked;
}

/** Fast/cheap model — GPT-4.1-mini (OpenAI/OpenRouter) for sentiment, classification. */
export function getFastModel(temperature = 0.7, maxTokens = 500, operation?: string): BaseChatModel {
  const provider = config.fastProvider;
  const modelName = MODELS[provider].fast;
  if (!operation) {
    log.warn('getFastModel called without operation label — usage will not be tracked');
    return createModel(provider, modelName, temperature, maxTokens);
  }
  const callbacks = [makeUsageHandler(operation, modelName, providerFor(provider))];
  const model = createModel(provider, modelName, temperature, maxTokens, callbacks);
  return trackModel(model, operation, modelName);
}

/** Extraction model — low temperature for consistent structured output.
 *  Same transparent Anthropic → OpenAI fallback as getChatModel. */
export function getExtractionModel(maxTokens = 3000, operation?: string): BaseChatModel {
  const provider = config.chatProvider;
  const modelName = MODELS[provider].extraction;
  if (!operation) {
    log.warn('getExtractionModel called without operation label — usage will not be tracked');
    return createModel(provider, modelName, 0.1, maxTokens);
  }
  const callbacks = [makeUsageHandler(operation, modelName, providerFor(provider))];
  const model = createModel(provider, modelName, 0.1, maxTokens, callbacks);
  const tracked = trackModel(model, operation, modelName);
  if (provider === 'anthropic' && process.env.OPENAI_API_KEY) {
    return wrapWithFallback(
      tracked,
      () => {
        const fb = buildTier1OpenAIFallback(operation, 0.1, maxTokens);
        if (!fb) throw new Error('OpenAI fallback unavailable (OPENAI_API_KEY missing at fallback time)');
        return fb.model;
      },
      operation,
      'gpt-4o',
    );
  }
  return tracked;
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
// LangChain's withStructuredOutput emits a tool-call schema. invokeStructured
// wraps the call once with the primary chat-provider model (now Anthropic
// direct by default) and retries with OpenAI direct (gpt-4o) on any error so
// callers don't have to duplicate the fallback.
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
  // method: 'functionCalling' avoids OpenAI's strict json_schema response_format,
  // which Claude (via OpenRouter or direct) historically rejected. Tool use is
  // supported by OpenAI, Anthropic, and Gemini, so one method covers all providers.
  const structuredOpts = { method: 'functionCalling' as const, name: label.replace(/[^a-zA-Z0-9_]/g, '_') };
  const invokeOpts = { runName: label, tags: ['structured', label] };
  try {
    const primaryCallbacks = [makeUsageHandler(label, primaryName, providerFor(config.chatProvider))];
    const primary = createModel(config.chatProvider, primaryName, temperature, maxTokens, primaryCallbacks);
    const tracked = trackModel(primary, label, primaryName);
    return await tracked.withStructuredOutput(schema, structuredOpts).invoke(messages, invokeOpts);
  } catch (primaryErr: any) {
    log.warn(`${label}: primary model failed, retrying with fallback`, describeAIError(primaryErr));
    // Fallback to OpenAI direct (gpt-4o) when Anthropic is primary; otherwise
    // preserve the legacy OpenRouter tier-2 fallback path.
    const fallbackName =
      config.chatProvider === 'anthropic'
        ? 'gpt-4o'
        : isOpenRouterEnabled()
          ? AI_MODELS.TIER2
          : 'gpt-4o';
    const fallbackCallbacks = [makeUsageHandler(label, fallbackName, providerFor('openai'))];
    const fallback = createModel('openai', fallbackName, temperature, maxTokens, fallbackCallbacks);
    const tracked = trackModel(fallback, label, fallbackName);
    return await tracked.withStructuredOutput(schema, structuredOpts).invoke(messages, {
      ...invokeOpts,
      runName: `${label}_fallback`,
      tags: [...invokeOpts.tags, 'fallback', fallbackName],
    });
  }
}

// ─── Availability Checks ──────────────────────────────────────────

export function isOpenAICompatibleAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY || !!process.env.OPENROUTER_API_KEY;
}

export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function isAnthropicAvailable(): boolean {
  return isAnthropicEnabled();
}

export function isLLMAvailable(): boolean {
  return isOpenAICompatibleAvailable() || isGeminiAvailable() || isAnthropicAvailable();
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
  tier1Model: AI_MODELS.TIER1,
  anthropicAvailable: useAnthropic,
  anthropicPrimary: config.chatProvider === 'anthropic',
  openaiCompatibleAvailable: isOpenAICompatibleAvailable(),
  geminiAvailable: isGeminiAvailable(),
  routedThroughOpenRouter: useOpenRouter,
});
