"use client";

import type { AdminTask } from "./types";

interface Props {
  tasks: AdminTask[];
  onScheduleClick: () => void;
}

// Vanilla: "reviews" are tasks with a "[Review]" prefix. Show up to 3, soonest
// first. Matches admin-tasks.js::renderUpcomingReviews.
export function UpcomingReviews({ tasks, onScheduleClick }: Props) {
  const reviews = tasks
    .filter((t) => t.title.startsWith("[Review]") && t.status !== "COMPLETED")
    .sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    })
    .slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-primary to-primary-hover rounded-xl shadow-lg p-5 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
        <span className="material-symbols-outlined text-[80px]">event_available</span>
      </div>
      <h3 className="font-bold text-lg mb-1 relative z-10">Upcoming Reviews</h3>
      {reviews.length === 0 ? (
        <div className="relative z-10">
          <p className="text-blue-200 text-sm mb-3">No upcoming reviews scheduled</p>
          <button
            type="button"
            onClick={onScheduleClick}
            className="bg-white/10 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-white/20 transition-colors border border-white/20 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Schedule Review
          </button>
        </div>
      ) : (
        <div className="space-y-3 mt-3 relative z-10">
          {reviews.map((r) => {
            const title = r.title.replace("[Review] ", "");
            const date = r.dueDate ? new Date(r.dueDate) : null;
            const assignee = r.assignee;
            const deal = r.deal;
            const isOverdue = date && date < new Date();
            const month = date
              ? date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
              : "";
            const day = date ? date.getDate() : "?";

            return (
              <div
                key={r.id}
                className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10"
              >
                <div className="flex items-center gap-3">
                  {date && (
                    <div
                      className={`rounded-lg px-2.5 py-1.5 text-center min-w-[50px] ${
                        isOverdue ? "bg-red-100 text-red-600" : "bg-white text-primary"
                      }`}
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-wide">
                        {month}
                      </span>
                      <span className="block text-xl font-bold leading-none">{day}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{title}</p>
                    <p className="text-xs text-blue-200 mt-0.5">
                      {assignee
                        ? assignee.name || assignee.email?.split("@")[0] || "Unassigned"
                        : "Unassigned"}
                      {deal ? ` · ${deal.name}` : ""}
                      {isOverdue && (
                        <>
                          {" · "}
                          <span className="text-red-300 font-medium">Overdue</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
