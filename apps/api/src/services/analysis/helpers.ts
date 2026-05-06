/**
 * Financial Analysis Helpers
 * Shared utility functions used across all analysis modules.
 */

import { LineItems, PreparedData } from './types.js';

export function li(lineItems: LineItems, key: string): number | null {
  return lineItems[key] ?? null;
}

export function pctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export function round2(val: number | null): number | null {
  if (val == null) return null;
  return Math.round(val * 100) / 100;
}

export function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function trendDirection(values: (number | null)[]): 'improving' | 'declining' | 'stable' | 'insufficient' {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return 'insufficient';

  const mid = Math.floor(valid.length / 2);
  const firstHalf = avg(valid.slice(0, mid));
  const secondHalf = avg(valid.slice(mid));

  if (firstHalf == null || secondHalf == null) return 'insufficient';
  const change = ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100;

  if (Math.abs(change) < 3) return 'stable';
  return change > 0 ? 'improving' : 'declining';
}

export function prepareData(rows: any[]): PreparedData {
  const income = new Map<string, LineItems>();
  const balance = new Map<string, LineItems>();
  const cashflow = new Map<string, LineItems>();

  for (const row of rows) {
    if (row.periodType !== 'HISTORICAL') continue;
    const map =
      row.statementType === 'INCOME_STATEMENT' ? income :
        row.statementType === 'BALANCE_SHEET' ? balance :
          row.statementType === 'CASH_FLOW' ? cashflow : null;
    if (map) map.set(row.period, row.lineItems as LineItems);
  }

  const allPeriods = new Set<string>();
  [income, balance, cashflow].forEach(m => m.forEach((_, k) => allPeriods.add(k)));
  const periods = Array.from(allPeriods).sort();

  return { income, balance, cashflow, periods };
}
