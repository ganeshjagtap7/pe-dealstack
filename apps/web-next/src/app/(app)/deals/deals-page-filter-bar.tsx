"use client";

import {
  STAGES,
  STAGE_LABELS,
  SORT_OPTIONS,
  DEAL_SIZE_OPTIONS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
  type MetricKey,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { DealFilters } from "@/types";
import { FilterDropdown, MetricsDropdown } from "./components";

// ---------------------------------------------------------------------------
// Filter / view-toggle / sort toolbar for the deals page.
// Extracted from deals/page.tsx for file-size budget.
// ---------------------------------------------------------------------------

export function DealsFilterBar({
  filters,
  setFilters,
  industries,
  hasActiveFilters,
  clearFilters,
  view,
  toggleView,
  activeMetrics,
  onMetricsApply,
  sortLabel,
  dealSizeLabel,
}: {
  filters: DealFilters;
  setFilters: React.Dispatch<React.SetStateAction<DealFilters>>;
  industries: string[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
  view: "list" | "kanban";
  toggleView: (v: "list" | "kanban") => void;
  activeMetrics: MetricKey[];
  onMetricsApply: (metrics: MetricKey[]) => void;
  sortLabel: string;
  dealSizeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      {/* Left: filter dropdowns — allowed to wrap */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Stage Filter */}
        <FilterDropdown label={filters.stage ? `Stage: ${STAGE_LABELS[filters.stage]}` : "Stage: All"} active={!!filters.stage}>
          {(close) => (
            <>
              <button
                onClick={() => { setFilters((f) => ({ ...f, stage: "" })); close(); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light font-medium"
              >
                All Stages
              </button>
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilters((f) => ({ ...f, stage: s })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light"
                >
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </>
          )}
        </FilterDropdown>

        {/* Industry Filter */}
        <FilterDropdown label={filters.industry ? `Industry: ${filters.industry}` : "Industry: All"} active={!!filters.industry}>
          {(close) => (
            <>
              <button
                onClick={() => { setFilters((f) => ({ ...f, industry: "" })); close(); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light font-medium"
              >
                All Industries
              </button>
              {industries.map((ind) => (
                <button
                  key={ind}
                  onClick={() => { setFilters((f) => ({ ...f, industry: ind })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light"
                >
                  {ind}
                </button>
              ))}
            </>
          )}
        </FilterDropdown>

        {/* Deal Size Filter */}
        <FilterDropdown label={dealSizeLabel} active={!!filters.minDealSize || !!filters.maxDealSize}>
          {(close) =>
            DEAL_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  setFilters((f) => ({ ...f, minDealSize: opt.min, maxDealSize: opt.max }));
                  close();
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light"
              >
                {opt.label}
              </button>
            ))
          }
        </FilterDropdown>

        {/* Priority Filter */}
        <FilterDropdown
          label={filters.priority ? `Priority: ${PRIORITY_LABELS[filters.priority]}` : "Priority: All"}
          active={!!filters.priority}
        >
          {(close) => (
            <>
              <button
                onClick={() => { setFilters((f) => ({ ...f, priority: "" })); close(); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light font-medium"
              >
                All Priorities
              </button>
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setFilters((f) => ({ ...f, priority: p })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-primary-light"
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </>
          )}
        </FilterDropdown>

        <div className="h-6 w-px bg-border-subtle mx-1 hidden sm:block" />

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 h-9 px-3 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
            Clear
          </button>
        )}
      </div>

      {/* Right: view toggle + metrics + sort — shrink-0 keeps them always on the same row */}
      <div className="flex items-center gap-2 shrink-0">
        {/* View Toggle */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => toggleView("list")}
            title="List View"
            className={cn(
              "p-1.5 rounded-md transition-all",
              view === "list"
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text-secondary hover:bg-gray-100"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">view_list</span>
          </button>
          <button
            onClick={() => toggleView("kanban")}
            title="Kanban View"
            className={cn(
              "p-1.5 rounded-md transition-all",
              view === "kanban"
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text-secondary hover:bg-gray-100"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">view_kanban</span>
          </button>
        </div>

        {/* Customize Metrics */}
        <MetricsDropdown activeMetrics={activeMetrics} onApply={onMetricsApply} />

        <div className="h-6 w-px bg-border-subtle hidden sm:block" />

        {/* Sort */}
        {view === "list" && (
          <FilterDropdown
            label={`Sort by: ${sortLabel}`}
            active={false}
            icon="sort"
            borderless
            compact
            align="right"
          >
            {(close) =>
              SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setFilters((f) => ({ ...f, sortBy: opt.sortBy, sortOrder: opt.sortOrder }));
                    close();
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm hover:bg-primary-light whitespace-nowrap",
                    filters.sortBy === opt.sortBy && filters.sortOrder === opt.sortOrder && "font-medium text-[#003366]"
                  )}
                >
                  {opt.label}
                </button>
              ))
            }
          </FilterDropdown>
        )}
      </div>
    </div>
  );
}
