"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { useToast } from "@/providers/ToastProvider";
import { Builder } from "./Builder";
import { Gallery } from "./Gallery";
import { SEED_GRAPHS } from "./constants";
import { buildFinancials } from "./mockData";
import type { Graph, GraphDraft } from "./types";

type View = { mode: "gallery" } | { mode: "builder"; editing: Graph | null };

export default function GraphsPage() {
  const data = useMemo(() => buildFinancials(), []);
  const { showToast } = useToast();
  const [graphs, setGraphs] = useState<Graph[]>(SEED_GRAPHS);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>({ mode: "gallery" });
  const [deleteTarget, setDeleteTarget] = useState<Graph | null>(null);

  // Hydrate from localStorage on mount; seeds remain only on a fresh load.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.customGraphs);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setGraphs(parsed as Graph[]);
      }
    } catch (err) {
      console.warn("Failed to hydrate custom graphs", err);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist whenever the library changes — but only after hydration so we don't
  // overwrite stored data with the initial seed array on first render.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.customGraphs, JSON.stringify(graphs));
    } catch (err) {
      console.warn("Failed to persist custom graphs", err);
    }
  }, [graphs, hydrated]);

  function handleCreate() {
    setView({ mode: "builder", editing: null });
  }

  function handleEdit(graph: Graph) {
    setView({ mode: "builder", editing: graph });
  }

  function handleDeleteRequest(graph: Graph) {
    setDeleteTarget(graph);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setGraphs((gs) => gs.filter((g) => g.id !== deleteTarget.id));
    showToast(`Deleted "${deleteTarget.title}"`, "success");
    setDeleteTarget(null);
  }

  function handleSave(draft: GraphDraft) {
    const editing = view.mode === "builder" ? view.editing : null;
    setGraphs((gs) => {
      if (editing) {
        return gs.map((g) => (g.id === editing.id ? { ...g, ...draft } : g));
      }
      return [...gs, { id: `g-${Date.now()}`, ...draft }];
    });
    showToast(editing ? "Graph updated" : "Graph saved", "success");
    setView({ mode: "gallery" });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 text-slate-900">
      {view.mode === "gallery" ? (
        <Gallery
          graphs={graphs}
          data={data}
          onCreate={handleCreate}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
        />
      ) : (
        <Builder
          data={data}
          initial={view.editing}
          onCancel={() => setView({ mode: "gallery" })}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete graph?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" will be removed from your library. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
