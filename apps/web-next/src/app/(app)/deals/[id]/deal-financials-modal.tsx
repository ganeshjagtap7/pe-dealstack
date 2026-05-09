"use client";

import { useEffect } from "react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { type FinancialStatement } from "./deal-financials-charts";

export interface ExtractionResult {
  result?: {
    periodsStored?: number;
    warnings?: string[];
    overallConfidence?: number;
    hasConflicts?: boolean;
  };
  agent?: {
    retryCount?: number;
  };
  documentUsed?: {
    name?: string;
  };
  extractionMethod?: string;
}

export function ExtractionResultModal({
  extractionResult,
  statements,
  currency,
  onClose,
}: {
  extractionResult: ExtractionResult;
  statements: FinancialStatement[];
  currency: string;
  onClose: () => void;
}) {
  const result = extractionResult.result ?? {};
  const docName = extractionResult.documentUsed?.name ?? "Unknown document";
  const method = (extractionResult.extractionMethod ?? "gpt4o").toUpperCase();
  const overallConf = result.overallConfidence ?? 0;
  const warnings = result.warnings ?? [];
  const hasConflicts = result.hasConflicts ?? false;
  const retryCount = extractionResult.agent?.retryCount ?? 0;

  const sym = getCurrencySymbol(currency);

  // Count by type
  const incomeCount = statements.filter((s) => s.statementType === "INCOME_STATEMENT").length;
  const balanceCount = statements.filter((s) => s.statementType === "BALANCE_SHEET").length;
  const cashFlowCount = statements.filter((s) => s.statementType === "CASH_FLOW").length;

  // Latest revenue & EBITDA
  const incomeStmts = statements
    .filter((s) => s.statementType === "INCOME_STATEMENT")
    .sort((a, b) => b.period.localeCompare(a.period));
  const latestIncome = incomeStmts[0]?.lineItems ?? {};
  const revenue = latestIncome.revenue ?? null;
  const ebitda = latestIncome.ebitda ?? null;
  const grossMargin = latestIncome.gross_margin_pct ?? null;
  const ebitdaMargin = latestIncome.ebitda_margin_pct ?? null;
  const latestPeriod = incomeStmts[0]?.period ?? "";

  // Confidence color
  const confColor = overallConf >= 80 ? "#059669" : overallConf >= 50 ? "#d97706" : "#dc2626";

  const fmtVal = (val: number | null | undefined) => {
    if (val == null) return "—";
    return formatCurrency(val, currency);
  };
  const fmtPctVal = (val: number | null | undefined) => {
    if (val == null) return "—";
    return Number(val).toFixed(1) + "%";
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleViewFinancials = () => {
    onClose();
    const el = document.getElementById("financials-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-[slideUp_0.3s_ease-out]"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-xl" style={{ color: "#003366" }}>
                auto_awesome
              </span>
              <h3 className="text-base font-bold text-gray-900">Extraction Results</h3>
            </div>
            {hasConflicts ? (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1"
                style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}
              >
                <span className="material-symbols-outlined text-xs">warning</span>
                Conflicts Found
              </span>
            ) : (
              <span
                className="px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1"
                style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}
              >
                <span className="material-symbols-outlined text-xs">check_circle</span>
                Extraction Complete
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-xs">description</span>
            {docName}
            <span className="mx-1">&middot;</span>
            {method}
            {retryCount > 0 && (
              <>
                <span className="mx-1">&middot;</span>
                {retryCount} retries
              </>
            )}
          </p>
        </div>

        {/* Confidence */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Overall Confidence</span>
            <span className="text-sm font-bold" style={{ color: confColor }}>
              {overallConf}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${overallConf}%`, background: confColor }}
            />
          </div>
        </div>

        {/* Extracted Metrics 2x2 Grid */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                Revenue {latestPeriod ? `(${latestPeriod})` : ""}
              </p>
              <p className="text-sm font-bold text-gray-900 mt-1">{fmtVal(revenue)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">EBITDA</p>
              <p className="text-sm font-bold text-gray-900 mt-1">{fmtVal(ebitda)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Gross Margin</p>
              <p className="text-sm font-bold text-gray-900 mt-1">{fmtPctVal(grossMargin)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">EBITDA Margin</p>
              <p className="text-sm font-bold text-gray-900 mt-1">{fmtPctVal(ebitdaMargin)}</p>
            </div>
          </div>
        </div>

        {/* Statement counts + Currency */}
        <div className="px-6 pb-4">
          <div className="flex gap-2 flex-wrap">
            {incomeCount > 0 && (
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}
              >
                Income: {incomeCount} period{incomeCount > 1 ? "s" : ""}
              </span>
            )}
            {balanceCount > 0 && (
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
              >
                Balance: {balanceCount} period{balanceCount > 1 ? "s" : ""}
              </span>
            )}
            {cashFlowCount > 0 && (
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: "#fefce8", color: "#854d0e", border: "1px solid #fef08a" }}
              >
                Cash Flow: {cashFlowCount} period{cashFlowCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Currency: <span className="font-semibold text-gray-700">{sym.trim()} ({currency})</span>
          </p>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="px-6 pb-4">
            <div className="p-3 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <p className="text-xs font-medium" style={{ color: "#92400e" }}>Warnings:</p>
              <ul className="text-xs mt-1 space-y-0.5" style={{ color: "#a16207" }}>
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">&bull;</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleViewFinancials}
            className="flex-1 py-2.5 px-4 rounded-lg text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{ background: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
            View Financials
          </button>
        </div>
      </div>

      {/* slideUp animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
