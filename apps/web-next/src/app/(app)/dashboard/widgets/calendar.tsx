"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from calendar.js. Next-7-days union of
// Task.dueDate (pending) + Deal.targetCloseDate.
type DealRow = { name: string; targetCloseDate?: string };
type TaskRow = { title: string; dueDate?: string; status?: string };
type Event = { date: Date; label: string; icon: string; color: string };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function CalendarWidget() {
  const [groups, setGroups] = useState<Array<{ dateLabel: string; events: Event[] }> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tasksData, dealsData] = await Promise.all([
          api.get<{ tasks?: TaskRow[] } | TaskRow[]>("/tasks?limit=100"),
          api.get<DealRow[] | { deals: DealRow[] }>("/deals?limit=500"),
        ]);
        if (cancelled) return;
        const tasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
        const deals = Array.isArray(dealsData) ? dealsData : dealsData.deals || [];

        const today = startOfDay(new Date());
        const horizon = new Date(today.getTime() + 7 * 86400000);

        const events: Event[] = [];
        for (const t of tasks) {
          if (!t.dueDate || t.status === "COMPLETED") continue;
          const d = new Date(t.dueDate);
          if (d < today || d >= horizon) continue;
          events.push({ date: d, label: t.title, icon: "task_alt", color: "#003366" });
        }
        for (const d of deals) {
          if (!d.targetCloseDate) continue;
          const dt = new Date(d.targetCloseDate);
          if (dt < today || dt >= horizon) continue;
          events.push({ date: dt, label: `${d.name} closing`, icon: "flag", color: "#10B981" });
        }

        if (events.length === 0) {
          setGroups([]);
          return;
        }

        events.sort((a, b) => a.date.getTime() - b.date.getTime());
        const byDay = new Map<string, Event[]>();
        for (const e of events) {
          const key = startOfDay(e.date).toISOString();
          const arr = byDay.get(key) || [];
          arr.push(e);
          byDay.set(key, arr);
        }
        const grouped = [...byDay.entries()].map(([key, evs]) => ({
          dateLabel: new Date(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
          events: evs,
        }));
        setGroups(grouped);
      } catch (err) {
        console.warn("[dashboard/calendar] failed to load tasks/deals:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="This Week" icon="calendar_month">
      {error ? (
        <WidgetError message="Could not load calendar" />
      ) : !groups ? (
        <WidgetLoading />
      ) : groups.length === 0 ? (
        <WidgetEmpty message="Nothing scheduled this week" icon="calendar_month" />
      ) : (
        <div className="p-3 space-y-3">
          {groups.map((g) => (
            <div key={g.dateLabel}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5 px-2">{g.dateLabel}</p>
              {g.events.map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors">
                  <span className="material-symbols-outlined text-[16px]" style={{ color: e.color }}>
                    {e.icon}
                  </span>
                  <span className="text-xs text-text-main truncate flex-1">{e.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
