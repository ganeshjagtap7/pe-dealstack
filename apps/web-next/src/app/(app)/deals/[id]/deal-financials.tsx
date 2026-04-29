"use client";

import { useEffect, useState, useCallback } from "react";
import { api, NotFoundError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import {
  type FinancialStatement,
  RevenueChart,
  GrowthChart,
  BalanceSheetChart,
} from "./deal-financials-charts";
import {
  TAB_CONFIG,
  type ChartType,
  type StatementType,
} from "./deal-financials-constants";
import {
  ValidationFlagsPanel,
  deriveClientValidationFlags,
  type ValidationCheck,
  type ValidationResult,
} from "./deal-financials-validation";
import {
  ConflictBanner,
  type ConflictGroup,
} from "./deal-financials-conflicts";
import { FinancialShell, FinancialTable } from "./deal-financials-table";
import {
  ExtractionResultModal,
  type ExtractionResult,
} from "./deal-financials-modal";

// --- Main Panel ---

export function FinancialStatementsPanel({ dealId, onFullscreen }: { dealId: string; onFullscreen?: () => void }) {
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
  const [extractionModalResult, setExtractionModalResult] = useState<ExtractionResult | null>(null);

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
        // API returns raw array, but handle wrapped responses too
        const raw = stmtData.value as unknown;
        const arr = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.statements)
            ? (raw as Record<string, unknown>).statements as FinancialStatement[]
            : Array.isArray((raw as Record<string, unknown>)?.financials)
              ? (raw as Record<string, unknown>).financials as FinancialStatement[]
              : [];
        setStatements(arr);
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
    } catch (err) {
      // Silently swallow — conflicts panel will still show. Log so it's not invisible.
      console.warn("[deal-financials] auto-resolve failed:", err);
    }
  }, [dealId, loadFinancials]);

  // Progress messages matching legacy (cycle every 15s)
  const [extractLabel, setExtractLabel] = useState("");

  const handleExtract = useCallback(async () => {
    if (extracting) return;
    setExtracting(true);
    setExtractLabel("Extracting… (30–60s)");

    const progressMsgs = [
      "Extracting… (reading file)",
      "Extracting… (analyzing data)",
      "Extracting… (almost done)",
    ];
    let idx = 0;
    const progressTimer = setInterval(() => {
      idx = (idx + 1) % progressMsgs.length;
      setExtractLabel(progressMsgs[idx]);
    }, 15000);

    try {
      const result = await api.post<ExtractionResult>(
        `/deals/${dealId}/financials/extract`,
        {},
      );

      // Small delay before fetching — the API may return success before data
      // is fully committed to the database (observed in production).
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
        // Show extraction results modal instead of a simple toast
        setExtractionModalResult(result);
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "AbortError"
          ? "Extraction timed out (>2 min). The file may be too large — try again or upload a simpler P&L."
          : "Could not extract financial data — document may be encrypted or unsupported";
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

  // Extraction Results Modal — rendered above all states so it persists across re-renders
  const extractionModal = extractionModalResult ? (
    <ExtractionResultModal
      extractionResult={extractionModalResult}
      statements={statements}
      currency={detectedCurrency}
      onClose={() => setExtractionModalResult(null)}
    />
  ) : null;

  // Loading state
  if (loading) {
    return (
      <>
        {extractionModal}
        <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed} onFullscreen={onFullscreen}>
          <div className="text-center py-10">
            <span className="material-symbols-outlined text-gray-300 text-3xl animate-spin block mb-2">progress_activity</span>
            <p className="text-xs text-gray-400">Loading financial data...</p>
          </div>
        </FinancialShell>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        {extractionModal}
        <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed} onFullscreen={onFullscreen}>
          <div className="text-center py-10">
            <span className="material-symbols-outlined text-red-300 text-3xl block mb-2">error</span>
            <p className="text-xs text-gray-500">{error}</p>
            <button onClick={loadFinancials} className="mt-3 text-xs text-blue-600 hover:underline">Retry</button>
          </div>
        </FinancialShell>
      </>
    );
  }

  // Empty state
  if (!hasData) {
    return (
      <>
        {extractionModal}
        <FinancialShell collapsed={collapsed} onToggle={toggleCollapsed} onFullscreen={onFullscreen}>
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
                  {extractLabel || "Extracting… (30–60s)"}
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
      </>
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
    <>
      {extractionModal}
      <FinancialShell avgConfidence={avgConfidence} currency={detectedCurrency} collapsed={collapsed} onToggle={toggleCollapsed} onFullscreen={onFullscreen}>
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
                {extractLabel || "Extracting…"}
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
    </>
  );
}
