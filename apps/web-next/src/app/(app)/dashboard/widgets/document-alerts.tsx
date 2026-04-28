"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from apps/web/js/widgets/document-alerts.js. Depends on the
// /api/documents/alerts endpoint added on main in c9dcc6d.
type Alert = {
  id: string;
  name: string;
  state: "pending" | "ready_for_ai";
  dealId?: string;
  dealName?: string | null;
};

const STATE_META = {
  pending: { label: "Pending", icon: "hourglass_top", color: "#6B7280", bg: "#F3F4F6" },
  ready_for_ai: { label: "Ready for AI", icon: "check_circle", color: "#10B981", bg: "#D1FAE5" },
} as const;

export function DocumentAlertsWidget() {
  const [items, setItems] = useState<Alert[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ items?: Alert[] }>("/documents/alerts");
        if (!cancelled) setItems(data?.items || []);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Document Alerts" icon="report">
      {error ? (
        <WidgetError message="Could not load document alerts" />
      ) : !items ? (
        <WidgetLoading />
      ) : items.length === 0 ? (
        <WidgetEmpty message="All documents reviewed" icon="task_alt" />
      ) : (
        <div className="p-2">
          {items.slice(0, 8).map((item) => {
            const meta = STATE_META[item.state] || STATE_META.pending;
            const href = item.dealId ? `/data-room/${item.dealId}` : "/data-room";
            return (
              <Link
                key={item.id}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span
                  className="material-symbols-outlined text-[20px] shrink-0"
                  style={{ color: meta.color }}
                >
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{item.name}</p>
                  <p className="text-xs text-text-muted truncate">{item.dealName || "—"}</p>
                </div>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  {meta.label}
                </span>
              </Link>
            );
          })}
          {items.length > 8 && (
            <p className="text-[11px] text-text-muted text-center mt-2">+ {items.length - 8} more</p>
          )}
        </div>
      )}
    </WidgetShell>
  );
}
