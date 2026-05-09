"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/formatters";
import type { AdminTask, AdminTaskStatus } from "./types";
import {
  PRIORITY_STYLES, STATUS_OPTIONS,
  formatDueDate, renderStatusBadge,
} from "./TaskTable.helpers";

// One row of the global task table, plus its inline status dropdown.
// Extracted from TaskTable.tsx so the parent module stays under the 500-line
// cap.

export function TaskTableRow({
  task,
  now,
  openStatusFor,
  onToggleStatusMenu,
  onUpdateStatus,
  onAskDelete,
}: {
  task: AdminTask;
  now: Date;
  openStatusFor: string | null;
  onToggleStatusMenu: (id: string | null) => void;
  onUpdateStatus: (taskId: string, status: AdminTaskStatus) => void;
  onAskDelete: (id: string, title: string) => void;
}) {
  const isOverdue =
    !!task.dueDate &&
    new Date(task.dueDate) < now &&
    task.status !== "COMPLETED";
  const assignee = task.assignee;
  return (
    <tr
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
              onToggleStatusMenu(openStatusFor === task.id ? null : task.id);
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
                  onClick={() => onUpdateStatus(task.id, s)}
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
            onAskDelete(task.id, task.title);
          }}
          className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete task"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </td>
    </tr>
  );
}
