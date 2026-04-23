"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from apps/web/js/widgets/upcoming-deadlines.js.
type TaskRow = {
  id: string;
  title: string;
  dueDate?: string;
  status?: string;
  deal?: { name?: string };
};

function colorForDue(dueDate: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { color: "#EF4444", label: "Overdue", bg: "#FEE2E2" };
  if (days <= 2) return { color: "#F59E0B", label: days === 0 ? "Today" : `${days}d`, bg: "#FEF3C7" };
  if (days <= 7) return { color: "#003366", label: `${days}d`, bg: "#DBEAFE" };
  return { color: "#6B7280", label: `${days}d`, bg: "#F3F4F6" };
}

export function UpcomingDeadlinesWidget() {
  const [upcoming, setUpcoming] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ tasks?: TaskRow[] } | TaskRow[]>("/tasks?limit=100");
        if (cancelled) return;
        const tasks = Array.isArray(data) ? data : data.tasks || [];
        const cutoff = Date.now() + 14 * 86400000;
        const filtered = tasks
          .filter((t) => t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate).getTime() <= cutoff)
          .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
          .slice(0, 8);
        setUpcoming(filtered);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Upcoming Deadlines" icon="event">
      {error ? (
        <WidgetError message="Could not load deadlines" />
      ) : !upcoming ? (
        <WidgetLoading />
      ) : upcoming.length === 0 ? (
        <WidgetEmpty message="No upcoming deadlines" icon="event_available" />
      ) : (
        <div className="p-2">
          {upcoming.map((t) => {
            const meta = colorForDue(t.dueDate!);
            const dateLabel = new Date(t.dueDate!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const dealName = t.deal?.name ? ` · ${t.deal.name}` : "";
            return (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded uppercase shrink-0"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{t.title}</p>
                  <p className="text-xs text-text-muted truncate">
                    {dateLabel}
                    {dealName}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
