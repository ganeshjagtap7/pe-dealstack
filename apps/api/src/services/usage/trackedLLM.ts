import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { getUsageContext } from '../../middleware/usageContext.js';
import { getModelPrice, computeCostUsd } from './modelPrices.js';
import { getCreditsForOperation } from './operationCredits.js';

export type UsageProvider =
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'anthropic'
  | 'apify'
  | 'azure_doc_intelligence';

export type UsageStatus = 'success' | 'error' | 'rate_limited' | 'blocked';

interface RecordUsageEventBase {
  operation: string;
  provider: UsageProvider;
  status: UsageStatus;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** LLM call: cost is computed from token counts × ModelPrice lookup. */
interface RecordUsageEventLLM extends RecordUsageEventBase {
  model: string;
  promptTokens: number;
  completionTokens: number;
  unitCostUsd?: never;
  units?: never;
}

/** Non-LLM call (Apify, Azure DocIntel): caller supplies the cost directly. */
interface RecordUsageEventNonLLM extends RecordUsageEventBase {
  model?: never;
  promptTokens?: never;
  completionTokens?: never;
  unitCostUsd: number;
  units: number;
}

export type RecordUsageEventInput = RecordUsageEventLLM | RecordUsageEventNonLLM;

/**
 * Insert one UsageEvent row attributing AI consumption to the current
 * request's user + organization. Fire-and-forget — the caller never blocks
 * on the ledger insert and any failure is logged but not thrown.
 *
 * Cost handling:
 * - For LLM calls (model + token counts), cost is computed via ModelPrice.
 *   When the model isn't in the price table, costUsd=0 AND
 *   metadata.priceLookupFailed=true is set so it can be reconciled later.
 * - For non-LLM providers (Apify, Azure DocIntel), the caller passes
 *   unitCostUsd directly and the model lookup is skipped.
 */
export async function recordUsageEvent(input: RecordUsageEventInput): Promise<void> {
  log.info('[usage] recordUsageEvent ENTRY', {
    operation: input.operation,
    model: input.model,
    provider: input.provider,
  });

  const ctx = getUsageContext();
  if (!ctx) {
    log.warn('[usage] recordUsageEvent skipped — no usage context bound', {
      operation: input.operation,
    });
    return;
  }

  try {
    const promptTokens = input.promptTokens ?? 0;
    const completionTokens = input.completionTokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    let costUsd = 0;
    const extraMetadata: Record<string, unknown> = {};

    if (input.unitCostUsd !== undefined) {
      costUsd = input.unitCostUsd;
    } else if (input.model) {
      const price = await getModelPrice(input.model);
      if (price) {
        costUsd = computeCostUsd(price, promptTokens, completionTokens);
      } else {
        log.warn('[usage] unknown model, costUsd=0', { model: input.model });
        extraMetadata.priceLookupFailed = true;
      }
    }

    const credits = await getCreditsForOperation(input.operation);

    const row = {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      operation: input.operation,
      model: input.model ?? null,
      provider: input.provider,
      promptTokens,
      completionTokens,
      totalTokens,
      units: input.units ?? 0,
      costUsd,
      credits,
      status: input.status,
      durationMs: input.durationMs ?? null,
      metadata: { ...(input.metadata ?? {}), ...extraMetadata, requestId: ctx.requestId },
    };

    log.info('[usage] inserting UsageEvent row', {
      operation: row.operation,
      userId: row.userId,
      organizationId: row.organizationId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      costUsd: row.costUsd,
    });

    const { error, data } = await supabase.from('UsageEvent').insert(row).select('id');
    if (error) {
      log.error('[usage] INSERT FAILED', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        operation: input.operation,
        rowKeys: Object.keys(row),
      });
    } else {
      log.info('[usage] insert OK', {
        operation: input.operation,
        insertedId: data?.[0]?.id,
      });
    }
  } catch (err) {
    log.error('[usage] recordUsageEvent threw', {
      err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      operation: input.operation,
    });
  }
}
