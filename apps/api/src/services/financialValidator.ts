import { log } from '../utils/logger.js';
import type { ClassifiedStatement, LineItem } from './financialClassifier.js';

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  corrections: Record<string, { original: any; corrected: any; reason: string }>;
}

// ─── 3-Statement Validation Types ────────────────────────────

export interface StatementCheck {
  check: string;              // machine-readable key e.g. "bs_balances"
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;            // human-readable description
  period?: string;            // which period this applies to
}

export interface StatementsValidationResult {
  checks: StatementCheck[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  isValid: boolean;     // true if no errors (warnings are OK)
}

// Format value in millions to human-readable form with currency symbol
function fmtVal(v: number, currency: string = 'USD'): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';

  // Currency symbol mapping
  const currencySymbols: Record<string, string> = {
    USD: '$',
    INR: '₹',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'C$',
    AUD: 'A$',
    CHF: 'Fr',
  };

  const symbol = currencySymbols[currency] || currency;

  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}${symbol}${abs.toFixed(1)}M`;
  if (abs * 1000 >= 1) return `${sign}${symbol}${(abs * 1000).toFixed(1)}K`;
  return `${sign}${symbol}${(abs * 1000000).toFixed(0)}`;
}

/**
 * Validate and sanity-check extracted financial data.
 * Supports deals ranging from micro-acquisitions ($1K+) to large PE ($5B).
 */
export function validateFinancials(data: {
  revenue?: number | null;
  ebitda?: number | null;
  ebitdaMargin?: number | null;
  revenueGrowth?: number | null;
  dealSize?: number | null;
  employees?: number | null;
}): ValidationResult {
  const warnings: string[] = [];
  const corrections: Record<string, { original: any; corrected: any; reason: string }> = {};

  // Revenue sanity check (expect values in millions)
  if (data.revenue !== null && data.revenue !== undefined) {
    if (data.revenue > 50000) {
      warnings.push(`Revenue ${fmtVal(data.revenue)} seems too high. May be in thousands.`);
      corrections.revenue = {
        original: data.revenue,
        corrected: data.revenue / 1000,
        reason: 'Value exceeds $50B — likely reported in thousands, not millions',
      };
    }
    if (data.revenue > 0 && data.revenue < 0.0001) {
      // Only flag if less than $100 — micro-acquisitions with $1K+ revenue are valid
      warnings.push(`Revenue ${fmtVal(data.revenue)} seems extremely low. Verify units.`);
    }
    if (data.revenue < 0) {
      warnings.push('Revenue is negative — likely an error.');
    }
  }

  // EBITDA margin check
  if (data.ebitdaMargin !== null && data.ebitdaMargin !== undefined) {
    if (data.ebitdaMargin > 80) {
      warnings.push(`EBITDA margin of ${data.ebitdaMargin}% is unusually high. Verify.`);
    }
    if (data.ebitdaMargin < -50) {
      warnings.push(`EBITDA margin of ${data.ebitdaMargin}% indicates significant losses.`);
    }
  }

  // Cross-check: EBITDA vs Revenue
  if (data.revenue && data.ebitda && data.revenue > 0) {
    const calculatedMargin = (data.ebitda / data.revenue) * 100;
    if (data.ebitdaMargin && Math.abs(calculatedMargin - data.ebitdaMargin) > 5) {
      warnings.push(
        `EBITDA margin mismatch: extracted ${data.ebitdaMargin}% but calculated ${calculatedMargin.toFixed(1)}% from revenue/EBITDA.`
      );
    }
    if (data.ebitda > data.revenue) {
      warnings.push('EBITDA exceeds revenue — likely an extraction error.');
    }
  }

  // Revenue growth check
  if (data.revenueGrowth !== null && data.revenueGrowth !== undefined) {
    if (data.revenueGrowth > 200) {
      warnings.push(`Revenue growth of ${data.revenueGrowth}% is exceptionally high. Verify.`);
    }
  }

  // Employee count check
  if (data.employees !== null && data.employees !== undefined) {
    if (data.employees > 100000) {
      warnings.push(`${data.employees} employees seems very high for a PE target.`);
    }
    if (data.revenue && data.employees > 0) {
      const revenuePerEmployee = (data.revenue * 1000000) / data.employees;
      if (revenuePerEmployee < 10000) {
        warnings.push(`Revenue per employee ($${(revenuePerEmployee / 1000).toFixed(0)}K) is unusually low.`);
      }
    }
  }

  if (warnings.length > 0) {
    log.warn('Financial validation warnings', { warnings, corrections });
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    corrections,
  };
}

// ─── 3-Statement Cross-Check Validators ──────────────────────

// Assignment spec uses 1% tolerance for core financial math cross-checks.
// Keep this strict to catch unit-scale and row-mapping extraction errors early.
const TOLERANCE = 0.01; // 1% tolerance per assignment requirement

function pct(numerator: number, denominator: number): number {
  return (numerator / denominator) * 100;
}

function withinTolerance(a: number, b: number): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= TOLERANCE;
}

/** Subtask 4a — Income statement math checks */
function checkIncomeStatement(
  lineItems: LineItem[],
  period: string,
  currency: string = 'USD',
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems.find(l => l.name === k)?.value ?? null;

  const revenue = li('revenue');
  const cogs = li('cogs');
  const grossProfit = li('gross_profit');
  const ebitda = li('ebitda');
  const ebitdaMarginPct = li('ebitda_margin_pct');
  const da = li('da');
  const ebit = li('ebit');
  const netIncome = li('net_income');

  // 4a: Revenue - COGS = Gross Profit
  if (revenue !== null && cogs !== null && grossProfit !== null) {
    const calc = revenue - cogs;
    checks.push({
      check: 'is_gross_profit_math',
      passed: withinTolerance(calc, grossProfit),
      severity: 'error',
      message: withinTolerance(calc, grossProfit)
        ? `Gross profit checks out: ${fmtVal(revenue, currency)} - ${fmtVal(cogs, currency)} ≈ ${fmtVal(grossProfit, currency)}`
        : `Gross profit mismatch: Revenue ${fmtVal(revenue, currency)} - COGS ${fmtVal(cogs, currency)} = ${fmtVal(calc, currency)}, but extracted ${fmtVal(grossProfit, currency)}`,
      period,
    });
  }

  // CRITICAL: Gross Profit must be <= Revenue (accounting impossibility otherwise)
  if (revenue !== null && grossProfit !== null && revenue > 0) {
    const gpExceedsRevenue = grossProfit > revenue;
    checks.push({
      check: 'is_gross_profit_lte_revenue',
      passed: !gpExceedsRevenue,
      severity: 'error',
      message: gpExceedsRevenue
        ? `Gross Profit ${fmtVal(grossProfit, currency)} exceeds Revenue ${fmtVal(revenue, currency)} — IMPOSSIBLE: Revenue must be >= Gross Profit`
        : `Gross Profit (${fmtVal(grossProfit, currency)}) is within Revenue bounds (${fmtVal(revenue, currency)})`,
      period,
    });
  }

  // EBITDA must be less than revenue
  if (revenue !== null && ebitda !== null && revenue > 0) {
    const exceeds = ebitda > revenue;
    checks.push({
      check: 'is_ebitda_lt_revenue',
      passed: !exceeds,
      severity: 'error',
      message: exceeds
        ? `EBITDA ${fmtVal(ebitda, currency)} exceeds revenue ${fmtVal(revenue, currency)} — likely an extraction error`
        : `EBITDA is within revenue bounds`,
      period,
    });
  }

  // CRITICAL: Net Income must be <= EBITDA in most cases (rare exceptions for unusual items)
  if (ebitda !== null && netIncome !== null) {
    const niExceedsEbitda = netIncome > ebitda;
    // Only flag as error if significantly exceeds (accounting for non-standard items)
    if (niExceedsEbitda && (netIncome - ebitda) / Math.abs(ebitda) > 0.1) {
      checks.push({
        check: 'is_net_income_lte_ebitda',
        passed: false,
        severity: 'warning',
        message: `Net Income ${fmtVal(netIncome, currency)} exceeds EBITDA ${fmtVal(ebitda, currency)} by >10% — unusual, verify for one-time gains`,
        period,
      });
    }
  }

  // 4d: EBITDA margin sanity (5–60% normal for LMM)
  if (revenue !== null && ebitda !== null && revenue > 0) {
    const calcMargin = pct(ebitda, revenue);
    if (ebitdaMarginPct !== null && !withinTolerance(calcMargin, ebitdaMarginPct)) {
      checks.push({
        check: 'is_ebitda_margin_consistent',
        passed: false,
        severity: 'warning',
        message: `EBITDA margin mismatch: extracted ${ebitdaMarginPct.toFixed(1)}% but calculated ${calcMargin.toFixed(1)}% from revenue/EBITDA`,
        period,
      });
    }
    if (calcMargin > 60) {
      checks.push({
        check: 'is_ebitda_margin_sane',
        passed: false,
        severity: 'warning',
        message: `EBITDA margin of ${calcMargin.toFixed(1)}% is unusually high — verify`,
        period,
      });
    } else if (calcMargin < 0) {
      checks.push({
        check: 'is_ebitda_margin_sane',
        passed: false,
        severity: calcMargin < -10 ? 'error' : 'warning',
        message: calcMargin < -10
          ? `EBITDA margin of ${calcMargin.toFixed(1)}% indicates extreme losses`
          : `EBITDA margin of ${calcMargin.toFixed(1)}% indicates losses`,
        period,
      });
    } else {
      checks.push({
        check: 'is_ebitda_margin_sane',
        passed: true,
        severity: 'info',
        message: `EBITDA margin of ${calcMargin.toFixed(1)}% is within normal range`,
        period,
      });
    }
  }

  // EBIT = EBITDA - D&A
  if (ebitda !== null && da !== null && ebit !== null) {
    const calc = ebitda - da;
    checks.push({
      check: 'is_ebit_math',
      passed: withinTolerance(calc, ebit),
      severity: 'warning',
      message: withinTolerance(calc, ebit)
        ? `EBIT math checks out: EBITDA ${fmtVal(ebitda, currency)} - D&A ${fmtVal(da, currency)} ≈ EBIT ${fmtVal(ebit, currency)}`
        : `EBIT mismatch: EBITDA ${fmtVal(ebitda, currency)} - D&A ${fmtVal(da, currency)} = ${fmtVal(calc, currency)}, but extracted EBIT ${fmtVal(ebit, currency)}`,
      period,
    });
  }

  return checks;
}

/** Subtask 4b — Balance sheet: Assets = Liabilities + Equity */
function checkBalanceSheet(
  lineItems: LineItem[],
  period: string,
  currency: string = 'USD',
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems.find(l => l.name === k)?.value ?? null;

  const totalAssets = li('total_assets');
  const totalLiabilities = li('total_liabilities');
  const totalEquity = li('total_equity');
  const totalCurrentAssets = li('total_current_assets');
  const totalCurrentLiabilities = li('total_current_liabilities');

  // Assets = Liabilities + Equity
  if (totalAssets !== null && totalLiabilities !== null && totalEquity !== null) {
    const calc = totalLiabilities + totalEquity;
    checks.push({
      check: 'bs_balances',
      passed: withinTolerance(calc, totalAssets),
      severity: 'error',
      message: withinTolerance(calc, totalAssets)
        ? `Balance sheet balances: Assets ≈ Liabilities + Equity (${fmtVal(totalAssets, currency)})`
        : `Balance sheet doesn't balance: Assets ${fmtVal(totalAssets, currency)} ≠ Liabilities ${fmtVal(totalLiabilities, currency)} + Equity ${fmtVal(totalEquity, currency)} = ${fmtVal(calc, currency)}`,
      period,
    });
  }

  // Current assets ≤ total assets
  if (totalCurrentAssets !== null && totalAssets !== null && totalCurrentAssets > totalAssets) {
    checks.push({
      check: 'bs_current_assets_sane',
      passed: false,
      severity: 'error',
      message: `Current assets ${fmtVal(totalCurrentAssets, currency)} exceed total assets ${fmtVal(totalAssets, currency)} — extraction error`,
      period,
    });
  }

  // Current liabilities ≤ total liabilities
  if (totalCurrentLiabilities !== null && totalLiabilities !== null && totalCurrentLiabilities > totalLiabilities) {
    checks.push({
      check: 'bs_current_liabilities_sane',
      passed: false,
      severity: 'error',
      message: `Current liabilities ${fmtVal(totalCurrentLiabilities, currency)} exceed total liabilities ${fmtVal(totalLiabilities, currency)} — extraction error`,
      period,
    });
  }

  return checks;
}

/** Subtask 4c — Cash flow: FCF = Operating CF - CapEx */
function checkCashFlow(
  lineItems: LineItem[],
  period: string,
  currency: string = 'USD',
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems.find(l => l.name === k)?.value ?? null;

  const operatingCf = li('operating_cf');
  const capex = li('capex');
  const fcf = li('fcf');

  // FCF = Operating CF - CapEx
  if (operatingCf !== null && capex !== null && fcf !== null) {
    // CapEx is typically negative in CF statements but sometimes stored as positive
    const capexAbs = Math.abs(capex);
    const calc = operatingCf - capexAbs;
    checks.push({
      check: 'cf_fcf_math',
      passed: withinTolerance(calc, fcf),
      severity: 'warning',
      message: withinTolerance(calc, fcf)
        ? `FCF checks out: Operating CF ${fmtVal(operatingCf, currency)} - CapEx ${fmtVal(capexAbs, currency)} ≈ FCF ${fmtVal(fcf, currency)}`
        : `FCF mismatch: ${fmtVal(operatingCf, currency)} - ${fmtVal(capexAbs, currency)} = ${fmtVal(calc, currency)}, but extracted FCF ${fmtVal(fcf, currency)}`,
      period,
    });
  }

  return checks;
}

/** Subtask 4e — YoY growth sanity across sorted periods */
function checkYoYGrowth(
  periods: Array<{ period: string; periodType: string; lineItems: LineItem[] }>,
  currency: string = 'USD',
): StatementCheck[] {
  const checks: StatementCheck[] = [];

  // Only check historical periods in chronological order
  const historical = periods
    .filter(p => p.periodType === 'HISTORICAL')
    .sort((a, b) => a.period.localeCompare(b.period));

  for (let i = 1; i < historical.length; i++) {
    const prev = historical[i - 1];
    const curr = historical[i];
    const prevRev = prev.lineItems.find(l => l.name === 'revenue')?.value ?? null;
    const currRev = curr.lineItems.find(l => l.name === 'revenue')?.value ?? null;

    if (prevRev !== null && currRev !== null && prevRev > 0) {
      const growth = pct(currRev - prevRev, prevRev);
      // Assignment: Flag >500% YoY growth as suspicious
      if (Math.abs(growth) > 500) {
        checks.push({
          check: 'yoy_revenue_growth_sane',
          passed: false,
          severity: 'warning',
          message: `Revenue growth from ${prev.period} to ${curr.period} is ${growth.toFixed(1)}% — verify (${fmtVal(prevRev, currency)} → ${fmtVal(currRev, currency)})`,
          period: curr.period,
        });
      }
    }

    const prevEbitda = prev.lineItems.find(l => l.name === 'ebitda')?.value ?? null;
    const currEbitda = curr.lineItems.find(l => l.name === 'ebitda')?.value ?? null;
    if (prevRev !== null && prevRev > 0 && currRev !== null && currRev > 0 && prevEbitda !== null && currEbitda !== null) {
      const prevMargin = pct(prevEbitda, prevRev);
      const currMargin = pct(currEbitda, currRev);
      if (Math.abs(currMargin - prevMargin) > 20) {
        checks.push({
          check: 'yoy_margin_swing_sane',
          passed: false,
          severity: 'warning',
          message: `EBITDA margin swung ${(currMargin - prevMargin).toFixed(1)}pp from ${prev.period} (${prevMargin.toFixed(1)}%) to ${curr.period} (${currMargin.toFixed(1)}%) — verify`,
          period: curr.period,
        });
      }
    }
  }

  return checks;
}

/**
 * Subtask 4f — Top-level validator for the full extracted 3-statement model.
 * Input is the ClassifiedStatement[] array from financialClassifier.ts.
 * Returns structured StatementCheck[] with severity levels.
 */
export function validateStatements(statements: ClassifiedStatement[]): StatementsValidationResult {
  const allChecks: StatementCheck[] = [];

  for (const stmt of statements) {
    for (const period of stmt.periods) {
      let periodChecks: StatementCheck[] = [];

      if (stmt.statementType === 'INCOME_STATEMENT') {
        periodChecks = checkIncomeStatement(period.lineItems, period.period, stmt.currency);
      } else if (stmt.statementType === 'BALANCE_SHEET') {
        periodChecks = checkBalanceSheet(period.lineItems, period.period, stmt.currency);
      } else if (stmt.statementType === 'CASH_FLOW') {
        periodChecks = checkCashFlow(period.lineItems, period.period, stmt.currency);
      }

      allChecks.push(...periodChecks);
    }

    // YoY growth checks across all periods for income statements
    if (stmt.statementType === 'INCOME_STATEMENT') {
      allChecks.push(...checkYoYGrowth(stmt.periods, stmt.currency));
    }
  }

  const errorCount = allChecks.filter(c => !c.passed && c.severity === 'error').length;
  const warningCount = allChecks.filter(c => !c.passed && c.severity === 'warning').length;
  const infoCount = allChecks.filter(c => c.severity === 'info').length;

  if (errorCount > 0 || warningCount > 0) {
    log.warn('Statement validation issues found', { errorCount, warningCount });
  }

  return {
    checks: allChecks,
    errorCount,
    warningCount,
    infoCount,
    isValid: errorCount === 0,
  };
}
