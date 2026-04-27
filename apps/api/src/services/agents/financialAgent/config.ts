/**
 * config.ts — Constants for the financial extraction agent.
 * Centralizes magic numbers used across agent nodes.
 */

/** Max characters to send to GPT-4o per extraction call */
export const MAX_TEXT_LENGTH = 120000;

/** Document size threshold for smart chunking (chars) */
export const CHUNK_THRESHOLD = 100000;

/** Max chunk size for document splitting (chars) */
export const MAX_CHUNK_SIZE = 100000;

/** Max chunks to extract in parallel */
export const MAX_CHUNKS = 4;

/** Source text sample size for verify/cross-verify nodes (chars) */
export const VERIFY_SAMPLE_SIZE = 15000;

/** Min text length from pdf-parse before falling back to vision */
export const MIN_TEXT_LENGTH = 200;

/** Default max retries for self-correction loop */
export const DEFAULT_MAX_RETRIES = 3;

/** Confidence threshold — periods below this trigger self-correction */
export const CONFIDENCE_THRESHOLD = 80;

/** Validation math tolerance for large values (>$1M) */
export const TOLERANCE_LARGE = 0.01;

/** Validation math tolerance for small values (≤$1M) */
export const TOLERANCE_SMALL = 0.02;
