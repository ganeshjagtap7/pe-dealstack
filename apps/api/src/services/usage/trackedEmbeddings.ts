import { recordUsageEvent } from './trackedLLM.js';

/**
 * Per-1K-character price for Gemini text-embedding-004. Tunable via env.
 * Reference: Google's pricing page (verify against your current rate before
 * shipping to prod — Gemini embeddings are heavily promotional/free at low
 * volume, and the free quota differs by region).
 */
const GEMINI_EMBED_PRICE_PER_1K_CHARS_USD = Number(
  process.env.GEMINI_EMBED_PRICE_PER_1K_CHARS_USD ?? 0.000025,
);

const EMBEDDING_MODEL = 'text-embedding-004';

function totalChars(items: string[]): number {
  let n = 0;
  for (const s of items) n += (s?.length ?? 0);
  return n;
}

/**
 * Wrap a Gemini batch-embedding call (`embedDocuments`). Records one
 * UsageEvent per call with units = chunk count and cost = per-character
 * rate × total characters across all chunks. Use for document ingestion.
 *
 * The wrapper is fire-and-forget on the ledger insert and re-throws on
 * embedding failure so the caller's existing error handling still runs.
 */
export async function trackedEmbedDocuments<T>(
  operation: string,
  texts: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const chars = totalChars(texts);
  try {
    const result = await fn();
    void recordUsageEvent({
      operation,
      provider: 'gemini',
      units: texts.length,
      unitCostUsd: (chars / 1000) * GEMINI_EMBED_PRICE_PER_1K_CHARS_USD,
      status: 'success',
      durationMs: Date.now() - start,
      metadata: { embeddingModel: EMBEDDING_MODEL, charCount: chars },
    });
    return result;
  } catch (err) {
    void recordUsageEvent({
      operation,
      provider: 'gemini',
      units: texts.length,
      unitCostUsd: 0,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: {
        embeddingModel: EMBEDDING_MODEL,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

/**
 * Wrap a single-query embedding call (`embedQuery`). 1 unit, char-based
 * cost. Use for RAG retrieval queries (deal chat, memo agent, etc.).
 */
export async function trackedEmbedQuery<T>(
  operation: string,
  text: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const chars = text?.length ?? 0;
  try {
    const result = await fn();
    void recordUsageEvent({
      operation,
      provider: 'gemini',
      units: 1,
      unitCostUsd: (chars / 1000) * GEMINI_EMBED_PRICE_PER_1K_CHARS_USD,
      status: 'success',
      durationMs: Date.now() - start,
      metadata: { embeddingModel: EMBEDDING_MODEL, charCount: chars },
    });
    return result;
  } catch (err) {
    void recordUsageEvent({
      operation,
      provider: 'gemini',
      units: 1,
      unitCostUsd: 0,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: {
        embeddingModel: EMBEDDING_MODEL,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

export const EMBEDDING_PRICES = {
  perKCharsUsd: GEMINI_EMBED_PRICE_PER_1K_CHARS_USD,
  model: EMBEDDING_MODEL,
};
