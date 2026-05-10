// Pure LBO model math. No DOM, no fetch, no React — safe to import on client
// and server. The agent imports the same module server-side so it can describe
// computed results without the client.
//
// All currency values are in USD millions.
// All percentages are stored as decimals (0.10 = 10%).
// Years are 1-indexed (Y1, Y2, ...).

export interface LBOAssumptions {
  // Entry
  revenueY0: number;          // entry-year revenue
  ebitdaMarginY0: number;     // entry-year EBITDA margin (decimal)
  entryMultiple: number;      // entry EV / entry EBITDA
  transactionFeesPct: number; // transaction fees as % of EV (decimal)

  // Capital structure
  debtPctOfEV: number;        // debt as % of EV (decimal)
  interestRate: number;       // annual cash interest rate on debt (decimal)
  mandatoryAmortPct: number;  // mandatory annual debt repayment as % of original debt (decimal)
  cashSweepPct: number;       // % of FCF after mandatory amort applied to debt paydown (decimal)

  // Operating
  revenueGrowth: number;      // annual revenue growth (decimal)
  ebitdaMarginExit: number;   // exit-year EBITDA margin; linear interp from Y0
  capexPctRevenue: number;    // capex as % of revenue (decimal)
  nwcPctRevenue: number;      // net working capital as % of revenue (decimal)
  taxRate: number;            // effective tax rate (decimal)

  // Exit
  exitYear: number;           // hold period (years)
  exitMultiple: number;       // exit EV / exit-year EBITDA

  // Hurdle / cost of capital — used as IRR comparison benchmark, not in cashflows
  wacc: number;               // weighted average cost of capital (decimal)
}

export interface SourcesUses {
  entryEV: number;
  entryEBITDA: number;
  debt: number;
  equity: number;
  fees: number;
}

export interface YearRow {
  year: number;
  revenue: number;
  ebitda: number;
  ebitdaMargin: number;
  capex: number;
  depreciation: number;
  ebit: number;
  interest: number;
  pretaxIncome: number;
  tax: number;
  netIncome: number;
  nwc: number;
  changeInNwc: number;
  fcfBeforeDebt: number;       // FCF available for debt paydown (after cash interest + cash tax)
  mandatoryAmort: number;
  cashSweep: number;
  totalDebtPaydown: number;
  openingDebt: number;
  endingDebt: number;
}

export interface Returns {
  exitEBITDA: number;
  exitEV: number;
  endingDebt: number;
  equityProceeds: number;
  equityInvested: number;
  moic: number;
  irr: number;                 // decimal
  holdYears: number;
}

export interface LBOOutputs {
  sourcesUses: SourcesUses;
  years: YearRow[];
  returns: Returns;
}

export const DEFAULT_LBO_ASSUMPTIONS: LBOAssumptions = {
  revenueY0: 100,
  ebitdaMarginY0: 0.20,
  entryMultiple: 10,
  transactionFeesPct: 0.02,

  debtPctOfEV: 0.55,
  interestRate: 0.08,
  mandatoryAmortPct: 0.05,
  cashSweepPct: 0.75,

  revenueGrowth: 0.08,
  ebitdaMarginExit: 0.24,
  capexPctRevenue: 0.03,
  nwcPctRevenue: 0.10,
  taxRate: 0.25,

  exitYear: 5,
  exitMultiple: 11,

  wacc: 0.10,
};

// Human-readable labels and formatting for each assumption — used by the grid
// UI and the chat agent's tool schema. Keep this in sync with the assumption
// keys above; the agent prompt enumerates these.
export type AssumptionKey = keyof LBOAssumptions;
export type CellFormat = "currency" | "percent" | "multiple" | "years";

export const ASSUMPTION_META: Record<AssumptionKey, {
  label: string;
  group: "Entry" | "Capital Structure" | "Operating" | "Exit" | "Hurdle";
  format: CellFormat;
  min?: number;
  max?: number;
  step?: number;
}> = {
  revenueY0:          { label: "Revenue (Y0)",          group: "Entry",            format: "currency", min: 0, step: 1 },
  ebitdaMarginY0:     { label: "EBITDA Margin (Y0)",    group: "Entry",            format: "percent",  min: 0, max: 1, step: 0.005 },
  entryMultiple:      { label: "Entry Multiple",        group: "Entry",            format: "multiple", min: 0, step: 0.25 },
  transactionFeesPct: { label: "Transaction Fees",      group: "Entry",            format: "percent",  min: 0, max: 0.2, step: 0.005 },

  debtPctOfEV:        { label: "Debt % of EV",          group: "Capital Structure", format: "percent",  min: 0, max: 0.95, step: 0.01 },
  interestRate:       { label: "Interest Rate",         group: "Capital Structure", format: "percent",  min: 0, max: 0.5, step: 0.0025 },
  mandatoryAmortPct:  { label: "Mandatory Amort %",     group: "Capital Structure", format: "percent",  min: 0, max: 0.5, step: 0.005 },
  cashSweepPct:       { label: "Cash Sweep %",          group: "Capital Structure", format: "percent",  min: 0, max: 1, step: 0.05 },

  revenueGrowth:      { label: "Revenue Growth",        group: "Operating",        format: "percent",  min: -0.2, max: 0.5, step: 0.005 },
  ebitdaMarginExit:   { label: "EBITDA Margin (Exit)",  group: "Operating",        format: "percent",  min: 0, max: 1, step: 0.005 },
  capexPctRevenue:    { label: "Capex % of Revenue",    group: "Operating",        format: "percent",  min: 0, max: 0.5, step: 0.005 },
  nwcPctRevenue:      { label: "NWC % of Revenue",      group: "Operating",        format: "percent",  min: -0.5, max: 0.5, step: 0.005 },
  taxRate:            { label: "Tax Rate",              group: "Operating",        format: "percent",  min: 0, max: 0.6, step: 0.005 },

  exitYear:           { label: "Exit Year",             group: "Exit",             format: "years",    min: 1, max: 10, step: 1 },
  exitMultiple:       { label: "Exit Multiple",         group: "Exit",             format: "multiple", min: 0, step: 0.25 },

  wacc:               { label: "WACC",                  group: "Hurdle",           format: "percent",  min: 0, max: 0.5, step: 0.0025 },
};

export const ASSUMPTION_KEYS = Object.keys(ASSUMPTION_META) as AssumptionKey[];

// Solve for the IRR of a cashflow series [equityInvested<0, ..., equityProceeds>0]
// using bisection. Sufficient precision for display (3 decimal places) and
// avoids the need for a numerics dependency.
function computeIRR(cashflows: number[]): number {
  const npv = (rate: number) =>
    cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);

  // Edge cases: no positive return or all negative
  const totalIn = cashflows.filter(c => c < 0).reduce((s, c) => s + c, 0);
  const totalOut = cashflows.filter(c => c > 0).reduce((s, c) => s + c, 0);
  if (totalOut <= -totalIn) return -1; // 100% loss as a sentinel

  let lo = -0.99, hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 1e-7) return mid;
    if (v > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeLBO(a: LBOAssumptions): LBOOutputs {
  const entryEBITDA = a.revenueY0 * a.ebitdaMarginY0;
  const entryEV = entryEBITDA * a.entryMultiple;
  const fees = entryEV * a.transactionFeesPct;
  const debt = entryEV * a.debtPctOfEV;
  const equity = entryEV - debt + fees;

  const sourcesUses: SourcesUses = {
    entryEV,
    entryEBITDA,
    debt,
    equity,
    fees,
  };

  const years: YearRow[] = [];
  const totalYears = Math.max(1, Math.round(a.exitYear));
  const originalDebt = debt;
  let openingDebt = debt;
  // Y0 nwc baseline for delta calculation
  let priorNwc = a.revenueY0 * a.nwcPctRevenue;

  for (let y = 1; y <= totalYears; y++) {
    const revenue = a.revenueY0 * Math.pow(1 + a.revenueGrowth, y);
    // Linear margin trajectory from Y0 → exit year
    const marginProgress = totalYears <= 1 ? 1 : y / totalYears;
    const ebitdaMargin = a.ebitdaMarginY0 + (a.ebitdaMarginExit - a.ebitdaMarginY0) * marginProgress;
    const ebitda = revenue * ebitdaMargin;
    const capex = revenue * a.capexPctRevenue;
    const depreciation = capex; // simplification: D&A == capex
    const ebit = ebitda - depreciation;
    const interest = openingDebt * a.interestRate;
    const pretaxIncome = ebit - interest;
    const tax = Math.max(0, pretaxIncome) * a.taxRate;
    const netIncome = pretaxIncome - tax;
    const nwc = revenue * a.nwcPctRevenue;
    const changeInNwc = nwc - priorNwc;
    const fcfBeforeDebt = ebitda - capex - changeInNwc - interest - tax;

    const mandatoryAmort = Math.min(originalDebt * a.mandatoryAmortPct, openingDebt);
    const fcfAfterMandatory = Math.max(0, fcfBeforeDebt - mandatoryAmort);
    const cashSweep = Math.min(fcfAfterMandatory * a.cashSweepPct, openingDebt - mandatoryAmort);
    const totalDebtPaydown = mandatoryAmort + Math.max(0, cashSweep);
    const endingDebt = Math.max(0, openingDebt - totalDebtPaydown);

    years.push({
      year: y,
      revenue,
      ebitda,
      ebitdaMargin,
      capex,
      depreciation,
      ebit,
      interest,
      pretaxIncome,
      tax,
      netIncome,
      nwc,
      changeInNwc,
      fcfBeforeDebt,
      mandatoryAmort,
      cashSweep,
      totalDebtPaydown,
      openingDebt,
      endingDebt,
    });

    openingDebt = endingDebt;
    priorNwc = nwc;
  }

  const exit = years[years.length - 1];
  const exitEV = exit.ebitda * a.exitMultiple;
  const equityProceeds = Math.max(0, exitEV - exit.endingDebt);
  const moic = equity > 0 ? equityProceeds / equity : 0;

  // IRR cashflows: -equity at t=0, +equityProceeds at t=exitYear
  const cashflows: number[] = [-equity];
  for (let y = 1; y <= totalYears; y++) {
    cashflows.push(y === totalYears ? equityProceeds : 0);
  }
  const irr = computeIRR(cashflows);

  const returns: Returns = {
    exitEBITDA: exit.ebitda,
    exitEV,
    endingDebt: exit.endingDebt,
    equityProceeds,
    equityInvested: equity,
    moic,
    irr,
    holdYears: totalYears,
  };

  return { sourcesUses, years, returns };
}

export function formatCell(value: number, format: CellFormat): string {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "currency":
      return value >= 1000
        ? `$${(value / 1000).toFixed(2)}B`
        : `$${value.toFixed(1)}M`;
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "multiple":
      return `${value.toFixed(2)}x`;
    case "years":
      return `${Math.round(value)}y`;
  }
}

// Validate and clamp an assumption update — used by both the grid input
// handler and the chat agent's update_assumption tool.
export function applyAssumptionUpdate(
  current: LBOAssumptions,
  key: AssumptionKey,
  rawValue: number,
): LBOAssumptions {
  const meta = ASSUMPTION_META[key];
  let v = rawValue;
  if (typeof meta.min === "number" && v < meta.min) v = meta.min;
  if (typeof meta.max === "number" && v > meta.max) v = meta.max;
  return { ...current, [key]: v };
}
