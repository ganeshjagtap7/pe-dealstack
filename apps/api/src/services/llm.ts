// ─── Unified LLM Abstraction Layer ─────────────────────────────────
// Provides a single interface to swap between OpenAI / Gemini via config.
// Uses LangChain as the abstraction so all downstream code is model-agnostic.

import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { log } from '../utils/logger.js';
import {
  AI_MODELS,
  OPENROUTER_BASE_URL,
  OPENROUTER_HEADERS,
  isOpenRouterEnabled,
} from '../utils/aiModels.js';
import { recordUsageEvent } from './usage/trackedLLM.js';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ─────────────────────────────────────────────────

export type LLMProvider = 'openai' | 'gemini';

interface LLMConfig {
  /** Primary provider for chat/analysis */
  chatProvider: LLMProvider;
  /** Provider for fast/cheap tasks (sentiment, classification) */
  fastProvider: LLMProvider;
  /** Provider for embeddings — always Gemini (768-dim text-embedding-004) */
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
 * Wrap a BaseChatModel so every `.invoke()` call records a UsageEvent.
 * Token counts come from LangChain's `usage_metadata` on the AIMessage result.
 * Always provider='openrouter' when OpenRouter is configured, else 'openai'.
 */
function trackModel(model: BaseChatModel, operation: string, modelName: string): BaseChatModel {
  const original = model.invoke.bind(model);
  const provider: 'openrouter' | 'openai' = useOpenRouter ? 'openrouter' : 'openai';
  model.invoke = async (input: any, options?: any) => {
    const start = Date.now();
    try {
      const result = await original(input, options);
      const usage = (result as AIMessage)?.usage_metadata;
      void recordUsageEvent({
        operation,
        model: modelName,
        provider,
        promptTokens: usage?.input_tokens ?? 0,
        completionTokens: usage?.output_tokens ?? 0,
        status: 'success',
        durationMs: Date.now() - start,
      });
      return result;
    } catch (err) {
      void recordUsageEvent({
        operation,
        model: modelName,
        provider,
        promptTokens: 0,
        completionTokens: 0,
        status: 'error',
        durationMs: Date.now() - start,
        metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
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
