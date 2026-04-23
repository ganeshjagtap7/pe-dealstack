"use client";

import { useEffect, useState, useRef } from "react";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { STAGES, STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// Filter Dropdown (reusable popover)
// ---------------------------------------------------------------------------
export function FilterDropdown({
  label,
  active,
  children,
  icon,
  borderless,
}: {
  label: string;
  active: boolean;
  children: (close: () => void) => React.ReactNode;
  icon?: string;
  borderless?: boolean;
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
        "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all",
        active
          ? "text-[#003366] bg-blue-50"
          : "text-text-secondary hover:bg-primary-light"
      )
    : cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-all group",
        active
          ? "border-[#B3C2D1] bg-blue-50 text-[#003366]"
          : "border-border-subtle bg-surface-card text-text-secondary hover:border-primary/30 hover:shadow-sm"
      );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={buttonClass}>
        {icon && (
          <span className="material-symbols-outlined text-text-muted text-[18px]">{icon}</span>
        )}
        {label}
        {!borderless && (
          <span className="material-symbols-outlined text-text-muted text-[16px]">
            keyboard_arrow_down
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-50">
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors"
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
}: {
  deal: Deal;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const style = STAGE_STYLES[deal.stage] || STAGE_STYLES.INITIAL_REVIEW;
  const isPassed = deal.status === "PASSED" || deal.stage === "PASSED";
  const hasRiskFlag = (deal.ebitda ?? 0) < 0 || deal.stage === "PASSED";

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
          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-50">
            <Link
              href={`/deals/${deal.id}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-blue-50 hover:text-[#003366] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open Deal
            </Link>
            <Link
              href={`/data-room?dealId=${deal.id}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-blue-50 hover:text-[#003366] transition-colors"
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

      <article
        onClick={() => router.push(`/deals/${deal.id}`)}
        onMouseEnter={() => router.prefetch(`/deals/${deal.id}`)}
        className={cn(
          "bg-white rounded-lg border border-border-subtle p-5 hover:border-[#B3C2D1] transition-all cursor-pointer flex flex-col h-full shadow-sm hover:shadow-md relative overflow-hidden",
          isPassed && "opacity-70 hover:opacity-100",
          selected && "ring-2 ring-[#003366] border-[#003366]"
        )}
      >
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex gap-3 items-center pl-6">
              <div className="size-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#003366]">
                <span className="material-symbols-outlined text-[20px]">
                  {deal.icon || "business_center"}
                </span>
              </div>
              <div>
                <h3 className="text-text-main font-bold text-base leading-tight group-hover/card:text-[#003366] transition-colors truncate max-w-[200px]" title={deal.name}>
                  {deal.companyName || deal.name}
                </h3>
                <p className="text-text-muted text-xs font-medium">
                  {deal.industry || "N/A"}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider mr-8",
                style.bg,
                style.border,
                style.text
              )}
            >
              {STAGE_LABELS[deal.stage] || deal.stage}
            </span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-md p-3">
              <span className="text-text-muted text-[10px] font-bold uppercase tracking-wider block mb-1">
                Revenue
              </span>
              <span className="text-text-main font-bold text-lg">
                {formatCurrency(deal.revenue, deal.currency)}
              </span>
            </div>
            <div className="bg-gray-50 rounded-md p-3">
              <span className="text-text-muted text-[10px] font-bold uppercase tracking-wider block mb-1">
                Deal Size
              </span>
              <span className="text-text-main font-bold text-lg">
                {formatCurrency(deal.dealSize, deal.currency)}
              </span>
            </div>
          </div>

          {/* AI Thesis */}
          <div className="bg-gray-50 rounded-md p-3 mt-auto border border-border-subtle">
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

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle">
            <span className="text-[11px] text-text-muted font-medium">
              {formatRelativeTime(deal.updatedAt)}
            </span>
            <Link
              href={`/data-room?dealId=${deal.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-[#003366] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">folder_open</span>
              <span className="hidden sm:inline">VDR</span>
            </Link>
          </div>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban Card (Compact)
// ---------------------------------------------------------------------------
export function KanbanCard({ deal }: { deal: Deal }) {
  const hasRiskFlag = (deal.ebitda ?? 0) < 0 || deal.stage === "PASSED";
  return (
    <div className="bg-white rounded-lg border border-border-subtle p-3 shadow-sm hover:shadow-md hover:border-[#B3C2D1] transition-all">
      <Link href={`/deals/${deal.id}`} className="block">
        <div className="flex items-start gap-2 mb-2">
          <div className="size-8 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-[#003366] shrink-0">
            <span className="material-symbols-outlined text-[16px]">
              {deal.icon || "business_center"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-text-main truncate hover:text-[#003366] transition-colors" title={deal.name}>
              {deal.companyName || deal.name}
            </h4>
            <p className="text-[11px] text-text-muted truncate">
              {deal.industry || "N/A"}
            </p>
          </div>
        </div>
        <div className="flex gap-3 mb-2">
          <div className="flex-1 bg-gray-50 rounded px-2 py-1.5">
            <span className="text-[9px] text-text-muted font-medium uppercase block">Revenue</span>
            <span className="text-xs font-bold text-text-main">
              {formatCurrency(deal.revenue, deal.currency)}
            </span>
          </div>
          <div className="flex-1 bg-gray-50 rounded px-2 py-1.5">
            <span className="text-[9px] text-text-muted font-medium uppercase block">Deal Size</span>
            <span className="text-xs font-bold text-text-main">
              {formatCurrency(deal.dealSize, deal.currency)}
            </span>
          </div>
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
