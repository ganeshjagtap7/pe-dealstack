"use client";

import { cn } from "@/lib/cn";

// ─── Constants ──────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  { key: "DEAL_UPDATE", label: "Deal Updates", description: "When deal data or stage changes", icon: "trending_up" },
  { key: "DOCUMENT_UPLOADED", label: "Document Uploads", description: "When new files are added to a data room", icon: "upload_file" },
  { key: "MENTION", label: "Mentions", description: "When someone mentions you in a comment", icon: "alternate_email" },
  { key: "AI_INSIGHT", label: "AI Insights", description: "When the AI generates new analysis or flags", icon: "auto_awesome" },
  { key: "TASK_ASSIGNED", label: "Task Assignments", description: "When a task is assigned to you", icon: "task_alt" },
  { key: "COMMENT", label: "Comments", description: "When someone comments on your deals or memos", icon: "comment" },
] as const;

export const DEFAULT_NOTIFICATION_PREFS: Record<string, boolean> = {
  DEAL_UPDATE: true,
  DOCUMENT_UPLOADED: true,
  MENTION: true,
  AI_INSIGHT: true,
  TASK_ASSIGNED: true,
  COMMENT: true,
};

// ─── Component ──────────────────────────────────────────────────────

interface NotificationsSectionProps {
  notificationPrefs: Record<string, boolean>;
  setNotificationPrefs: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  markChanged: () => void;
}

export function NotificationsSection({
  notificationPrefs,
  setNotificationPrefs,
  markChanged,
}: NotificationsSectionProps) {
  return (
    <section
      id="section-notifications"
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
    >
      <div className="px-6 py-5 border-b border-border-subtle flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-200">
          <span className="material-symbols-outlined text-[20px] block">notifications</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-text-main">Notification Preferences</h2>
          <p className="text-xs text-text-muted">
            Choose which events trigger in-app notifications.
          </p>
        </div>
      </div>
      <div className="divide-y divide-border-subtle">
        {NOTIFICATION_TYPES.map((notif) => {
          const enabled = !!notificationPrefs[notif.key];
          return (
            <div
              key={notif.key}
              className="flex items-center justify-between px-5 py-4 hover:bg-background-body/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    {notif.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-main">{notif.label}</p>
                  <p className="text-xs text-text-muted">{notif.description}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => {
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    [notif.key]: !prev[notif.key],
                  }));
                  markChanged();
                }}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors shrink-0",
                  enabled ? "bg-primary" : "bg-gray-300",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                    enabled ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
