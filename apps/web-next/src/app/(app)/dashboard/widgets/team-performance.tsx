"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/formatters";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from team-performance.js.
type User = { id: string; name?: string; email?: string };
type DealRow = { teamMembers?: Array<{ userId?: string; user?: { id?: string } }> };
type TaskRow = { assignedTo?: string; status?: string };

type Row = {
  id: string;
  name?: string;
  email?: string;
  dealCount: number;
  taskCount: number;
  capacity: number;
};

function capacityColor(pct: number): string {
  if (pct >= 80) return "#EF4444";
  if (pct >= 50) return "#F59E0B";
  return "#003366";
}

export function TeamPerformanceWidget() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [users, dealsData, tasksData] = await Promise.all([
          api.get<User[]>("/users?isActive=true"),
          api.get<DealRow[] | { deals: DealRow[] }>("/deals?limit=500"),
          api.get<{ tasks?: TaskRow[] } | TaskRow[]>("/tasks?limit=500"),
        ]);
        if (cancelled) return;
        const team = Array.isArray(users) ? users : [];
        const deals = Array.isArray(dealsData) ? dealsData : dealsData.deals || [];
        const tasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];

        const dealsByMember = new Map<string, number>();
        for (const d of deals) {
          for (const tm of d.teamMembers || []) {
            const uid = tm.user?.id || tm.userId;
            if (!uid) continue;
            dealsByMember.set(uid, (dealsByMember.get(uid) || 0) + 1);
          }
        }

        const computed = team.slice(0, 6).map((m) => {
          const dealCount = dealsByMember.get(m.id) || 0;
          const taskCount = tasks.filter((t) => t.assignedTo === m.id && t.status !== "COMPLETED").length;
          const capacity = Math.min(100, Math.round((dealCount / 5) * 100));
          return { id: m.id, name: m.name, email: m.email, dealCount, taskCount, capacity };
        });
        setRows(computed);
      } catch (err) {
        console.warn("[dashboard/team-performance] failed to load team data:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Team Performance" icon="groups">
      {error ? (
        <WidgetError message="Could not load team" />
      ) : !rows ? (
        <WidgetLoading />
      ) : rows.length === 0 ? (
        <WidgetEmpty message="No team members yet" icon="groups" />
      ) : (
        <div className="p-2">
          {rows.map((r) => {
            const initials = getInitials(r.name || r.email || "");
            const color = capacityColor(r.capacity);
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div
                  className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#003366" }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{r.name || r.email}</p>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(r.capacity, 4)}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-text-main">
                    {r.dealCount}
                    <span className="text-text-muted font-normal text-[10px] ml-0.5">deals</span>
                  </p>
                  <p className="text-[10px] text-text-muted">{r.taskCount} tasks</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
