"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Card shell + loading/error/empty renderers — ported from WidgetBase
// (apps/web/js/widgets/widget-base.js, c9dcc6d).
export function WidgetShell({
  title,
  icon,
  children,
  headerRight,
  className,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  headerRight?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden",
        className,
      )}
    >
      <div className="p-4 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="material-symbols-outlined text-text-secondary text-[20px]">{icon}</span>
          )}
          <h3 className="font-bold text-text-main text-sm">{title}</h3>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

export function WidgetLoading() {
  return (
    <div className="p-6 text-center text-text-muted">
      <span className="material-symbols-outlined text-[20px] animate-spin opacity-60">progress_activity</span>
      <p className="text-xs mt-1">Loading...</p>
    </div>
  );
}

export function WidgetEmpty({ message, icon = "inbox" }: { message: string; icon?: string }) {
  return (
    <div className="p-6 text-center text-text-muted">
      <span className="material-symbols-outlined text-[28px] mb-2 block opacity-60">{icon}</span>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function WidgetError({ message = "Could not load" }: { message?: string }) {
  return (
    <div className="p-6 text-center text-text-muted">
      <span className="material-symbols-outlined text-[24px] mb-2 block">cloud_off</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
