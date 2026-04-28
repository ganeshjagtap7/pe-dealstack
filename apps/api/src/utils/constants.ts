export const OPENAI_TOKEN_PRICING_USD_PER_TOKEN = {
  'gpt-4o': {
    input: Number(process.env.OPENAI_GPT4O_INPUT_COST_PER_TOKEN ?? 5 / 1_000_000),
    output: Number(process.env.OPENAI_GPT4O_OUTPUT_COST_PER_TOKEN ?? 15 / 1_000_000),
  },
  'gpt-4o-mini': {
    input: Number(process.env.OPENAI_GPT4O_MINI_INPUT_COST_PER_TOKEN ?? 0.15 / 1_000_000),
    output: Number(process.env.OPENAI_GPT4O_MINI_OUTPUT_COST_PER_TOKEN ?? 0.60 / 1_000_000),
  },
} as const;

export type PricedOpenAIModel = keyof typeof OPENAI_TOKEN_PRICING_USD_PER_TOKEN;

export function estimateOpenAICostUsd(
  model: PricedOpenAIModel,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = OPENAI_TOKEN_PRICING_USD_PER_TOKEN[model];
  return (promptTokens * pricing.input) + (completionTokens * pricing.output);
}
