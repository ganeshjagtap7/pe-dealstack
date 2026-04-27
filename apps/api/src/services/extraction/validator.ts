/**
 * validator.ts — 7-rule financial validation engine.
 *
 * Wraps the existing validateStatements() from financialValidator.ts (which
 * already implements income-statement math, balance-sheet equality, CF math,
 * YoY growth, and EBITDA margin checks) and adds the two missing rules:
 *   ✅  Revenue > 0
 *   ✅  Subtotal grouped-reset consistency
 *
 * All checks are keyed in StatementsValidationResult.checks so callers
 * can distinguish rules added here from the existing ones.
 *
 * Types re-use the canonical ClassifiedStatement from financialClassifier.ts.
 */

import { validateStatements } from '../financialValidator.js';
import { log } from '../../utils/logger.js';
import type { ClassifiedStatement } from '../financialClassifier.js';
import type { StatementsValidationResult, StatementCheck } from '../financialValidator.js';

// ─── Types ────────────────────────────────────────────────────

export interface FlaggedItem {
  lineItemKey: string;
  statementType: string;
  period: string;
  value: number;
  reason: string;
  suggestedAction: 'review' | 'likely_correct' | 'likely_wrong';
}

export interface PipelineValidationResult extends StatementsValidationResult {
  /** Items that need human review or self-correction */
  flaggedItems: FlaggedItem[];
  /** 0-100 average confidence across all periods */
  overallConfidence: number;
}

// ─── Helper ───────────────────────────────────────────────────

/** 1% tolerance for numeric comparisons (assignment requirement) */
const TOLERANCE_PCT = 0.01;

function withinTolerance(a: number, b: number): boolean {
  if (b === 0) return Math.abs(a) < 1; // Both effectively zero
  return Math.abs(a - b) / Math.abs(b) <= TOLERANCE_PCT;
}

// ─── Rule 1 (added): Revenue > 0 ─────────────────────────────

function checkRevenuePositive(statements: ClassifiedStatement[]): StatementCheck[] {
  const checks: StatementCheck[] = [];

  for (const stmt of statements) {
    if (stmt.statementType !== 'INCOME_STATEMENT') continue;
    for (const period of stmt.periods) {
      const revenue = period.lineItems['revenue'] ?? null;
      if (revenue === null) continue; // not extracted — not a violation

      const passed = revenue > 0;
      checks.push({
        check: 'revenue_positive',
        passed,
        severity: passed ? 'info' : 'warning',
        message: passed
          ? `Revenue ${revenue}M is positive`
          : `Revenue ${revenue}M is zero or negative — likely an extraction error`,
        period: period.period,
      });
    }
  }

  return checks;
}

// ─── Rule 2 (added): Subtotal grouped consistency ─────────────

/**
 * Walk each statement's lineItems and check that every subtotal key
 * (total_*, gross_profit, net_income, ebitda, fcf) equals the sum of
 * the preceding group of non-subtotal items.
 *
 * The group resets whenever a subtotal is encountered — this avoids
 * rolling-sum false positives in nested financial hierarchies.
 *
 * Keys are the canonical identifiers from classifyFinancials() prompt,
 * so no fuzzy name matching is needed.
 */
const SUBTOTAL_KEYS = new Set([
  'gross_profit',
  'total_opex',
  'ebitda',
  'ebit',
  'ebt',
  'net_income',
  'total_current_assets',
  'total_assets',
  'total_current_liabilities',
  'total_liabilities',
  'fcf',
]);

const EXPENSE_KEYS = new Set([
  'cogs',
  'sga',
  'rd',
  'other_opex',
  'total_opex',
  'interest_expense',
  'tax',
  'capex',
]);

function checkSubtotalConsistency(statements: ClassifiedStatement[]): StatementCheck[] {
  const checks: StatementCheck[] = [];

  for (const stmt of statements) {
    for (const period of stmt.periods) {
      const entries = Object.entries(period.lineItems);
      let groupSum = 0;
      let hasItems = false;

      for (const [key, value] of entries) {
        if (value === null || value === undefined) continue;

        if (SUBTOTAL_KEYS.has(key)) {
          // Only run check when we have at least one preceding item
          if (hasItems) {
            const passed = withinTolerance(groupSum, value);

            checks.push({
              check: 'subtotal_consistency',
              passed,
              severity: 'warning',
              message: passed
                ? `Subtotal ${key} (${value}M) matches group sum (${groupSum.toFixed(4)}M) for ${period.period}`
                : `Subtotal ${key} mismatch for ${period.period}: expected ≈${groupSum.toFixed(4)}M, got ${value}M`,
              period: period.period,
            });
          }
          // Reset group for next logical section
          groupSum = 0;
          hasItems = false;
        } else {
          // Treat known expenses as negative for summation
          const signedValue = EXPENSE_KEYS.has(key) ? -Math.abs(value) : value;
          groupSum += signedValue;
          hasItems = true;
        }
      }
    }
  }

  return checks;
}

// ─── Net Income Cross-Statement Consistency ───────────────────

/**
 * Check that net_income in the Income Statement matches net_income
 * in the Cash Flow statement for the same period (if both exist).
 * This is the 7th required rule.
 */
function checkNetIncomeConsistency(statements: ClassifiedStatement[]): StatementCheck[] {
  const checks: StatementCheck[] = [];

  const isStmt = statements.find(s => s.statementType === 'INCOME_STATEMENT');
  const cfStmt = statements.find(s => s.statementType === 'CASH_FLOW');

  if (!isStmt || !cfStmt) return checks;

  for (const isPeriod of isStmt.periods) {
    const isNI = isPeriod.lineItems['net_income'] ?? null;
    if (isNI === null) continue;

    const cfPeriod = cfStmt.periods.find(p => p.period === isPeriod.period);
    if (!cfPeriod) continue;

    // CF statements sometimes store operating_cf instead — skip if net_income absent
    const cfNI = cfPeriod.lineItems['net_income'] ?? null;
    if (cfNI === null) continue;

    const passed = withinTolerance(isNI, cfNI);
    checks.push({
      check: 'net_income_consistency',
      passed,
      severity: 'error',
      message: passed
        ? `Net income consistent across IS and CF for ${isPeriod.period} (${isNI}M)`
        : `Net income mismatch for ${isPeriod.period}: IS has ${isNI}M, CF has ${cfNI}M`,
      period: isPeriod.period,
    });
  }

  return checks;
}

// ─── Cash Reconciliation (required): Beginning Cash + Net Change = Ending Cash ──

/**
 * Implements the assignment cash reconciliation rule using available keys:
 * - Balance Sheet provides cash by period (`cash`)
 * - Cash Flow provides net change in cash for the period (`net_change_cash`)
 *
 * For a given historical period T, we treat:
 *   beginning_cash(T) = cash(T-1) from Balance Sheet
 *   ending_cash(T) = cash(T) from Balance Sheet
 *   net_change(T) = net_change_cash(T) from Cash Flow
 *
 * Check: beginning_cash + net_change ≈ ending_cash (within tolerance)
 */
function checkCashReconciliation(statements: ClassifiedStatement[]): StatementCheck[] {
  const checks: StatementCheck[] = [];

  const bs = statements.find(s => s.statementType === 'BALANCE_SHEET');
  const cf = statements.find(s => s.statementType === 'CASH_FLOW');
  if (!bs || !cf) return checks;

  const bsHist = bs.periods
    .filter(p => p.periodType === 'HISTORICAL')
    .sort((a, b) => a.period.localeCompare(b.period));

  for (let i = 1; i < bsHist.length; i++) {
    const prev = bsHist[i - 1];
    const curr = bsHist[i];

    const beginningCash = prev.lineItems['cash'] ?? null;
    const endingCash = curr.lineItems['cash'] ?? null;
    if (beginningCash === null || endingCash === null) continue;

    const cfPeriod = cf.periods.find(p => p.period === curr.period);
    const netChange = cfPeriod?.lineItems['net_change_cash'] ?? null;
    if (netChange === null) continue;

    const expectedEnding = beginningCash + netChange;
    const passed = withinTolerance(expectedEnding, endingCash);

    checks.push({
      check: 'cf_cash_reconciliation',
      passed,
      severity: 'error',
      message: passed
        ? `Cash reconciles for ${curr.period}: ${beginningCash}M + ${netChange}M ≈ ${endingCash}M`
        : `Cash reconciliation failed for ${curr.period}: beginning cash ${beginningCash}M + net change ${netChange}M = ${expectedEnding.toFixed(4)}M, but ending cash is ${endingCash}M`,
      period: curr.period,
    });
  }

  return checks;
}

// ─── Build Flagged Items ──────────────────────────────────────

function buildFlaggedItems(
  statements: ClassifiedStatement[],
  checks: StatementCheck[],
): FlaggedItem[] {
  const flagged: FlaggedItem[] = [];

  const failedChecks = checks.filter(c => !c.passed && c.severity === 'error');

  for (const check of failedChecks) {
    // Derive statement type from check key prefix
    const stmtType = check.check.startsWith('bs_') ? 'BALANCE_SHEET'
      : check.check.startsWith('cf_') ? 'CASH_FLOW'
        : 'INCOME_STATEMENT';

    // Find the first failing numeric value for context
    const stmt = statements.find(s => s.statementType === stmtType);
    const period = stmt?.periods.find(p => p.period === check.period);

    const lineItemKey = check.check === 'bs_balances' ? 'total_assets'
      : check.check === 'net_income_consistency' ? 'net_income'
        : check.check === 'revenue_positive' ? 'revenue'
          : 'unknown';

    const value = period?.lineItems[lineItemKey] ?? 0;

    flagged.push({
      lineItemKey,
      statementType: stmtType,
      period: check.period ?? 'unknown',
      value: value as number,
      reason: check.message,
      suggestedAction: check.severity === 'error' ? 'likely_wrong' : 'review',
    });
  }

  return flagged;
}

// ─── Main Export ─────────────────────────────────────────────

/** Assignment Rule 5: Flag any line item growing > 500% YoY */
function checkYoYGrowthSanity(statements: ClassifiedStatement[]): StatementCheck[] {
  const checks: StatementCheck[] = [];

  for (const stmt of statements) {
    const historical = stmt.periods
      .filter(p => p.periodType === 'HISTORICAL')
      .sort((a, b) => a.period.localeCompare(b.period));

    for (let i = 1; i < historical.length; i++) {
      const prev = historical[i - 1];
      const curr = historical[i];

      for (const key of ['revenue', 'ebitda', 'net_income']) {
        const prevVal = prev.lineItems[key] ?? null;
        const currVal = curr.lineItems[key] ?? null;
        if (prevVal === null || currVal === null || prevVal === 0) continue;

        const growth = ((currVal - prevVal) / Math.abs(prevVal)) * 100;

        if (Math.abs(growth) > 500) {
          checks.push({
            check: 'yoy_growth_sanity',
            passed: false,
            severity: 'warning',
            message: `${key} grew ${growth.toFixed(0)}% from ${prev.period} (${prevVal}M) to ${curr.period} (${currVal}M) — exceeds 500% threshold`,
            period: curr.period,
          });
        }
      }
    }
  }

  return checks;
}

/**
 * Run all 7 financial validation rules on extracted statements.
 *
 * Rules delegated to existing validateStatements():
 *   1. Balance sheet equation (Assets = Liabilities + Equity)        [bs_balances]
 *   2. EBITDA < Revenue sanity                                        [is_ebitda_lt_revenue]
 *   3. EBITDA margin consistency & sanity (5-60% normal range)        [is_ebitda_margin_*]
 *   4. YoY revenue growth sanity (>100% flagged)                      [yoy_revenue_growth_sane]
 *   5. Cash flow math (FCF = Operating CF - CapEx)                    [cf_fcf_math]
 *
 * Rules added here:
 *   6. Revenue > 0                                                    [revenue_positive]
 *   7. Subtotal grouped consistency                                   [subtotal_consistency]
 *   +  Net income cross-statement consistency (bonus rule 7b)         [net_income_consistency]
 */
export function validateExtraction(
  statements: ClassifiedStatement[],
): PipelineValidationResult {
  if (!statements || statements.length === 0) {
    return {
      checks: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      overallPassed: true,
      flaggedItems: [],
      overallConfidence: 0,
    };
  }

  // ── Delegate to existing 3-statement validator ───────────────
  const base = validateStatements(statements);

  // ── Additional rules ─────────────────────────────────────────
  const additionalChecks: StatementCheck[] = [
    ...checkRevenuePositive(statements),
    ...checkSubtotalConsistency(statements),
    ...checkNetIncomeConsistency(statements),
    ...checkCashReconciliation(statements),
    ...checkYoYGrowthSanity(statements),
  ];

  const allChecks = [...base.checks, ...additionalChecks];

  const errorCount = allChecks.filter(c => !c.passed && c.severity === 'error').length;
  const warningCount = allChecks.filter(c => !c.passed && c.severity === 'warning').length;
  const infoCount = allChecks.filter(c => c.severity === 'info').length;
  const overallPassed = errorCount === 0;

  // ── Confidence ───────────────────────────────────────────────
  const allConfidences: number[] = [];
  for (const stmt of statements) {
    for (const p of stmt.periods) {
      allConfidences.push(p.confidence);
    }
  }
  const overallConfidence = allConfidences.length > 0
    ? Math.round(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length)
    : 0;

  const flaggedItems = buildFlaggedItems(statements, allChecks);

  if (errorCount > 0 || warningCount > 0) {
    log.warn('validateExtraction: issues found', { errorCount, warningCount, overallConfidence });
  }

  return {
    checks: allChecks,
    errorCount,
    warningCount,
    infoCount,
    overallPassed,
    flaggedItems,
    overallConfidence,
  };
}
