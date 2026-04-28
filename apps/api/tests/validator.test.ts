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
});
