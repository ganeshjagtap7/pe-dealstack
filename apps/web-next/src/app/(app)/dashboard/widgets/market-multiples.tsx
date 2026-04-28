"use client";

import { WidgetShell } from "./shell";

// Ported from apps/web/js/widgets/market-multiples-data.js + .js.
// Static reference data — refresh quarterly by editing SECTORS/AS_OF.
const AS_OF = "Q1 2026";
const DISCLAIMER = "Illustrative ranges only. Verify with PitchBook / Capital IQ before use.";
const SECTORS: Array<{ sector: string; evEbitda: string; evRevenue: string }> = [
  { sector: "B2B SaaS", evEbitda: "14 – 22x", evRevenue: "4 – 9x" },
  { sector: "Healthcare Services", evEbitda: "10 – 14x", evRevenue: "1.5 – 2.5x" },
  { sector: "Industrials / Manufacturing", evEbitda: "7 – 10x", evRevenue: "0.8 – 1.5x" },
  { sector: "Consumer Brands", evEbitda: "8 – 12x", evRevenue: "1 – 2.5x" },
  { sector: "Financial Services", evEbitda: "8 – 12x", evRevenue: "2 – 4x" },
  { sector: "Tech-Enabled Services", evEbitda: "11 – 16x", evRevenue: "2 – 4x" },
  { sector: "Logistics / Distribution", evEbitda: "6 – 9x", evRevenue: "0.6 – 1.2x" },
  { sector: "Energy / Utilities", evEbitda: "6 – 9x", evRevenue: "1 – 2x" },
];

export function MarketMultiplesWidget() {
  return (
    <WidgetShell title="Market Multiples" icon="insert_chart">
      <div className="p-4">
        <p className="text-[11px] text-text-muted mb-3">As of {AS_OF} · Illustrative only</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-text-muted uppercase tracking-wide">
                <th className="text-left font-semibold py-2 pr-3">Sector</th>
                <th className="text-right font-semibold py-2 px-2">EV / EBITDA</th>
                <th className="text-right font-semibold py-2 pl-2">EV / Revenue</th>
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((s) => (
                <tr key={s.sector} className="border-b border-border-subtle/50">
                  <td className="py-2 pr-3 font-medium text-text-main">{s.sector}</td>
                  <td className="py-2 px-2 text-right text-text-secondary">{s.evEbitda}</td>
                  <td className="py-2 pl-2 text-right text-text-secondary">{s.evRevenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-text-muted italic mt-3">{DISCLAIMER}</p>
      </div>
    </WidgetShell>
  );
}
