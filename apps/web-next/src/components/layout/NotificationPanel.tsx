"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationCount } from "@/providers/NotificationCountProvider";
import {
  type NotificationItem,
  type NotificationsResponse,
  type FilterTab,
  EMPTY_MESSAGES,
  groupNotifications,
  filterNotifications,
} from "./notification-utils";
import { NotificationDropdownPreview } from "./NotificationDropdownPreview";
import { NotificationSlideOut } from "./NotificationSlideOut";

// ── NotificationCenter ───────────────────────────────────────────────────────
// Renders the bell button (with badge). Clicking the bell opens a small
// dropdown (preview list); the dropdown's "View all" link expands into a
// full-height slide-out panel with tabs, time-grouping, dismiss, etc.
//
// File-size budget: this orchestrator stays thin (under 250 lines). The
// dropdown preview and slide-out chrome each live in their own files.

export function NotificationCenter() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { unreadCount, setUnreadCount } = useNotificationCount();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────
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

  // Eager load once the user is signed in. Lazy-loading on bell click made the
  // first interaction feel sluggish — we'd round-trip /notifications?limit=50
  // before showing any content. Doing it once at mount means the dropdown is
  // populated by the time the bell is clicked. Subsequent opens still re-load
  // so freshly-arrived items show.
  useEffect(() => {
    if (!userId) return;
    // load() is async — its setStates fire from deferred callbacks, not
    // synchronously inside this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [userId, load]);

  useEffect(() => {
    // Same as above — async load, deferred setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dropdownOpen || panelOpen) load();
  }, [dropdownOpen, panelOpen, load]);

  // Outside-click closes the dropdown (but never the slide-out — that has its
  // own backdrop)
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // ── Slide-out open/close ─────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    setDropdownOpen(false);
    setPanelOpen(true);
    setClosing(false);
  }, []);

  const closePanel = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setPanelOpen(false);
    }, 200);
  }, []);

  // Esc closes the slide-out
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [panelOpen, closePanel]);

  // Lock body scroll while the slide-out is open. Wheel events still bleed
  // into nested overflow-y-auto containers (e.g. deal detail panels) through
  // the fixed overlay, so we capture wheel at document level and only allow
  // it inside the panel itself.
  useEffect(() => {
    if (!panelOpen) return;
    document.body.style.overflow = "hidden";
    const blockWheel = (e: WheelEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("wheel", blockWheel, { capture: true } as EventListenerOptions);
    };
  }, [panelOpen]);

  // ── Mutations ────────────────────────────────────────────────────────────
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

  const dismissOne = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (!target) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!target.isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    try {
      await api.delete(`/notifications/${id}`);
    } catch (err) {
      console.warn("[notifications] dismiss failed:", err);
    }
  };

  const filtered = filterNotifications(notifications, activeFilter);
  const groups = groupNotifications(filtered);
  const emptyMsg = EMPTY_MESSAGES[activeFilter];

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        className="flex items-center justify-center rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-primary-light transition-colors relative"
        aria-label="Notifications"
        aria-expanded={dropdownOpen}
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

      {/* Compact dropdown — preview only, with View all → slide-out */}
      {dropdownOpen && (
        <NotificationDropdownPreview
          notifications={notifications}
          unreadCount={unreadCount}
          onClose={() => setDropdownOpen(false)}
          onViewAll={openPanel}
          onItemClick={(id) => {
            markOneRead(id);
            setDropdownOpen(false);
          }}
        />
      )}

      {/* Slide-out panel + backdrop */}
      {panelOpen && createPortal(
        <NotificationSlideOut
          panelRef={panelRef}
          closing={closing}
          unreadCount={unreadCount}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          groups={groups}
          filteredCount={filtered.length}
          emptyMsg={emptyMsg}
          onClose={closePanel}
          onMarkAllRead={markAllRead}
          onItemClick={(id) => {
            markOneRead(id);
          }}
          onItemDismiss={dismissOne}
          onItemNavigate={closePanel}
        />,
        document.body,
      )}
    </div>
  );
}
