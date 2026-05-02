"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "./formatters";

/**
 * Live-updating relative timestamp.
 *
 * Returns a human-readable "5 mins ago" string that re-formats every 30s,
 * matching the legacy `setInterval(..., 30000)` mechanic in apps/web/crm.js
 * (commit 42511e5). Cleans up its interval on unmount.
 */
export function useLiveTime(date: string | Date | null | undefined): string {
  const iso = date instanceof Date ? date.toISOString() : (date ?? null);
  // Empty initial value so SSR and first client render match. formatRelativeTime
  // calls `new Date()`, which gives different strings on server vs client and
  // would otherwise trip React's hydration check (#418). The real label snaps
  // in on the first effect tick after hydration.
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    // Re-format immediately when iso changes, then poll every 30s. Matches the
    // legacy 30s tick cadence in apps/web/crm.js (commit 42511e5).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(formatRelativeTime(iso));
    if (!iso) return;
    const id = setInterval(() => {
      setLabel(formatRelativeTime(iso));
    }, 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return label;
}
