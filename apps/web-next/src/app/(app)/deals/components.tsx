"use client";

import { useEffect, useState, useRef, type DragEvent } from "react";
import { formatCurrency, getDocIcon, getDealDisplayName } from "@/lib/formatters";
import { useLiveTime } from "@/lib/useLiveTime";
import {
  STAGES,
  STAGE_STYLES,
  STAGE_LABELS,
  METRIC_CONFIG,
  DEFAULT_CARD_METRICS,
  ALL_METRIC_KEYS,
  type MetricKey,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Deal } from "@/types";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Filter Dropdown (reusable popover)
// ---------------------------------------------------------------------------
export function FilterDropdown({
  label,
  active,
  children,
  icon,
  borderless,
  compact,
  align = "left",
}: {
  label: string;
  active: boolean;
  children: (close: () => void) => React.ReactNode;
  icon?: string;
  borderless?: boolean;
  /** Slightly smaller sizing — used for right-side controls (sort, etc.) */
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const buttonClass = borderless
    ? cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-all",
        compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        active
          ? "text-[#003366] bg-blue-50"
          : "text-text-secondary hover:bg-primary-light"
      )
    : cn(
        "flex shrink-0 items-center gap-2 rounded-lg border font-medium transition-all group",
        compact ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
        active
          ? "border-[#B3C2D1] bg-primary-light text-[#003366]"
          : "border-border-subtle bg-surface-card text-text-secondary hover:border-primary/30 hover:shadow-sm"
      );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={buttonClass}>
        {icon && (
          <span className={cn("material-symbols-outlined text-text-muted", compact ? "text-[15px]" : "text-[18px]")}>{icon}</span>
        )}
        {label}
        {!borderless && (
          <span className={cn("material-symbols-outlined text-text-muted", compact ? "text-[14px]" : "text-[16px]")}>
            keyboard_arrow_down
          </span>
        )}
      </button>
      {open && (
        <div className={cn(
          "absolute top-full mt-2 bg-surface-card rounded-lg shadow-lg border border-border-subtle py-1 z-50 min-w-[180px]",
          align === "right" ? "right-0" : "left-0"
        )}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------
export function DeleteModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-red-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 text-[20px]">warning</span>
          </div>
          <h3 className="font-bold text-text-main text-base">{title}</h3>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          This action cannot be undone. The deal and its data will be permanently removed.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Stage Change Modal
// ---------------------------------------------------------------------------
export function StageChangeModal({
  count,
  onSelect,
  onClose,
}: {
  count: number;
  onSelect: (stage: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-bold text-text-main">
            Change Stage for {count} Deal{count > 1 ? "s" : ""}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border-subtle">
          {STAGES.map((stage) => {
            const s = STAGE_STYLES[stage] || STAGE_STYLES.INITIAL_REVIEW;
            return (
              <button
                key={stage}
                onClick={() => onSelect(stage)}
                className="w-full text-left px-4 py-3 hover:bg-primary-light flex items-center gap-3 transition-colors"
              >
                <span className={cn("px-2 py-0.5 rounded text-xs font-bold", s.bg, s.text)}>
                  {STAGE_LABELS[stage]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal Card (List View)
// ---------------------------------------------------------------------------
export function DealCard({
  deal,
  selected,
  onToggleSelect,
  onDelete,
  activeMetrics,
  onRemoveSample,
}: {
  deal: Deal;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  activeMetrics: MetricKey[];
  onRemoveSample?: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const style = STAGE_STYLES[deal.stage] || STAGE_STYLES.INITIAL_REVIEW;
  const isPassed = deal.status === "PASSED" || deal.stage === "PASSED";
  const hasRiskFlag = (deal.ebitda ?? 0) < 0 || deal.stage === "PASSED";
  const liveUpdated = useLiveTime(deal.lastDocumentUpdated || deal.updatedAt);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative group/card" data-deal-id={deal.id}>
      {/* Checkbox */}
      <div className="absolute top-3 left-3 z-10">
        <label
          className={cn(
            "flex items-center justify-center size-6 rounded bg-white/90 backdrop-blur border cursor-pointer shadow-sm transition-all",
            selected
              ? "bg-[#003366] border-[#003366]"
              : "border-border-subtle hover:border-[#003366]"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={selected}
            onChange={() => onToggleSelect(deal.id)}
          />
          <span
            className={cn(
              "material-symbols-outlined text-[16px]",
              selected
                ? "text-white"
                : "text-transparent group-hover/card:text-gray-300"
            )}
          >
            check
          </span>
        </label>
      </div>

      {/* Three-dot Menu */}
      <div className="absolute top-3 right-3 z-10" ref={menuRef}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="flex items-center justify-center size-7 rounded-md bg-white/90 backdrop-blur border border-border-subtle cursor-pointer hover:border-[#003366] shadow-sm transition-all opacity-0 group-hover/card:opacity-100 focus:opacity-100"
        >
          <span className="material-symbols-outlined text-[18px] text-text-muted">more_vert</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-surface-card rounded-lg shadow-lg border border-border-subtle py-1 z-50">
            <Link
              href={`/deals/${deal.id}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-[#003366] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open Deal
            </Link>
            <Link
              href={`/data-room?dealId=${deal.id}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-primary-light hover:text-[#003366] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">folder_open</span>
              Open Data Room
            </Link>
            <div className="border-t border-border-subtle my-1" />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(deal.id, deal.name);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete Deal
            </button>
          </div>
        )}
      </div>

      {/* Remove Sample button (for sample deals) */}
      {deal.tags?.includes("sample") && onRemoveSample && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveSample(deal.id); }}
          className="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 text-[10px] font-medium transition-colors shadow-sm"
          title="Remove sample deal"
        >
          <span className="material-symbols-outlined text-[14px] align-middle">close</span>{" "}
          Remove Sample
        </button>
      )}

      <article
        onClick={() => router.push(`/deals/${deal.id}`)}
        onMouseEnter={() => router.prefetch(`/deals/${deal.id}`)}
        className={cn(
          "bg-surface-card rounded-lg border border-border-subtle p-5 hover:border-primary/30 transition-all cursor-pointer flex flex-col h-full shadow-card hover:shadow-card-hover relative",
          isPassed && "opacity-70 hover:opacity-100",
          selected && "ring-2 ring-[#003366] border-[#003366]"
        )}
      >
          {/* Header */}
          <div className="flex items-start gap-2 mb-4 pl-6 pr-8 min-w-0">
            <div className="size-10 rounded-lg bg-primary-light border border-primary/10 flex items-center justify-center text-[#003366] shrink-0">
              <span className="material-symbols-outlined text-[20px]">
                {deal.icon || "business_center"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-text-main font-bold text-base leading-tight group-hover/card:text-[#003366] transition-colors truncate" title={getDealDisplayName(deal)}>
                {getDealDisplayName(deal)}
              </h3>
              <p className="text-text-muted text-xs font-medium truncate">
                {deal.industry || "\u2014"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                className={cn(
                  "px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap leading-none",
                  style.bg,
                  style.border,
                  style.text
                )}
              >
                {STAGE_LABELS[deal.stage] || deal.stage}
              </span>
              {deal.tags?.includes("sample") && (
                <span className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                  Sample
                </span>
              )}
            </div>
          </div>

          {/* Dynamic Metrics Grid */}
          <div className={cn("grid gap-3 mb-4", activeMetrics.length >= 5 ? "grid-cols-3" : "grid-cols-2")}>
            {activeMetrics.map((key) => {
              const cfg = METRIC_CONFIG[key];
              if (!cfg) return null;
              const value = deal[key as keyof Deal] as number | undefined | null;
              return (
                <div key={key} className="bg-background-body rounded-md p-3">
                  <span className="text-text-muted text-[10px] font-bold uppercase tracking-wider block mb-1">
                    {cfg.label}
                  </span>
                  <span className={cn(
                    "font-bold text-lg",
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

          {/* AI Thesis */}
          <div className="bg-background-body rounded-md p-3 mt-auto border border-border-subtle">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  "material-symbols-outlined text-[14px]",
                  hasRiskFlag ? "text-red-500" : "text-green-600"
                )}
              >
                {hasRiskFlag ? "warning" : "auto_awesome"}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  hasRiskFlag ? "text-red-500" : "text-green-600"
                )}
              >
                {hasRiskFlag ? "Risk Flag" : "AI Thesis"}
              </span>
            </div>
            <p className="text-text-secondary text-xs leading-relaxed line-clamp-2">
              {deal.aiThesis || "No AI analysis available yet."}
            </p>
          </div>

          {/* Risk Flag: Low EBITDA Margin */}
          {(deal.ebitda ?? 0) < 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <span className="material-symbols-outlined text-red-500 text-[14px]">warning</span>
              <span className="text-red-500 text-[11px] font-semibold">Low EBITDA margin</span>
            </div>
          )}

          {/* Data Completeness Bar */}
          {(() => {
            let filled = 0;
            const total = 6;
            if (deal.revenue) filled++;
            if (deal.ebitda) filled++;
            if (deal.dealSize) filled++;
            if (deal.aiThesis && deal.aiThesis !== "No AI analysis available yet.") filled++;
            if (deal.lastDocument) filled++;
            if (deal.industry) filled++;
            const completePct = Math.round((filled / total) * 100);
            const barColor = completePct >= 80 ? "#059669" : completePct >= 50 ? "#F59E0B" : "#9CA3AF";
            return (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Data</span>
                <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${completePct}%`, background: barColor }} />
                </div>
                <span className="text-[10px] font-bold" style={{ color: barColor }}>{completePct}%</span>
              </div>
            );
          })()}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-0">
            <div className="flex items-center gap-1.5 text-text-muted min-w-0">
              <span className="material-symbols-outlined text-[14px] shrink-0">
                {getDocIcon(deal.lastDocument)}
              </span>
              <span className="text-[11px] font-medium truncate max-w-[100px]">
                {deal.lastDocument || "No docs"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/data-room?dealId=${deal.id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[11px] text-text-muted hover:text-[#003366] transition-colors"
                title="Open Data Room"
              >
                <span className="material-symbols-outlined text-[14px]">folder_open</span>
                <span className="hidden sm:inline">VDR</span>
              </Link>
              <span className="text-[11px] text-text-muted font-medium">
                {liveUpdated}
              </span>
            </div>
          </div>
      </article>
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Customize Metrics Dropdown
// ---------------------------------------------------------------------------
export function MetricsDropdown({
  activeMetrics,
  onApply,
}: {
  activeMetrics: MetricKey[];
  onApply: (metrics: MetricKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<MetricKey>>(new Set(activeMetrics));
  const ref = useRef<HTMLDivElement>(null);

  // Sync local checked state when activeMetrics prop changes. Using the
  // "track previous prop" idiom (a state update during render) instead of
  // an effect so we don't double-render on prop change.
  const [prevActiveMetrics, setPrevActiveMetrics] = useState(activeMetrics);
  if (activeMetrics !== prevActiveMetrics) {
    setPrevActiveMetrics(activeMetrics);
    setChecked(new Set(activeMetrics));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (key: MetricKey) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) setChecked(new Set(activeMetrics)); }}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 hover:bg-primary-light transition-all"
        title="Customize Metrics"
      >
        <span className="material-symbols-outlined text-text-muted text-[16px]">tune</span>
        <span className="text-text-secondary text-xs font-medium hidden lg:block">Metrics</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 bg-surface-card border border-border-subtle rounded-lg shadow-lg z-50 min-w-[220px] py-2">
          <div className="px-4 py-2 border-b border-border-subtle">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Visible Metrics</p>
          </div>
          <div className="py-1">
            {ALL_METRIC_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 px-4 py-2 hover:bg-primary-light cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-[#003366] focus:ring-[#003366]"
                  checked={checked.has(key)}
                  onChange={() => toggle(key)}
                />
                <span className="text-sm text-text-main font-medium">{METRIC_CONFIG[key].label}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-border-subtle px-4 py-2 flex items-center justify-between">
            <button
              onClick={() => setChecked(new Set(DEFAULT_CARD_METRICS))}
              className="text-xs text-text-muted hover:text-[#003366] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => {
                const arr = ALL_METRIC_KEYS.filter((k) => checked.has(k));
                if (arr.length === 0) return; // Must have at least one
                onApply(arr);
                setOpen(false);
              }}
              className="text-xs font-medium text-white px-3 py-1 rounded-md hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Card (shown at end of deals grid)
// ---------------------------------------------------------------------------
export function UploadCard({ onClick }: { onClick?: () => void }) {
  return (
    <article
      onClick={onClick}
      className="bg-surface-card/50 rounded-lg border-2 border-dashed border-border-subtle p-5 hover:border-primary hover:bg-primary-light/30 transition-all cursor-pointer group flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-4"
    >
      <div className="size-14 rounded-full bg-surface-card border border-border-subtle flex items-center justify-center group-hover:scale-110 group-hover:border-primary/30 transition-all shadow-sm">
        <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-2xl">add</span>
      </div>
      <div>
        <h3 className="text-text-main font-bold text-base group-hover:text-primary transition-colors">
          Upload Documents
        </h3>
        <p className="text-text-muted text-sm mt-1 max-w-[180px]">
          Drop CIMs, Teasers, or Excel models
        </p>
      </div>
    </article>
  );
}
