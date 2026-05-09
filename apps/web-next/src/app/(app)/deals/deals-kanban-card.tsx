"use client";

import { type DragEvent } from "react";
import { formatCurrency, getDealDisplayName } from "@/lib/formatters";
import { METRIC_CONFIG, type MetricKey } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Link from "next/link";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// Kanban Card (Compact) with drag-and-drop support
// ---------------------------------------------------------------------------
export function KanbanCard({
  deal,
  activeMetrics,
  onDragStart,
}: {
  deal: Deal;
  activeMetrics: MetricKey[];
  onDragStart?: (e: DragEvent<HTMLDivElement>, dealId: string) => void;
}) {
  const hasRiskFlag = (deal.ebitda ?? 0) < 0 || deal.stage === "PASSED";
  const kanbanMetrics = activeMetrics.slice(0, 3);

  return (
    <div
      className="kanban-card bg-surface-card rounded-lg border border-border-subtle p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-grab active:cursor-grabbing"
      draggable
      data-deal-id={deal.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", deal.id);
        (e.target as HTMLDivElement).style.opacity = "0.5";
        onDragStart?.(e, deal.id);
      }}
      onDragEnd={(e) => {
        (e.target as HTMLDivElement).style.opacity = "1";
      }}
    >
      <Link href={`/deals/${deal.id}`} className="block">
        <div className="flex items-start gap-2 mb-2">
          <div className="size-8 rounded-md bg-primary-light border border-primary/10 flex items-center justify-center text-[#003366] shrink-0">
            <span className="material-symbols-outlined text-[16px]">
              {deal.icon || "business_center"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-text-main truncate hover:text-[#003366] transition-colors" title={getDealDisplayName(deal)}>
              {getDealDisplayName(deal)}
            </h4>
            <p className="text-[11px] text-text-muted truncate">
              {deal.industry || "\u2014"}
            </p>
          </div>
        </div>
        {/* Dynamic compact metrics (first 3) */}
        <div className="flex gap-3 mb-2">
          {kanbanMetrics.map((key) => {
            const cfg = METRIC_CONFIG[key];
            if (!cfg) return null;
            const value = deal[key as keyof Deal] as number | undefined | null;
            return (
              <div key={key} className="flex-1 bg-background-body rounded px-2 py-1.5">
                <span className="text-[9px] text-text-muted font-medium uppercase block">{cfg.kanbanLabel}</span>
                <span className={cn(
                  "text-xs font-bold",
                  key === "mom" && value != null && value >= 3 ? "text-secondary" : "",
                  key === "ebitda" && value != null && value < 0 ? "text-red-600" : "",
                  !(key === "mom" && value != null && value >= 3) && !(key === "ebitda" && value != null && value < 0) ? "text-text-main" : "",
                )}>
                  {key === "irrProjected"
                    ? (value != null ? Number(value).toFixed(1) + "%" : "\u2014")
                    : key === "mom"
                      ? (value != null ? Number(value).toFixed(1) + "x" : "\u2014")
                      : formatCurrency(value as number | null | undefined, deal.currency)}
                </span>
              </div>
            );
          })}
        </div>
        {deal.aiThesis && (
          <div className="flex items-start gap-1.5 pt-2 border-t border-border-subtle">
            <span
              className={cn(
                "material-symbols-outlined text-[12px] mt-0.5",
                hasRiskFlag ? "text-red-500" : "text-green-600"
              )}
            >
              {hasRiskFlag ? "warning" : "auto_awesome"}
            </span>
            <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
              {deal.aiThesis}
            </p>
          </div>
        )}
      </Link>
    </div>
  );
}
