/**
 * parserTypes.ts — Shared types for payment CSV parsers.
 */

export interface ParseResult {
  periodsStored: number;
  statementIds: string[];
  warnings: string[];
  steps: Array<{ timestamp: string; node: string; message: string; detail?: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monthlyData: any[];
}
