"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_VISIBLE, WIDGETS, WidgetId } from "./registry";

const STORAGE_KEY = "pe-dashboard-widget-visibility";

// Persist the set of visible optional-widget IDs in localStorage, per-browser.
// Matches the legacy key in apps/web/dashboard.js but stores a pure array of
// widget IDs rather than the HTML-specific "order + visibility" map.
export function useVisibleWidgets() {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => new Set(DEFAULT_VISIBLE));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id): id is WidgetId => WIDGETS.some((w) => w.id === id));
          setVisible(new Set(valid));
        }
      }
    } catch {
      // ignore malformed / disabled localStorage
    }
    setLoaded(true);
  }, []);

  const persist = useCallback((set: Set<WidgetId>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch {
      // ignore quota / disabled
    }
  }, []);

  const toggle = useCallback(
    (id: WidgetId) => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const orderedVisible = useMemo(
    () => WIDGETS.filter((w) => visible.has(w.id)),
    [visible],
  );

  return { visible, toggle, orderedVisible, loaded };
}
