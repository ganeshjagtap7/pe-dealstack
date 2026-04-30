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
  const [label, setLabel] = useState(() => formatRelativeTime(iso));

  useEffect(() => {
    // Re-format immediately when iso changes, then poll every 30s. Both
    // setLabel calls produce render-cycle work (the immediate one is the
    // sync one — but it only fires when iso changes, not on every render,
    // and matches the legacy 30s tick cadence). The interval callback is
    // deferred, not a sync setState during effect.
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
