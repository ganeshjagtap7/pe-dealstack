"use client";

import { cn } from "@/lib/cn";
import { getCurrencySymbol } from "@/lib/formatters";
import { type FinancialStatement } from "./deal-financials-charts";
import {
  LINE_ITEM_LABELS,
  ORDERED_LINE_ITEMS,
  SUBTOTAL_KEYS,
  type StatementType,
} from "./deal-financials-constants";
import { ConfidenceBadge, fmtMoney, fmtPct, isPctKey } from "./deal-financials-formatters";
import { type ConflictGroup } from "./deal-financials-conflicts";

// --- Shell wrapper (header + border) ---

export function FinancialShell({ children, avgConfidence, currency, collapsed, onToggle, onFullscreen }: {
  children: React.ReactNode; avgConfidence?: number | null; currency?: string;
  collapsed?: boolean; onToggle?: () => void; onFullscreen?: () => void;
}) {
  return (
    <div id="financials-section" className="overflow-hidden"
      style={{ borderRadius: 12, border: "2px solid #003366", boxShadow: "0 2px 8px rgba(0,51,102,0.15)", flexShrink: 0 }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 cursor-pointer"
        style={{ backgroundColor: "#003366", padding: "14px 20px", borderRadius: collapsed ? "10px" : "10px 10px 0 0", border: "none" }}>
        <span className="material-symbols-outlined text-white text-[20px]">table_chart</span>
        <span className="text-white text-[13px] font-bold uppercase tracking-wider" style={{ letterSpacing: "0.05em" }}>
          Financial Statements
        </span>
        <div className="ml-auto flex items-center gap-2">
          {currency && currency !== "USD" && (
            <span className="text-[10px] font-semibold text-white/70 bg-white/10 px-2 py-0.5 rounded-full">{currency}</span>
          )}
          {avgConfidence != null && (
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
              avgConfidence >= 80 ? "bg-emerald-400/20 text-emerald-200"
              : avgConfidence >= 50 ? "bg-amber-400/20 text-amber-200"
              : "bg-red-400/20 text-red-200")}>
              {avgConfidence}% confidence
            </span>
          )}
          <span
            className="material-symbols-outlined text-[16px] transition-colors"
            style={{ color: "rgba(255,255,255,0.5)", cursor: onFullscreen ? "pointer" : "default" }}
            title="Fullscreen"
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
            onClick={(e) => { e.stopPropagation(); onFullscreen?.(); }}
          >
            open_in_full
          </span>
          <span
            className="material-symbols-outlined text-[18px] transition-transform duration-200"
            style={{ color: "rgba(255,255,255,0.75)", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            expand_more
          </span>
        </div>
      </button>
      {!collapsed && (
        <div className="bg-white" style={{ padding: 20, borderRadius: "0 0 10px 10px" }}>{children}</div>
      )}
    </div>
  );
}

// --- Financial Data Table ---

export function FinancialTable({
  statements,
  statementType,
  conflicts,
}: {
  statements: FinancialStatement[];
  statementType: StatementType;
  conflicts: ConflictGroup[];
}) {
  const rows = statements.filter((s) => s.statementType === statementType).sort((a, b) => a.period.localeCompare(b.period));
  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 py-4 text-center">No {statementType.replace(/_/g, " ").toLowerCase()} data available.</p>;
  }

  const unitScale = rows[0]?.unitScale ?? "ACTUALS";
  const currency = rows[0]?.currency ?? "USD";
  const allKeys = new Set<string>();
  rows.forEach((r) => Object.keys(r.lineItems ?? {}).forEach((k) => allKeys.add(k)));
  const orderedKeys = ORDERED_LINE_ITEMS.filter((k) => allKeys.has(k));
  allKeys.forEach((k) => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

  const sym = getCurrencySymbol(currency);
  const code = (currency || "USD").toUpperCase();
  const unitSuffix = code === "INR"
    ? (unitScale === "MILLIONS" ? "Cr" : unitScale === "THOUSANDS" ? "L" : "")
    : (unitScale === "MILLIONS" ? "M" : unitScale === "THOUSANDS" ? "K" : "");

  const docMap = new Map<string, string>();
  rows.forEach((r) => { if (r.Document?.id) docMap.set(r.Document.id, r.Document.name ?? "Unknown document"); });

  // Build a Set of conflict period keys for quick lookup
  const conflictPeriodSet = new Set(
    conflicts
      .filter((c) => c.statementType === statementType)
      .map((c) => c.period),
  );

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "#fafbfc" }}>
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 sticky left-0 min-w-[160px]"
                style={{ background: "#fafbfc", zIndex: 3, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.06)" }}>
                Line Item <span className="text-[10px] font-normal text-gray-400">({sym}{unitSuffix})</span>
              </th>
              {rows.map((r) => {
                const hasConflict = conflictPeriodSet.has(r.period);
                return (
                  <th key={r.id} className="px-3 py-3 text-right whitespace-nowrap min-w-[95px]" style={{ background: "#fafbfc" }}>
                    <div className="flex items-center justify-end gap-1">
                      {hasConflict && (
                        <span
                          className="material-symbols-outlined text-amber-500 cursor-default"
                          style={{ fontSize: 14 }}
                          title="Multiple versions exist for this period — overlapping extraction detected"
                        >
                          merge_type
                        </span>
                      )}
                      <span className={cn("text-[11px] font-semibold", r.periodType === "PROJECTED" ? "italic text-gray-400" : "text-gray-700")}>{r.period}</span>
                    </div>
                    <div className="mt-1"><ConfidenceBadge confidence={r.extractionConfidence} /></div>
                    {r.Document?.name && <div className="text-[9px] text-gray-400 truncate max-w-[88px] mt-0.5" title={r.Document.name}>{r.Document.name}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {orderedKeys.map((key, idx) => {
              const label = LINE_ITEM_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const isSubtotal = SUBTOTAL_KEYS.has(key);
              const isPct = isPctKey(key);
              const rowBg = isSubtotal ? "#f7f8f9" : idx % 2 === 0 ? "#ffffff" : "#fbfbfc";
              const labelCls = isSubtotal ? "font-semibold text-gray-800" : isPct ? "text-gray-400 pl-6" : "text-gray-500";
              return (
                <tr key={key} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors group">
                  <td className={cn("px-3 py-2 text-xs whitespace-nowrap sticky left-0", labelCls)}
                    style={{ zIndex: 2, background: rowBg, boxShadow: "2px 0 4px -2px rgba(0,0,0,0.06)" }}>{label}</td>
                  {rows.map((r) => {
                    const val = (r.lineItems ?? {})[key];
                    const display = isPct ? fmtPct(val) : fmtMoney(val, unitScale, currency);
                    const valCls = r.periodType === "PROJECTED" ? "text-gray-400 italic"
                      : isSubtotal ? "text-gray-900 font-semibold" : "text-gray-700";
                    return <td key={r.id} className={cn("px-3 py-2 text-right text-xs", valCls)}>{display}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {docMap.size > 0 && (
        <p className="text-[10px] text-gray-400 mt-2.5 px-1 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">description</span>
          Source{docMap.size > 1 ? "s" : ""}: {[...docMap.values()].join(" · ")}
        </p>
      )}
    </>
  );
}
