"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminTask, AdminTaskStatus } from "./types";

// ─── Constants ───────────────────────────────────────────────────────

const TASK_PAGE_SIZE = 20;
const STATUS_OPTIONS: AdminTaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "STUCK"];
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const PRIORITY_STYLES: Record<string, string> = {
  URGENT: "bg-red-50 text-red-600 border-red-100",
  HIGH: "bg-red-50 text-red-600 border-red-100",
  MEDIUM: "bg-slate-100 text-slate-600 border-slate-200",
  LOW: "bg-gray-100 text-text-secondary border-gray-200",
};

type FilterValue = "ALL" | AdminTaskStatus | "OVERDUE";

const FILTER_OPTIONS: { value: FilterValue; label: string; icon: string }[] = [
  { value: "ALL", label: "All Tasks", icon: "list" },
  { value: "PENDING", label: "Pending", icon: "hourglass_empty" },
  { value: "IN_PROGRESS", label: "In Progress", icon: "play_circle" },
  { value: "COMPLETED", label: "Completed", icon: "check_circle" },
  { value: "OVERDUE", label: "Overdue", icon: "warning" },
];

type SortField = "createdAt" | "dueDate" | "priority";
const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Date Created" },
  { value: "dueDate", label: "Due Date" },
  { value: "priority", label: "Priority" },
];

// ─── Helpers ─────────────────────────────────────────────────────────

import { getInitials } from "@/lib/formatters";

function formatDueDate(dateStr: string | null, isOverdue: boolean) {
  if (!dateStr) return <span className="text-text-muted">No date</span>;
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.round((date.getTime() - now.getTime()) / 86400000);

  if (isOverdue) {
    const overdueDays = Math.abs(diffDays);
    return <>{overdueDays === 0 ? "Overdue (today)" : `Overdue (${overdueDays}d)`}</>;
  }
  if (diffDays === 0) return <>Today</>;
  if (diffDays === 1) return <>Tomorrow</>;
  if (diffDays < 7) return <>In {diffDays} days</>;
  return <>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>;
}

function renderStatusBadge(status: AdminTaskStatus, isOverdue: boolean) {
  if (status === "COMPLETED") {
    return (
      <span className="text-secondary flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        Completed
      </span>
    );
  }
  if (isOverdue || status === "STUCK") {
    return (
      <span className="text-red-600 flex items-center gap-1.5 font-medium">
        <span className="material-symbols-outlined text-[16px]">error</span>
        {status === "STUCK" ? "Stuck" : "Overdue"}
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="text-primary flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        In Progress
      </span>
    );
  }
  return (
    <span className="text-text-muted flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Pending
    </span>
  );
}

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

  // Sync external filter (e.g., user clicked Overdue stats card)
  useEffect(() => {
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

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === "OVERDUE") {
      list = list.filter(
        (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "COMPLETED",
      );
    } else if (filter !== "ALL") {
      list = list.filter((t) => t.status === filter);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "priority") {
        cmp = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
      } else if (sortField === "dueDate") {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        cmp = da - db;
      } else {
        cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [tasks, filter, sortField, sortAsc]);

  const display = showAll ? filtered : filtered.slice(0, TASK_PAGE_SIZE);

  const pendingCount = tasks.filter((t) => t.status === "PENDING" || t.status === "STUCK").length;
  const headerLabel =
    filter === "ALL"
      ? `${pendingCount} Pending`
      : `${filtered.length} ${
          filter === "OVERDUE"
            ? "Overdue"
            : filter.charAt(0) + filter.slice(1).toLowerCase().replace("_", " ")
        }`;

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
              display.map((task) => {
                const isOverdue =
                  !!task.dueDate &&
                  new Date(task.dueDate) < now &&
                  task.status !== "COMPLETED";
                const assignee = task.assignee;
                return (
                  <tr
                    key={task.id}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      isOverdue && "bg-red-50/30",
                    )}
                  >
                    <td className="px-5 py-4 font-medium text-text-main">
                      {task.deal ? (
                        <Link
                          href={`/deals/${task.deal.id}`}
                          className="hover:text-primary hover:underline transition-colors"
                        >
                          {task.title}
                        </Link>
                      ) : (
                        task.title
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border",
                          PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM,
                        )}
                      >
                        {task.priority || "Med"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-5 py-4",
                        isOverdue ? "text-red-600 font-medium" : "text-text-main",
                      )}
                    >
                      {formatDueDate(task.dueDate, isOverdue)}
                    </td>
                    <td className="px-5 py-4">
                      {assignee ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary text-white text-[10px] font-medium flex items-center justify-center">
                            {getInitials(assignee.name || assignee.email)}
                          </div>
                          <span className="text-text-secondary">
                            {assignee.name || assignee.email?.split("@")[0] || "Unknown"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-muted text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {task.deal ? (
                        <Link
                          href={`/deals/${task.deal.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {task.deal.name}
                        </Link>
                      ) : (
                        <span className="text-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenStatusFor(openStatusFor === task.id ? null : task.id);
                          }}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {renderStatusBadge(task.status, isOverdue)}
                        </button>
                        {openStatusFor === task.id && (
                          <div
                            className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-border-subtle shadow-lg z-50 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => updateStatus(task.id, s)}
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors",
                                  task.status === s
                                    ? "text-primary font-medium bg-primary-light/30"
                                    : "text-text-main",
                                )}
                              >
                                {renderStatusBadge(s, false)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ id: task.id, title: task.title });
                        }}
                        className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete task"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })
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
