"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminTask, AdminTaskStatus } from "./types";
import {
  FILTER_OPTIONS, FilterValue, SORT_OPTIONS, SortField, TASK_PAGE_SIZE,
} from "./TaskTable.helpers";
import { TaskTableRow } from "./TaskTable.row";
import { buildHeaderLabel, filterAndSortTasks } from "./TaskTable.filter";

// ─── Component ───────────────────────────────────────────────────────

interface Props {
  tasks: AdminTask[];
  /** Filter preset applied by external click (e.g., Overdue stats card). */
  externalFilter?: FilterValue;
  onTasksChanged: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

export function TaskTable({ tasks, externalFilter, onTasksChanged, onToast }: Props) {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync external filter (e.g., user clicked Overdue stats card).
  // We deliberately only sync when externalFilter changes — local filter
  // edits are preserved until the parent re-asserts a value.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (externalFilter && externalFilter !== filter) setFilter(externalFilter);
  }, [externalFilter, filter]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
        setSortOpen(false);
      }
      setOpenStatusFor(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Stable reference — only recalculated when tasks change, not every render
  const now = useMemo(() => new Date(), [tasks]);

  const filtered = useMemo(
    () => filterAndSortTasks({ tasks, filter, sortField, sortAsc, now }),
    [tasks, filter, sortField, sortAsc, now],
  );

  const display = showAll ? filtered : filtered.slice(0, TASK_PAGE_SIZE);

  const headerLabel = buildHeaderLabel(tasks, filter, filtered.length);

  const updateStatus = async (taskId: string, newStatus: AdminTaskStatus) => {
    setOpenStatusFor(null);
    const current = tasks.find((t) => t.id === taskId);
    if (!current) return;
    // Optimistic update: mutate parent by calling onTasksChanged after API returns.
    // Here we surface the in-flight intent by calling the API and letting the
    // parent reload on success.
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      onTasksChanged();
      onToast(`Task marked as ${newStatus.replace("_", " ").toLowerCase()}`, "success");
    } catch (err) {
      console.warn("[admin] updateStatus failed:", err);
      onToast("Failed to update task status", "error");
    }
  };

  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const deleteTask = async (taskId: string) => {
    setConfirmDelete(null);
    try {
      await api.delete(`/tasks/${taskId}`);
      onTasksChanged();
      onToast("Task deleted", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete task", "error");
    }
  };

  return (
    <div
      id="task-table-body"
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
    >
      <div className="p-5 border-b border-border-subtle flex justify-between items-center bg-gray-50/50">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-text-muted text-[20px]">task_alt</span>
            Global Task Management
          </h2>
          <span className="bg-gray-200 text-text-secondary text-xs px-2 py-0.5 rounded-full font-medium">
            {headerLabel}
          </span>
        </div>
        <div className="flex gap-2 relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFilterOpen((v) => !v);
              setSortOpen(false);
            }}
            className={cn(
              "p-1.5 rounded transition-colors",
              filter !== "ALL"
                ? "text-primary bg-primary-light/30"
                : "text-text-muted hover:text-primary hover:bg-gray-100",
            )}
            title="Filter tasks"
          >
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSortOpen((v) => !v);
              setFilterOpen(false);
            }}
            className="p-1.5 text-text-muted hover:text-primary hover:bg-gray-100 rounded transition-colors"
            title="Sort tasks"
          >
            <span className="material-symbols-outlined text-[20px]">sort</span>
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-border-subtle shadow-lg z-50 py-1">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    setFilter(f.value);
                    setFilterOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                    filter === f.value
                      ? "text-primary font-medium bg-primary-light/30"
                      : "text-text-main",
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">{f.icon}</span>
                  {f.label}
                  {filter === f.value && (
                    <span className="material-symbols-outlined text-[14px] ml-auto">check</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-border-subtle shadow-lg z-50 py-1">
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    setSortField(s.value);
                    setSortOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                    sortField === s.value
                      ? "text-primary font-medium bg-primary-light/30"
                      : "text-text-main",
                  )}
                >
                  {s.label}
                  {sortField === s.value && (
                    <span className="material-symbols-outlined text-[14px] ml-auto">
                      {sortAsc ? "arrow_upward" : "arrow_downward"}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-t border-border-subtle mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSortAsc((v) => !v);
                    setSortOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-text-main"
                >
                  <span className="material-symbols-outlined text-[16px]">swap_vert</span>
                  {sortAsc ? "Ascending" : "Descending"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-text-muted font-medium border-b border-border-subtle">
            <tr>
              <th className="px-5 py-3">Task Name</th>
              <th className="px-5 py-3">Priority</th>
              <th className="px-5 py-3">Due Date</th>
              <th className="px-5 py-3">Analyst</th>
              <th className="px-5 py-3">Linked Deal</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {display.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-text-muted">
                  <span className="material-symbols-outlined text-[32px] mb-2 block">
                    {tasks.length === 0 ? "task_alt" : "filter_list_off"}
                  </span>
                  <p className="text-sm font-medium">
                    {tasks.length === 0
                      ? "No tasks yet"
                      : "No tasks match this filter"}
                  </p>
                  {tasks.length === 0 && (
                    <p className="text-xs mt-1">Create your first task to start tracking work</p>
                  )}
                </td>
              </tr>
            ) : (
              display.map((task) => (
                <TaskTableRow
                  key={task.id}
                  task={task}
                  now={now}
                  openStatusFor={openStatusFor}
                  onToggleStatusMenu={setOpenStatusFor}
                  onUpdateStatus={updateStatus}
                  onAskDelete={(id, title) => setConfirmDelete({ id, title })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > TASK_PAGE_SIZE && (
        <div className="p-4 border-t border-border-subtle flex justify-center bg-gray-50/30">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-sm font-medium text-text-secondary hover:text-primary flex items-center gap-1 transition-colors"
          >
            {showAll ? (
              <>
                Show recent
                <span className="material-symbols-outlined text-[16px]">expand_less</span>
              </>
            ) : (
              <>
                View all {filtered.length} tasks
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </>
            )}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Task"
        message={confirmDelete ? `Delete task "${confirmDelete.title}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => confirmDelete && deleteTask(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
