"use client";

import { useEffect, useState, useCallback } from "react";
import { api, NotFoundError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { getCurrencySymbol } from "@/lib/formatters";
import { useToast } from "@/providers/ToastProvider";
import {
  type FinancialStatement,
  RevenueChart,
  GrowthChart,
  BalanceSheetChart,
} from "./deal-financials-charts";

// --- Validation & Conflict Types ---

interface ValidationCheck {
  check: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  period?: string;
}

interface ValidationResult {
  checks: ValidationCheck[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  overallPassed: boolean;
}

interface ConflictVersion {
  id: string;
  documentId: string;
  documentName: string;
  isActive: boolean;
  lineItems: Record<string, number | null>;
  extractionConfidence: number;
  extractionSource: string;
  extractedAt: string;
  reviewedAt: string | null;
}

interface ConflictGroup {
  statementType: string;
  period: string;
  versions: ConflictVersion[];
}

// --- Constants (ported from legacy financials-helpers.js) ---

const LINE_ITEM_LABELS: Record<string, string> = {
  revenue: "Revenue", cogs: "Cost of Goods Sold", gross_profit: "Gross Profit",
  gross_margin_pct: "Gross Margin %", sga: "SG&A", rd: "R&D",
  other_opex: "Other OpEx", total_opex: "Total OpEx", ebitda: "EBITDA",
  ebitda_margin_pct: "EBITDA Margin %", da: "D&A", ebit: "EBIT",
  interest_expense: "Interest Expense", ebt: "EBT", tax: "Tax",
  net_income: "Net Income", sde: "SDE", depreciation: "D&A", tax_expense: "Tax Expense",
  cash: "Cash & Equivalents", accounts_receivable: "Accounts Receivable",
  inventory: "Inventory", other_current_assets: "Other Current Assets",
  total_current_assets: "Total Current Assets", ppe_net: "PP&E (Net)",
  goodwill: "Goodwill", intangibles: "Intangibles", total_assets: "Total Assets",
  accounts_payable: "Accounts Payable", short_term_debt: "Short-term Debt",
  other_current_liabilities: "Other Current Liabilities",
  total_current_liabilities: "Total Current Liabilities",
  long_term_debt: "Long-term Debt", total_liabilities: "Total Liabilities",
  total_equity: "Total Equity", total_debt: "Total Debt",
  operating_cf: "Operating Cash Flow", operating_cash_flow: "Operating Cash Flow",
  capex: "CapEx", fcf: "Free Cash Flow", free_cash_flow: "Free Cash Flow",
  acquisitions: "Acquisitions", debt_repayment: "Debt Repayment",
  dividends: "Dividends", net_change_cash: "Net Change in Cash",
  investing_activities: "Investing Activities", financing_activities: "Financing Activities",
};

const SUBTOTAL_KEYS = new Set([
  "revenue", "gross_profit", "ebitda", "ebit", "net_income", "sde",
  "total_current_assets", "total_assets", "total_current_liabilities",
  "total_liabilities", "total_equity", "fcf", "free_cash_flow",
  "operating_cf", "operating_cash_flow", "net_change_cash",
]);

const ORDERED_LINE_ITEMS = [
  "revenue", "cogs", "gross_profit", "gross_margin_pct",
  "sga", "rd", "other_opex", "total_opex",
  "ebitda", "ebitda_margin_pct", "da", "ebit",
  "interest_expense", "ebt", "tax", "net_income", "sde",
  "cash", "accounts_receivable", "inventory", "other_current_assets", "total_current_assets",
  "ppe_net", "goodwill", "intangibles", "total_assets",
  "accounts_payable", "short_term_debt", "other_current_liabilities", "total_current_liabilities",
  "long_term_debt", "total_liabilities", "total_equity",
  "operating_cf", "operating_cash_flow", "capex", "fcf", "free_cash_flow",
  "acquisitions", "debt_repayment", "dividends", "net_change_cash",
  "investing_activities", "financing_activities",
];

type StatementType = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";
type ChartType = "revenue" | "growth" | "composition";

const TAB_CONFIG: { key: StatementType; label: string; icon: string }[] = [
  { key: "INCOME_STATEMENT", label: "Income Statement", icon: "receipt_long" },
  { key: "BALANCE_SHEET", label: "Balance Sheet", icon: "account_balance" },
  { key: "CASH_FLOW", label: "Cash Flow", icon: "payments" },
];

// --- Helpers ---

function isPctKey(key: string): boolean {
  return key.endsWith("_pct") || key.endsWith("_margin");
}

function fmtMoney(val: number | null | undefined, unitScale?: string, currency?: string): string {
  if (val === null || val === undefined) return "\u2014";
  const n = Number(val);
  if (isNaN(n)) return "\u2014";
  const sym = getCurrencySymbol(currency);
  const code = (currency || "USD").toUpperCase();
  if (code === "INR" && unitScale === "MILLIONS") {
    return sym + (n / 10).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "Cr";
  }
  if (code === "INR" && unitScale === "THOUSANDS") {
    return sym + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "L";
  }
  const suffix = unitScale === "MILLIONS" ? "M" : unitScale === "THOUSANDS" ? "K" : "";
  return sym + n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + suffix;
}

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "\u2014";
  const n = Number(val);
  if (isNaN(n)) return "\u2014";
  return n.toFixed(1) + "%";
}

function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  const pct = Math.round(confidence ?? 0);
  const [cls, dotColor] =
    pct >= 80 ? ["bg-emerald-50 text-emerald-700 border-emerald-200", "#059669"]
    : pct >= 50 ? ["bg-amber-50 text-amber-700 border-amber-200", "#d97706"]
    : ["bg-red-50 text-red-600 border-red-200", "#dc2626"];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", cls)}>
      <span className="inline-block rounded-full" style={{ width: 5, height: 5, background: dotColor }} />
      {pct}%
    </span>
  );
}

// --- Client-side validation flag derivation ---
// Mirrors the legacy financials.js checks run against the loaded statements.
// We derive flags purely from the statements array so no extra API round-trip
// is needed when the server /validation endpoint is unavailable.

function deriveClientValidationFlags(statements: FinancialStatement[]): ValidationCheck[] {
  const flags: ValidationCheck[] = [];

  // 1. Low confidence warning (< 70%) on any period
  for (const s of statements) {
    const conf = s.extractionConfidence ?? null;
    if (conf !== null && conf < 70) {
      flags.push({
        check: "low_confidence",
        passed: false,
        severity: conf < 50 ? "error" : "warning",
        message: `${s.statementType.replace(/_/g, " ")} ${s.period}: extraction confidence is ${Math.round(conf)}% — review extracted values`,
        period: s.period,
      });
    }
  }

  // 2. Cross-source value divergence for the same (statementType, period)
  //    Group statements by type+period, check if multiple docs report wildly different values.
  const KEY_FIELDS = ["revenue", "ebitda", "net_income", "total_assets", "total_equity", "operating_cf"];
  const groups = new Map<string, FinancialStatement[]>();
  for (const s of statements) {
    const key = `${s.statementType}|${s.period}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [stmtType, period] = key.split("|");
    for (const field of KEY_FIELDS) {
      const vals = group
        .map((s) => (s.lineItems ?? {})[field])
        .filter((v): v is number => v != null);
      if (vals.length < 2) continue;
      const maxAbs = Math.max(...vals.map(Math.abs));
      const spread = Math.max(...vals) - Math.min(...vals);
      const discPct = maxAbs > 0 ? (spread / maxAbs) * 100 : 0;
      if (discPct > 10) {
        const fieldLabel = field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        flags.push({
          check: `cross_source_${field}`,
          passed: false,
          severity: discPct > 30 ? "error" : "warning",
          message: `${stmtType.replace(/_/g, " ")} ${period}: ${fieldLabel} differs by ${discPct.toFixed(1)}% across source documents — verify`,
          period,
        });
      }
    }
  }

  return flags;
}

// --- Validation Flags Panel ---

function ValidationFlagsPanel({ flags }: { flags: ValidationCheck[] }) {
  const [open, setOpen] = useState(true);

  if (flags.length === 0) return null;

  const errorFlags = flags.filter((f) => f.severity === "error");
  const hasErrors = errorFlags.length > 0;

  return (
    <div className={cn(
      "mb-4 rounded-lg border overflow-hidden",
      hasErrors ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50",
    )}>
      <button
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
          hasErrors ? "hover:bg-red-100/50" : "hover:bg-amber-100/50",
        )}
        aria-expanded={open}
      >
        <span className={cn(
          "material-symbols-outlined text-base",
          hasErrors ? "text-red-500" : "text-amber-500",
        )}>
          warning
        </span>
        <span className={cn(
          "text-xs font-semibold",
          hasErrors ? "text-red-800" : "text-amber-800",
        )}>
          {flags.length} Validation Flag{flags.length > 1 ? "s" : ""}
          {hasErrors && ` (${errorFlags.length} error${errorFlags.length > 1 ? "s" : ""})`}
        </span>
        <span
          className={cn(
            "material-symbols-outlined text-sm ml-auto transition-transform duration-200",
            hasErrors ? "text-red-400" : "text-amber-400",
          )}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className={cn(
          "px-4 pb-3 border-t",
          hasErrors ? "border-red-200/60" : "border-amber-200/60",
        )}>
          <ul className={cn(
            "text-xs space-y-1 mt-2",
            hasErrors ? "text-red-700" : "text-amber-700",
          )}>
            {flags.map((f, i) => (
              <li key={`${f.check}-${i}`} className="flex items-start gap-1.5">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 material-symbols-outlined",
                    f.severity === "error"
                      ? "text-red-400 text-xs"
                      : f.severity === "warning"
                        ? "text-amber-400 text-xs"
                        : "text-gray-400 text-xs",
                  )}
                  style={{ fontSize: 12 }}
                >
                  {f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "info"}
                </span>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Conflict / Overlapping Period Banner ---

interface ConflictBannerProps {
  conflicts: ConflictGroup[];
  onAutoResolve: () => void;
}

function ConflictBanner({ conflicts, onAutoResolve }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border-2 border-blue-300 bg-blue-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
        <span className="material-symbols-outlined text-blue-600 text-lg">merge_type</span>
        <div className="flex-1 min-w-[200px]">
          <span className="text-xs font-bold text-blue-900">
            {conflicts.length} Overlapping Period{conflicts.length > 1 ? "s" : ""} Found
          </span>
          <span className="text-[10px] text-blue-600 ml-2">
            Multiple documents extracted data for the same period — highest-confidence version is shown
          </span>
        </div>
        <button
          onClick={onAutoResolve}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-100 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">auto_fix_high</span>
          Auto-resolve
        </button>
      </div>

      {/* Conflict detail rows */}
      <div className="border-t border-blue-200/60 px-4 py-2 space-y-1">
        {conflicts.map((c) => (
          <div key={`${c.statementType}|${c.period}`} className="flex items-center gap-2 text-[10px] text-blue-700">
            <span className="material-symbols-outlined text-[11px] text-blue-400">chevron_right</span>
            <span className="font-semibold">{c.statementType.replace(/_/g, " ")}</span>
            <span>{c.period}</span>
            <span className="text-blue-400">·</span>
            <span>{c.versions.length} versions</span>
            <span className="text-blue-400 ml-auto">
              Showing: {c.versions.reduce((best, v) =>
                v.extractionConfidence > best.extractionConfidence ? v : best
              ).documentName}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Shell wrapper (header + border) ---

function FinancialShell({ children, avgConfidence, currency, collapsed, onToggle }: {
  children: React.ReactNode; avgConfidence?: number | null; currency?: string;
  collapsed?: boolean; onToggle?: () => void;
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
            style={{ color: "rgba(255,255,255,0.5)" }}
            title="Fullscreen"
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
            onClick={(e) => { e.stopPropagation(); }}
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

function FinancialTable({
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
          Source{docMap.size > 1 ? "s" : ""}: {[...docMap.values()].join(" \u00B7 ")}
        </p>
      )}
    </>
  );
}

// --- Main Panel ---

export function FinancialStatementsPanel({ dealId }: { dealId: string }) {
  const { showToast } = useToast();
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [serverValidation, setServerValidation] = useState<ValidationResult | null>(null);
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<StatementType>("INCOME_STATEMENT");
  const [chartVisible, setChartVisible] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("revenue");
  const [periodFilter, setPeriodFilter] = useState<"all" | "annual" | "quarterly">("all");
  const [extracting, setExtracting] = useState(false);

  const loadFinancials = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch statements, validation flags, and conflict groups in parallel.
      // Validation and conflicts endpoints may return 404 if not yet implemented —
      // we treat that gracefully (fall back to client-side derivation).
      const [stmtData, validData, conflictData] = await Promise.allSettled([
        api.get<FinancialStatement[]>(`/deals/${dealId}/financials`),
        api.get<ValidationResult>(`/deals/${dealId}/financials/validation`),
        api.get<{ conflicts: ConflictGroup[]; count: number }>(`/deals/${dealId}/financials/conflicts`),
      ]);

      if (stmtData.status === "fulfilled") {
        setStatements(Array.isArray(stmtData.value) ? stmtData.value : []);
      } else {
        const err = stmtData.reason;
        const msg = err instanceof Error ? err.message : "Failed to load financials";
        // Treat 404/Not Found as empty data rather than an error
        if (err instanceof NotFoundError || msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setStatements([]);
        } else {
          setError(msg);
        }
      }

      if (validData.status === "fulfilled" && validData.value?.checks) {
        setServerValidation(validData.value);
      } else {
        setServerValidation(null);
      }

      if (conflictData.status === "fulfilled" && Array.isArray(conflictData.value?.conflicts)) {
        setConflicts(conflictData.value.conflicts);
      } else {
        setConflicts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  const handleAutoResolve = useCallback(async () => {
    try {
      await api.post(`/deals/${dealId}/financials/resolve-all`, { strategy: "highest_confidence" });
      // Reload everything after resolution
      await loadFinancials();
    } catch {
      // Silently ignore — conflicts panel will still show
    }
  }, [dealId, loadFinancials]);

  // Progress messages matching legacy (cycle every 15s)
  const [extractLabel, setExtractLabel] = useState("");

  const handleExtract = useCallback(async () => {
    if (extracting) return;
    setExtracting(true);
    setExtractLabel("Extracting\u2026 (30\u201360s)");

    const progressMsgs = [
      "Extracting\u2026 (reading file)",
      "Extracting\u2026 (analyzing data)",
      "Extracting\u2026 (almost done)",
    ];
    let idx = 0;
    const progressTimer = setInterval(() => {
      idx = (idx + 1) % progressMsgs.length;
      setExtractLabel(progressMsgs[idx]);
    }, 15000);

    try {
      const result = await api.post<{
        result?: { periodsStored?: number; warnings?: string[] };
      }>(`/deals/${dealId}/financials/extract`, {});

      await loadFinancials();

      const stored = result?.result?.periodsStored ?? 0;
      const warnings = result?.result?.warnings ?? [];

      if (stored === 0) {
        const warningMsg =
          warnings.length > 0
            ? warnings[0]
            : "No financial data found in the document. Try uploading a P&L, Balance Sheet, or CIM.";
        showToast(warningMsg, "warning", { title: "No Data Extracted" });
      } else {
        showToast(
          `Extracted ${stored} period${stored > 1 ? "s" : ""} of financial data.`,
          "success",
          { title: "Financials Extracted" },
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "Extraction timed out (>2 min). The file may be too large \u2014 try again or upload a simpler P&L."
          : "Could not extract financial data \u2014 document may be encrypted or unsupported";
      showToast(msg, "warning", { title: "No Data Extracted" });
    } finally {
      clearInterval(progressTimer);
      setExtracting(false);
      setExtractLabel("");
    }
  }, [dealId, extracting, loadFinancials, showToast]);

  useEffect(() => { loadFinancials(); }, [loadFinancials]);

  // Derived state
  const hasData = statements.length > 0;
  const availableTabs = TAB_CONFIG.filter((t) => statements.some((s) => s.statementType === t.key));
  const resolvedTab = availableTabs.find((t) => t.key === activeTab) ? activeTab : (availableTabs[0]?.key ?? "INCOME_STATEMENT");

  const filteredStatements = statements.filter((s) => {
    if (periodFilter === "all") return true;
    const isFY = /^FY\b/i.test(s.period) || /^\d{4}$/i.test(s.period);
    return periodFilter === "annual" ? isFY : !isFY;
  });

  const hasAnnual = statements.some((s) => /^FY\b/i.test(s.period) || /^\d{4}$/i.test(s.period));
  const hasQuarterly = statements.some((s) => !(/^FY\b/i.test(s.period) || /^\d{4}$/i.test(s.period)));
  const showPeriodToggle = hasAnnual && hasQuarterly;
  const detectedCurrency = statements.find((s) => s.currency)?.currency ?? "USD";
  const confidences = statements.map((s) => s.extractionConfidence).filter((c): c is number => c != null);
  const avgConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null;

  // Merge server-supplied validation flags with client-derived ones.
  // Server flags (from /financials/validation) take precedence; client flags
  // catch cases the server endpoint doesn't cover (e.g. low-confidence periods,
  // cross-source discrepancies visible only after the statements are loaded).
  const clientFlags = deriveClientValidationFlags(statements);
  const serverFlags: ValidationCheck[] = serverValidation?.checks.filter((c) => !c.passed) ?? [];
  // Deduplicate by check key — server wins over client for same key
  const seenChecks = new Set(serverFlags.map((f) => f.check));
  const extraClientFlags = clientFlags.filter((f) => !seenChecks.has(f.check));
  const validationFlags: ValidationCheck[] = [...serverFlags, ...extraClientFlags];

  function toggleChart(type: ChartType) {
    if (chartVisible && chartType === type) setChartVisible(false);
    else { setChartVisible(true); setChartType(type); }
  }

  function handleTabSwitch(tab: StatementType) {
    setActiveTab(tab);
    setChartVisible(false);
    setChartType(tab === "BALANCE_SHEET" ? "composition" : "revenue");
  }

  const toggleCollapsed = () => setCollapsed((p) => !p);

  // Loading state
  if (loading) {
    return (
      <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed}>
        <div className="text-center py-10">
          <span className="material-symbols-outlined text-gray-300 text-3xl animate-spin block mb-2">progress_activity</span>
          <p className="text-xs text-gray-400">Loading financial data...</p>
        </div>
      </FinancialShell>
    );
  }

  // Error state
  if (error) {
    return (
      <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed}>
        <div className="text-center py-10">
          <span className="material-symbols-outlined text-red-300 text-3xl block mb-2">error</span>
          <p className="text-xs text-gray-500">{error}</p>
          <button onClick={loadFinancials} className="mt-3 text-xs text-blue-600 hover:underline">Retry</button>
        </div>
      </FinancialShell>
    );
  }

  // Empty state
  if (!hasData) {
    return (
      <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed}>
        <div className="text-center" style={{ padding: "40px 16px" }}>
          <span className="material-symbols-outlined text-gray-300 block mb-2" style={{ fontSize: 40 }}>table_chart</span>
          <p className="text-sm font-semibold text-gray-800" style={{ marginBottom: 4 }}>No Financial Data Yet</p>
          <p className="text-xs text-gray-500" style={{ marginBottom: 20 }}>
            Upload a CIM, P&amp;L, or financial PDF to extract the 3-statement model automatically.
          </p>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-2 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
            style={{ padding: "10px 20px", backgroundColor: "#003366" }}>
            {extracting ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                {extractLabel || "Extracting\u2026 (30\u201360s)"}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                Extract Financials
              </>
            )}
          </button>
        </div>
      </FinancialShell>
    );
  }

  // Chart toggle button
  function ChartBtn({ type, label, icon }: { type: ChartType; label: string; icon: string }) {
    const active = chartVisible && chartType === type;
    return (
      <button onClick={() => toggleChart(type)}
        className={cn("flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 transition-all",
          active ? "text-white border-transparent shadow-sm" : "text-gray-500 hover:text-gray-800 border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
        style={active ? { backgroundColor: "#003366", borderColor: "#003366" } : undefined}>
        <span className="material-symbols-outlined text-sm">{icon}</span>{label}
      </button>
    );
  }

  const showChart = chartVisible && (resolvedTab === "INCOME_STATEMENT" || resolvedTab === "BALANCE_SHEET");

  return (
    <FinancialShell avgConfidence={avgConfidence} currency={detectedCurrency} collapsed={collapsed} onToggle={toggleCollapsed}>
      {/* Validation flags — collapsible amber/red warning card (mirrors legacy flagHtml) */}
      <ValidationFlagsPanel flags={validationFlags} />

      {/* Overlapping period conflict banner (mirrors legacy conflictBannerHtml) */}
      <ConflictBanner conflicts={conflicts} onAutoResolve={handleAutoResolve} />

      {/* Tabs + controls */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-50 rounded-lg p-1 border border-gray-100">
          {availableTabs.map((t) => (
            <button key={t.key} onClick={() => handleTabSwitch(t.key)}
              className={cn("flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                resolvedTab === t.key ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100")}
              style={resolvedTab === t.key ? { backgroundColor: "#003366" } : undefined}>
              <span className="material-symbols-outlined text-sm">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {resolvedTab === "INCOME_STATEMENT" && (
            <><ChartBtn type="revenue" label="Revenue" icon="bar_chart" /><ChartBtn type="growth" label="Growth" icon="trending_up" /></>
          )}
          {resolvedTab === "BALANCE_SHEET" && <ChartBtn type="composition" label="Composition" icon="donut_large" />}
        </div>
        {showPeriodToggle && (
          <div className="flex gap-1 ml-auto bg-gray-50 rounded-lg p-0.5 border border-gray-100">
            {(["all", "annual", "quarterly"] as const).map((p) => (
              <button key={p} onClick={() => setPeriodFilter(p)}
                className={cn("px-2.5 py-1 text-[10px] font-medium rounded-md transition-all capitalize",
                  periodFilter === p ? "bg-white shadow-sm text-gray-800" : "text-gray-400 hover:text-gray-600")}>{p}</button>
            ))}
          </div>
        )}
        {/* Re-extract button */}
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-md px-3 py-1.5 transition-all hover:bg-gray-50 disabled:opacity-60 disabled:pointer-events-none"
        >
          {extracting ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
              {extractLabel || "Extracting\u2026"}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">refresh</span>
              Re-extract
            </>
          )}
        </button>
      </div>
      {/* Chart or Table */}
      {showChart ? (
        <>
          {resolvedTab === "INCOME_STATEMENT" && chartType === "revenue" && <RevenueChart statements={filteredStatements} />}
          {resolvedTab === "INCOME_STATEMENT" && chartType === "growth" && <GrowthChart statements={filteredStatements} />}
          {resolvedTab === "BALANCE_SHEET" && chartType === "composition" && <BalanceSheetChart statements={filteredStatements} />}
        </>
      ) : (
        <FinancialTable statements={filteredStatements} statementType={resolvedTab} conflicts={conflicts} />
      )}
    </FinancialShell>
  );
}
