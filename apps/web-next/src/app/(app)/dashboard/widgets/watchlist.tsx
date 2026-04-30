"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";
import { WatchlistAddModal } from "./watchlist-add-modal";

// Ported from apps/web/js/widgets/watchlist.js. Needs the /api/watchlist
// endpoint added on main in c9dcc6d.
type WatchItem = {
  id: string;
  companyName: string;
  industry?: string;
  notes?: string;
};

export function WatchlistWidget() {
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await api.get<{ items?: WatchItem[] }>("/watchlist");
      setItems(data?.items || []);
    } catch (err) {
      console.warn("[dashboard/watchlist] failed to load watchlist:", err);
      setError(true);
    }
  }, []);

  useEffect(() => {
    // load() awaits an async fetch — its setStates happen in deferred
    // callbacks, not synchronously during the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/watchlist/${id}`);
      load();
    } catch (err) {
      console.warn("[dashboard/watchlist] failed to delete watchlist item:", err);
      setError(true);
    }
  };

  return (
    <>
      <WidgetShell
        title="Watchlist"
        icon="visibility"
        headerRight={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="text-xs font-bold text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">add</span> Add
          </button>
        }
      >
        {error ? (
          <WidgetError message="Could not load watchlist" />
        ) : !items ? (
          <WidgetLoading />
        ) : items.length === 0 ? (
          <WidgetEmpty message="No companies watched yet" icon="visibility" />
        ) : (
          <div className="p-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#003366" }}
                >
                  <span className="material-symbols-outlined text-white text-[18px]">visibility</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{item.companyName}</p>
                  <p className="text-xs text-text-muted truncate">{item.industry || item.notes || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-500 p-1"
                  title="Remove"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </WidgetShell>
      <WatchlistAddModal open={modalOpen} onClose={() => setModalOpen(false)} onAdded={load} />
    </>
  );
}
