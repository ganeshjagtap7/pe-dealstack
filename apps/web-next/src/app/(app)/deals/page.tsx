"use client";

import { useEffect, useState, useCallback, useRef, type DragEvent } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import {
  STAGES,
  KANBAN_STAGES,
  STAGE_STYLES,
  STAGE_LABELS,
  SORT_OPTIONS,
  DEAL_SIZE_OPTIONS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
  DEFAULT_CARD_METRICS,
  ALL_METRIC_KEYS,
  type MetricKey,
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
  MetricsDropdown,
  UploadCard,
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
  const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>([...DEFAULT_CARD_METRICS]);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load view preference and metrics from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.dealsView);
    if (saved === "kanban" || saved === "list") setView(saved);
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.dealCardMetrics);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((k: string) => ALL_METRIC_KEYS.includes(k as MetricKey));
          if (valid.length > 0) setActiveMetrics(valid as MetricKey[]);
        }
      }
    } catch { /* ignore */ }
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
      const raw = Array.isArray(data) ? data : [];
      // Flatten company.name into companyName so cards can display it
      const list = raw.map((d) => ({
        ...d,
        companyName: d.companyName || d.company?.name || undefined,
      }));
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

  const handleBulkPass = async () => {
    if (!confirm(`Mark ${selected.size} deal${selected.size > 1 ? "s" : ""} as Passed?`)) return;
    await handleBulkStage("PASSED");
  };

  // CSV Export
  const exportSelectedToCSV = () => {
    const dealsToExport = deals.filter((d) => selected.has(d.id));
    if (dealsToExport.length === 0) return;

    const escapeCSV = (val: string | null | undefined) => {
      if (val == null) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      "Name", "Industry", "Stage", "Status",
      "Revenue (displayed)", "EBITDA (displayed)", "Deal Size (displayed)",
      "IRR Projected (%)", "MoM Multiple", "AI Thesis",
      "Created At", "Updated At",
    ];

    const rows = dealsToExport.map((deal) => [
      escapeCSV(deal.name),
      escapeCSV(deal.industry),
      escapeCSV(STAGE_LABELS[deal.stage] || deal.stage),
      escapeCSV(deal.status),
      deal.revenue != null ? formatCurrency(deal.revenue) : "",
      deal.ebitda != null ? formatCurrency(deal.ebitda) : "",
      deal.dealSize != null ? formatCurrency(deal.dealSize) : "",
      deal.irrProjected?.toString() ?? "",
      deal.mom?.toString() ?? "",
      escapeCSV(deal.aiThesis),
      deal.createdAt ? new Date(deal.createdAt).toISOString() : "",
      deal.updatedAt ? new Date(deal.updatedAt).toISOString() : "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `deals-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Save metrics preference to localStorage (and server if available)
  const handleMetricsApply = (metrics: MetricKey[]) => {
    setActiveMetrics(metrics);
    localStorage.setItem(STORAGE_KEYS.dealCardMetrics, JSON.stringify(metrics));
    // Fire-and-forget save to server
    api.patch("/users/me", { dealCardMetrics: metrics }).catch(() => {});
  };

  // Remove sample deal
  const handleRemoveSample = async (id: string) => {
    try {
      await api.delete(`/deals/${id}`);
      setDeals((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
  };

  // Kanban drag-and-drop
  const handleKanbanDrop = async (e: DragEvent<HTMLDivElement>, newStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData("text/plain");
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    const oldStage = deal.stage;
    // Optimistic update
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d)));
    try {
      await api.patch(`/deals/${dealId}`, { stage: newStage });
    } catch {
      // Revert on error
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: oldStage } : d)));
    }
  };

  // Keyboard shortcuts (CMD+K handled by layout Header; deals page handles Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape to clear selection
      if (e.key === "Escape" && selected.size > 0) {
        clearSelection();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selected.size]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="p-4 md:p-6 mx-auto max-w-[1600px] w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-main tracking-tight font-display">Deal Pipeline</h1>
          <p className="text-text-secondary text-sm flex items-center gap-2">
            {!loading && (
              <>
                <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(5,150,105,0.4)]" />
                {deals.filter((d) => d.status !== "PASSED").length} Active Opportunities
              </>
            )}
          </p>
        </div>
        <Link
          href="/deal-intake"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-text-secondary hover:border-[#003366] hover:text-[#003366] bg-surface-card text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          Import Deals
        </Link>
      </div>

      {/* Filter Bar */}
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
          <MetricsDropdown activeMetrics={activeMetrics} onApply={handleMetricsApply} />

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

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-[#003366] text-white rounded-xl p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <button onClick={clearSelection} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            <span className="font-bold text-sm">
              {selected.size} deal{selected.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStageModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
              Change Stage
            </button>
            <button
              onClick={exportSelectedToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export CSV
            </button>
            <button
              onClick={handleBulkPass}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">block</span>
              Mark as Passed
            </button>
            <button
              onClick={() => setDeleteTarget({ id: "__bulk__", name: `${selected.size} deals` })}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/90 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete
            </button>
          </div>
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
        hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
            <p className="text-text-main font-medium mb-2">No deals found</p>
            <p className="text-text-muted text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-primary-light border border-primary/10 flex items-center justify-center mb-6 shadow-sm">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: "36px" }}>
                rocket_launch
              </span>
            </div>
            <p className="text-text-main font-bold text-xl mb-2 tracking-tight">Welcome to Your Deal Pipeline</p>
            <p className="text-text-muted text-sm text-center max-w-md mb-8 leading-relaxed">
              Start building your deal flow. Create your first deal or import from a spreadsheet to track through sourcing, due diligence, and close.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/deal-intake"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-semibold"
                style={{ backgroundColor: "#003366" }}
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Create Your First Deal
              </Link>
              <Link
                href="/deal-intake"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border-subtle text-text-secondary hover:border-primary/30 hover:text-primary transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                Import Deals
              </Link>
            </div>
          </div>
        )
      ) : view === "list" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 pb-6">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              selected={selected.has(deal.id)}
              onToggleSelect={toggleSelect}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
              activeMetrics={activeMetrics}
              onRemoveSample={handleRemoveSample}
            />
          ))}
          <UploadCard />
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_STAGES.map((stage) => {
            const s = STAGE_STYLES[stage] || STAGE_STYLES.INITIAL_REVIEW;
            const stageDeals = deals.filter((d) => d.stage === stage);
            return (
              <div key={stage} className="min-w-[300px] w-[300px] shrink-0" data-stage={stage}>
                <div className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden h-full flex flex-col">
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
                  <div
                    className={cn(
                      "flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-320px)] border-2 border-dashed border-transparent rounded-lg transition-all custom-scrollbar",
                      dragOverStage === stage && "bg-[rgba(0,51,102,0.05)] border-[rgba(0,51,102,0.3)]",
                    )}
                    style={{ minHeight: 100 }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStage(stage); }}
                    onDragLeave={(e) => {
                      const col = (e.currentTarget as HTMLElement);
                      if (!col.contains(e.relatedTarget as Node)) setDragOverStage(null);
                    }}
                    onDrop={(e) => handleKanbanDrop(e, stage)}
                  >
                    {stageDeals.map((deal) => (
                      <KanbanCard key={deal.id} deal={deal} activeMetrics={activeMetrics} />
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-center py-8 text-text-muted text-sm">
                        <span className="material-symbols-outlined text-2xl mb-2 block opacity-40">inbox</span>
                        Drop deals here
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
