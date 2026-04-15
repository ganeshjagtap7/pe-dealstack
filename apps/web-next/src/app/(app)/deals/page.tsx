"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import {
  STAGES,
  KANBAN_STAGES,
  STAGE_STYLES,
  STAGE_LABELS,
  SORT_OPTIONS,
  DEAL_SIZE_OPTIONS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import Link from "next/link";
import type { Deal, DealFilters } from "@/types";
import {
  FilterDropdown,
  DeleteModal,
  StageChangeModal,
  DealCard,
  KanbanCard,
} from "./components";

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [stageModal, setStageModal] = useState(false);
  const [industries, setIndustries] = useState<string[]>([]);
  const [filters, setFilters] = useState<DealFilters>({
    stage: "",
    industry: "",
    minDealSize: "",
    maxDealSize: "",
    priority: "",
    search: "",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.dealsView);
    if (saved === "kanban" || saved === "list") setView(saved);
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.stage) params.set("stage", filters.stage);
      if (filters.industry) params.set("industry", filters.industry);
      if (filters.minDealSize) params.set("minDealSize", filters.minDealSize);
      if (filters.maxDealSize) params.set("maxDealSize", filters.maxDealSize);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.search) params.set("search", filters.search);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
      params.set("limit", "50");

      const data = await api.get<Deal[]>(`/deals?${params}`);
      const list = Array.isArray(data) ? data : [];
      setDeals(list);
      setIndustries([...new Set(list.map((d) => d.industry).filter(Boolean) as string[])].sort());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  // Helpers
  const toggleView = (v: "list" | "kanban") => {
    setView(v);
    localStorage.setItem(STORAGE_KEYS.dealsView, v);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const hasActiveFilters =
    !!filters.stage || !!filters.industry || !!filters.minDealSize || !!filters.maxDealSize || !!filters.priority;

  const clearFilters = () =>
    setFilters((f) => ({ ...f, stage: "", industry: "", minDealSize: "", maxDealSize: "", priority: "" }));

  const handleSearch = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((f) => ({ ...f, search: value }));
    }, 300);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/deals/${id}`);
      setDeals((prev) => prev.filter((d) => d.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete deal");
    }
    setDeleteTarget(null);
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/deals/${id}`)));
    const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    if (succeededIds.length > 0) {
      const succeededSet = new Set(succeededIds);
      setDeals((prev) => prev.filter((d) => !succeededSet.has(d.id)));
    }
    if (failed.length > 0) {
      console.warn("[deals] bulk delete failures:", failed.map((r) => (r as PromiseRejectedResult).reason));
      setError(`${failed.length} of ${ids.length} deletes failed.`);
    }
    setSelected(new Set());
    setDeleteTarget(null);
  };

  const handleBulkStage = async (stage: string) => {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api.patch(`/deals/${id}`, { stage })));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.warn("[deals] bulk stage-change failures:", failed.map((r) => (r as PromiseRejectedResult).reason));
      setError(`${failed.length} of ${ids.length} stage updates failed.`);
    }
    setStageModal(false);
    clearSelection();
    loadDeals();
  };

  const sortLabel = SORT_OPTIONS.find(
    (o) => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder
  )?.label || "Recent Activity";

  const dealSizeLabel = (() => {
    if (!filters.minDealSize && !filters.maxDealSize) return "Deal Size: All";
    const opt = DEAL_SIZE_OPTIONS.find(
      (o) => o.min === filters.minDealSize && o.max === filters.maxDealSize
    );
    return opt ? `Size: ${opt.label}` : "Deal Size";
  })();

  return (
    <div className="p-6 mx-auto max-w-[1600px] flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-main tracking-tight">Deal Pipeline</h1>
        <p className="text-text-secondary text-sm mt-0.5 flex items-center gap-2">
          {!loading && (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(5,150,105,0.4)]" />
              {deals.filter((d) => d.status !== "PASSED").length} Active Opportunities
            </>
          )}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Stage Filter */}
        <FilterDropdown label={filters.stage ? `Stage: ${STAGE_LABELS[filters.stage]}` : "Stage: All"} active={!!filters.stage}>
          {(close) => (
            <>
              <button
                onClick={() => { setFilters((f) => ({ ...f, stage: "" })); close(); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 font-medium"
              >
                All Stages
              </button>
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilters((f) => ({ ...f, stage: s })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
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
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 font-medium"
              >
                All Industries
              </button>
              {industries.map((ind) => (
                <button
                  key={ind}
                  onClick={() => { setFilters((f) => ({ ...f, industry: ind })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
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
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
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
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 font-medium"
              >
                All Priorities
              </button>
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setFilters((f) => ({ ...f, priority: p })); close(); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </>
          )}
        </FilterDropdown>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Clear Filters
          </button>
        )}

      </div>

      {/* View + Sort Row */}
      <div className="flex flex-wrap items-center gap-1">
        {/* View Toggle (icon-only) */}
        <button
          onClick={() => toggleView("list")}
          title="List View"
          className={cn(
            "p-2 rounded-md transition-all",
            view === "list"
              ? "text-primary bg-primary/10"
              : "text-text-muted hover:text-text-secondary hover:bg-gray-100"
          )}
        >
          <span className="material-symbols-outlined text-[20px]">view_list</span>
        </button>
        <button
          onClick={() => toggleView("kanban")}
          title="Kanban View"
          className={cn(
            "p-2 rounded-md transition-all",
            view === "kanban"
              ? "text-primary bg-primary/10"
              : "text-text-muted hover:text-text-secondary hover:bg-gray-100"
          )}
        >
          <span className="material-symbols-outlined text-[20px]">view_kanban</span>
        </button>
        <button
          title="Customize Metrics"
          className="p-2 rounded-md text-text-muted hover:text-text-secondary hover:bg-gray-100 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>

        <div className="flex-1" />

        {/* Sort (hidden in kanban) */}
        {view === "list" && (
          <FilterDropdown
            label={`Sort by: ${sortLabel}`}
            active={false}
            icon="sort"
            borderless
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
                    "w-full text-left px-4 py-2 text-sm hover:bg-blue-50",
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

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-[#003366] text-white rounded-lg px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} deal{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex-1" />
          <button onClick={clearSelection} className="text-xs font-medium hover:underline">
            Clear
          </button>
          <button
            onClick={() => setStageModal(true)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-white/20 text-xs font-medium hover:bg-white/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            Change Stage
          </button>
          <button
            onClick={() => setDeleteTarget({ id: "__bulk__", name: `${selected.size} deals` })}
            className="flex items-center gap-1 px-3 py-1 rounded bg-red-500/80 text-xs font-medium hover:bg-red-500 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Delete
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-[#003366] text-4xl animate-spin mb-4">sync</span>
          <p className="text-text-muted text-sm font-medium">Loading deals...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
          <p className="text-text-main font-medium mb-2">Failed to load deals</p>
          <p className="text-text-muted text-sm mb-4">{error}</p>
          <button
            onClick={loadDeals}
            className="px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            Try Again
          </button>
        </div>
      ) : deals.length === 0 ? (
        hasActiveFilters || filters.search ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
            <p className="text-text-main font-medium mb-2">No deals found</p>
            <p className="text-text-muted text-sm">Try adjusting your filters or search query</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ backgroundColor: "#E6EEF5" }}
            >
              <span className="material-symbols-outlined text-[32px]" style={{ color: "#003366" }}>
                rocket_launch
              </span>
            </div>
            <p className="text-text-main font-semibold text-lg mb-2">Welcome to Your Deal Pipeline</p>
            <p className="text-text-muted text-sm text-center max-w-md mb-6">
              Start building your deal flow. Create your first deal to track it through sourcing, due diligence, and close.
            </p>
            <Link
              href="/deal-intake"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg shadow-sm hover:opacity-90 transition-all text-sm font-semibold"
              style={{ backgroundColor: "#003366" }}
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Create Your First Deal
            </Link>
          </div>
        )
      ) : view === "list" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              selected={selected.has(deal.id)}
              onToggleSelect={toggleSelect}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
            />
          ))}
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_STAGES.map((stage) => {
            const s = STAGE_STYLES[stage] || STAGE_STYLES.INITIAL_REVIEW;
            const stageDeals = deals.filter((d) => d.stage === stage);
            return (
              <div key={stage} className="min-w-[280px] w-[280px] shrink-0">
                <div className="bg-white rounded-xl border border-border-subtle overflow-hidden h-full flex flex-col">
                  <div className={cn("px-4 py-3 border-b border-border-subtle", s.bg)}>
                    <div className="flex items-center justify-between">
                      <span className={cn("px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider", s.bg, s.border, s.text)}>
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className={cn("text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full", s.text)}>
                        {stageDeals.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-320px)]">
                    {stageDeals.map((deal) => (
                      <KanbanCard key={deal.id} deal={deal} />
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-center py-8 text-text-muted text-sm">
                        <span className="material-symbols-outlined text-2xl mb-2 block opacity-40">inbox</span>
                        No deals
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteModal
          title={deleteTarget.id === "__bulk__" ? `Delete ${selected.size} deal${selected.size > 1 ? "s" : ""}?` : `Delete "${deleteTarget.name}"?`}
          onConfirm={() => {
            if (deleteTarget.id === "__bulk__") handleBulkDelete();
            else handleDelete(deleteTarget.id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Bulk Stage Change Modal */}
      {stageModal && (
        <StageChangeModal
          count={selected.size}
          onSelect={handleBulkStage}
          onClose={() => setStageModal(false)}
        />
      )}
    </div>
  );
}
