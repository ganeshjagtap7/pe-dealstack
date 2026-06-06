"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  ASSUMPTION_KEYS,
  ASSUMPTION_META,
  formatCell,
  type AssumptionKey,
  type CellFormat,
  type LBOAssumptions,
  type LBOOutputs,
} from "@/lib/lbo-model";
import { SensitivityTab } from "./sensitivity-tab";

type TabKey = "assumptions" | "pnl" | "debt" | "returns" | "sensitivity";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "assumptions", label: "Assumptions", icon: "tune" },
  { key: "pnl", label: "P&L", icon: "table_chart" },
  { key: "debt", label: "Debt Schedule", icon: "account_balance" },
  { key: "returns", label: "Returns", icon: "trending_up" },
  { key: "sensitivity", label: "Sensitivity", icon: "grid_on" },
];

export interface LBOGridProps {
  assumptions: LBOAssumptions;
  outputs: LBOOutputs;
  highlightedKeys?: AssumptionKey[];
  onChangeAssumption: (key: AssumptionKey, value: number) => void;
}

export function LBOGrid({ assumptions, outputs, highlightedKeys, onChangeAssumption }: LBOGridProps) {
  const [tab, setTab] = useState<TabKey>("assumptions");
  const [sensitivityMetric, setSensitivityMetric] = useState<"moic" | "irr">("moic");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-end gap-1 border-b border-border bg-white px-4">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2",
                active
                  ? "border-primary text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              )}
              style={active ? { borderBottomColor: "#003366" } : undefined}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 custom-scrollbar bg-[#F8F9FA]">
        {tab === "assumptions" && (
          <AssumptionsTab
            assumptions={assumptions}
            highlightedKeys={highlightedKeys}
            onChange={onChangeAssumption}
          />
        )}
        {tab === "pnl" && <PnLTab outputs={outputs} />}
        {tab === "debt" && <DebtTab outputs={outputs} />}
        {tab === "returns" && <ReturnsTab assumptions={assumptions} outputs={outputs} />}
        {tab === "sensitivity" && (
          <SensitivityTab
            assumptions={assumptions}
            metric={sensitivityMetric}
            onChangeMetric={setSensitivityMetric}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Assumptions tab — editable inputs grouped by section
// ────────────────────────────────────────────────────────────

const GROUP_ORDER: Array<"Entry" | "Capital Structure" | "Operating" | "Exit" | "Hurdle"> = [
  "Entry",
  "Capital Structure",
  "Operating",
  "Exit",
  "Hurdle",
];

function AssumptionsTab({
  assumptions,
  highlightedKeys,
  onChange,
}: {
  assumptions: LBOAssumptions;
  highlightedKeys?: AssumptionKey[];
  onChange: (key: AssumptionKey, value: number) => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<string, AssumptionKey[]> = {};
    for (const k of ASSUMPTION_KEYS) {
      const g = ASSUMPTION_META[k].group;
      out[g] = out[g] || [];
      out[g].push(k);
    }
    return out;
  }, []);
  const highlighted = useMemo(() => new Set(highlightedKeys || []), [highlightedKeys]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {GROUP_ORDER.map((group) => (
        <section key={group} className="rounded-xl border border-border bg-white shadow-sm">
          <header className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{group}</h3>
          </header>
          <div className="divide-y divide-border">
            {grouped[group]?.map((key) => (
              <AssumptionRow
                key={key}
                assumptionKey={key}
                value={assumptions[key]}
                highlighted={highlighted.has(key)}
                onChange={(v) => onChange(key, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssumptionRow({
  assumptionKey,
  value,
  highlighted,
  onChange,
}: {
  assumptionKey: AssumptionKey;
  value: number;
  highlighted: boolean;
  onChange: (v: number) => void;
}) {
  const meta = ASSUMPTION_META[assumptionKey];
  const display = toInputString(value, meta.format);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = fromInputString(draft, meta.format);
    setDraft(null);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 transition-colors",
        highlighted ? "bg-blue-50/60" : "hover:bg-slate-50"
      )}
    >
      <span className="text-sm text-text-primary">{meta.label}</span>
      <div className="relative flex items-center">
        <input
          type="number"
          value={draft ?? display}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          step={meta.format === "percent" ? 0.1 : meta.step}
          className="w-28 rounded-md border border-border bg-white px-2 py-1 text-right text-sm font-mono tabular-nums text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
        <span className="ml-2 w-4 text-xs text-text-secondary">{unitSuffix(meta.format)}</span>
      </div>
    </label>
  );
}

function toInputString(value: number, format: CellFormat): string {
  if (!Number.isFinite(value)) return "";
  switch (format) {
    case "percent":
      return (value * 100).toFixed(2).replace(/\.?0+$/, "");
    case "multiple":
      return value.toFixed(2).replace(/\.?0+$/, "");
    case "currency":
      return value.toFixed(2).replace(/\.?0+$/, "");
    case "years":
      return String(Math.round(value));
  }
}

function fromInputString(raw: string, format: CellFormat): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return NaN;
  switch (format) {
    case "percent":
      return n / 100;
    case "years":
      return Math.round(n);
    default:
      return n;
  }
}

function unitSuffix(format: CellFormat): string {
  switch (format) {
    case "percent": return "%";
    case "multiple": return "x";
    case "currency": return "$M";
    case "years": return "y";
  }
}

// ────────────────────────────────────────────────────────────
// P&L tab — yearly income statement
// ────────────────────────────────────────────────────────────

function PnLTab({ outputs }: { outputs: LBOOutputs }) {
  const years = outputs.years;
  const rows: Array<{ label: string; values: number[]; format: CellFormat; bold?: boolean }> = [
    { label: "Revenue", values: years.map((y) => y.revenue), format: "currency", bold: true },
    { label: "EBITDA Margin", values: years.map((y) => y.ebitdaMargin), format: "percent" },
    { label: "EBITDA", values: years.map((y) => y.ebitda), format: "currency", bold: true },
    { label: "Depreciation", values: years.map((y) => y.depreciation), format: "currency" },
    { label: "EBIT", values: years.map((y) => y.ebit), format: "currency" },
    { label: "Interest Expense", values: years.map((y) => y.interest), format: "currency" },
    { label: "Pretax Income", values: years.map((y) => y.pretaxIncome), format: "currency" },
    { label: "Tax", values: years.map((y) => y.tax), format: "currency" },
    { label: "Net Income", values: years.map((y) => y.netIncome), format: "currency", bold: true },
  ];
  return <YearTable years={years.map((y) => y.year)} rows={rows} />;
}

// ────────────────────────────────────────────────────────────
// Debt schedule tab
// ────────────────────────────────────────────────────────────

function DebtTab({ outputs }: { outputs: LBOOutputs }) {
  const years = outputs.years;
  const rows: Array<{ label: string; values: number[]; format: CellFormat; bold?: boolean }> = [
    { label: "Opening Debt", values: years.map((y) => y.openingDebt), format: "currency", bold: true },
    { label: "EBITDA", values: years.map((y) => y.ebitda), format: "currency" },
    { label: "Capex", values: years.map((y) => -y.capex), format: "currency" },
    { label: "Δ NWC", values: years.map((y) => -y.changeInNwc), format: "currency" },
    { label: "Cash Interest", values: years.map((y) => -y.interest), format: "currency" },
    { label: "Cash Tax", values: years.map((y) => -y.tax), format: "currency" },
    { label: "FCF (pre-debt)", values: years.map((y) => y.fcfBeforeDebt), format: "currency", bold: true },
    { label: "Mandatory Amort", values: years.map((y) => -y.mandatoryAmort), format: "currency" },
    { label: "Cash Sweep", values: years.map((y) => -y.cashSweep), format: "currency" },
    { label: "Ending Debt", values: years.map((y) => y.endingDebt), format: "currency", bold: true },
  ];
  return <YearTable years={years.map((y) => y.year)} rows={rows} />;
}

// ────────────────────────────────────────────────────────────
// Returns tab — sources/uses + headline returns
// ────────────────────────────────────────────────────────────

function ReturnsTab({ assumptions, outputs }: { assumptions: LBOAssumptions; outputs: LBOOutputs }) {
  const su = outputs.sourcesUses;
  const r = outputs.returns;
  const wacc = assumptions.wacc;
  const spread = r.irr - wacc;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-white shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Sources & Uses</h3>
        </header>
        <dl className="divide-y divide-border">
          <Row label="Entry EBITDA" value={formatCell(su.entryEBITDA, "currency")} />
          <Row label="Entry EV" value={formatCell(su.entryEV, "currency")} bold />
          <Row label="Debt" value={formatCell(su.debt, "currency")} />
          <Row label="Transaction Fees" value={formatCell(su.fees, "currency")} />
          <Row label="Equity Invested" value={formatCell(su.equity, "currency")} bold />
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-white shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Exit & Returns</h3>
        </header>
        <dl className="divide-y divide-border">
          <Row label="Exit-Year EBITDA" value={formatCell(r.exitEBITDA, "currency")} />
          <Row label="Exit EV" value={formatCell(r.exitEV, "currency")} bold />
          <Row label="Ending Debt at Exit" value={formatCell(r.endingDebt, "currency")} />
          <Row label="Equity Proceeds" value={formatCell(r.equityProceeds, "currency")} bold />
          <Row label="Hold Period" value={`${r.holdYears}y`} />
          <Row label="MOIC" value={formatCell(r.moic, "multiple")} highlight />
          <Row label="IRR" value={formatCell(r.irr, "percent")} highlight />
          <Row label="WACC (hurdle)" value={formatCell(wacc, "percent")} />
          <Row
            label="IRR Spread vs WACC"
            value={`${spread >= 0 ? "+" : ""}${formatCell(spread, "percent")}`}
            highlight={spread >= 0}
          />
        </dl>
      </section>
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums text-sm",
          bold ? "font-semibold text-text-primary" : "text-text-primary",
          highlight && "text-base font-bold"
        )}
        style={highlight ? { color: "#003366" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Year-column table used by P&L and Debt schedule
// ────────────────────────────────────────────────────────────

function YearTable({
  years,
  rows,
}: {
  years: number[];
  rows: Array<{ label: string; values: number[]; format: CellFormat; bold?: boolean }>;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50">
            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Line Item
            </th>
            {years.map((y) => (
              <th
                key={y}
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                Y{y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0 hover:bg-slate-50/60">
              <td
                className={cn(
                  "sticky left-0 z-10 bg-white px-4 py-2.5 text-text-primary",
                  row.bold && "font-semibold"
                )}
              >
                {row.label}
              </td>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-4 py-2.5 text-right font-mono tabular-nums",
                    row.bold ? "font-semibold text-text-primary" : "text-text-primary"
                  )}
                >
                  {formatCell(v, row.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
