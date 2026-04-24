"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

// ─── Types (match api/src/routes/notifications.ts response) ──────

type NotificationType =
  | "DEAL_UPDATE"
  | "DOCUMENT_UPLOADED"
  | "MENTION"
  | "AI_INSIGHT"
  | "TASK_ASSIGNED"
  | "COMMENT"
  | "SYSTEM";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  dealId?: string;
  Deal?: { id: string; name: string };
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const ICON_BY_TYPE: Record<NotificationType, { icon: string; color: string; bg: string }> = {
  DEAL_UPDATE: { icon: "trending_up", color: "text-primary", bg: "bg-primary-light" },
  DOCUMENT_UPLOADED: { icon: "upload_file", color: "text-blue-600", bg: "bg-blue-100" },
  MENTION: { icon: "alternate_email", color: "text-purple-600", bg: "bg-purple-100" },
  AI_INSIGHT: { icon: "auto_awesome", color: "text-amber-600", bg: "bg-amber-100" },
  TASK_ASSIGNED: { icon: "task_alt", color: "text-green-600", bg: "bg-green-100" },
  COMMENT: { icon: "comment", color: "text-cyan-600", bg: "bg-cyan-100" },
  SYSTEM: { icon: "info", color: "text-gray-600", bg: "bg-gray-100" },
};

// Poll every 30s to match the vanilla cadence. The app is mostly idle so the
// round-trip cost is tolerable and keeps the unread badge honest without
// requiring a websocket.
const POLL_INTERVAL_MS = 30_000;

export function NotificationsDropdown() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get<NotificationsResponse>(
        `/notifications?userId=${encodeURIComponent(userId)}&limit=20`,
      );
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.warn("[notifications] load failed:", err);
    }
  }, [userId]);

  // Initial load + polling
  useEffect(() => {
    if (!userId) return;
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // When the panel opens, silently mark the first few unread as read (matches
  // vanilla's markVisibleAsRead behavior). Fire-and-forget — the badge updates
  // optimistically.
  useEffect(() => {
    if (!open) return;
    const unread = notifications.filter((n) => !n.isRead).slice(0, 5);
    if (unread.length === 0) return;

    const t = setTimeout(async () => {
      const ids = unread.map((n) => n.id);
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
      await Promise.allSettled(
        ids.map((id) => api.patch(`/notifications/${id}`, { isRead: true })),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [open, notifications]);

  const markAllRead = async () => {
    if (!userId || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/mark-all-read", { userId });
    } catch (err) {
      console.warn("[notifications] mark-all-read failed:", err);
    }
  };

  const markOneRead = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/notifications/${id}`, { isRead: true });
    } catch (err) {
      console.warn("[notifications] mark-read failed:", err);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-primary-light transition-colors relative"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[calc(100vh-5rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden dropdown-animate">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">notifications</span>
              <h3 className="font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary text-white text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-primary hover:text-primary-hover font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Close notifications"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <span className="material-symbols-outlined text-4xl mb-2">notifications_off</span>
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-xs mt-1">You&apos;re all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => {
                const style = ICON_BY_TYPE[n.type] || ICON_BY_TYPE.SYSTEM;
                const isUnread = !n.isRead;
                const inner = (
                  <div
                    className={cn(
                      "flex items-start gap-3 p-4 hover:bg-gray-50 border-b border-gray-100 transition-colors",
                      isUnread && "bg-primary-light/30",
                    )}
                  >
                    <div className={cn("size-10 rounded-full flex items-center justify-center shrink-0", style.bg)}>
                      <span className={cn("material-symbols-outlined", style.color)}>
                        {style.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm text-gray-900 leading-tight",
                            isUnread ? "font-bold" : "font-medium",
                          )}
                        >
                          {n.title}
                        </p>
                        {isUnread && (
                          <div className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                      {n.message && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                        {n.Deal?.name && (
                          <>
                            <span className="text-[10px] text-gray-400">•</span>
                            <span className="text-[10px] text-primary font-medium">
                              {n.Deal.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );

                if (n.dealId) {
                  return (
                    <Link
                      key={n.id}
                      href={`/deals/${n.dealId}`}
                      onClick={() => {
                        markOneRead(n.id);
                        setOpen(false);
                      }}
                      className="block cursor-pointer"
                    >
                      {inner}
                    </Link>
                  );
                }
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markOneRead(n.id)}
                    className="w-full text-left cursor-pointer"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
