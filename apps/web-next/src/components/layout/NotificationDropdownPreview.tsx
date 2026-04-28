"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  type NotificationItem,
  getTypeConfig,
  getNotificationLink,
} from "./notification-utils";

// Compact dropdown that opens from the bell button. Shows a 5-item preview
// with a "View all" footer that swaps in the full slide-out panel.

export function NotificationDropdownPreview({
  notifications,
  unreadCount,
  onClose,
  onViewAll,
  onItemClick,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onClose: () => void;
  onViewAll: () => void;
  onItemClick: (id: string) => void;
}) {
  const preview = notifications.slice(0, 5);
  return (
    <div
      className="absolute right-0 top-full mt-2 w-96 max-h-[calc(100vh-5rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden dropdown-animate"
      role="menu"
    >
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">notifications</span>
          <h3 className="font-bold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-white text-xs font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          aria-label="Close notifications"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <span className="material-symbols-outlined text-4xl mb-2">notifications_off</span>
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">You&apos;re all caught up!</p>
          </div>
        ) : (
          preview.map((n) => (
            <PreviewRow key={n.id} notification={n} onClick={() => onItemClick(n.id)} />
          ))
        )}
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5 flex items-center justify-center">
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm font-semibold hover:underline flex items-center gap-1"
          style={{ color: "#003366" }}
        >
          View all
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

function PreviewRow({
  notification: n,
  onClick,
}: {
  notification: NotificationItem;
  onClick: () => void;
}) {
  const cfg = getTypeConfig(n.type);
  const isUnread = !n.isRead;
  const target = getNotificationLink(n);
  const inner = (
    <div
      className={cn(
        "flex items-start gap-3 p-4 hover:bg-gray-50 border-b border-gray-100 transition-colors",
        isUnread && "bg-primary-light/30",
      )}
    >
      <div
        className="size-10 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        <span className="material-symbols-outlined">{cfg.icon}</span>
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
            <div
              className="size-2 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: "#003366" }}
            />
          )}
        </div>
        {n.message && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-400">{formatRelativeTime(n.createdAt)}</span>
          {n.Deal?.name && (
            <>
              <span className="text-[10px] text-gray-400">&bull;</span>
              <span
                className="text-[10px] font-medium"
                style={{ color: "#003366" }}
              >
                {n.Deal.name}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (target) {
    return (
      <Link href={target} onClick={onClick} className="block cursor-pointer">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="w-full text-left cursor-pointer">
      {inner}
    </button>
  );
}
