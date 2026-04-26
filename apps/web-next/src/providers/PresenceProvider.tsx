"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";

// ---------------------------------------------------------------------------
// PresenceProvider
//
// Tracks "who's online" — a user is considered online if their lastActiveAt
// is within the last PRESENCE_WINDOW_MS (5 minutes). Polls every 60s.
//
// NOTE: There is no backend presence endpoint today (`grep -rn "presence|
// lastActive|onlineUsers|heartbeat" apps/api/src/routes/` returns nothing).
// This provider therefore ships with an empty map — every user reads as
// "Offline" until the API is wired up. The polling shell is in place so the
// only follow-up is replacing fetchPresence() with a real call.
//
// TODO(presence): replace fetchPresence() with a call to e.g.
// `GET /presence?orgId=...` returning `{ users: Array<{ id, lastActiveAt }> }`
// once the backend route exists. Also POST a heartbeat from this hook on
// mount + every 60s so the current user's own presence is broadcast.
// Tracked alongside legacy commit 1e843b9.
// ---------------------------------------------------------------------------

export const PRESENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 60_000;

interface PresenceContextType {
  /** Map of userId -> ISO timestamp of last activity (or null/missing if offline). */
  lastActiveByUserId: Record<string, string>;
  /**
   * True when at least one team member (excluding the current viewer) has
   * been active within PRESENCE_WINDOW_MS. Drives the sidebar activity dot.
   */
  teamHasRecentActivity: boolean;
  /** Returns true if the given user has been active within PRESENCE_WINDOW_MS. */
  isOnline: (userId: string | null | undefined) => boolean;
  /** Returns the user's lastActiveAt ISO, or null if unknown. */
  getLastActiveAt: (userId: string | null | undefined) => string | null;
  /** Force-refresh the presence map (called by interaction-driven UI). */
  refresh: () => Promise<void>;
}

const PresenceContext = createContext<PresenceContextType>({
  lastActiveByUserId: {},
  teamHasRecentActivity: false,
  isOnline: () => false,
  getLastActiveAt: () => null,
  refresh: async () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [lastActiveByUserId, setLastActiveByUserId] = useState<Record<string, string>>({});

  const fetchPresence = useCallback(async (): Promise<Record<string, string>> => {
    // TODO(presence): wire up backend. Until then we return an empty map so
    // every team member renders "Offline". DO NOT fake online users here —
    // we want the indicator to read true once the API is live.
    //
    // Example future implementation:
    //   const data = await api.get<{ users: Array<{ id: string; lastActiveAt: string }> }>(
    //     "/presence",
    //   );
    //   return Object.fromEntries(data.users.map((u) => [u.id, u.lastActiveAt]));
    return {};
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await fetchPresence();
      setLastActiveByUserId(next);
    } catch {
      // swallow — presence polling failures are non-critical
    }
  }, [userId, fetchPresence]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, refresh]);

  const isOnline = useCallback(
    (id: string | null | undefined): boolean => {
      if (!id) return false;
      const ts = lastActiveByUserId[id];
      if (!ts) return false;
      const last = new Date(ts).getTime();
      if (Number.isNaN(last)) return false;
      return Date.now() - last < PRESENCE_WINDOW_MS;
    },
    [lastActiveByUserId],
  );

  const getLastActiveAt = useCallback(
    (id: string | null | undefined): string | null => {
      if (!id) return null;
      return lastActiveByUserId[id] ?? null;
    },
    [lastActiveByUserId],
  );

  // teamHasRecentActivity: any user other than the current viewer is online.
  const teamHasRecentActivity = Object.entries(lastActiveByUserId).some(([id, ts]) => {
    if (id === userId) return false;
    const last = new Date(ts).getTime();
    if (Number.isNaN(last)) return false;
    return Date.now() - last < PRESENCE_WINDOW_MS;
  });

  return (
    <PresenceContext.Provider
      value={{
        lastActiveByUserId,
        teamHasRecentActivity,
        isOnline,
        getLastActiveAt,
        refresh,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}

/**
 * Small helper used by tooltips: returns "Online" when the user is active
 * inside PRESENCE_WINDOW_MS, otherwise "Offline X mins ago" / "Offline".
 */
export function formatPresenceStatus(lastActiveAt: string | null | undefined): string {
  if (!lastActiveAt) return "Offline";
  const last = new Date(lastActiveAt).getTime();
  if (Number.isNaN(last)) return "Offline";
  const diffMs = Date.now() - last;
  if (diffMs < PRESENCE_WINDOW_MS) return "Online";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `Offline ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Offline ${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Offline ${days} day${days === 1 ? "" : "s"} ago`;
}
