import type { AdminTask } from "./types";
import {
  FilterValue, PRIORITY_RANK, SortField,
} from "./TaskTable.helpers";

// Filter + sort logic for the TaskTable.
// Extracted from TaskTable.tsx so the parent module stays under the 500-line
// cap.

export function filterAndSortTasks({
  tasks, filter, sortField, sortAsc, now,
}: {
  tasks: AdminTask[];
  filter: FilterValue;
  sortField: SortField;
  sortAsc: boolean;
  now: Date;
}): AdminTask[] {
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
}

export function buildHeaderLabel(
  tasks: AdminTask[],
  filter: FilterValue,
  filteredCount: number,
): string {
  const pendingCount = tasks.filter(
    (t) => t.status === "PENDING" || t.status === "STUCK",
  ).length;
  if (filter === "ALL") return `${pendingCount} Pending`;
  return `${filteredCount} ${
    filter === "OVERDUE"
      ? "Overdue"
      : filter.charAt(0) + filter.slice(1).toLowerCase().replace("_", " ")
  }`;
}
