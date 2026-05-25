"use client";

// ---------------------------------------------------------------------------
// Shared Chart.js setup + tooltip/legend config used by every Financial chart.
// ---------------------------------------------------------------------------
//
// Lives in its own module so each chart file stays under the 500-line cap and
// so Chart.js component registration only happens once across the panel.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
} from "chart.js";

// Register Chart.js primitives once for the whole financials panel.
ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FinancialStatement {
  id: string;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";
  period: string;
  periodType?: "ACTUAL" | "PROJECTED";
  currency?: string;
  unitScale?: "ACTUALS" | "THOUSANDS" | "MILLIONS" | "BILLIONS";
  extractionConfidence?: number | null;
  extractionSource?: string | null;
  lineItems?: Record<string, number | null>;
  Document?: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Shared tooltip / legend defaults (ported from legacy CHART_TOOLTIP / CHART_LEGEND)
// ---------------------------------------------------------------------------

export const CHART_TOOLTIP = {
  backgroundColor: "rgba(255,255,255,0.98)",
  titleColor: "#111827",
  titleFont: { size: 12 as const, family: "Inter", weight: "bold" as const },
  bodyColor: "#4b5563",
  bodyFont: { size: 11 as const, family: "Inter" },
  borderColor: "#e5e7eb",
  borderWidth: 1,
  padding: { top: 10, bottom: 10, left: 14, right: 14 },
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true as const,
  caretSize: 6,
};

export const CHART_LEGEND = {
  position: "bottom" as const,
  labels: {
    font: { size: 11 as const, family: "Inter", weight: "normal" as const },
    boxWidth: 14,
    boxHeight: 8,
    padding: 18,
    color: "#6b7280",
    usePointStyle: true as const,
    pointStyleWidth: 14,
  },
};
