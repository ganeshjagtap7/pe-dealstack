import { classifyFinancials } from '../financialClassifier.js';
import type { ClassifiedStatement as OriginalClassifiedStatement } from '../financialClassifier.js';
import { log } from '../../utils/logger.js';

export interface LineItem {
  name: string;
  value: number | null;
  category: string;
  isSubtotal: boolean;
}

export interface ClassifiedStatement {
  statementType: 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW';
  unitScale: 'MILLIONS' | 'THOUSANDS' | 'ACTUALS';
  currency: string;
  periods: Array<{
    period: string;
    periodType: 'HISTORICAL' | 'PROJECTED' | 'LTM';
    lineItems: LineItem[];
    confidence: number;
  }>;
}

export interface ExtractionClassificationResult {
  statements: ClassifiedStatement[];
  usage: { promptTokens: number; completionTokens: number };
  warnings: string[];
  overallConfidence: number;
}

const SUBTOTAL_KEYS = new Set(['gross_profit', 'ebitda', 'ebit', 'total_assets', 'total_liabilities', 'total_current_assets', 'total_current_liabilities', 'total_equity', 'operating_cf', 'fcf', 'free_cash_flow']);

function convertToLineItems(record: Record<string, number | null>): LineItem[] {
  const items: LineItem[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith('_source')) continue;
    items.push({
      name: key,
      value,
      category: assignCategory(key),
      isSubtotal: SUBTOTAL_KEYS.has(key),
    });
  }
  return items;
}

function convertStatement(stmt: OriginalClassifiedStatement): ClassifiedStatement {
  return {
    statementType: stmt.statementType,
    unitScale: stmt.unitScale,
    currency: stmt.currency,
    periods: stmt.periods.map(p => ({
      period: p.period,
      periodType: p.periodType,
      lineItems: convertToLineItems(p.lineItems),
      confidence: p.confidence,
    })),
  };
}

async function tryClassify(text: string): Promise<{ result: any; promptTokens: number; completionTokens: number } | null> {
  const result = await classifyFinancials(text);
  if (!result) return null;
  return { result, promptTokens: 0, completionTokens: 0 };
}

export async function classifyExtraction(text: string): Promise<ExtractionClassificationResult> {
  const truncated = text.slice(0, 120000);
  log.info('financialClassifier (extraction): classifying', { textLength: truncated.length });

  let attempt = await tryClassify(truncated).catch(() => null);

  if (!attempt) {
    log.warn('financialClassifier (extraction): first attempt failed, retrying');
    attempt = await tryClassify(truncated).catch(() => null);
  }

  if (!attempt || !attempt.result) {
    log.error('financialClassifier (extraction): all attempts failed');
    return { statements: [], usage: { promptTokens: 0, completionTokens: 0 }, warnings: ['Classification failed after retry'], overallConfidence: 0 };
  }

  const { result, promptTokens, completionTokens } = attempt;

  const statements: ClassifiedStatement[] = (result.statements || []).map(convertStatement);

  return {
    statements,
    usage: { promptTokens, completionTokens },
    warnings: result.warnings || [],
    overallConfidence: result.overallConfidence || 0,
  };
}

export function assignCategory(lineItemKey: string): string {
  const k = lineItemKey.toLowerCase();
  if (/revenue|sales|turnover/.test(k)) return 'revenue';
  if (/cogs|cost_of_goods/.test(k)) return 'cost_of_goods';
  if (/gross_profit/.test(k)) return 'gross_profit';
  if (/sga|selling|admin|opex/.test(k)) return 'operating_expenses';
  if (/ebitda/.test(k)) return 'ebitda';
  if (/ebit\b/.test(k)) return 'ebit';
  if (/net_income|net_profit/.test(k)) return 'net_income';
  if (/cash|equivalent/.test(k)) return 'cash';
  if (/asset/.test(k)) return 'assets';
  if (/liabilit/.test(k)) return 'liabilities';
  if (/equity/.test(k)) return 'equity';
  if (/depreciation|amortization/.test(k)) return 'depreciation_amortization';
  if (/capex|capital_expend/.test(k)) return 'capex';
  if (/free_cash|fcf/.test(k)) return 'free_cash_flow';
  if (/operating_cf/.test(k)) return 'operating_cash_flow';
  return 'other';
}
