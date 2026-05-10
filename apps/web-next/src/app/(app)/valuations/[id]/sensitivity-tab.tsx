"use client";

import { useMemo } from "react";
import { computeLBO, type LBOAssumptions } from "@/lib/lbo-model";
import { cn } from "@/lib/cn";

const GRID_SIZE = 5;
const EXIT_STEP = 0.5;
const GROWTH_STEP = 0.01;

export interface SensitivityTabProps {
  assumptions: LBOAssumptions;
  metric: "moic" | "irr";
  onChangeMetric: (m: "moic" | "irr") => void;
}

export function SensitivityTab({ assumptions, metric, onChangeMetric }: SensitivityTabProps) {
  const grid = useMemo(() => buildGrid(assumptions, metric), [assumptions, metric]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Sensitivity: {metric === "moic" ? "MOIC" : "IRR"} by exit multiple × revenue growth
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Center cell holds the current assumptions. Each step varies one variable while holding the other
            and all other assumptions constant.
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-white p-0.5 text-sm">
          <button
            type="button"
            onClick={() => onChangeMetric("moic")}
            className={cn(
              "px-3 py-1.5 rounded-md font-medium transition-colors",
              metric === "moic" ? "text-white shadow-sm" : "text-text-secondary",
            )}
            style={metric === "moic" ? { backgroundColor: "#003366" } : undefined}
          >
            MOIC
          </button>
          <button
            type="button"
            onClick={() => onChangeMetric("irr")}
            className={cn(
              "px-3 py-1.5 rounded-md font-medium transition-colors",
              metric === "irr" ? "text-white shadow-sm" : "text-text-secondary",
            )}
            style={metric === "irr" ? { backgroundColor: "#003366" } : undefined}
          >
            IRR
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="bg-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary border-b border-border">
                <div className="flex flex-col">
                  <span>Exit Mult ↓</span>
                  <span className="text-text-secondary">Growth →</span>
                </div>
              </th>
              {grid.growthValues.map((g, i) => (
                <th
                  key={i}
                  className={cn(
                    "px-4 py-3 text-center text-xs font-semibold tracking-wider border-b border-border",
                    i === grid.centerCol ? "bg-blue-50 text-text-primary" : "bg-slate-100 text-text-secondary",
                  )}
                >
                  {(g * 100).toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.exitValues.map((m, ri) => {
              const isCenterRow = ri === grid.centerRow;
              return (
                <tr key={ri}>
                  <th
                    className={cn(
                      "px-4 py-3 text-left text-xs font-semibold border-b border-border",
                      isCenterRow ? "bg-blue-50 text-text-primary" : "bg-slate-100 text-text-secondary",
                    )}
                  >
                    {m.toFixed(2)}x
                  </th>
                  {grid.cells[ri].map((value, ci) => {
                    const isCenter = isCenterRow && ci === grid.centerCol;
                    const intensity = grid.intensity[ri][ci];
                    const bg = colorForIntensity(intensity);
                    return (
                      <td
                        key={ci}
                        className={cn(
                          "px-4 py-3 text-center font-mono tabular-nums border-b border-border",
                          isCenter && "ring-2 ring-inset",
                        )}
                        style={{
                          backgroundColor: bg,
                          ...(isCenter ? { boxShadow: "inset 0 0 0 2px #003366" } : {}),
                        }}
                      >
                        {formatCell(value, metric)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-text-secondary px-1">
        Cell shading: darker green = stronger return, darker red = weaker. Outlined cell is the current
        base case.
      </p>
    </div>
  );
}

interface SensitivityGrid {
  exitValues: number[];
  growthValues: number[];
  cells: number[][];
  intensity: number[][];
  centerRow: number;
  centerCol: number;
}

function buildGrid(a: LBOAssumptions, metric: "moic" | "irr"): SensitivityGrid {
  const half = Math.floor(GRID_SIZE / 2);
  const exitValues: number[] = [];
  const growthValues: number[] = [];
  for (let i = -half; i <= half; i++) {
    exitValues.push(Math.max(0.5, a.exitMultiple + i * EXIT_STEP));
    growthValues.push(a.revenueGrowth + i * GROWTH_STEP);
  }

  const cells: number[][] = [];
  let min = Infinity;
  let max = -Infinity;
  for (const exitMultiple of exitValues) {
    const row: number[] = [];
    for (const revenueGrowth of growthValues) {
      const out = computeLBO({ ...a, exitMultiple, revenueGrowth });
      const value = metric === "moic" ? out.returns.moic : out.returns.irr;
      row.push(value);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    cells.push(row);
  }

  // Normalize each cell to [0, 1] for color shading
  const range = max - min || 1;
  const intensity = cells.map((row) => row.map((v) => (v - min) / range));

  return {
    exitValues,
    growthValues,
    cells,
    intensity,
    centerRow: half,
    centerCol: half,
  };
}

function colorForIntensity(intensity: number): string {
  // 0 = red-tinged, 0.5 = white, 1 = green-tinged
  // Use soft tints so numbers stay readable
  if (intensity < 0.5) {
    const t = (0.5 - intensity) * 2; // 0..1
    const alpha = (t * 0.18).toFixed(2);
    return `rgba(220, 38, 38, ${alpha})`; // red-600
  } else {
    const t = (intensity - 0.5) * 2;
    const alpha = (t * 0.18).toFixed(2);
    return `rgba(16, 185, 129, ${alpha})`; // emerald-500
  }
}

function formatCell(value: number, metric: "moic" | "irr"): string {
  if (!Number.isFinite(value)) return "—";
  return metric === "moic" ? `${value.toFixed(2)}x` : `${(value * 100).toFixed(1)}%`;
}
