"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_VISIBLE, WIDGETS, WidgetId } from "./registry";

const STORAGE_KEY = "pe-dashboard-widget-visibility";
// Separate key for user-chosen order (matches WIDGET_ORDER_KEY in
// apps/web/dashboard-widgets.js). Order is independent of visibility.
const ORDER_KEY = "pe-dashboard-widget-order";

// Persist the set of visible optional-widget IDs in localStorage, per-browser.
// Matches the legacy key in apps/web/dashboard.js but stores a pure array of
// widget IDs rather than the HTML-specific "order + visibility" map.
export function useVisibleWidgets() {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => new Set(DEFAULT_VISIBLE));
  const [order, setOrder] = useState<WidgetId[]>([]);
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
    try {
      const rawOrder = localStorage.getItem(ORDER_KEY);
      if (rawOrder) {
        const parsed = JSON.parse(rawOrder);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id): id is WidgetId => WIDGETS.some((w) => w.id === id));
          setOrder(valid);
        }
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const persistVisible = useCallback((set: Set<WidgetId>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch {
      // ignore quota / disabled
    }
  }, []);

  const persistOrder = useCallback((ids: WidgetId[]) => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(
    (id: WidgetId) => {
      setVisible((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistVisible(next);
        return next;
      });
    },
    [persistVisible],
  );

  const reorder = useCallback(
    (ids: WidgetId[]) => {
      setOrder(ids);
      persistOrder(ids);
    },
    [persistOrder],
  );

  // Apply saved order to WIDGETS, keeping unreordered widgets in their
  // original registry position. Mirrors applyWidgetOrder() in main.
  const orderedVisible = useMemo(() => {
    const visibleWidgets = WIDGETS.filter((w) => visible.has(w.id));
    if (order.length === 0) return visibleWidgets;
    const byId = new Map(visibleWidgets.map((w) => [w.id, w]));
    const out: typeof visibleWidgets = [];
    const seen = new Set<WidgetId>();
    for (const id of order) {
      const w = byId.get(id);
      if (w) {
        out.push(w);
        seen.add(id);
      }
    }
    for (const w of visibleWidgets) {
      if (!seen.has(w.id)) out.push(w);
    }
    return out;
  }, [visible, order]);

  return { visible, toggle, orderedVisible, reorder, loaded };
}
