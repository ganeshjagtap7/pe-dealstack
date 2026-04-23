"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from apps/web/js/widgets/recent-activity.js +
// activity-formatters.js. Top 10 audit logs grouped by day.
type AuditLog = {
  id: string;
  action: string;
  description?: string;
  userName?: string | null;
  resourceType?: string;
  createdAt: string;
};

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - dayStart.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDay(logs: AuditLog[]): Array<{ label: string; logs: AuditLog[] }> {
  const map = new Map<string, AuditLog[]>();
  for (const l of logs) {
    const label = dayLabel(l.createdAt);
    const arr = map.get(label) || [];
    arr.push(l);
    map.set(label, arr);
  }
  return [...map.entries()].map(([label, logs]) => ({ label, logs }));
}

export function RecentActivityWidget() {
  const [groups, setGroups] = useState<Array<{ label: string; logs: AuditLog[] }> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ logs?: AuditLog[] }>("/audit?limit=10");
        if (cancelled) return;
        const logs = data?.logs || [];
        setGroups(logs.length === 0 ? [] : groupByDay(logs));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Recent Activity" icon="rss_feed">
      {error ? (
        <WidgetError message="Could not load activity" />
      ) : !groups ? (
        <WidgetLoading />
      ) : groups.length === 0 ? (
        <WidgetEmpty message="Activity will appear here as your team works" icon="rss_feed" />
      ) : (
        <div className="p-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mt-2 mb-2 first:mt-0">{g.label}</p>
              {g.logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2 py-1.5">
                  <span className="material-symbols-outlined text-text-muted text-[14px] mt-0.5 shrink-0">
                    history
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-main">
                      {l.userName && <span className="font-semibold">{l.userName} </span>}
                      {l.description || l.action.toLowerCase().replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-text-muted">{formatRelativeTime(l.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
