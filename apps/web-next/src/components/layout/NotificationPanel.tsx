"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationCount } from "@/providers/NotificationCountProvider";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

// ── Types ────────────────────────────────────────────────────────────────────

type NotificationType =
  | "DEAL_UPDATE"
  | "DOCUMENT_UPLOADED"
  | "MENTION"
  | "AI_INSIGHT"
  | "TASK_ASSIGNED"
  | "COMMENT"
  | "SYSTEM"
  | "STAGE_CHANGE"
  | "FINANCIAL_READY"
  | "INVITATION";

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

type FilterTab = "all" | "unread" | "ai" | "team";
type TimeGroup = "Today" | "Yesterday" | "This Week" | "This Month" | "Older";

// ── Notification type config (10 types, matching legacy) ─────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: string; color: string; bg: string; label: string }
> = {
  DEAL_UPDATE:       { icon: "trending_up",     color: "#003366", bg: "#E6EEF5", label: "Deal" },
  DOCUMENT_UPLOADED: { icon: "upload_file",     color: "#2563EB", bg: "#EFF6FF", label: "Document" },
  MENTION:           { icon: "alternate_email", color: "#7C3AED", bg: "#F5F3FF", label: "Mention" },
  AI_INSIGHT:        { icon: "auto_awesome",    color: "#D97706", bg: "#FFFBEB", label: "AI" },
  TASK_ASSIGNED:     { icon: "task_alt",        color: "#059669", bg: "#ECFDF5", label: "Task" },
  COMMENT:           { icon: "comment",         color: "#0891B2", bg: "#ECFEFF", label: "Comment" },
  SYSTEM:            { icon: "info",            color: "#6B7280", bg: "#F3F4F6", label: "System" },
  STAGE_CHANGE:      { icon: "swap_horiz",      color: "#003366", bg: "#E6EEF5", label: "Stage" },
  FINANCIAL_READY:   { icon: "table_chart",     color: "#059669", bg: "#ECFDF5", label: "Financial" },
  INVITATION:        { icon: "mail",            color: "#7C3AED", bg: "#F5F3FF", label: "Invite" },
};

function getTypeConfig(type: NotificationType) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.SYSTEM;
}

// ── Time grouping ────────────────────────────────────────────────────────────

const TIME_GROUP_ORDER: TimeGroup[] = [
  "Today", "Yesterday", "This Week", "This Month", "Older",
];

function getTimeGroup(dateStr: string): TimeGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && date.toDateString() === now.toDateString()) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  if (diffDays < 30) return "This Month";
  return "Older";
}

function groupNotifications(
  list: NotificationItem[],
): Map<TimeGroup, NotificationItem[]> {
  const groups = new Map<TimeGroup, NotificationItem[]>();
  for (const n of list) {
    const group = getTimeGroup(n.createdAt);
    const existing = groups.get(group);
    if (existing) {
      existing.push(n);
    } else {
      groups.set(group, [n]);
    }
  }
  const sorted = new Map<TimeGroup, NotificationItem[]>();
  for (const key of TIME_GROUP_ORDER) {
    const items = groups.get(key);
    if (items) sorted.set(key, items);
  }
  return sorted;
}

// ── Filter logic ─────────────────────────────────────────────────────────────

const AI_TYPES: NotificationType[] = ["AI_INSIGHT", "FINANCIAL_READY"];
const TEAM_TYPES: NotificationType[] = [
  "MENTION", "COMMENT", "TASK_ASSIGNED", "INVITATION",
];

function filterNotifications(
  list: NotificationItem[],
  filter: FilterTab,
): NotificationItem[] {
  switch (filter) {
    case "unread": return list.filter((n) => !n.isRead);
    case "ai":     return list.filter((n) => AI_TYPES.includes(n.type));
    case "team":   return list.filter((n) => TEAM_TYPES.includes(n.type));
    default:       return list;
  }
}

const EMPTY_MESSAGES: Record<FilterTab, { title: string; sub: string }> = {
  all:    { title: "No notifications yet",      sub: "Notifications will appear here as your deals progress" },
  unread: { title: "You're all caught up!",     sub: "No unread notifications" },
  ai:     { title: "No AI notifications yet",   sub: "AI insights will appear here when available" },
  team:   { title: "No team notifications yet", sub: "Mentions, comments, and tasks will show here" },
};

const POLL_INTERVAL_MS = 30_000;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",    label: "All" },
  { key: "unread", label: "Unread" },
  { key: "ai",     label: "AI" },
  { key: "team",   label: "Team" },
];

// ── Self-contained Notification Center ───────────────────────────────────────
// Renders the bell button (with badge) and, when toggled, the full-height
// slide-out panel. Drop-in replacement for the old NotificationsDropdown.

export function NotificationCenter() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const {
    unreadCount,
    setUnreadCount,
  } = useNotificationCount();

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Data loading ───────────────────────────────────────
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get<NotificationsResponse>(
        `/notifications?userId=${encodeURIComponent(userId)}&limit=50`,
      );
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.warn("[notifications] load failed:", err);
    }
  }, [userId, setUnreadCount]);

  // ── Open / close with animation ────────────────────────
  const handleOpen = useCallback(() => {
    setOpen(true);
    setClosing(false);
    load(); // refresh on open
  }, [load]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 200);
  }, []);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  // Lock scrolling while the notification panel is open.
  // Setting body overflow to hidden prevents page-level scroll, but on
  // pages that use inner scroll containers (e.g. the deal detail page's
  // overflow-y-auto panels) wheel events still reach those containers
  // through the fixed overlay. A document-level wheel capture handler
  // blocks all scroll-through so the user can only scroll the panel itself.
  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = "hidden";

    const blockWheel = (e: WheelEvent) => {
      // Allow scrolling inside the notification panel itself
      if (panelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener("wheel", blockWheel, { passive: false, capture: true });

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("wheel", blockWheel, { capture: true } as EventListenerOptions);
    };
  }, [open]);

  // ── Mark all read ──────────────────────────────────────
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

  // ── Mark single read ──────────────────────────────────
  const markOneRead = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (!target || target.isRead) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/notifications/${id}`, { isRead: true });
    } catch (err) {
      console.warn("[notifications] mark-read failed:", err);
    }
  };

  const filtered = filterNotifications(notifications, activeFilter);
  const groups = groupNotifications(filtered);
  const emptyMsg = EMPTY_MESSAGES[activeFilter];

  return (
    <>
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center justify-center rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-primary-light transition-colors relative"
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-[20px]">
          notifications
        </span>
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border border-white text-white text-[10px] font-bold flex items-center justify-center"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Slide-out panel + overlay */}
      {open && (
        <>
          {/* Overlay -- onWheel + onTouchMove prevent scroll bleed-through
              to underlying scrollable containers (e.g. deal detail panels). */}
          <div
            className={cn(
              "fixed inset-0 z-[10000] bg-black/40 backdrop-blur-md overscroll-contain",
              closing
                ? "animate-[fadeOut_0.2s_ease-in_forwards]"
                : "animate-[fadeIn_0.2s_ease-out]",
            )}
            data-modal-overlay
            onClick={handleClose}
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className={cn(
              "fixed top-0 right-0 bottom-0 z-[10001] w-[420px] max-w-full",
              "bg-white border-l border-border-subtle flex flex-col",
              "shadow-[-8px_0_24px_rgba(0,0,0,0.1)]",
              closing
                ? "animate-[slideOut_0.2s_ease-in_forwards]"
                : "animate-[slideIn_0.25s_cubic-bezier(0.16,1,0.3,1)]",
            )}
          >
            {/* Header */}
            <div className="shrink-0 border-b border-border-subtle">
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-text-main">
                    Notifications
                  </h2>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-bold text-white bg-primary rounded-full px-2 py-0.5 min-w-[20px] text-center">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-semibold text-primary hover:bg-primary-light px-2 py-1 rounded-md transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-1 text-text-muted hover:text-text-secondary hover:bg-gray-100 rounded-md transition-colors"
                    aria-label="Close notifications"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      close
                    </span>
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveFilter(tab.key)}
                    className={cn(
                      "flex-1 py-2.5 text-xs font-semibold text-center border-b-2 transition-colors",
                      activeFilter === tab.key
                        ? "text-primary border-primary"
                        : "text-text-muted border-transparent hover:text-text-secondary",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-5 text-text-muted">
                  <span className="material-symbols-outlined text-[40px] mb-2 opacity-40">
                    notifications_off
                  </span>
                  <p className="text-sm">{emptyMsg.title}</p>
                  <p className="text-[11px] mt-1">{emptyMsg.sub}</p>
                </div>
              ) : (
                Array.from(groups.entries()).map(([groupLabel, items]) => (
                  <div key={groupLabel}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted px-5 py-3 bg-[#FAFAFA] border-b border-gray-100 sticky top-0 z-[1]">
                      {groupLabel}
                    </div>
                    {items.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        onRead={markOneRead}
                        onClose={handleClose}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  notification: n,
  onRead,
  onClose,
}: {
  notification: NotificationItem;
  onRead: (id: string) => void;
  onClose: () => void;
}) {
  const cfg = getTypeConfig(n.type);
  const isUnread = !n.isRead;

  const handleClick = () => {
    onRead(n.id);
    if (n.dealId) onClose();
  };

  const inner = (
    <div
      className={cn(
        "flex items-start gap-3 px-5 py-3.5 border-b border-gray-100",
        "transition-colors cursor-pointer relative",
        isUnread ? "bg-[#F0F5FA] hover:bg-primary-light" : "hover:bg-gray-50",
      )}
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        <span className="material-symbols-outlined text-[18px]">
          {cfg.icon}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-[13px] text-text-main leading-snug line-clamp-2",
            isUnread ? "font-bold" : "font-medium",
          )}
        >
          {n.title}
        </p>
        {n.message && (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
            {n.message}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-muted">
          <span>{formatRelativeTime(n.createdAt)}</span>
          {n.Deal?.name && (
            <>
              <span>·</span>
              <span className="text-primary font-semibold">
                {n.Deal.name}
              </span>
            </>
          )}
          <span>·</span>
          <span className="text-[10px] font-semibold text-text-secondary bg-gray-100 rounded px-1.5 py-px">
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div className="absolute top-[18px] right-5 w-2 h-2 rounded-full bg-primary" />
      )}
    </div>
  );

  if (n.dealId) {
    return (
      <Link
        href={`/deals/${n.dealId}`}
        onClick={handleClick}
        className="block"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className="w-full text-left">
      {inner}
    </button>
  );
}
