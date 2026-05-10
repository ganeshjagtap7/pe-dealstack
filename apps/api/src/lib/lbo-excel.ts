// Generate an .xlsx workbook for an LBO model: assumptions, P&L,
// debt schedule, returns. Pure function — returns a Buffer the route
// can stream as the response body.

import XLSX from 'xlsx';
import {
  ASSUMPTION_KEYS,
  ASSUMPTION_LABELS,
  computeLBO,
  type LBOAssumptions,
} from './lbo-model.js';

interface SheetCell {
  v: string | number;
  t?: 'n' | 's';
  z?: string;
  s?: { font?: { bold?: boolean } };
}

type SheetRow = SheetCell[];

const PCT = '0.00%';
const MULT = '0.00"x"';
const CURR = '$#,##0.0,,"M"';

function pctRow(label: string, value: number): SheetRow {
  return [{ v: label, t: 's' }, { v: value, t: 'n', z: PCT }];
}
function multRow(label: string, value: number): SheetRow {
  return [{ v: label, t: 's' }, { v: value, t: 'n', z: MULT }];
}
function currRow(label: string, value: number): SheetRow {
  // Excel's number format expects raw dollars, but our model is in $M.
  // Keep it simple: store the $M value as-is and format with "x M" suffix.
  return [{ v: label, t: 's' }, { v: value, t: 'n', z: '0.0"M"' }];
}

function buildAssumptionsSheet(a: LBOAssumptions): XLSX.WorkSheet {
  const rows: SheetRow[] = [
    [{ v: 'Assumption', t: 's', s: { font: { bold: true } } }, { v: 'Value', t: 's', s: { font: { bold: true } } }],
  ];

  for (const k of ASSUMPTION_KEYS) {
    const label = ASSUMPTION_LABELS[k];
    const v = a[k];
    if (k === 'revenueY0') rows.push(currRow(label, v));
    else if (k === 'entryMultiple' || k === 'exitMultiple') rows.push(multRow(label, v));
    else if (k === 'exitYear') rows.push([{ v: label, t: 's' }, { v: Math.round(v), t: 'n' }]);
    else rows.push(pctRow(label, v));
  }

  return XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c.v)));
}

function buildPnLSheet(out: ReturnType<typeof computeLBO>): XLSX.WorkSheet {
  const years = out.years;
  const header = ['Line Item', ...years.map((y) => `Y${y.year}`)];
  const data: (string | number)[][] = [
    header,
    ['Revenue ($M)', ...years.map((y) => round(y.revenue))],
    ['EBITDA Margin', ...years.map((y) => pctValue(y.ebitdaMargin))],
    ['EBITDA ($M)', ...years.map((y) => round(y.ebitda))],
    ['Capex ($M)', ...years.map((y) => round(y.capex))],
    ['Depreciation ($M)', ...years.map((y) => round(y.depreciation))],
    ['EBIT ($M)', ...years.map((y) => round(y.ebit))],
    ['Interest ($M)', ...years.map((y) => round(y.interest))],
    ['Pretax Income ($M)', ...years.map((y) => round(y.pretaxIncome))],
    ['Tax ($M)', ...years.map((y) => round(y.tax))],
    ['Net Income ($M)', ...years.map((y) => round(y.netIncome))],
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

function buildDebtSheet(out: ReturnType<typeof computeLBO>): XLSX.WorkSheet {
  const years = out.years;
  const header = ['Line Item', ...years.map((y) => `Y${y.year}`)];
  const data: (string | number)[][] = [
    header,
    ['Opening Debt ($M)', ...years.map((y) => round(y.openingDebt))],
    ['EBITDA ($M)', ...years.map((y) => round(y.ebitda))],
    ['(-) Capex ($M)', ...years.map((y) => -round(y.capex))],
    ['(-) Δ NWC ($M)', ...years.map((y) => -round(y.changeInNwc))],
    ['(-) Cash Interest ($M)', ...years.map((y) => -round(y.interest))],
    ['(-) Cash Tax ($M)', ...years.map((y) => -round(y.tax))],
    ['FCF before Debt ($M)', ...years.map((y) => round(y.fcfBeforeDebt))],
    ['Mandatory Amort ($M)', ...years.map((y) => round(y.mandatoryAmort))],
    ['Cash Sweep ($M)', ...years.map((y) => round(y.cashSweep))],
    ['Ending Debt ($M)', ...years.map((y) => round(y.endingDebt))],
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

function buildReturnsSheet(a: LBOAssumptions, out: ReturnType<typeof computeLBO>): XLSX.WorkSheet {
  const r = out.returns;
  const su = out.sourcesUses;
  const data: (string | number)[][] = [
    ['Sources & Uses', ''],
    ['Entry EBITDA ($M)', round(su.entryEBITDA)],
    ['Entry EV ($M)', round(su.entryEV)],
    ['Debt ($M)', round(su.debt)],
    ['Transaction Fees ($M)', round(su.fees)],
    ['Equity Invested ($M)', round(su.equity)],
    ['', ''],
    ['Exit & Returns', ''],
    ['Hold Period (years)', r.holdYears],
    ['Exit-Year EBITDA ($M)', round(r.exitEBITDA)],
    ['Exit EV ($M)', round(r.exitEV)],
    ['Ending Debt at Exit ($M)', round(r.endingDebt)],
    ['Equity Proceeds ($M)', round(r.equityProceeds)],
    ['MOIC (x)', round(r.moic)],
    ['IRR', pctValue(r.irr)],
    ['WACC (hurdle)', pctValue(a.wacc)],
    ['IRR Spread vs WACC', pctValue(r.irr - a.wacc)],
  ];
  return XLSX.utils.aoa_to_sheet(data);
}

export function buildLBOWorkbookBuffer(name: string, assumptions: LBOAssumptions): Buffer {
  const out = computeLBO(assumptions);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildAssumptionsSheet(assumptions), 'Assumptions');
  XLSX.utils.book_append_sheet(wb, buildPnLSheet(out), 'P&L');
  XLSX.utils.book_append_sheet(wb, buildDebtSheet(out), 'Debt Schedule');
  XLSX.utils.book_append_sheet(wb, buildReturnsSheet(assumptions, out), 'Returns');

  // Cover sheet with the model name + timestamp, makes the file self-describing
  const cover = XLSX.utils.aoa_to_sheet([
    ['LBO Model'],
    ['Name', name],
    ['Generated', new Date().toISOString()],
    [''],
    ['Sheets:'],
    ['1. Assumptions — editable inputs'],
    ['2. P&L — 5-year income statement'],
    ['3. Debt Schedule — FCF and debt paydown'],
    ['4. Returns — Sources & Uses, MOIC, IRR'],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, 'Cover');
  // Reorder so Cover is first
  wb.SheetNames = ['Cover', 'Assumptions', 'P&L', 'Debt Schedule', 'Returns'];

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function pctValue(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}
