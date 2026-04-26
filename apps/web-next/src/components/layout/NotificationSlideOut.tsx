"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  type NotificationItem,
  type FilterTab,
  FILTER_TABS,
  getTypeConfig,
  getNotificationLink,
} from "./notification-utils";

// Full-height slide-out panel anchored to the right edge. Renders the
// backdrop, header (title + count badge + close), filter tabs, the grouped
// list, and a footer with "Mark all as read".

export function NotificationSlideOut({
  panelRef,
  closing,
  unreadCount,
  activeFilter,
  setActiveFilter,
  groups,
  filteredCount,
  emptyMsg,
  onClose,
  onMarkAllRead,
  onItemClick,
  onItemDismiss,
  onItemNavigate,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  closing: boolean;
  unreadCount: number;
  activeFilter: FilterTab;
  setActiveFilter: (f: FilterTab) => void;
  groups: Map<string, NotificationItem[]>;
  filteredCount: number;
  emptyMsg: { title: string; sub: string };
  onClose: () => void;
  onMarkAllRead: () => void;
  onItemClick: (id: string) => void;
  onItemDismiss: (id: string) => void;
  onItemNavigate: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[10000] bg-black/40 backdrop-blur-md overscroll-contain",
          closing
            ? "animate-[fadeOut_0.2s_ease-in_forwards]"
            : "animate-[fadeIn_0.2s_ease-out]",
        )}
        data-modal-overlay
        onClick={onClose}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
        aria-hidden="true"
      />

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
        role="dialog"
        aria-label="Notifications"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text-main">Notifications</h2>
              {unreadCount > 0 && (
                <span
                  className="text-[11px] font-bold text-white rounded-full px-2 py-0.5 min-w-[20px] text-center"
                  style={{ backgroundColor: "#003366" }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-secondary hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Close notifications"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
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
                    ? "border-primary"
                    : "text-text-muted border-transparent hover:text-text-secondary",
                )}
                style={
                  activeFilter === tab.key
                    ? { color: "#003366", borderBottomColor: "#003366" }
                    : undefined
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredCount === 0 ? (
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
                    onRead={onItemClick}
                    onDismiss={onItemDismiss}
                    onNavigate={onItemNavigate}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer — Mark all as read */}
        <div className="shrink-0 border-t border-border-subtle px-5 py-3 flex items-center justify-between bg-[#FAFAFA]">
          <span className="text-xs text-text-muted">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "All caught up"}
          </span>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-md transition-colors",
              unreadCount === 0
                ? "text-text-muted cursor-not-allowed"
                : "text-white hover:opacity-90",
            )}
            style={
              unreadCount === 0
                ? undefined
                : { backgroundColor: "#003366" }
            }
          >
            Mark all as read
          </button>
        </div>
      </div>
    </>
  );
}

// ── Single slide-out row ─────────────────────────────────────────────────────

function NotificationRow({
  notification: n,
  onRead,
  onDismiss,
  onNavigate,
}: {
  notification: NotificationItem;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onNavigate: () => void;
}) {
  const cfg = getTypeConfig(n.type);
  const isUnread = !n.isRead;
  const target = getNotificationLink(n);

  const handleClick = () => {
    onRead(n.id);
    if (target) onNavigate();
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss(n.id);
  };

  const inner = (
    <div
      className={cn(
        "group flex items-start gap-3 px-5 py-3.5 border-b border-gray-100",
        "transition-colors cursor-pointer relative",
        isUnread ? "bg-[#F0F5FA] hover:bg-[#E6EEF5]" : "hover:bg-gray-50",
      )}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        <span className="material-symbols-outlined text-[18px]">{cfg.icon}</span>
      </div>

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
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{n.message}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-muted">
          <span>{formatRelativeTime(n.createdAt)}</span>
          {n.Deal?.name && (
            <>
              <span>&middot;</span>
              <span className="font-semibold" style={{ color: "#003366" }}>
                {n.Deal.name}
              </span>
            </>
          )}
          <span>&middot;</span>
          <span className="text-[10px] font-semibold text-text-secondary bg-gray-100 rounded px-1.5 py-px">
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Dismiss button — visible on hover */}
      <button
        type="button"
        onClick={handleDismiss}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-md self-start"
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>

      {isUnread && (
        <div
          className="absolute top-[18px] right-10 w-2 h-2 rounded-full"
          style={{ backgroundColor: "#003366" }}
        />
      )}
    </div>
  );

  if (target) {
    return (
      <Link href={target} onClick={handleClick} className="block">
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
