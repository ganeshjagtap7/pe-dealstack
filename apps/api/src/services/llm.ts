// ─── Unified LLM Abstraction Layer ─────────────────────────────────
// Provides a single interface to swap between OpenAI / Gemini via config.
// Uses LangChain as the abstraction so all downstream code is model-agnostic.

import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { log } from '../utils/logger.js';
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

const MODELS = {
  openai: {
    chat: process.env.LLM_CHAT_MODEL || 'gpt-4o',
    fast: process.env.LLM_FAST_MODEL || 'gpt-4o-mini',
    extraction: 'gpt-4-turbo',
  },
  gemini: {
    chat: 'gemini-1.5-pro',
    fast: 'gemini-1.5-flash',
    extraction: 'gemini-1.5-pro',
  },
} as const;

// ─── Factory Functions ─────────────────────────────────────────────

function createOpenAIModel(model: string, temperature = 0.7, maxTokens?: number): ChatOpenAI {
  return new ChatOpenAI({
    modelName: model,
    temperature,
    maxTokens,
    openAIApiKey: process.env.OPENAI_API_KEY,
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

/** Primary chat model (GPT-4o or Gemini Pro) — for deal analysis, chat, memos */
export function getChatModel(temperature = 0.7, maxTokens = 1500): BaseChatModel {
  const provider = config.chatProvider;
  const model = MODELS[provider].chat;
  return createModel(provider, model, temperature, maxTokens);
}

/** Fast/cheap model (GPT-4o-mini or Gemini Flash) — for sentiment, classification */
export function getFastModel(temperature = 0.7, maxTokens = 500): BaseChatModel {
  const provider = config.fastProvider;
  const model = MODELS[provider].fast;
  return createModel(provider, model, temperature, maxTokens);
}

/** Extraction model — low temperature for consistent structured output */
export function getExtractionModel(maxTokens = 3000): BaseChatModel {
  const provider = config.chatProvider;
  const model = MODELS[provider].extraction;
  return createModel(provider, model, 0.1, maxTokens);
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

export function isOpenAIAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function isLLMAvailable(): boolean {
  return isOpenAIAvailable() || isGeminiAvailable();
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
  openaiAvailable: isOpenAIAvailable(),
  geminiAvailable: isGeminiAvailable(),
});
