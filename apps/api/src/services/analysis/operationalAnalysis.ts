/**
 * Operational Analysis
 * EBITDA bridge, revenue quality, cash flow, working capital, cost structure.
 */

import {
  PreparedData, EBITDABridge, RevenueQuality, CashFlowAnalysis,
  WorkingCapital, CostStructure, WorkforceMetrics,
} from './types.js';
import { li, pctChange, safeDiv, round2, avg, trendDirection } from './helpers.js';

export function computeEBITDABridge(data: PreparedData): EBITDABridge | undefined {
  const { income, periods } = data;
  if (periods.length === 0) return undefined;

  const bridgePeriods = periods.map(p => {
    const inc = income.get(p) ?? {};
    const reportedEbitda = li(inc, 'ebitda');
    const revenue = li(inc, 'revenue');
    const sga = li(inc, 'sga');
    const rd = li(inc, 'rd');
    const otherOpex = li(inc, 'other_opex');

    const addbacks: { label: string; amount: number | null }[] = [];

    if (sga != null && revenue != null && revenue > 0) {
      const sgaPct = (sga / revenue) * 100;
      if (sgaPct > 25) {
        const excessSga = round2(sga - revenue * 0.20);
        addbacks.push({ label: 'Excess SG&A (potential owner comp)', amount: excessSga });
      }
    }

    if (rd != null && rd > 0) {
      addbacks.push({ label: 'R&D (potentially capitalizable)', amount: round2(rd * 0.3) });
    }

    if (otherOpex != null && revenue != null && revenue > 0 && (otherOpex / revenue) > 0.05) {
      addbacks.push({ label: 'Other OpEx (review for one-time items)', amount: round2(otherOpex * 0.5) });
    }

    const totalAddbacks = addbacks.reduce((sum, a) => sum + (a.amount ?? 0), 0);
    const adjustedEbitda = reportedEbitda != null ? round2(reportedEbitda + totalAddbacks) : null;
    const adjustmentPct = reportedEbitda != null && reportedEbitda > 0
      ? round2((totalAddbacks / reportedEbitda) * 100)
      : null;

    return { period: p, reportedEbitda, addbacks, adjustedEbitda, adjustmentPct };
  });

  return { periods: bridgePeriods };
}

export function computeRevenueQuality(data: PreparedData): RevenueQuality | undefined {
  const { income, periods } = data;
  if (periods.length < 2) return undefined;

  const revenues = periods.map(p => li(income.get(p) ?? {}, 'revenue'));
  const validRevs = revenues.filter((r): r is number => r != null);

  const firstRev = validRevs[0];
  const lastRev = validRevs[validRevs.length - 1];
  const years = validRevs.length - 1;
  const revenueCAGR = firstRev && lastRev && firstRev > 0 && years > 0
    ? round2((Math.pow(lastRev / firstRev, 1 / years) - 1) * 100)
    : null;

  const organicGrowthRates = periods.slice(1).map((p, i) => ({
    period: p,
    rate: round2(pctChange(revenues[i + 1], revenues[i])),
  }));

  const validGrowths = organicGrowthRates.map(g => g.rate).filter((r): r is number => r != null);
  let consistencyScore = 75;
  if (validGrowths.length >= 2) {
    const avgG = avg(validGrowths)!;
    const variance = avg(validGrowths.map(g => (g - avgG) ** 2))!;
    const stddev = Math.sqrt(variance);
    if (stddev < 5) consistencyScore = 95;
    else if (stddev < 10) consistencyScore = 80;
    else if (stddev < 20) consistencyScore = 60;
    else consistencyScore = 40;

    if (validGrowths.every(g => g > 0)) consistencyScore = Math.min(100, consistencyScore + 10);
    if (validGrowths.some(g => g < -5)) consistencyScore = Math.max(0, consistencyScore - 15);
  }

  return { revenueCAGR, organicGrowthRates, consistencyScore };
}

export function computeCashFlowAnalysis(data: PreparedData): CashFlowAnalysis | undefined {
  const { income, balance, cashflow, periods } = data;
  if (periods.length === 0) return undefined;

  const cfPeriods = periods.map((p, i) => {
    const inc = income.get(p) ?? {};
    const cf = cashflow.get(p) ?? {};
    const bal = balance.get(p) ?? {};
    const prevBal = i > 0 ? balance.get(periods[i - 1]) ?? {} : {};

    const ebitda = li(inc, 'ebitda');
    const capex = li(cf, 'capex');
    const capexAbs = capex != null ? Math.abs(capex) : null;

    let wcChange: number | null = null;
    if (i > 0) {
      const curCA = li(bal, 'total_current_assets');
      const curCL = li(bal, 'total_current_liabilities');
      const prevCA = li(prevBal, 'total_current_assets');
      const prevCL = li(prevBal, 'total_current_liabilities');
      const curCash = li(bal, 'cash') ?? 0;
      const prevCash = li(prevBal, 'cash') ?? 0;
      const curSTDebt = li(bal, 'short_term_debt') ?? 0;
      const prevSTDebt = li(prevBal, 'short_term_debt') ?? 0;

      if (curCA != null && curCL != null && prevCA != null && prevCL != null) {
        const curNWC = (curCA - curCash) - (curCL - curSTDebt);
        const prevNWC = (prevCA - prevCash) - (prevCL - prevSTDebt);
        wcChange = round2(curNWC - prevNWC);
      }
    }

    const fcf = li(cf, 'fcf') ?? (
      ebitda != null && capexAbs != null
        ? round2(ebitda - capexAbs - (wcChange ?? 0))
        : null
    );

    const ebitdaToFcfConversion = ebitda != null && fcf != null && ebitda > 0
      ? round2((fcf / ebitda) * 100)
      : null;

    return {
      period: p,
      ebitda: round2(ebitda),
      capex: capexAbs != null ? round2(capexAbs) : null,
      wcChange,
      fcf: round2(fcf),
      ebitdaToFcfConversion,
    };
  });

  const conversions = cfPeriods.map(p => p.ebitdaToFcfConversion);
  const avgConversion = round2(avg(conversions));
  const fcfTrend = trendDirection(cfPeriods.map(p => p.fcf));

  return { periods: cfPeriods, avgConversion, fcfTrend };
}

export function computeWorkingCapital(data: PreparedData): WorkingCapital | undefined {
  const { income, balance, periods } = data;
  if (periods.length === 0) return undefined;

  const wcPeriods = periods.map(p => {
    const bal = balance.get(p) ?? {};
    const inc = income.get(p) ?? {};

    const ar = li(bal, 'accounts_receivable');
    const inventory = li(bal, 'inventory');
    const ap = li(bal, 'accounts_payable');
    const cash = li(bal, 'cash') ?? 0;
    const stDebt = li(bal, 'short_term_debt') ?? 0;
    const ca = li(bal, 'total_current_assets');
    const cl = li(bal, 'total_current_liabilities');
    const revenue = li(inc, 'revenue');

    const nwc = ca != null && cl != null
      ? round2((ca - cash) - (cl - stDebt))
      : null;

    const nwcPctRevenue = nwc != null && revenue != null && revenue > 0
      ? round2((nwc / revenue) * 100)
      : null;

    return { period: p, ar: round2(ar), inventory: round2(inventory), ap: round2(ap), nwc, nwcPctRevenue };
  });

  const nwcPcts = wcPeriods.map(p => p.nwcPctRevenue).filter((v): v is number => v != null);
  const avgNwcPct = avg(nwcPcts);
  const latestRevenue = li(income.get(periods[periods.length - 1]) ?? {}, 'revenue');
  const normalizedNwc = avgNwcPct != null && latestRevenue != null
    ? round2((avgNwcPct / 100) * latestRevenue)
    : null;

  const nwcTrend = trendDirection(wcPeriods.map(p => p.nwcPctRevenue));

  return { periods: wcPeriods, normalizedNwc, nwcTrend };
}

export function computeCostStructure(data: PreparedData): CostStructure | undefined {
  const { income, periods } = data;
  if (periods.length === 0) return undefined;

  const csPeriods = periods.map(p => {
    const inc = income.get(p) ?? {};
    const revenue = li(inc, 'revenue');
    const cogs = li(inc, 'cogs');
    const sga = li(inc, 'sga');
    const rd = li(inc, 'rd');
    const totalOpex = li(inc, 'total_opex');

    return {
      period: p,
      cogsPct: round2(safeDiv(cogs, revenue) != null ? safeDiv(cogs, revenue)! * 100 : null),
      sgaPct: round2(safeDiv(sga, revenue) != null ? safeDiv(sga, revenue)! * 100 : null),
      rdPct: round2(safeDiv(rd, revenue) != null ? safeDiv(rd, revenue)! * 100 : null),
      opexPct: round2(safeDiv(totalOpex, revenue) != null ? safeDiv(totalOpex, revenue)! * 100 : null),
    };
  });

  const latestInc = income.get(periods[periods.length - 1]) ?? {};
  const revenue = li(latestInc, 'revenue');
  const cogs = li(latestInc, 'cogs');
  const ebitda = li(latestInc, 'ebitda');

  let breakEvenRevenue: number | null = null;
  let operatingLeverage: 'high' | 'moderate' | 'low' | 'unknown' = 'unknown';

  if (revenue != null && cogs != null && ebitda != null && revenue > 0) {
    const contributionMarginPct = ((revenue - cogs) / revenue);
    const fixedCosts = (revenue - cogs) - ebitda;
    if (contributionMarginPct > 0) {
      breakEvenRevenue = round2(fixedCosts / contributionMarginPct);
    }

    if (breakEvenRevenue != null && breakEvenRevenue > 0) {
      const marginOfSafety = ((revenue - breakEvenRevenue) / revenue) * 100;
      if (marginOfSafety > 40) operatingLeverage = 'low';
      else if (marginOfSafety > 20) operatingLeverage = 'moderate';
      else operatingLeverage = 'high';
    }
  }

  return { periods: csPeriods, breakEvenRevenue, operatingLeverage };
}

export function computeWorkforceMetrics(data: PreparedData): WorkforceMetrics | undefined {
  const { income, periods } = data;

  const revenues = periods.map(p => ({
    period: p,
    value: li(income.get(p) ?? {}, 'revenue'),
  }));

  if (!revenues.some(r => r.value != null)) return undefined;

  return {
    revenuePerEmployee: revenues,
    trend: trendDirection(revenues.map(r => r.value)),
  };
}
