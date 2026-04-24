"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthProvider";

interface NotificationCountContextType {
  unreadCount: number;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;
  refresh: () => Promise<void>;
}

const NotificationCountContext = createContext<NotificationCountContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  refresh: async () => {},
});

const POLL_INTERVAL_MS = 30_000;

/**
 * Provides the unread notification count to the entire app tree.
 * NotificationPanel and Sidebar both consume this so the badge / dot
 * stay in sync without duplicating polling logic.
 */
export function NotificationCountProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.get<{ unreadCount: number }>(
        `/notifications?userId=${encodeURIComponent(userId)}&limit=1`,
      );
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // swallow -- polling failures are not critical
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, refresh]);

  return (
    <NotificationCountContext.Provider value={{ unreadCount, setUnreadCount, refresh }}>
      {children}
    </NotificationCountContext.Provider>
  );
}

export function useNotificationCount() {
  return useContext(NotificationCountContext);
}
