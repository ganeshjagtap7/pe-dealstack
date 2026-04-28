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
        lineItems: { total_assets: 100, total_liabilities: 50, total_equity: 40 } // 100 != 90
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
        lineItems: { revenue: 100, cogs: 60, gross_profit: 40 }
      }]
    }];
    const result = validateStatements(stmts as any);
    const check = result.checks.find(c => c.check === 'is_gross_profit_math');
    expect(check?.passed).toBe(true);
  });
});
