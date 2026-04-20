"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import Link from "next/link";
import { type DealDetail, PIPELINE_STAGES, TERMINAL_STAGES } from "./components";

// ---------------------------------------------------------------------------
// Stage Pipeline
// ---------------------------------------------------------------------------

export function StagePipeline({
  deal,
  onStageClick,
}: {
  deal: DealDetail;
  onStageClick: (stage: string) => void;
}) {
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === deal.stage);
  const isTerminal = TERMINAL_STAGES.includes(deal.stage);

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-sm">timeline</span>
          Deal Pipeline
        </h3>
        <button
          onClick={() => {
            if (isTerminal) return;
            const nextIdx = currentStageIndex + 1;
            if (nextIdx < PIPELINE_STAGES.length) {
              onStageClick(PIPELINE_STAGES[nextIdx].key);
            }
          }}
          className="text-xs text-primary font-medium flex items-center gap-1 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">edit</span>
          Change Stage
        </button>
      </div>
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, index) => {
          const isPast = currentStageIndex >= 0 && index < currentStageIndex;
          const isCurrent = index === currentStageIndex && !isTerminal;
          const isFuture =
            currentStageIndex < 0 || index > currentStageIndex || isTerminal;

          return (
            <div
              key={stage.key}
              className="flex-1 flex flex-col items-center relative group cursor-pointer"
              onClick={() => onStageClick(stage.key)}
            >
              <div className="flex items-center w-full">
                {index > 0 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5",
                      isPast || isCurrent ? "bg-emerald-500" : "bg-gray-200"
                    )}
                  />
                )}
                {index === 0 && <div className="flex-1" />}
                <div
                  className={cn(
                    "size-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110",
                    isPast && "bg-emerald-500 text-white",
                    isCurrent && "bg-primary text-white ring-2 ring-primary/30 shadow-lg",
                    isFuture && !isCurrent && "bg-gray-100 text-gray-400"
                  )}
                >
                  {isPast ? (
                    <span className="material-symbols-outlined text-sm">check</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">{stage.icon}</span>
                  )}
                </div>
                {index < PIPELINE_STAGES.length - 1 ? (
                  <div
                    className={cn(
                      "flex-1 h-0.5",
                      isPast ? "bg-emerald-500" : "bg-gray-200"
                    )}
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] mt-1.5 text-center leading-tight whitespace-nowrap",
                  isPast && "text-emerald-600 font-medium",
                  isCurrent && "text-primary font-bold",
                  isFuture && !isCurrent && "text-gray-400"
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal Metadata Row (Lead Partner, Analyst, Deal Source, Last Updated)
// ---------------------------------------------------------------------------

export function DealMetadataRow({ deal }: { deal: DealDetail }) {
  const leadPartner = deal.assignedUser;
  // Team members have roles: LEAD, MEMBER, VIEWER. The first MEMBER is the analyst.
  const analyst = deal.team?.find((m) => m.role === "MEMBER") ?? deal.team?.find((m) => m.role !== "LEAD") ?? deal.team?.[0];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-background-body border border-border-subtle">
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
          Lead Partner
        </p>
        <div className="flex items-center gap-2">
          {leadPartner ? (
            <>
              <div className="size-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
                {leadPartner.name?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="text-sm text-text-main font-bold">{leadPartner.name}</span>
            </>
          ) : (
            <span className="text-sm text-text-muted font-bold">Not assigned</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
          Analyst
        </p>
        <div className="flex items-center gap-2">
          {analyst ? (
            <>
              <div className="size-5 rounded-full bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">
                {analyst.name?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="text-sm text-text-main font-bold">{analyst.name}</span>
            </>
          ) : (
            <span className="text-sm text-text-muted font-bold">&mdash;</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
          Deal Source
        </p>
        <span className="text-sm text-text-main font-bold">
          {deal.source || "\u2014"}
        </span>
      </div>
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
          Last Updated
        </p>
        <span className="text-sm text-text-main font-bold">
          {formatRelativeTime(deal.updatedAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financial Metrics Row (Deal Size, Revenue, EBITDA, EBITDA Margin)
// ---------------------------------------------------------------------------

export function FinancialMetricsRow({ deal }: { deal: DealDetail }) {
  const ebitdaMargin =
    deal.ebitda != null && deal.revenue != null && deal.revenue !== 0
      ? ((deal.ebitda / deal.revenue) * 100).toFixed(1) + "%"
      : null;

  const allMetrics = [
    { label: "Deal Size", value: deal.dealSize, formatted: formatCurrency(deal.dealSize), icon: "payments" },
    { label: "Revenue", value: deal.revenue, formatted: formatCurrency(deal.revenue), icon: "trending_up" },
    { label: "EBITDA", value: deal.ebitda, formatted: formatCurrency(deal.ebitda), icon: "analytics" },
    { label: "EBITDA Margin", value: ebitdaMargin, formatted: ebitdaMargin || "N/A", icon: "percent" },
  ];

  // Show all metrics but highlight ones with actual values
  return (
    <div className="flex flex-wrap gap-3">
      {allMetrics.map((m) => {
        const hasValue = m.value != null;
        return (
          <div
            key={m.label}
            className={cn(
              "rounded-lg p-3 min-w-[120px] flex-1",
              hasValue
                ? "bg-surface-card border border-border-subtle shadow-card"
                : "bg-gray-50 border border-gray-100"
            )}
          >
            <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider block mb-1">
              {m.label}
            </span>
            <p className={cn("text-lg font-bold", hasValue ? "text-text-main" : "text-text-muted")}>
              {m.formatted}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financial Statements Section (collapsible, with "Extract Financials" CTA)
// ---------------------------------------------------------------------------

export function FinancialStatementsSection({ dealId }: { dealId: string }) {
  return (
    <div
      className="rounded-xl overflow-hidden border-2 shadow-sm"
      style={{ borderColor: "#003366" }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ backgroundColor: "#003366" }}
      >
        <span className="material-symbols-outlined text-white text-[20px]">table_chart</span>
        <span className="text-white text-[13px] font-bold uppercase tracking-wider">
          Financial Statements
        </span>
      </div>
      <div className="bg-white p-5">
        <div className="text-center py-8">
          <span className="material-symbols-outlined text-4xl text-text-muted block mb-2">
            table_chart
          </span>
          <p className="text-sm font-semibold text-text-main mb-1">No Financial Data Yet</p>
          <p className="text-xs text-text-muted mb-5">
            Upload a CIM, P&amp;L, or financial PDF to extract the 3-statement model
            automatically.
          </p>
          <Link
            href={`/data-room/${dealId}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-white text-xs font-semibold rounded-lg transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            Extract Financials
          </Link>
        </div>
      </div>
    </div>
  );
}
