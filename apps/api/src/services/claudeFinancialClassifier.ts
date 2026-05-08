/**
 * Claude (Sonnet 4.6) financial classifier.
 *
 * Mirrors the contract of `classifyFinancials` (financialClassifier.ts) but
 * dispatches to Anthropic instead of OpenAI. Used by `financialCrossVerify`
 * to produce a second independent extraction that can be cross-checked
 * against the GPT result, catching single-model hallucinations that a
 * self-correction loop on either provider alone wouldn't catch.
 *
 * Why Sonnet 4.6 specifically:
 *   - Same prompt as the GPT path (buildExtractionPrompt) so the two
 *     extractions are directly comparable.
 *   - Adaptive thinking + high effort — extraction is intelligence-
 *     sensitive (unit-scale inference, period classification, derived-field
 *     reconciliation).
 *   - System prompt cached (ephemeral, 5-min TTL) — re-extracting the
 *     same document or processing many docs with the same hint structure
 *     reuses the input prefix at ~10% of the input price.
 *   - Streaming required: max_tokens up to 32K to fit a deep monthly grid
 *     plus per-period source citations exceeds the SDK's non-streaming
 *     HTTP timeout window. We use stream() + finalMessage() per the
 *     SDK guidance.
 *   - Same post-processing as the GPT path (normalizeClassificationResult,
 *     applyExplicitUnitOverride, applySmallDollarActualsOverride) — keeps
 *     outputs byte-comparable when both models agree, so the cross-verify
 *     diff only flags real disagreements.
 */

import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger.js';
import { buildExtractionPrompt } from './extractionPrompt.js';
import { MAX_TEXT_LENGTH } from './agents/financialAgent/config.js';
import {
  applyExplicitUnitOverride,
  applySmallDollarActualsOverride,
  detectExplicitUnitInText,
  hasExplicitSmallDollarAmounts,
  normalizeClassificationResult,
  type ClassificationResult,
  type ClassifyOptions,
} from './financialClassifier.js';

// ─── Config ──────────────────────────────────────────────────

/** Sonnet 4.6 — exact model ID per Anthropic SDK spec. Do not append a
 *  date suffix; the alias resolves to the latest GA release. */
const SONNET_MODEL = 'claude-sonnet-4-6';

/** Output budget — matches the GPT path (32K) so a deep monthly grid +
 *  source citations fit. Values above ~16K mandate streaming on the
 *  Anthropic SDK, which we do via `messages.stream()` below. */
const MAX_OUTPUT_TOKENS = 32_000;

/** Higher per-request timeout than the SDK default. Sonnet 4.6 with
 *  adaptive thinking on a 32K output budget can take 60-90s for deep
 *  grids; the GPT path uses 120s for the same reason. */
const REQUEST_TIMEOUT_MS = 180_000;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  cachedClient = new Anthropic({ timeout: REQUEST_TIMEOUT_MS });
  return cachedClient;
}

/**
 * True when ANTHROPIC_API_KEY is present in the environment. The cross-
 * verify wrapper uses this to decide whether to fan out to a second
 * extractor or fall through to GPT-only behaviour. Vercel users set this
 * via the project's env vars (the user names it ANTHROPIC_API_KEY).
 */
export function isClaudeClassifierEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── Main Function ────────────────────────────────────────────

/**
 * Drop-in mirror of `classifyFinancials`. Same input shape, same return
 * shape, same null-on-failure semantics — so callers can route to either
 * extractor without branching on which provider answered.
 */
export async function classifyFinancialsWithClaude(
  text: string,
  options?: ClassifyOptions,
): Promise<ClassificationResult | null> {
  const client = getClient();
  if (!client) {
    log.warn('Claude classifier skipped: ANTHROPIC_API_KEY not set');
    return null;
  }

  if (!text || text.trim().length < 100) {
    log.warn('Claude classifier skipped: text too short');
    return null;
  }

  // Same truncation cap as the GPT path so the two extractors see exactly
  // the same input. Diverging here would create false-positive "disagreement"
  // signals in the cross-verify step.
  const truncated = text.slice(0, MAX_TEXT_LENGTH);
  const explicitUnit = detectExplicitUnitInText(truncated);
  const hasSmallDollars = hasExplicitSmallDollarAmounts(truncated);

  const systemPrompt = buildExtractionPrompt({
    includeSourceCitations: true,
    expectedPeriods: options?.expectedPeriods,
    lineItemHints: options?.lineItemHints,
  });

  log.debug('Claude classifier starting', {
    model: SONNET_MODEL,
    textLength: truncated.length,
    explicitUnit,
    hasSmallDollars,
    hasPeriodHints: Boolean(options?.expectedPeriods),
    hasLineItemHints: Boolean(options?.lineItemHints),
  });

  try {
    // Streaming required for max_tokens > ~16K — the SDK's non-streaming
    // path hits its HTTP timeout before Sonnet 4.6 finishes a 32K output.
    const stream = client.messages.stream({
      model: SONNET_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: [
        {
          type: 'text',
          text: systemPrompt,
          // Cache the prompt prefix. The system prompt is large (~5K
          // tokens) and constant across re-extractions of the same doc
          // and across docs with the same hint structure — reading from
          // cache costs ~10% of input price.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            'Extract all financial statements from this document. Return JSON only — no surrounding prose, no markdown fences:\n\n' +
            truncated,
        },
      ],
    });

    const message = await stream.finalMessage();

    // Concatenate all text blocks from the response. With adaptive
    // thinking, the response usually contains thinking blocks (omitted
    // text by default) followed by one or more text blocks carrying the
    // JSON. We ignore thinking blocks and only parse text.
    let textContent = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    if (!textContent) {
      log.error('Claude classifier: no text content in response');
      return null;
    }

    const cleaned = stripJsonFences(textContent);

    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch (parseErr) {
      log.error('Claude classifier: JSON parse failed', {
        error: String(parseErr),
        sample: cleaned.slice(0, 200),
      });
      return null;
    }

    // Same post-processing as the GPT path — keeps cross-verify diffs
    // grounded in real disagreements rather than normalization artifacts.
    const result = normalizeClassificationResult(raw);
    applyExplicitUnitOverride(result, explicitUnit);
    applySmallDollarActualsOverride(result, hasSmallDollars, explicitUnit);

    log.debug('Claude classifier completed', {
      model: SONNET_MODEL,
      statementsFound: result.statements.length,
      overallConfidence: result.overallConfidence,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });

    return result;
  } catch (err) {
    // SDK typed exceptions per shared/error-codes.md — most-specific first.
    if (err instanceof Anthropic.RateLimitError) {
      log.warn('Claude classifier: rate limited (retry handled by SDK already exhausted)');
    } else if (err instanceof Anthropic.AuthenticationError) {
      log.error('Claude classifier: authentication failed — check ANTHROPIC_API_KEY');
    } else if (err instanceof Anthropic.APIError) {
      log.error('Claude classifier: API error', {
        status: err.status,
        message: err.message,
      });
    } else {
      log.error('Claude classifier: unexpected error', err);
    }
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Strip ```json ... ``` fences if Sonnet decided to wrap the JSON despite
 * the "no markdown fences" instruction. Defensive — most responses come
 * back as bare JSON, but assert no parse errors when they don't.
 */
function stripJsonFences(text: string): string {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, '');
  s = s.replace(/\n?```\s*$/, '');
  return s.trim();
}
