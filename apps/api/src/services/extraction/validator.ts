import type { ClassifiedStatement } from './financialClassifier.js';
import { log } from '../../utils/logger.js';

const TOLERANCE = 0.01;

export interface ValidationCheck {
  rule: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  expected?: number;
  actual?: number;
  details: string;
  period?: string;
}

export interface FlaggedItem {
  lineItem: string;
  statementType: string;
  period: string;
  value: number;
  reason: string;
  suggestedAction: 'review' | 'likely_correct' | 'likely_wrong';
}

export interface PipelineValidationResult {
  checks: ValidationCheck[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  isValid: boolean;
  flaggedItems: FlaggedItem[];
  overallConfidence: number;
}

function withinTolerance(a: number, b: number, tol = TOLERANCE): boolean {
  if (b === 0) return Math.abs(a) <= tol;
  return Math.abs(a - b) / Math.abs(b) <= tol;
}

function getVal(lineItems: Array<{ name: string; value: number | null }>, key: string): number | null {
  return lineItems.find(l => l.name === key)?.value ?? null;
}

function suggestAction(actual: number, expected: number): 'review' | 'likely_wrong' {
  if (expected === 0) return 'likely_wrong';
  const ratio = Math.abs(actual / expected);
  return ratio > 10 || ratio < 0.1 ? 'likely_wrong' : 'review';
}

export function validateExtraction(statements: ClassifiedStatement[]): PipelineValidationResult {
  const checks: ValidationCheck[] = [];
  const flaggedItems: FlaggedItem[] = [];

  const bs = statements.find(s => s.statementType === 'BALANCE_SHEET');
  const is = statements.find(s => s.statementType === 'INCOME_STATEMENT');
  const cf = statements.find(s => s.statementType === 'CASH_FLOW');

  // Rule 1: bs_balances
  if (bs) {
    for (const period of bs.periods) {
      const totalAssets = getVal(period.lineItems, 'total_assets');
      const totalLiabilities = getVal(period.lineItems, 'total_liabilities');
      const totalEquity = getVal(period.lineItems, 'total_equity');

      if (totalAssets !== null && totalLiabilities !== null && totalEquity !== null) {
        const calcLiabPlusEquity = totalLiabilities + totalEquity;
        const passed = withinTolerance(calcLiabPlusEquity, totalAssets);
        const check: ValidationCheck = {
          rule: 'bs_balances',
          passed,
          severity: 'error',
          expected: totalAssets,
          actual: calcLiabPlusEquity,
          details: passed
            ? `Balance sheet balances: Assets=${totalAssets}`
            : `Balance sheet imbalance: Assets=${totalAssets} ≠ Liabilities(${totalLiabilities}) + Equity(${totalEquity}) = ${calcLiabPlusEquity}`,
          period: period.period,
        };
        checks.push(check);
        if (!passed) {
          flaggedItems.push({
            lineItem: 'total_assets',
            statementType: 'BALANCE_SHEET',
            period: period.period,
            value: totalAssets,
            reason: check.details,
            suggestedAction: suggestAction(calcLiabPlusEquity, totalAssets),
          });
        }
      }
    }
  }

  // Rule 2: net_income_consistency (IS vs CF same period)
  if (is && cf) {
    for (const isPeriod of is.periods) {
      const cfPeriod = cf.periods.find(p => p.period === isPeriod.period);
      if (!cfPeriod) continue;

      const isNI = getVal(isPeriod.lineItems, 'net_income');
      const cfNI = getVal(cfPeriod.lineItems, 'net_income');

      if (isNI !== null && cfNI !== null) {
        const passed = withinTolerance(isNI, cfNI);
        const check: ValidationCheck = {
          rule: 'net_income_consistency',
          passed,
          severity: 'error',
          expected: isNI,
          actual: cfNI,
          details: passed
            ? `Net income consistent between IS and CF: ${isNI}`
            : `Net income mismatch: IS=${isNI} vs CF=${cfNI}`,
          period: isPeriod.period,
        };
        checks.push(check);
        if (!passed) {
          flaggedItems.push({
            lineItem: 'net_income',
            statementType: 'INCOME_STATEMENT',
            period: isPeriod.period,
            value: isNI,
            reason: check.details,
            suggestedAction: suggestAction(cfNI, isNI),
          });
        }
      }
    }
  }

  // Rule 3: revenue_positive
  if (is) {
    for (const period of is.periods) {
      const revenue = getVal(period.lineItems, 'revenue');
      if (revenue !== null) {
        const passed = revenue > 0;
        checks.push({
          rule: 'revenue_positive',
          passed,
          severity: 'warning',
          actual: revenue,
          details: passed ? `Revenue is positive: ${revenue}` : `Revenue is non-positive: ${revenue}`,
          period: period.period,
        });
      }
    }
  }

  // Rule 4: ebitda_margin_sanity
  if (is) {
    for (const period of is.periods) {
      const revenue = getVal(period.lineItems, 'revenue');
      const ebitda = getVal(period.lineItems, 'ebitda');
      if (revenue !== null && ebitda !== null && revenue !== 0) {
        const margin = ebitda / revenue;
        const passed = margin >= -1.0 && margin <= 0.80;
        checks.push({
          rule: 'ebitda_margin_sanity',
          passed,
          severity: 'warning',
          actual: margin,
          details: passed
            ? `EBITDA margin is ${(margin * 100).toFixed(1)}% (sane)`
            : `EBITDA margin of ${(margin * 100).toFixed(1)}% is outside sane range (-100% to 80%)`,
          period: period.period,
        });
      }
    }
  }

  // Rule 5: yoy_revenue_growth_sane (HISTORICAL periods only)
  if (is) {
    const historical = is.periods
      .filter(p => p.periodType === 'HISTORICAL')
      .sort((a, b) => a.period.localeCompare(b.period));

    for (let i = 1; i < historical.length; i++) {
      const prev = historical[i - 1];
      const curr = historical[i];
      const prevRev = getVal(prev.lineItems, 'revenue');
      const currRev = getVal(curr.lineItems, 'revenue');

      if (prevRev !== null && currRev !== null && prevRev > 0) {
        const growthPct = ((currRev - prevRev) / prevRev) * 100;
        const passed = growthPct <= 500;
        checks.push({
          rule: 'yoy_revenue_growth_sane',
          passed,
          severity: 'warning',
          actual: growthPct,
          details: passed
            ? `Revenue YoY growth ${prev.period}→${curr.period}: ${growthPct.toFixed(1)}%`
            : `Revenue YoY growth ${prev.period}→${curr.period} of ${growthPct.toFixed(1)}% exceeds 500% — verify`,
          period: curr.period,
        });
      }
    }
  }

  // Rule 6: cf_reconciliation
  if (cf) {
    for (const period of cf.periods) {
      const beginCash = getVal(period.lineItems, 'beginning_cash');
      const netChange = getVal(period.lineItems, 'net_change_cash');
      const endCash = getVal(period.lineItems, 'ending_cash');

      if (beginCash !== null && netChange !== null && endCash !== null) {
        const calc = beginCash + netChange;
        const passed = withinTolerance(calc, endCash);
        const check: ValidationCheck = {
          rule: 'cf_reconciliation',
          passed,
          severity: 'error',
          expected: endCash,
          actual: calc,
          details: passed
            ? `Cash reconciles: ${beginCash} + ${netChange} ≈ ${endCash}`
            : `Cash reconciliation failed: ${beginCash} + ${netChange} = ${calc} ≠ ${endCash}`,
          period: period.period,
        };
        checks.push(check);
        if (!passed) {
          flaggedItems.push({
            lineItem: 'ending_cash',
            statementType: 'CASH_FLOW',
            period: period.period,
            value: endCash,
            reason: check.details,
            suggestedAction: suggestAction(calc, endCash),
          });
        }
      }
    }
  }

  // Rule 7: subtotal_consistency
  if (is) {
    for (const period of is.periods) {
      const revenue = getVal(period.lineItems, 'revenue');
      const cogs = getVal(period.lineItems, 'cogs');
      const grossProfit = getVal(period.lineItems, 'gross_profit');

      if (revenue !== null && cogs !== null && grossProfit !== null) {
        const calc = revenue - cogs;
        const passed = withinTolerance(calc, grossProfit);
        checks.push({
          rule: 'subtotal_consistency_gross_profit',
          passed,
          severity: 'warning',
          expected: grossProfit,
          actual: calc,
          details: passed
            ? `Gross profit subtotal checks out: ${revenue} - ${cogs} ≈ ${grossProfit}`
            : `Gross profit subtotal mismatch: ${revenue} - ${cogs} = ${calc} ≠ ${grossProfit}`,
          period: period.period,
        });
      }
    }
  }

  // Rule 8: inr_scale_sanity
  if (is) {
    const currency = statements[0]?.currency;
    if (currency === 'INR') {
      for (const period of is.periods) {
        const revenue = getVal(period.lineItems, 'revenue');
        // If revenue < 50M INR (5 Crore), it's suspiciously small for a PE-grade CIM
        // but plausible for a startup. We flag it for double-check.
        if (revenue !== null && revenue < 50) {
          const check: ValidationCheck = {
            rule: 'inr_scale_sanity',
            passed: false,
            severity: 'warning',
            actual: revenue,
            details: `Revenue of ₹${revenue}M (₹${(revenue/10).toFixed(2)} Cr) is very low. Verify if the document intended ₹${(revenue*10).toFixed(0)} Cr (missing 10x factor).`,
            period: period.period,
          };
          checks.push(check);
          flaggedItems.push({
            lineItem: 'revenue',
            statementType: 'INCOME_STATEMENT',
            period: period.period,
            value: revenue,
            reason: check.details,
            suggestedAction: 'review',
          });
        }

        const ebitda = getVal(period.lineItems, 'ebitda');
        if (ebitda !== null && ebitda < 5) {
          const check: ValidationCheck = {
            rule: 'inr_scale_sanity_ebitda',
            passed: false,
            severity: 'warning',
            actual: ebitda,
            details: `EBITDA of ₹${ebitda}M (₹${(ebitda/10).toFixed(2)} Cr) is very low. Verify if the document intended ₹${(ebitda*10).toFixed(0)} Cr.`,
            period: period.period,
          };
          checks.push(check);
          flaggedItems.push({
            lineItem: 'ebitda',
            statementType: 'INCOME_STATEMENT',
            period: period.period,
            value: ebitda,
            reason: check.details,
            suggestedAction: 'review',
          });
        }
      }
    }
  }

  // Bounds: is_gross_profit_lte_revenue
  if (is) {
    for (const period of is.periods) {
      const revenue = getVal(period.lineItems, 'revenue');
      const grossProfit = getVal(period.lineItems, 'gross_profit');

      if (revenue !== null && grossProfit !== null) {
        const passed = grossProfit <= revenue;
        const check: ValidationCheck = {
          rule: 'is_gross_profit_lte_revenue',
          passed,
          severity: 'error',
          expected: revenue,
          actual: grossProfit,
          details: passed
            ? `Gross profit (${grossProfit}) ≤ revenue (${revenue})`
            : `Gross profit (${grossProfit}) exceeds revenue (${revenue}) — impossible`,
          period: period.period,
        };
        checks.push(check);
        if (!passed) {
          flaggedItems.push({
            lineItem: 'gross_profit',
            statementType: 'INCOME_STATEMENT',
            period: period.period,
            value: grossProfit,
            reason: check.details,
            suggestedAction: suggestAction(grossProfit, revenue),
          });
        }
      }
    }
  }

  // Bounds: is_ebitda_lt_revenue
  if (is) {
    for (const period of is.periods) {
      const revenue = getVal(period.lineItems, 'revenue');
      const ebitda = getVal(period.lineItems, 'ebitda');

      if (revenue !== null && ebitda !== null) {
        const passed = ebitda <= revenue;
        const check: ValidationCheck = {
          rule: 'is_ebitda_lt_revenue',
          passed,
          severity: 'error',
          expected: revenue,
          actual: ebitda,
          details: passed
            ? `EBITDA (${ebitda}) ≤ revenue (${revenue})`
            : `EBITDA (${ebitda}) exceeds revenue (${revenue}) — 100%+ margin is impossible`,
          period: period.period,
        };
        checks.push(check);
        if (!passed) {
          flaggedItems.push({
            lineItem: 'ebitda',
            statementType: 'INCOME_STATEMENT',
            period: period.period,
            value: ebitda,
            reason: check.details,
            suggestedAction: suggestAction(ebitda, revenue),
          });
        }
      }
    }
  }

  const errorCount = checks.filter(c => !c.passed && c.severity === 'error').length;
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length;
  const infoCount = checks.filter(c => c.severity === 'info').length;

  const totalPeriodConfidences: number[] = [];
  for (const stmt of statements) {
    for (const period of stmt.periods) {
      totalPeriodConfidences.push(period.confidence);
    }
  }
  const baseConfidence = totalPeriodConfidences.length > 0
    ? Math.round(totalPeriodConfidences.reduce((a, b) => a + b, 0) / totalPeriodConfidences.length)
    : 0;
  const overallConfidence = Math.max(0, Math.min(100, baseConfidence - errorCount * 10 - warningCount * 5));

  if (errorCount > 0 || warningCount > 0) {
    log.warn('Validation issues found', { errorCount, warningCount });
  }

  return {
    checks,
    errorCount,
    warningCount,
    infoCount,
    isValid: errorCount === 0,
    flaggedItems,
    overallConfidence,
  };
}
