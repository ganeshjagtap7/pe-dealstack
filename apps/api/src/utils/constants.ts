export const EXTRACTION_SOURCES = ['gpt4o', 'azure', 'vision', 'manual'] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

export const STATEMENT_TYPES = ['INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW'] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];

export const PERIOD_TYPES = ['HISTORICAL', 'PROJECTED', 'LTM'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const UNIT_SCALES = ['MILLIONS', 'THOUSANDS', 'ACTUALS'] as const;
export type UnitScale = (typeof UNIT_SCALES)[number];

export const MAX_EXTRACTION_CONFIDENCE = 100;
export const MIN_EXTRACTION_CONFIDENCE = 0;
export const DEFAULT_CURRENCY = 'USD';

export const EXTRACTION_ERROR_MESSAGES = {
  NO_TEXT: 'No text extracted from document',
  CLASSIFICATION_FAILED: 'No financial statements found',
  VALIDATION_FAILED: 'Financial data validation failed',
  PIPELINE_ERROR: 'An error occurred during the extraction pipeline',
};

export const OPENAI_TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5 / 1_000_000, output: 15 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
};

export function estimateOpenAICostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = OPENAI_TOKEN_PRICING[model] ?? OPENAI_TOKEN_PRICING['gpt-4o'];
  return promptTokens * pricing.input + completionTokens * pricing.output;
}
