"use client";

import { useEffect, useState, useCallback } from "react";
import { api, NotFoundError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  type AnalysisTab,
  type InsightsData,
  type CrossDocData,
  type BenchmarkData,
  BANKER_BLUE,
  BANKER_BLUE_LIGHT,
  ANALYSIS_TABS,
} from "./deal-analysis-types";
import {
  OverviewPanel,
  ValuationPanel,
  RiskPanel,
  BenchmarksPanel,
} from "./deal-analysis-panels";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DealAnalysisSection({ dealId }: { dealId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [crossDoc, setCrossDoc] = useState<CrossDocData | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  // "error" = real server/network failure (5xx, network, etc). Never set for 404.
  const [error, setError] = useState(false);
  // "noData" = all endpoints returned 404 — analysis not generated yet.
  // The section renders with an empty state (not an error) in this case.
  const [noData, setNoData] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNoData(false);
    try {
      const [insightsRes, crossDocRes, benchmarkRes] = await Promise.allSettled([
        api.get<InsightsData>(`/deals/${dealId}/financials/insights`),
        api.get<CrossDocData>(`/deals/${dealId}/financials/cross-doc`),
        api.get<BenchmarkData>(`/deals/${dealId}/financials/benchmark`),
      ]);

      if (insightsRes.status === "fulfilled") setInsights(insightsRes.value);
      if (crossDocRes.status === "fulfilled") setCrossDoc(crossDocRes.value);
      if (benchmarkRes.status === "fulfilled") setBenchmark(benchmarkRes.value);

      const allRejected =
        insightsRes.status === "rejected" &&
        crossDocRes.status === "rejected" &&
        benchmarkRes.status === "rejected";

      if (allRejected) {
        // 404 on every endpoint means no analysis has been generated yet.
        // Treat as an empty state (not a real error — no retry needed).
        const is404 = (r: PromiseRejectedResult) => r.reason instanceof NotFoundError;
        if (is404(insightsRes) && is404(crossDocRes) && is404(benchmarkRes)) {
          setNoData(true);
        } else {
          setError(true);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hide section when fully loaded and there is real data (hasData flag) on none
  // of the endpoints AND it wasn't a hard error. This handles the case where the
  // API returns 200 but with hasData=false (analysis exists but no results yet).
  const hasAnyData = insights?.hasData || crossDoc?.hasData || benchmark?.hasData;
  if (!loading && !hasAnyData && !error && !noData) return null;

  return (
    <div
      id="analysis-section"
      className="overflow-hidden"
      style={{
        borderRadius: "12px",
        border: `2px solid ${BANKER_BLUE}`,
        boxShadow: "0 2px 8px rgba(0,51,102,0.15)",
        flexShrink: 0,
      }}
    >
      {/* Gradient header / collapsible toggle */}
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between gap-2.5 cursor-pointer"
        style={{
          background: `linear-gradient(135deg, ${BANKER_BLUE} 0%, ${BANKER_BLUE_LIGHT} 100%)`,
          padding: "14px 20px",
          borderRadius: collapsed ? "10px" : "10px 10px 0 0",
          border: "none",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-white text-[20px]">auto_awesome</span>
          <span
            className="text-white text-[13px] font-bold uppercase tracking-wider"
            style={{ letterSpacing: "0.05em" }}
          >
            AI Financial Analysis
          </span>
          {insights?.qoe && <QoEBadge score={insights.qoe.score} />}
        </div>
        <span
          className="material-symbols-outlined text-white/80 text-[20px] transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        >
          expand_more
        </span>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="bg-white" style={{ padding: "20px", borderRadius: "0 0 10px 10px" }}>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState onRetry={loadData} />
          ) : noData ? (
            <NoDataState />
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex gap-0 border-b-2 border-gray-200 mb-5 overflow-x-auto">
                {ANALYSIS_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap",
                      activeTab === t.id
                        ? "border-[#003366] text-[#003366] bg-[#00336608]"
                        : "border-transparent text-gray-500 hover:text-[#003366] hover:bg-[#00336608]"
                    )}
                  >
                    <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab panels */}
              {activeTab === "overview" && <OverviewPanel insights={insights} />}
              {activeTab === "valuation" && <ValuationPanel insights={insights} />}
              {activeTab === "risk" && <RiskPanel insights={insights} crossDoc={crossDoc} />}
              {activeTab === "benchmarks" && <BenchmarksPanel benchmark={benchmark} />}

              {/* Footer */}
              {insights?.analyzedAt && (
                <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">AI-generated analysis</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(insights.analyzedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QoE Badge (header pill)
// ---------------------------------------------------------------------------

function QoEBadge({ score }: { score: number }) {
  let bg: string, color: string;
  if (score >= 75) { bg = "#D1FAE5"; color = "#059669"; }
  else if (score >= 50) { bg = "#FEF3C7"; color = "#d97706"; }
  else { bg = "#FEE2E2"; color = "#dc2626"; }

  return (
    <span
      className="text-[11px] font-bold rounded-full px-3 py-0.5"
      style={{ background: bg, color }}
    >
      QoE: {score}/100
    </span>
  );
}

// ---------------------------------------------------------------------------
// Loading / Error / No-data states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="text-center py-10">
      <span className="material-symbols-outlined text-4xl text-gray-300 animate-spin block mb-2">
        progress_activity
      </span>
      <p className="text-sm text-gray-400">Loading financial analysis...</p>
    </div>
  );
}

function NoDataState() {
  return (
    <div className="text-center py-10">
      <span className="material-symbols-outlined text-4xl text-gray-300 block mb-2">analytics</span>
      <p className="text-sm font-semibold text-gray-500 mb-1">No analysis data available yet</p>
      <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
        Upload financial documents and extract data to generate AI-powered analysis.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-10">
      <span className="material-symbols-outlined text-4xl text-red-300 block mb-2">error_outline</span>
      <p className="text-sm font-semibold text-gray-500 mb-1">Failed to load analysis</p>
      <p className="text-xs text-gray-400 mb-4">
        Something went wrong loading the financial analysis. Please try again.
      </p>
      <button
        onClick={onRetry}
        className="text-xs font-semibold text-white px-4 py-2 rounded-lg"
        style={{ backgroundColor: BANKER_BLUE }}
      >
        Retry
      </button>
    </div>
  );
}
