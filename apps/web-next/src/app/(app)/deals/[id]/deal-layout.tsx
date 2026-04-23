"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/constants";
import { type DealDetail, PIPELINE_STAGES, TERMINAL_STAGES } from "./components";

// ---------------------------------------------------------------------------
// Stage Pipeline
// ---------------------------------------------------------------------------

export function StagePipeline({
  deal,
  onStageClick,
  onChangeStage,
}: {
  deal: DealDetail;
  onStageClick: (stage: string) => void;
  onChangeStage?: () => void;
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
            if (onChangeStage) {
              onChangeStage();
            } else {
              const nextIdx = currentStageIndex + 1;
              if (nextIdx < PIPELINE_STAGES.length) {
                onStageClick(PIPELINE_STAGES[nextIdx].key);
              }
            }
          }}
          className="text-xs text-primary hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
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
        {/* Terminal stage pill (Closed Won / Closed Lost / Passed) */}
        {isTerminal && (
          <div className="flex items-center ml-2">
            <div className="h-0.5 w-4 bg-gray-300" />
            <div
              className={cn(
                "px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold text-white shadow-lg",
                deal.stage === "CLOSED_WON" && "bg-green-500",
                deal.stage === "CLOSED_LOST" && "bg-red-500",
                deal.stage === "PASSED" && "bg-gray-500"
              )}
            >
              <span className="material-symbols-outlined text-sm">
                {deal.stage === "CLOSED_WON"
                  ? "celebration"
                  : deal.stage === "CLOSED_LOST"
                    ? "cancel"
                    : "block"}
              </span>
              {STAGE_LABELS[deal.stage] || deal.stage}
            </div>
          </div>
        )}
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
  // Dynamic financial metrics — only show cards with data, prioritized by
  // relevance. Ported from apps/web/deal.js renderDynamicMetrics.
  const hasMarginData = deal.ebitda != null && deal.revenue != null && deal.revenue !== 0;

  type MetricDef = { key: string; label: string; value: unknown; formatted: string; badge?: string; extra?: string };
  const allMetrics: MetricDef[] = [
    {
      key: "revenue",
      label: "Revenue (LTM)",
      value: deal.revenue,
      formatted: formatCurrency(deal.revenue, deal.currency),
    },
    {
      key: "ebitdaMargin",
      label: "EBITDA Margin",
      value: hasMarginData ? deal.ebitda : null,
      formatted: hasMarginData ? ((deal.ebitda! / deal.revenue!) * 100).toFixed(0) + "%" : "N/A",
    },
    {
      key: "ebitda",
      label: "EBITDA",
      value: deal.ebitda,
      formatted: formatCurrency(deal.ebitda, deal.currency),
    },
    {
      key: "dealSize",
      label: "Deal Size",
      value: deal.dealSize,
      formatted: formatCurrency(deal.dealSize, deal.currency),
      extra: deal.dealSize && deal.ebitda ? `~${(deal.dealSize / deal.ebitda).toFixed(1)}x EBITDA Multiple` : undefined,
    },
    {
      key: "irr",
      label: "Projected IRR",
      value: deal.irrProjected,
      formatted: deal.irrProjected != null ? deal.irrProjected.toFixed(1) + "%" : "N/A",
      badge: "Target",
      extra: deal.mom != null ? `MoM: ${deal.mom.toFixed(1)}x` : undefined,
    },
    {
      key: "mom",
      label: "Money Multiple",
      value: deal.mom,
      formatted: deal.mom != null ? deal.mom.toFixed(1) + "x" : "N/A",
    },
  ];

  // Filter to only metrics with data
  let available = allMetrics.filter((m) => m.value != null);

  // If EBITDA + revenue both exist, prefer ebitdaMargin over raw ebitda
  const hasMargin = available.some((m) => m.key === "ebitdaMargin");
  if (hasMargin) available = available.filter((m) => m.key !== "ebitda");

  // If IRR exists, skip standalone MoM (shown as sub-text under IRR)
  const hasIRR = available.some((m) => m.key === "irr");
  if (hasIRR) available = available.filter((m) => m.key !== "mom");

  const metrics = available.slice(0, 4);

  if (metrics.length === 0) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-card text-center">
        <span className="material-symbols-outlined text-text-muted text-3xl mb-2 block">analytics</span>
        <p className="text-text-muted text-sm">
          No financial metrics yet. Upload a CIM or edit the deal to add data.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4", metrics.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {metrics.map((m) => (
        <div
          key={m.key}
          className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-card relative overflow-hidden group"
        >
          <p className="text-[11px] text-text-muted font-bold uppercase tracking-wide">{m.label}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-2xl font-bold text-text-main leading-none">{m.formatted}</span>
            {m.badge && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                {m.badge}
              </span>
            )}
          </div>
          {m.extra && <p className="text-xs text-text-muted font-medium mt-2">{m.extra}</p>}
        </div>
      ))}
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
