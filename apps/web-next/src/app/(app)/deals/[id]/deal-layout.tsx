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
    <div className="rounded-xl p-3" style={{ background: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(229, 231, 235, 0.8)", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold text-text-main uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-xs">timeline</span>
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
                      isPast || isCurrent ? "bg-secondary" : "bg-gray-200"
                    )}
                  />
                )}
                {index === 0 && <div className="flex-1" />}
                <div
                  className={cn(
                    "size-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110",
                    isPast && "bg-secondary text-white",
                    isCurrent && "bg-primary text-white ring-2 ring-primary/30 shadow-md",
                    isFuture && !isCurrent && "bg-gray-100 text-gray-400"
                  )}
                >
                  {isPast ? (
                    <span className="material-symbols-outlined text-xs">check</span>
                  ) : (
                    <span className="material-symbols-outlined text-xs">{stage.icon}</span>
                  )}
                </div>
                {index < PIPELINE_STAGES.length - 1 ? (
                  <div
                    className={cn(
                      "flex-1 h-0.5",
                      isPast ? "bg-secondary" : "bg-gray-200"
                    )}
                  />
                ) : (
                  <div className="flex-1" />
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] mt-1 text-center leading-tight whitespace-nowrap",
                  isPast && "text-secondary font-medium",
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
                "px-2.5 py-1 rounded-full flex items-center gap-1 text-[10px] font-bold text-white shadow-md",
                deal.stage === "CLOSED_WON" && "bg-green-500",
                deal.stage === "CLOSED_LOST" && "bg-red-500",
                deal.stage === "PASSED" && "bg-gray-500"
              )}
            >
              <span className="material-symbols-outlined text-xs">
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-background-body border border-border-subtle">
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-0.5">
          Lead Partner
        </p>
        <div className="flex items-center gap-2">
          {leadPartner ? (
            <>
              <div className="size-5 rounded-full bg-primary border border-primary/20 flex items-center justify-center text-[10px] font-bold text-white">
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
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-0.5">
          Analyst
        </p>
        <div className="flex items-center gap-2">
          {analyst ? (
            <>
              <div className="size-5 rounded-full bg-secondary border border-secondary/20 flex items-center justify-center text-[10px] font-bold text-white">
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
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-0.5">
          Deal Source
        </p>
        <span className="text-sm text-text-main font-bold">
          {deal.source || "\u2014"}
        </span>
      </div>
      <div>
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-0.5">
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
      <div className="col-span-full rounded-xl p-4 text-center" style={{ background: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(229, 231, 235, 0.8)", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
        <span className="material-symbols-outlined text-text-muted text-2xl mb-1 block">analytics</span>
        <p className="text-text-muted text-sm">
          No financial metrics yet. Upload a CIM or edit the deal to add data.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3 items-stretch", metrics.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {metrics.map((m) => (
        <div
          key={m.key}
          className="rounded-xl p-3 relative overflow-hidden group"
          style={{ background: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(229, 231, 235, 0.8)", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}
        >
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wide">{m.label}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-lg font-bold text-text-main leading-none">{m.formatted}</span>
            {m.badge && (
              <span className="text-[10px] font-bold text-secondary bg-secondary-light border border-secondary/20 px-1.5 py-0.5 rounded">
                {m.badge}
              </span>
            )}
          </div>
          {m.extra && <p className="text-[10px] text-text-muted font-medium mt-1">{m.extra}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Financial Statements Section
// Delegates to FinancialStatementsPanel which handles loading, empty state,
// and data rendering internally.
// ---------------------------------------------------------------------------

import { FinancialStatementsPanel } from "./deal-financials";

export function FinancialStatementsSection({ dealId }: { dealId: string }) {
  return <FinancialStatementsPanel dealId={dealId} />;
}
