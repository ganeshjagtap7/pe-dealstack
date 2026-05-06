import { describe, it, expect } from 'vitest';
import { validateExtraction } from '../src/services/extraction/validator.js';
import type { ClassifiedStatement } from '../src/services/extraction/financialClassifier.js';

function makeIS(period: string, items: Record<string, number | null>): ClassifiedStatement {
  return {
    statementType: 'INCOME_STATEMENT',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period,
      periodType: 'HISTORICAL',
      confidence: 90,
      lineItems: Object.entries(items).map(([name, value]) => ({
        name, value, category: name, isSubtotal: ['gross_profit','ebitda','ebit'].includes(name),
      })),
    }],
  };
}

function makeBS(period: string, items: Record<string, number | null>): ClassifiedStatement {
  return {
    statementType: 'BALANCE_SHEET',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period,
      periodType: 'HISTORICAL',
      confidence: 90,
      lineItems: Object.entries(items).map(([name, value]) => ({
        name, value, category: name, isSubtotal: ['total_assets','total_liabilities'].includes(name),
      })),
    }],
  };
}

// Test 1: FAILS bs_balances — Assets=100, Liab=50, Equity=40 (100 ≠ 90)
describe('bs_balances — FAIL', () => {
  it('detects balance sheet imbalance', () => {
    const stmts = [makeBS('2023', { total_assets: 100, total_liabilities: 50, total_equity: 40 })];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'bs_balances');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.severity).toBe('error');
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.isValid).toBe(false);
  });
});

// Test 2: PASSES bs_balances — Assets=100, Liab=50.5, Equity=49.5 (within 1%)
describe('bs_balances — PASS', () => {
  it('accepts balanced balance sheet within 1% tolerance', () => {
    const stmts = [makeBS('2023', { total_assets: 100, total_liabilities: 50.5, total_equity: 49.5 })];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'bs_balances');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
  });
});

// Test 3: PASSES is_gross_profit_math — Revenue=100, COGS=60, GrossProfit=40
describe('subtotal_consistency_gross_profit — PASS', () => {
  it('accepts correct gross profit subtotal', () => {
    const stmts = [makeIS('2023', { revenue: 100, cogs: 60, gross_profit: 40 })];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'subtotal_consistency_gross_profit');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
  });
});

// Test 4: FAILS is_gross_profit_lte_revenue — Revenue=12, GrossProfit=48 (impossible)
describe('is_gross_profit_lte_revenue — FAIL', () => {
  it('flags gross profit exceeding revenue', () => {
    const stmts = [makeIS('2023', { revenue: 12, gross_profit: 48 })];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'is_gross_profit_lte_revenue');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.severity).toBe('error');
  });
});

// Test 5: FAILS is_ebitda_lt_revenue — Revenue=20, EBITDA=30 (impossible)
describe('is_ebitda_lt_revenue — FAIL', () => {
  it('flags EBITDA exceeding revenue', () => {
    const stmts = [makeIS('2023', { revenue: 20, ebitda: 30 })];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'is_ebitda_lt_revenue');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.severity).toBe('error');
  });
});

// Test 6: FLAGS yoy_revenue_growth_sane — Rev2022=10, Rev2023=80 (700% > 500%)
describe('yoy_revenue_growth_sane — FLAG', () => {
  it('flags >500% YoY revenue growth', () => {
    const stmts: ClassifiedStatement[] = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: [{ name: 'revenue', value: 10, category: 'revenue', isSubtotal: false }] },
        { period: '2023', periodType: 'HISTORICAL', confidence: 90, lineItems: [{ name: 'revenue', value: 80, category: 'revenue', isSubtotal: false }] },
      ],
    }];
    const result = validateExtraction(stmts);
    const check = result.checks.find(c => c.rule === 'yoy_revenue_growth_sane');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.severity).toBe('warning');
    expect(check!.actual!).toBeCloseTo(700, 0);
  });
});

// Test 7: PASSES full valid IS — Revenue=100, COGS=60, GP=40, EBITDA=30, DA=5, EBIT=25, NI=14
describe('full valid income statement', () => {
  it('all checks pass for a well-formed IS', () => {
    const stmts = [makeIS('2023', {
      revenue: 100, cogs: 60, gross_profit: 40, ebitda: 30,
      da: 5, ebit: 25, net_income: 14,
    })];
    const result = validateExtraction(stmts);
    const errors = result.checks.filter(c => !c.passed && c.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.isValid).toBe(true);
    expect(result.checks.find(c => c.rule === 'is_gross_profit_lte_revenue')!.passed).toBe(true);
    expect(result.checks.find(c => c.rule === 'is_ebitda_lt_revenue')!.passed).toBe(true);
  });
});
