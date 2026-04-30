"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_VISIBLE, WIDGETS, WidgetId, CoreWidgetId, CORE_WIDGETS } from "./registry";

const STORAGE_KEY = "pe-dashboard-widget-visibility";
// Separate key for user-chosen order (matches WIDGET_ORDER_KEY in
// apps/web/dashboard-widgets.js). Order is independent of visibility.
const ORDER_KEY = "pe-dashboard-widget-order";
// Key for core widget visibility (stats-cards, active-priorities, etc.)
const CORE_VISIBILITY_KEY = "pe-dashboard-core-widget-visibility";
// Key for core widget display order
const CORE_ORDER_KEY = "pe-dashboard-core-widget-order";

// All core widget IDs that are on by default
const DEFAULT_CORE_VISIBLE: CoreWidgetId[] = CORE_WIDGETS
  .filter((w) => !w.comingSoon)
  .map((w) => w.id as CoreWidgetId);

// Default core order: all non-coming-soon core widget IDs in registry order
const DEFAULT_CORE_ORDER: CoreWidgetId[] = DEFAULT_CORE_VISIBLE;

// Persist the set of visible optional-widget IDs in localStorage, per-browser.
// Matches the legacy key in apps/web/dashboard.js but stores a pure array of
// widget IDs rather than the HTML-specific "order + visibility" map.
export function useVisibleWidgets() {
  const [visible, setVisible] = useState<Set<WidgetId>>(() => new Set(DEFAULT_VISIBLE));
  const [coreVisible, setCoreVisible] = useState<Set<CoreWidgetId>>(
    () => new Set(DEFAULT_CORE_VISIBLE),
  );
  const [order, setOrder] = useState<WidgetId[]>([]);
  const [coreOrder, setCoreOrder] = useState<CoreWidgetId[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage after mount. Lazy useState initialisers
  // would diverge between SSR (no localStorage) and client first paint —
  // the eslint-disables document that this is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
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
    } catch (err) {
      console.warn("[dashboard/widgets] failed to read widget visibility from localStorage:", err);
    }
    try {
      const rawCore = localStorage.getItem(CORE_VISIBILITY_KEY);
      if (rawCore) {
        const parsed = JSON.parse(rawCore);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id): id is CoreWidgetId =>
            CORE_WIDGETS.some((w) => w.id === id && !w.comingSoon),
          );
          setCoreVisible(new Set(valid));
        }
      }
    } catch (err) {
      console.warn("[dashboard/widgets] failed to read core widget visibility from localStorage:", err);
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
    } catch (err) {
      console.warn("[dashboard/widgets] failed to read widget order from localStorage:", err);
    }
    try {
      const rawCoreOrder = localStorage.getItem(CORE_ORDER_KEY);
      if (rawCoreOrder) {
        const parsed = JSON.parse(rawCoreOrder);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id): id is CoreWidgetId =>
            CORE_WIDGETS.some((w) => w.id === id && !w.comingSoon),
          );
          setCoreOrder(valid);
        }
      }
    } catch (err) {
      console.warn("[dashboard/widgets] failed to read core widget order from localStorage:", err);
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistVisible = useCallback((set: Set<WidgetId>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch (err) {
      console.warn("[dashboard/widgets] failed to persist widget visibility:", err);
    }
  }, []);

  const persistCoreVisible = useCallback((set: Set<CoreWidgetId>) => {
    try {
      localStorage.setItem(CORE_VISIBILITY_KEY, JSON.stringify([...set]));
    } catch (err) {
      console.warn("[dashboard/widgets] failed to persist core widget visibility:", err);
    }
  }, []);

  const persistOrder = useCallback((ids: WidgetId[]) => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
    } catch (err) {
      console.warn("[dashboard/widgets] failed to persist widget order:", err);
    }
  }, []);

  const persistCoreOrder = useCallback((ids: CoreWidgetId[]) => {
    try {
      localStorage.setItem(CORE_ORDER_KEY, JSON.stringify(ids));
    } catch (err) {
      console.warn("[dashboard/widgets] failed to persist core widget order:", err);
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

  const toggleCore = useCallback(
    (id: CoreWidgetId) => {
      setCoreVisible((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persistCoreVisible(next);
        return next;
      });
    },
    [persistCoreVisible],
  );

  const reorder = useCallback(
    (ids: WidgetId[]) => {
      setOrder(ids);
      persistOrder(ids);
    },
    [persistOrder],
  );

  const reorderCore = useCallback(
    (ids: CoreWidgetId[]) => {
      setCoreOrder(ids);
      persistCoreOrder(ids);
    },
    [persistCoreOrder],
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

  // Apply saved order to core widgets. Any core IDs missing from coreOrder
  // fall back to their DEFAULT_CORE_ORDER position.
  const orderedCoreIds = useMemo((): CoreWidgetId[] => {
    if (coreOrder.length === 0) return DEFAULT_CORE_ORDER;
    const seen = new Set<CoreWidgetId>(coreOrder);
    const remaining = DEFAULT_CORE_ORDER.filter((id) => !seen.has(id));
    return [...coreOrder, ...remaining];
  }, [coreOrder]);

  return {
    visible,
    coreVisible,
    toggle,
    toggleCore,
    orderedVisible,
    reorder,
    orderedCoreIds,
    reorderCore,
    loaded,
  };
}
