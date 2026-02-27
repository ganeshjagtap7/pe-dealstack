import { log } from '../utils/logger.js';
import type { ClassifiedStatement } from './financialClassifier.js';

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
  overallPassed: boolean;     // true if no errors (warnings are OK)
}

// Format value in millions to human-readable form
function fmtVal(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}M`;
  if (abs * 1000 >= 1) return `${sign}$${(abs * 1000).toFixed(1)}K`;
  return `${sign}$${(abs * 1000000).toFixed(0)}`;
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

const TOLERANCE = 0.05; // 5% tolerance for math cross-checks

function pct(numerator: number, denominator: number): number {
  return (numerator / denominator) * 100;
}

function withinTolerance(a: number, b: number): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / Math.abs(b) <= TOLERANCE;
}

/** Subtask 4a — Income statement math checks */
function checkIncomeStatement(
  lineItems: Record<string, number | null>,
  period: string,
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems[k] ?? null;

  const revenue = li('revenue');
  const cogs = li('cogs');
  const grossProfit = li('gross_profit');
  const ebitda = li('ebitda');
  const ebitdaMarginPct = li('ebitda_margin_pct');
  const da = li('da');
  const ebit = li('ebit');

  // 4a: Revenue - COGS = Gross Profit
  if (revenue !== null && cogs !== null && grossProfit !== null) {
    const calc = revenue - cogs;
    checks.push({
      check: 'is_gross_profit_math',
      passed: withinTolerance(calc, grossProfit),
      severity: 'error',
      message: withinTolerance(calc, grossProfit)
        ? `Gross profit checks out: ${fmtVal(revenue)} - ${fmtVal(cogs)} ≈ ${fmtVal(grossProfit)}`
        : `Gross profit mismatch: Revenue ${fmtVal(revenue)} - COGS ${fmtVal(cogs)} = ${fmtVal(calc)}, but extracted ${fmtVal(grossProfit)}`,
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
        ? `EBITDA ${fmtVal(ebitda)} exceeds revenue ${fmtVal(revenue)} — likely an extraction error`
        : `EBITDA is within revenue bounds`,
      period,
    });
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
    checks.push({
      check: 'is_ebitda_margin_sane',
      passed: calcMargin >= -50 && calcMargin <= 80,
      severity: calcMargin > 60 ? 'warning' : 'info',
      message: calcMargin > 60
        ? `EBITDA margin of ${calcMargin.toFixed(1)}% is unusually high — verify`
        : calcMargin < 0
          ? `EBITDA margin of ${calcMargin.toFixed(1)}% indicates losses`
          : `EBITDA margin of ${calcMargin.toFixed(1)}% is within normal range`,
      period,
    });
  }

  // EBITDA - D&A = EBIT
  if (ebitda !== null && da !== null && ebit !== null) {
    const calc = ebitda - da;
    checks.push({
      check: 'is_ebit_math',
      passed: withinTolerance(calc, ebit),
      severity: 'warning',
      message: withinTolerance(calc, ebit)
        ? `EBIT math checks out: EBITDA ${fmtVal(ebitda)} - D&A ${fmtVal(da)} ≈ EBIT ${fmtVal(ebit)}`
        : `EBIT mismatch: EBITDA ${fmtVal(ebitda)} - D&A ${fmtVal(da)} = ${fmtVal(calc)}, but extracted EBIT ${fmtVal(ebit)}`,
      period,
    });
  }

  return checks;
}

/** Subtask 4b — Balance sheet: Assets = Liabilities + Equity */
function checkBalanceSheet(
  lineItems: Record<string, number | null>,
  period: string,
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems[k] ?? null;

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
        ? `Balance sheet balances: Assets ≈ Liabilities + Equity (${fmtVal(totalAssets)})`
        : `Balance sheet doesn't balance: Assets ${fmtVal(totalAssets)} ≠ Liabilities ${fmtVal(totalLiabilities)} + Equity ${fmtVal(totalEquity)} = ${fmtVal(calc)}`,
      period,
    });
  }

  // Current assets ≤ total assets
  if (totalCurrentAssets !== null && totalAssets !== null && totalCurrentAssets > totalAssets) {
    checks.push({
      check: 'bs_current_assets_sane',
      passed: false,
      severity: 'error',
      message: `Current assets ${fmtVal(totalCurrentAssets)} exceed total assets ${fmtVal(totalAssets)} — extraction error`,
      period,
    });
  }

  // Current liabilities ≤ total liabilities
  if (totalCurrentLiabilities !== null && totalLiabilities !== null && totalCurrentLiabilities > totalLiabilities) {
    checks.push({
      check: 'bs_current_liabilities_sane',
      passed: false,
      severity: 'error',
      message: `Current liabilities ${fmtVal(totalCurrentLiabilities)} exceed total liabilities ${fmtVal(totalLiabilities)} — extraction error`,
      period,
    });
  }

  return checks;
}

/** Subtask 4c — Cash flow: FCF = Operating CF - CapEx */
function checkCashFlow(
  lineItems: Record<string, number | null>,
  period: string,
): StatementCheck[] {
  const checks: StatementCheck[] = [];
  const li = (k: string) => lineItems[k] ?? null;

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
        ? `FCF checks out: Operating CF ${fmtVal(operatingCf)} - CapEx ${fmtVal(capexAbs)} ≈ FCF ${fmtVal(fcf)}`
        : `FCF mismatch: ${fmtVal(operatingCf)} - ${fmtVal(capexAbs)} = ${fmtVal(calc)}, but extracted FCF ${fmtVal(fcf)}`,
      period,
    });
  }

  return checks;
}

/** Subtask 4e — YoY growth sanity across sorted periods */
function checkYoYGrowth(
  periods: Array<{ period: string; periodType: string; lineItems: Record<string, number | null> }>,
): StatementCheck[] {
  const checks: StatementCheck[] = [];

  // Only check historical periods in chronological order
  const historical = periods
    .filter(p => p.periodType === 'HISTORICAL')
    .sort((a, b) => a.period.localeCompare(b.period));

  for (let i = 1; i < historical.length; i++) {
    const prev = historical[i - 1];
    const curr = historical[i];
    const prevRev = prev.lineItems['revenue'] ?? null;
    const currRev = curr.lineItems['revenue'] ?? null;

    if (prevRev !== null && currRev !== null && prevRev > 0) {
      const growth = pct(currRev - prevRev, prevRev);
      // 4e: Flag >100% or < -50% swings
      if (Math.abs(growth) > 100) {
        checks.push({
          check: 'yoy_revenue_growth_sane',
          passed: false,
          severity: 'warning',
          message: `Revenue growth from ${prev.period} to ${curr.period} is ${growth.toFixed(1)}% — verify (${fmtVal(prevRev)} → ${fmtVal(currRev)})`,
          period: curr.period,
        });
      }
    }

    const prevEbitda = prev.lineItems['ebitda'] ?? null;
    const currEbitda = curr.lineItems['ebitda'] ?? null;
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
        periodChecks = checkIncomeStatement(period.lineItems, period.period);
      } else if (stmt.statementType === 'BALANCE_SHEET') {
        periodChecks = checkBalanceSheet(period.lineItems, period.period);
      } else if (stmt.statementType === 'CASH_FLOW') {
        periodChecks = checkCashFlow(period.lineItems, period.period);
      }

      allChecks.push(...periodChecks);
    }

    // YoY growth checks across all periods for income statements
    if (stmt.statementType === 'INCOME_STATEMENT') {
      allChecks.push(...checkYoYGrowth(stmt.periods));
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
    overallPassed: errorCount === 0,
  };
}
