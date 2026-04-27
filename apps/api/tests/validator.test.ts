/**
 * validator.test.ts — Unit tests for the 7-rule financial validation engine.
 *
 * Tests validateExtraction() from services/extraction/validator.ts.
 * All tests are deterministic (no LLM calls) — they validate pure math logic.
 *
 * Vitest conventions mirror the existing financial-validator.test.ts pattern.
 */

import { describe, it, expect } from 'vitest';
import { validateExtraction } from '../src/services/extraction/validator.js';
import type { ClassifiedStatement } from '../src/services/financialClassifier.js';

// ─── Fixtures ─────────────────────────────────────────────────

function incomeStatement(overrides: Partial<Record<string, number | null>> = {}): ClassifiedStatement {
  return {
    statementType: 'INCOME_STATEMENT',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period: 'FY2023',
      periodType: 'HISTORICAL',
      confidence: 90,
      lineItems: {
        revenue: 100,
        cogs: 60, // financialValidator.ts uses revenue - cogs
        gross_profit: 40,
        ebitda: 25,
        ebitda_margin_pct: 25,
        net_income: 15,
        ...overrides,
      },
    }],
  };
}

function balanceSheet(
  totalAssets: number,
  totalLiabilities: number,
  totalEquity: number,
  period = 'FY2023',
): ClassifiedStatement {
  return {
    statementType: 'BALANCE_SHEET',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period,
      periodType: 'HISTORICAL',
      confidence: 90,
      lineItems: { total_assets: totalAssets, total_liabilities: totalLiabilities, total_equity: totalEquity },
    }],
  };
}

function cashFlow(operatingCf: number, capex: number, fcf: number, period = 'FY2023'): ClassifiedStatement {
  return {
    statementType: 'CASH_FLOW',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period,
      periodType: 'HISTORICAL',
      confidence: 90,
      lineItems: { operating_cf: operatingCf, capex, fcf },
    }],
  };
}

// ─── Rule 1: Balance sheet equality ───────────────────────────

describe('Rule 1 — Balance sheet equality', () => {
  it('passes when Assets = Liabilities + Equity', () => {
    const result = validateExtraction([balanceSheet(5000, 3000, 2000)]);
    const check = result.checks.find(c => c.check === 'bs_balances');
    expect(check?.passed).toBe(true);
    expect(result.overallPassed).toBe(true);
  });

  it('fails when Assets ≠ Liabilities + Equity', () => {
    const result = validateExtraction([balanceSheet(5000, 3000, 1500)]);
    const check = result.checks.find(c => c.check === 'bs_balances');
    expect(check?.passed).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it('accepts values within 5% tolerance', () => {
    // 5000 vs 3000 + 1960 = 4960 — 0.8% off (within 1% tolerance)
    const result = validateExtraction([balanceSheet(5000, 3000, 1960)]);
    const check = result.checks.find(c => c.check === 'bs_balances');
    expect(check?.passed).toBe(true);
  });
});

// ─── Rule 2: Revenue > 0 ──────────────────────────────────────

describe('Rule 2 — Revenue > 0', () => {
  it('passes for positive revenue', () => {
    const result = validateExtraction([incomeStatement()]);
    const check = result.checks.find(c => c.check === 'revenue_positive');
    expect(check?.passed).toBe(true);
  });

  it('fails for zero revenue', () => {
    const result = validateExtraction([incomeStatement({ revenue: 0 })]);
    const check = result.checks.find(c => c.check === 'revenue_positive');
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('warning');
  });

  it('fails for negative revenue', () => {
    const result = validateExtraction([incomeStatement({ revenue: -10 })]);
    const check = result.checks.find(c => c.check === 'revenue_positive');
    expect(check?.passed).toBe(false);
  });

  it('skips check when revenue is null (not extracted)', () => {
    const result = validateExtraction([incomeStatement({ revenue: null })]);
    const check = result.checks.find(c => c.check === 'revenue_positive');
    expect(check).toBeUndefined();
  });
});

// ─── Rule 3 — EBITDA margin sanity ─────────────────────────────

describe('Rule 3 — EBITDA margin sanity', () => {
  it('passes for normal EBITDA margin (25%)', () => {
    const result = validateExtraction([incomeStatement()]);
    const check = result.checks.find(c => c.check === 'is_ebitda_margin_sane');
    expect(check?.passed).toBe(true);
  });

  it('flags unusually high EBITDA margin (>80%)', () => {
    // financialValidator.ts passes if margin <= 80
    const result = validateExtraction([incomeStatement({ revenue: 100, ebitda: 85 })]);
    const check = result.checks.find(c => c.check === 'is_ebitda_margin_sane');
    expect(check?.passed).toBe(false);
  });

  it('EBITDA must not exceed revenue', () => {
    const result = validateExtraction([incomeStatement({ revenue: 50, ebitda: 80 })]);
    const check = result.checks.find(c => c.check === 'is_ebitda_lt_revenue');
    expect(check?.passed).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});

// ─── Rule 4: YoY growth sanity ────────────────────────────────

describe('Rule 4 — YoY growth sanity', () => {
  it('flags >500% YoY growth as warning (assignment threshold)', () => {
    const stmt: ClassifiedStatement = {
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2021', periodType: 'HISTORICAL', confidence: 90, lineItems: { revenue: 10 } },
        { period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: { revenue: 80 } }, // 700% growth
      ],
    };
    const result = validateExtraction([stmt]);
    const check = result.checks.find(c => c.check === 'yoy_growth_sanity' && !c.passed);
    expect(check).toBeDefined();
    expect(check?.severity).toBe('warning');
  });

  it('does NOT flag growth under 500%', () => {
    const stmt: ClassifiedStatement = {
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2021', periodType: 'HISTORICAL', confidence: 90, lineItems: { revenue: 10 } },
        { period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: { revenue: 30 } }, // 200% growth — under threshold
      ],
    };
    const result = validateExtraction([stmt]);
    const check = result.checks.find(c => c.check === 'yoy_growth_sanity' && !c.passed);
    expect(check).toBeUndefined();
  });
});

// ─── Rule 5: Cash flow reconciliation ─────────────────────────

describe('Rule 5 — Cash flow reconciliation', () => {
  it('passes when FCF = Operating CF - CapEx', () => {
    // FCF = 100 - 20 = 80
    const result = validateExtraction([cashFlow(100, 20, 80)]);
    const check = result.checks.find(c => c.check === 'cf_fcf_math');
    expect(check?.passed).toBe(true);
  });

  it('fails when FCF does not match Operating CF - CapEx', () => {
    // FCF = 100 - 20 = 80, but extracted as 50
    const result = validateExtraction([cashFlow(100, 20, 50)]);
    const check = result.checks.find(c => c.check === 'cf_fcf_math');
    expect(check?.passed).toBe(false);
  });
});

describe('Cash reconciliation — Beginning Cash + Net Change = Ending Cash', () => {
  it('passes when BS cash delta matches CF net_change_cash', () => {
    const bs: ClassifiedStatement = {
      statementType: 'BALANCE_SHEET',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: { cash: 100 } },
        { period: '2023', periodType: 'HISTORICAL', confidence: 90, lineItems: { cash: 120 } }, // +20
      ],
    };
    const cf: ClassifiedStatement = {
      statementType: 'CASH_FLOW',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2023', periodType: 'HISTORICAL', confidence: 90, lineItems: { net_change_cash: 20 } },
      ],
    };

    const result = validateExtraction([bs, cf]);
    const check = result.checks.find(c => c.check === 'cf_cash_reconciliation');
    expect(check?.passed).toBe(true);
  });

  it('fails when BS cash delta conflicts with CF net_change_cash', () => {
    const bs: ClassifiedStatement = {
      statementType: 'BALANCE_SHEET',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: { cash: 100 } },
        { period: '2023', periodType: 'HISTORICAL', confidence: 90, lineItems: { cash: 140 } }, // +40
      ],
    };
    const cf: ClassifiedStatement = {
      statementType: 'CASH_FLOW',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2023', periodType: 'HISTORICAL', confidence: 90, lineItems: { net_change_cash: 20 } },
      ],
    };

    const result = validateExtraction([bs, cf]);
    const check = result.checks.find(c => c.check === 'cf_cash_reconciliation');
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('error');
  });
});

// ─── Rule 6: Subtotal consistency ─────────────────────────────

describe('Rule 6 — Subtotal grouped consistency', () => {
  it('passes when subtotal matches preceding items', () => {
    const stmt: ClassifiedStatement = {
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: 'FY2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: {
          revenue: 100,
          cogs: 40,
          gross_profit: 60, // 100 - 40 = 60 ✓ (validator.ts now treats cogs as negative)
        },
      }],
    };

    const result = validateExtraction([stmt]);
    const check = result.checks.find(c => c.check === 'subtotal_consistency');
    if (check) {
      expect(check.passed).toBe(true);
    }
    expect(result.errorCount).toBe(0);
  });

  it('flags when gross_profit does not match revenue + cogs', () => {
    const stmt: ClassifiedStatement = {
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: 'FY2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: {
          revenue: 1000,
          cogs: 400,
          gross_profit: 800, // Expected 600
        },
      }],
    };

    const result = validateExtraction([stmt]);
    const check = result.checks.find(c => c.check === 'subtotal_consistency');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
  });
});

// ─── Rule 7: Net income consistency ───────────────────────────

describe('Rule 7 — Net income consistency (IS vs CF)', () => {
  it('passes when net_income matches between IS and CF', () => {
    const is = incomeStatement({ net_income: 15 });
    const cf: ClassifiedStatement = {
      statementType: 'CASH_FLOW',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: 'FY2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: { net_income: 15, operating_cf: 20, capex: -5, fcf: 15 },
      }],
    };

    const result = validateExtraction([is, cf]);
    const check = result.checks.find(c => c.check === 'net_income_consistency');
    expect(check?.passed).toBe(true);
  });

  it('fails when net_income conflicts between IS and CF', () => {
    const is = incomeStatement({ net_income: 15 });
    const cf: ClassifiedStatement = {
      statementType: 'CASH_FLOW',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: 'FY2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: { net_income: 9, operating_cf: 20, capex: -5, fcf: 15 },
      }],
    };

    const result = validateExtraction([is, cf]);
    const check = result.checks.find(c => c.check === 'net_income_consistency');
    expect(check?.passed).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});

// ─── Output shape ─────────────────────────────────────────────

describe('Output shape', () => {
  it('returns the correct PipelineValidationResult shape', () => {
    const result = validateExtraction([incomeStatement()]);
    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('errorCount');
    expect(result).toHaveProperty('warningCount');
    expect(result).toHaveProperty('infoCount');
    expect(result).toHaveProperty('overallPassed');
    expect(result).toHaveProperty('flaggedItems');
    expect(result).toHaveProperty('overallConfidence');
    expect(Array.isArray(result.checks)).toBe(true);
    expect(Array.isArray(result.flaggedItems)).toBe(true);
    expect(typeof result.overallPassed).toBe('boolean');
    expect(typeof result.overallConfidence).toBe('number');
  });

  it('returns empty result for empty statements array', () => {
    const result = validateExtraction([]);
    expect(result.checks).toHaveLength(0);
    expect(result.flaggedItems).toHaveLength(0);
    expect(result.overallPassed).toBe(true);
    expect(result.overallConfidence).toBe(0);
  });

  it('overallConfidence is average of period confidences', () => {
    const stmt: ClassifiedStatement = {
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        { period: '2021', periodType: 'HISTORICAL', confidence: 80, lineItems: { revenue: 10 } },
        { period: '2022', periodType: 'HISTORICAL', confidence: 60, lineItems: { revenue: 12 } },
      ],
    };

    const result = validateExtraction([stmt]);
    expect(result.overallConfidence).toBe(70); // (80 + 60) / 2 = 70
  });
});
