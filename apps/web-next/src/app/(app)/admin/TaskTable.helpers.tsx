"use client";

import type { AdminTaskStatus } from "./types";

// Constants, helpers, and the small status-badge / due-date renderers used
// by TaskTable. Extracted from TaskTable.tsx so the parent module stays under
// the 500-line cap.

// ─── Constants ───────────────────────────────────────────────────────

export const TASK_PAGE_SIZE = 20;
export const STATUS_OPTIONS: AdminTaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "STUCK"];
export const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const PRIORITY_STYLES: Record<string, string> = {
  URGENT: "bg-red-50 text-red-600 border-red-100",
  HIGH: "bg-red-50 text-red-600 border-red-100",
  MEDIUM: "bg-slate-100 text-slate-600 border-slate-200",
  LOW: "bg-gray-100 text-text-secondary border-gray-200",
};

export type FilterValue = "ALL" | AdminTaskStatus | "OVERDUE";

export const FILTER_OPTIONS: { value: FilterValue; label: string; icon: string }[] = [
  { value: "ALL", label: "All Tasks", icon: "list" },
  { value: "PENDING", label: "Pending", icon: "hourglass_empty" },
  { value: "IN_PROGRESS", label: "In Progress", icon: "play_circle" },
  { value: "COMPLETED", label: "Completed", icon: "check_circle" },
  { value: "OVERDUE", label: "Overdue", icon: "warning" },
];

export type SortField = "createdAt" | "dueDate" | "priority";
export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Date Created" },
  { value: "dueDate", label: "Due Date" },
  { value: "priority", label: "Priority" },
];

// ─── Helpers ─────────────────────────────────────────────────────────

export function formatDueDate(dateStr: string | null, isOverdue: boolean) {
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

export function renderStatusBadge(status: AdminTaskStatus, isOverdue: boolean) {
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
