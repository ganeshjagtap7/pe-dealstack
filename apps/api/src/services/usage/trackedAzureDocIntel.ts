import { recordUsageEvent } from './trackedLLM.js';

const AZURE_DOC_PRICE_PER_PAGE_USD = Number(
  process.env.AZURE_DOC_PRICE_PER_PAGE_USD ?? 0.0015,
);

/**
 * Wrap an Azure Document Intelligence call so a UsageEvent is recorded
 * with units = pages processed and cost = pages × env-driven per-page rate.
 * `getPageCount` is a callback that extracts the page count from the
 * caller's result, so the wrapper does not need to know the result shape.
 */
export async function trackedAzureDocIntelCall<T>(
  fn: () => Promise<T>,
  getPageCount: (result: T) => number,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const pages = result == null ? 0 : Math.max(0, getPageCount(result));
    await recordUsageEvent({
      operation: 'pdf_ocr',
      provider: 'azure_doc_intelligence',
      units: pages,
      unitCostUsd: pages * AZURE_DOC_PRICE_PER_PAGE_USD,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    await recordUsageEvent({
      operation: 'pdf_ocr',
      provider: 'azure_doc_intelligence',
      units: 0,
      unitCostUsd: 0,
      status: 'error',
      durationMs: Date.now() - start,
      metadata: { errorMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

export const AZURE_DOC_PRICES = {
  perPageUsd: AZURE_DOC_PRICE_PER_PAGE_USD,
};
