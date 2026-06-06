// Pure LBO model math — duplicate of apps/web-next/src/lib/lbo-model.ts.
// Kept in sync manually because the two TS projects don't share a
// node_modules layout (no packages/shared wiring yet). If you change one,
// change the other.

export interface LBOAssumptions {
  revenueY0: number;
  ebitdaMarginY0: number;
  entryMultiple: number;
  transactionFeesPct: number;
  debtPctOfEV: number;
  interestRate: number;
  mandatoryAmortPct: number;
  cashSweepPct: number;
  revenueGrowth: number;
  ebitdaMarginExit: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  taxRate: number;
  exitYear: number;
  exitMultiple: number;
  wacc: number;
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
  fcfBeforeDebt: number;
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
  irr: number;
  holdYears: number;
}

export interface SourcesUses {
  entryEV: number;
  entryEBITDA: number;
  debt: number;
  equity: number;
  fees: number;
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

export type AssumptionKey = keyof LBOAssumptions;

export const ASSUMPTION_LABELS: Record<AssumptionKey, string> = {
  revenueY0: "Revenue (Y0, $M)",
  ebitdaMarginY0: "EBITDA Margin (Y0)",
  entryMultiple: "Entry Multiple (x)",
  transactionFeesPct: "Transaction Fees",
  debtPctOfEV: "Debt % of EV",
  interestRate: "Interest Rate",
  mandatoryAmortPct: "Mandatory Amort %",
  cashSweepPct: "Cash Sweep %",
  revenueGrowth: "Revenue Growth",
  ebitdaMarginExit: "EBITDA Margin (Exit)",
  capexPctRevenue: "Capex % of Revenue",
  nwcPctRevenue: "NWC % of Revenue",
  taxRate: "Tax Rate",
  exitYear: "Exit Year",
  exitMultiple: "Exit Multiple (x)",
  wacc: "WACC",
};

export const ASSUMPTION_KEYS = Object.keys(ASSUMPTION_LABELS) as AssumptionKey[];

const ASSUMPTION_BOUNDS: Partial<Record<AssumptionKey, { min?: number; max?: number }>> = {
  revenueY0: { min: 0 },
  ebitdaMarginY0: { min: 0, max: 1 },
  entryMultiple: { min: 0 },
  transactionFeesPct: { min: 0, max: 0.2 },
  debtPctOfEV: { min: 0, max: 0.95 },
  interestRate: { min: 0, max: 0.5 },
  mandatoryAmortPct: { min: 0, max: 0.5 },
  cashSweepPct: { min: 0, max: 1 },
  revenueGrowth: { min: -0.2, max: 0.5 },
  ebitdaMarginExit: { min: 0, max: 1 },
  capexPctRevenue: { min: 0, max: 0.5 },
  nwcPctRevenue: { min: -0.5, max: 0.5 },
  taxRate: { min: 0, max: 0.6 },
  exitYear: { min: 1, max: 10 },
  exitMultiple: { min: 0 },
  wacc: { min: 0, max: 0.5 },
};

function computeIRR(cashflows: number[]): number {
  const npv = (rate: number) =>
    cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);
  const totalIn = cashflows.filter(c => c < 0).reduce((s, c) => s + c, 0);
  const totalOut = cashflows.filter(c => c > 0).reduce((s, c) => s + c, 0);
  if (totalOut <= -totalIn) return -1;

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

  const sourcesUses: SourcesUses = { entryEV, entryEBITDA, debt, equity, fees };

  const years: YearRow[] = [];
  const totalYears = Math.max(1, Math.round(a.exitYear));
  const originalDebt = debt;
  let openingDebt = debt;
  let priorNwc = a.revenueY0 * a.nwcPctRevenue;

  for (let y = 1; y <= totalYears; y++) {
    const revenue = a.revenueY0 * Math.pow(1 + a.revenueGrowth, y);
    const marginProgress = totalYears <= 1 ? 1 : y / totalYears;
    const ebitdaMargin = a.ebitdaMarginY0 + (a.ebitdaMarginExit - a.ebitdaMarginY0) * marginProgress;
    const ebitda = revenue * ebitdaMargin;
    const capex = revenue * a.capexPctRevenue;
    const depreciation = capex;
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
      year: y, revenue, ebitda, ebitdaMargin, capex, depreciation, ebit,
      interest, pretaxIncome, tax, netIncome, nwc, changeInNwc,
      fcfBeforeDebt, mandatoryAmort, cashSweep, totalDebtPaydown,
      openingDebt, endingDebt,
    });
    openingDebt = endingDebt;
    priorNwc = nwc;
  }

  const exit = years[years.length - 1];
  const exitEV = exit.ebitda * a.exitMultiple;
  const equityProceeds = Math.max(0, exitEV - exit.endingDebt);
  const moic = equity > 0 ? equityProceeds / equity : 0;

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

export function applyAssumptionUpdate(
  current: LBOAssumptions,
  key: AssumptionKey,
  rawValue: number,
): LBOAssumptions {
  const bounds = ASSUMPTION_BOUNDS[key] || {};
  let v = rawValue;
  if (typeof bounds.min === "number" && v < bounds.min) v = bounds.min;
  if (typeof bounds.max === "number" && v > bounds.max) v = bounds.max;
  return { ...current, [key]: v };
}

// Format the model state as a Markdown table for the LLM context.
export function summarizeForLLM(a: LBOAssumptions, out: LBOOutputs): string {
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtMult = (v: number) => `${v.toFixed(2)}x`;
  const fmt$ = (v: number) => `$${v.toFixed(1)}M`;

  const lines: string[] = [];
  lines.push(`## Assumptions`);
  lines.push(`| Key | Label | Value |`);
  lines.push(`| --- | --- | --- |`);
  for (const k of ASSUMPTION_KEYS) {
    const v = a[k];
    let display: string;
    if (k === "exitYear") display = `${Math.round(v)}`;
    else if (k === "revenueY0") display = fmt$(v);
    else if (k === "entryMultiple" || k === "exitMultiple") display = fmtMult(v);
    else display = fmtPct(v); // includes wacc
    lines.push(`| ${k} | ${ASSUMPTION_LABELS[k]} | ${display} |`);
  }

  lines.push(``);
  lines.push(`## Sources & Uses`);
  lines.push(`- Entry EBITDA: ${fmt$(out.sourcesUses.entryEBITDA)}`);
  lines.push(`- Entry EV: ${fmt$(out.sourcesUses.entryEV)}`);
  lines.push(`- Debt: ${fmt$(out.sourcesUses.debt)}`);
  lines.push(`- Equity: ${fmt$(out.sourcesUses.equity)}`);
  lines.push(`- Transaction Fees: ${fmt$(out.sourcesUses.fees)}`);

  lines.push(``);
  lines.push(`## P&L`);
  lines.push(`| Year | Revenue | EBITDA | Margin | EBIT | Interest | Net Income | Ending Debt |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const y of out.years) {
    lines.push(`| Y${y.year} | ${fmt$(y.revenue)} | ${fmt$(y.ebitda)} | ${fmtPct(y.ebitdaMargin)} | ${fmt$(y.ebit)} | ${fmt$(y.interest)} | ${fmt$(y.netIncome)} | ${fmt$(y.endingDebt)} |`);
  }

  lines.push(``);
  lines.push(`## Returns`);
  lines.push(`- Exit EBITDA: ${fmt$(out.returns.exitEBITDA)}`);
  lines.push(`- Exit EV: ${fmt$(out.returns.exitEV)}`);
  lines.push(`- Ending Debt at Exit: ${fmt$(out.returns.endingDebt)}`);
  lines.push(`- Equity Proceeds: ${fmt$(out.returns.equityProceeds)}`);
  lines.push(`- Equity Invested: ${fmt$(out.returns.equityInvested)}`);
  lines.push(`- **MOIC: ${fmtMult(out.returns.moic)}**`);
  lines.push(`- **IRR: ${fmtPct(out.returns.irr)}**`);
  lines.push(`- WACC (hurdle): ${fmtPct(a.wacc)}`);
  lines.push(`- IRR Spread vs WACC: ${fmtPct(out.returns.irr - a.wacc)}`);
  lines.push(`- Hold Period: ${out.returns.holdYears} years`);

  return lines.join("\n");
}
