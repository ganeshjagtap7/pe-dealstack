"use client";

import { cn } from "@/lib/cn";
import type { Template } from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Template Card                                                      */
/* ------------------------------------------------------------------ */

export function TemplateCard({
  template,
  isSelected,
  menuOpen,
  onSelect,
  onMenuToggle,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  isSelected: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "template-card group bg-surface-card rounded-lg overflow-hidden transition-all cursor-pointer relative",
        isSelected
          ? "border-2 border-primary shadow-card-hover"
          : "border border-border-subtle shadow-card hover:shadow-card-hover hover:border-primary/30"
      )}
      onClick={onSelect}
    >
      {/* Menu button */}
      <div
        className={cn(
          "absolute top-3 right-3 z-10 transition-opacity",
          isSelected ? "" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <button
          onClick={onMenuToggle}
          className="h-8 w-8 bg-surface-card/90 backdrop-blur rounded-full flex items-center justify-center text-text-muted hover:text-primary transition-colors shadow-sm border border-border-subtle"
        >
          <span className="material-symbols-outlined text-[18px]">more_vert</span>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-10 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-44 overflow-hidden z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">content_copy</span>
              Duplicate
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Preview thumbnail */}
      <div className="h-32 bg-background-body flex items-center justify-center relative overflow-hidden">
        <div
          className={cn(
            "w-3/4 h-[120%] bg-surface-card translate-y-4 rounded-t-sm border border-border-subtle p-3 transition-opacity",
            isSelected ? "shadow-lg opacity-100" : "shadow-sm opacity-80 group-hover:opacity-100",
            template.isGoldStandard && "rotate-[-2deg]"
          )}
        >
          <div className="h-2 w-1/3 bg-border-subtle rounded-sm mb-2" />
          <div className="h-2 w-full bg-background-body rounded-sm mb-1" />
          <div className="h-2 w-full bg-background-body rounded-sm mb-1" />
          <div className="h-2 w-2/3 bg-background-body rounded-sm" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-text-main text-sm">{template.name}</h3>
          {template.isGoldStandard && (
            <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ml-2 shrink-0">
              Gold Std
            </span>
          )}
          {template.isLegacy && (
            <span className="bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ml-2 shrink-0">
              Legacy
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mb-4 line-clamp-2">{template.description || ""}</p>
        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
            {formatDate(template.createdAt)}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <span className="material-symbols-outlined text-[14px]">bar_chart</span>
            {template.usageCount || 0} Uses
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create from Scratch Card                                           */
/* ------------------------------------------------------------------ */

export function CreateFromScratchCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group border-2 border-dashed border-border-subtle rounded-lg flex flex-col items-center justify-center text-text-muted hover:border-primary hover:text-primary hover:bg-primary-light/30 transition-all cursor-pointer min-h-[280px]"
    >
      <div className="bg-background-body p-3 rounded-full mb-3 group-hover:bg-primary-light group-hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-[24px]">add</span>
      </div>
      <span className="font-medium text-sm">Create from Scratch</span>
    </div>
  );
}
