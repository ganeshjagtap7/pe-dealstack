import type { FinancialRow } from "./types";

const PERIODS = [
  "Q1 FY23", "Q2 FY23", "Q3 FY23", "Q4 FY23",
  "Q1 FY24", "Q2 FY24", "Q3 FY24", "Q4 FY24",
  "Q1 FY25", "Q2 FY25", "Q3 FY25", "Q4 FY25",
];

const RAW_QUARTERS: [number, number, number][] = [
  [142, 88, 32],
  [156, 95, 34],
  [171, 103, 36],
  [188, 112, 39],
  [198, 117, 41],
  [214, 125, 43],
  [232, 134, 46],
  [251, 144, 49],
  [263, 149, 51],
  [284, 159, 54],
  [307, 170, 57],
  [332, 182, 61],
];

export function buildFinancials(): FinancialRow[] {
  return PERIODS.map((period, i) => {
    const [revenue, cogs, opex] = RAW_QUARTERS[i];
    const grossProfit = revenue - cogs;
    const ebitda = grossProfit - opex;
    const da = +(revenue * 0.04).toFixed(2);
    const interest = +(revenue * 0.015).toFixed(2);
    const ebt = ebitda - da - interest;
    const netIncome = +(ebt * 0.75).toFixed(2);
    return {
      period,
      revenue,
      cogs,
      grossProfit,
      opex,
      ebitda,
      netIncome,
      grossMargin: +((grossProfit / revenue) * 100).toFixed(1),
      ebitdaMargin: +((ebitda / revenue) * 100).toFixed(1),
      netMargin: +((netIncome / revenue) * 100).toFixed(1),
    };
  });
}
