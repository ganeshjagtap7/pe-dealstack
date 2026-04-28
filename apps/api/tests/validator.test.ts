/**
 * validator.test.ts — Subtask 3: Cross-statement validation
 */

import { describe, it, expect } from 'vitest';
import { validateStatements } from '../src/services/financialValidator.js';

describe('Subtask 3 — Cross-statement validation', () => {
  it('FAILS when balance sheet does not balance', () => {
    const stmts = [{
      statementType: 'BALANCE_SHEET',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: [
          { name: 'total_assets', value: 100 },
          { name: 'total_liabilities', value: 50 },
          { name: 'total_equity', value: 40 }
        ] // 100 != 90 (50+40)
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'bs_balances');
    expect(check?.passed).toBe(false);
  });

  it('PASSES when income statement math is correct', () => {
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: [
          { name: 'revenue', value: 100 },
          { name: 'cogs', value: 60 },
          { name: 'gross_profit', value: 40 }
        ] // 100 - 60 = 40 ✓
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'is_gross_profit_math');
    expect(check?.passed).toBe(true);
  });

  it('PASSES when balance sheet balances within 1% tolerance', () => {
    const stmts = [{
      statementType: 'BALANCE_SHEET',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: [
          { name: 'total_assets', value: 100 },
          { name: 'total_liabilities', value: 50.5 },
          { name: 'total_equity', value: 49.5 }
        ] // 100 ≈ 100 (50.5+49.5) within 1%
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'bs_balances');
    expect(check?.passed).toBe(true);
  });

  it('FLAGS YoY growth over 500% as suspicious', () => {
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [
        {
          period: '2022',
          periodType: 'HISTORICAL',
          confidence: 90,
          lineItems: [{ name: 'revenue', value: 10 }]
        },
        {
          period: '2023',
          periodType: 'HISTORICAL',
          confidence: 90,
          lineItems: [{ name: 'revenue', value: 80 }] // 700% growth
        }
      ]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'yoy_revenue_growth_sane');
    expect(check?.passed).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL NEW RULES: Revenue bounds checking (fixes screenshot bug)
  // ─────────────────────────────────────────────────────────────────────────

  it('CRITICAL: FAILS when Gross Profit > Revenue (accounting impossibility)', () => {
    // This is the bug from the screenshot: Revenue $12M, Gross Profit $48M
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 85,
        lineItems: [
          { name: 'revenue', value: 12 },        // $12M
          { name: 'cogs', value: 60 },
          { name: 'gross_profit', value: 48 }    // $48M > $12M - IMPOSSIBLE!
        ]
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'is_gross_profit_lte_revenue');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('error');
  });

  it('CRITICAL: FAILS when EBITDA > Revenue', () => {
    // Another impossible scenario: EBITDA cannot exceed Revenue
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 85,
        lineItems: [
          { name: 'revenue', value: 20 },
          { name: 'ebitda', value: 30 }  // $30M > $20M - impossible!
        ]
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'is_ebitda_lt_revenue');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('error');
  });

  it('PASSES when all revenue bounds are satisfied', () => {
    // Valid income statement: Revenue >= GP >= EBITDA >= Net Income
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 90,
        lineItems: [
          { name: 'revenue', value: 100 },
          { name: 'cogs', value: 60 },
          { name: 'gross_profit', value: 40 },    // 100 - 60 = 40 ✓
          { name: 'total_opex', value: 20 },
          { name: 'ebitda', value: 30 },          // 40 - 10 = 30 ✓
          { name: 'da', value: 5 },
          { name: 'ebit', value: 25 },
          { name: 'interest_expense', value: 5 },
          { name: 'tax', value: 6 },
          { name: 'net_income', value: 14 }       // 25 - 5 - 6 = 14 ✓
        ]
      }]
    }];
    const result = validateStatements(stmts as any);
    
    const gpCheck = result.checks.find(c => c.check === 'is_gross_profit_lte_revenue');
    const ebitdaCheck = result.checks.find(c => c.check === 'is_ebitda_lt_revenue');
    
    expect(gpCheck?.passed).toBe(true);
    expect(ebitdaCheck?.passed).toBe(true);
  });

  it('FLAGS Net Income > EBITDA by >10% as unusual (warning)', () => {
    // Net Income exceeding EBITDA is unusual (requires non-operating gains)
    const stmts = [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{
        period: '2023',
        periodType: 'HISTORICAL',
        confidence: 85,
        lineItems: [
          { name: 'revenue', value: 100 },
          { name: 'ebitda', value: 20 },
          { name: 'net_income', value: 25 }  // 25 > 20 by 25% - unusual
        ]
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'is_net_income_lte_ebitda');
    expect(check).toBeDefined();
    expect(check?.passed).toBe(false);
    expect(check?.severity).toBe('warning');
  });
});
