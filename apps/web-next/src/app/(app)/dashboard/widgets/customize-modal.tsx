"use client";

import { useEffect, useRef, useState } from "react";
import { WIDGETS, WidgetId, CoreWidgetId, CORE_WIDGETS } from "./registry";
import { useToast } from "@/providers/ToastProvider";
import {
  ALL_ENTRIES, CATEGORY_LABELS, CATEGORY_ORDER,
  CoreOrComingSoonId, DraftState, ModalEntry, REORDERABLE_CATEGORIES,
} from "./customize-modal.entries";
import {
  ComingSoonEntryRow, NonCoreEntryRow, ReorderableEntryRow,
} from "./customize-modal.row";

// ---------------------------------------------------------------------------
// Customize Dashboard modal — shows ALL widgets including core sections.
// Matches apps/web/dashboard-widgets.js openWidgetModal() full widget list.
// ---------------------------------------------------------------------------
export function CustomizeDashboardModal({
  open,
  visible,
  coreVisible,
  coreOrder: savedCoreOrder,
  onToggle,
  onToggleCore,
  onReorderCore,
  onClose,
}: {
  open: boolean;
  visible: Set<WidgetId>;
  coreVisible: Set<CoreWidgetId>;
  coreOrder: CoreWidgetId[];
  onToggle: (id: WidgetId) => void;
  onToggleCore: (id: CoreWidgetId) => void;
  onReorderCore: (ids: CoreWidgetId[]) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  // Local draft state so the user can Cancel without saving
  const [draft, setDraft] = useState<DraftState>({
    core: new Set(coreVisible) as Set<CoreOrComingSoonId>,
    optional: new Set(visible),
    coreOrder: savedCoreOrder,
  });

  // Drag state for reordering core widgets inside the modal
  const dragIdRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Reset draft from props each time the modal opens — local edits are
  // discarded when the user closes/reopens. This is intentionally a sync
  // (not a remount), since the modal stays mounted to keep its DOM.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({
        core: new Set(coreVisible) as Set<CoreOrComingSoonId>,
        optional: new Set(visible),
        coreOrder: savedCoreOrder,
      });
    }
  }, [open, visible, coreVisible, savedCoreOrder]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Build the ordered list of reorderable entries.
  // All non-coming-soon core/ai entries are reorderable; their display order
  // in the modal follows draft.coreOrder.
  // ---------------------------------------------------------------------------
  const allReorderableEntries: ModalEntry[] = ALL_ENTRIES.filter(
    (e) => REORDERABLE_CATEGORIES.has(e.category) && !e.comingSoon,
  );

  // Map from id -> entry for fast lookup
  const reorderableById = new Map(allReorderableEntries.map((e) => [e.id, e]));

  // Build ordered list: saved order first, then any not yet in coreOrder
  const orderedReorderable: ModalEntry[] = [];
  const seen = new Set<string>();
  for (const id of draft.coreOrder) {
    const e = reorderableById.get(id);
    if (e) { orderedReorderable.push(e); seen.add(id); }
  }
  for (const e of allReorderableEntries) {
    if (!seen.has(e.id)) orderedReorderable.push(e);
  }

  // Coming-soon entries shown after reorderable ones (not draggable)
  const comingSoonEntries: ModalEntry[] = ALL_ENTRIES.filter(
    (e) => REORDERABLE_CATEGORIES.has(e.category) && e.comingSoon,
  );

  // Non-core categories grouped as before
  const nonCoreGrouped: Record<string, ModalEntry[]> = {};
  ALL_ENTRIES.forEach((entry) => {
    if (REORDERABLE_CATEGORIES.has(entry.category)) return; // handled above
    if (!nonCoreGrouped[entry.category]) nonCoreGrouped[entry.category] = [];
    nonCoreGrouped[entry.category].push(entry);
  });

  const isEntryOn = (entry: ModalEntry): boolean => {
    if (entry.comingSoon) return false;
    if (entry.isCore) return draft.core.has(entry.id as CoreOrComingSoonId);
    return draft.optional.has(entry.id as WidgetId);
  };

  const toggleDraft = (entry: ModalEntry) => {
    if (entry.comingSoon) return;
    if (entry.isCore) {
      setDraft((prev) => {
        const next = new Set(prev.core);
        const id = entry.id as CoreOrComingSoonId;
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...prev, core: next };
      });
    } else {
      setDraft((prev) => {
        const next = new Set(prev.optional);
        const id = entry.id as WidgetId;
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...prev, optional: next };
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Reorder helpers
  // ---------------------------------------------------------------------------
  const moveCore = (id: string, direction: "up" | "down") => {
    setDraft((prev) => {
      const ids = [...orderedReorderable.map((e) => e.id)];
      const idx = ids.indexOf(id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= ids.length) return prev;
      const next = [...ids];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return { ...prev, coreOrder: next as CoreWidgetId[] };
    });
  };

  const handleDragStart = (id: string) => {
    dragIdRef.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOver(id);
  };

  const handleDrop = (targetId: string) => {
    const sourceId = dragIdRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragOver(null);
      dragIdRef.current = null;
      return;
    }
    setDraft((prev) => {
      const ids = [...orderedReorderable.map((e) => e.id)];
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      return { ...prev, coreOrder: next as CoreWidgetId[] };
    });
    setDragOver(null);
    dragIdRef.current = null;
  };

  const handleDragEnd = () => {
    setDragOver(null);
    dragIdRef.current = null;
  };

  const handleSave = () => {
    // Apply diff for core widgets
    CORE_WIDGETS.forEach((w) => {
      if (w.comingSoon) return;
      const id = w.id as CoreWidgetId;
      const wasOn = coreVisible.has(id);
      const nowOn = draft.core.has(id);
      if (wasOn !== nowOn) onToggleCore(id);
    });
    // Apply diff for optional widgets
    WIDGETS.forEach((w) => {
      const wasOn = visible.has(w.id);
      const nowOn = draft.optional.has(w.id);
      if (wasOn !== nowOn) onToggle(w.id);
    });
    // Persist core widget order
    onReorderCore(draft.coreOrder);
    onClose();
    showToast("Dashboard layout saved.", "success", { title: "Layout Saved" });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-fadeIn">
        {/* Header — matches legacy #add-widget-modal header */}
        <div className="p-5 border-b border-border-subtle flex items-center justify-between bg-gradient-to-r from-white to-gray-50">
          <div>
            <h2 className="text-lg font-bold text-text-main">Customize Dashboard</h2>
            <p className="text-xs text-text-secondary mt-0.5">Show, hide, or reorder sections on your dashboard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* ----------------------------------------------------------------
              Reorderable core + AI widgets — rendered as a single ordered
              list with drag handles and up/down arrows.
          ---------------------------------------------------------------- */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
              <span className="material-symbols-outlined text-[18px] text-primary">dashboard</span>
              <h3 className="text-sm font-bold text-text-main uppercase tracking-wide">Core &amp; AI Widgets</h3>
              <span className="ml-auto text-[10px] text-text-muted font-medium bg-gray-100 px-2 py-0.5 rounded">Drag to reorder</span>
            </div>
            <div className="grid gap-2">
              {orderedReorderable.map((entry, idx) => (
                <ReorderableEntryRow
                  key={entry.id}
                  entry={entry}
                  isOn={isEntryOn(entry)}
                  isDragTarget={dragOver === entry.id}
                  isFirst={idx === 0}
                  isLast={idx === orderedReorderable.length - 1}
                  onDragStart={() => handleDragStart(entry.id)}
                  onDragOver={(e) => handleDragOver(e, entry.id)}
                  onDrop={() => handleDrop(entry.id)}
                  onDragEnd={handleDragEnd}
                  onToggle={() => toggleDraft(entry)}
                  onMoveUp={() => moveCore(entry.id, "up")}
                  onMoveDown={() => moveCore(entry.id, "down")}
                />
              ))}

              {/* Coming-soon entries — shown at bottom, not draggable */}
              {comingSoonEntries.map((entry) => (
                <ComingSoonEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>

          {/* ----------------------------------------------------------------
              Non-core optional widget categories — 2-column grid as before
          ---------------------------------------------------------------- */}
          <div className="grid md:grid-cols-2 gap-x-6">
            {CATEGORY_ORDER.filter(
              (cat) => !REORDERABLE_CATEGORIES.has(cat) && nonCoreGrouped[cat]?.length,
            ).map((cat) => {
              const catInfo = CATEGORY_LABELS[cat] || { name: cat, icon: "widgets" };
              return (
                <div key={cat} className="mb-4">
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border-subtle">
                    <span className="material-symbols-outlined text-[18px] text-primary">{catInfo.icon}</span>
                    <h3 className="text-sm font-bold text-text-main uppercase tracking-wide">{catInfo.name}</h3>
                  </div>
                  {/* Widget rows */}
                  <div className="grid gap-2">
                    {nonCoreGrouped[cat].map((entry) => (
                      <NonCoreEntryRow
                        key={entry.id}
                        entry={entry}
                        isOn={isEntryOn(entry)}
                        onToggle={() => toggleDraft(entry)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer — Cancel + Save Changes, matching legacy modal footer */}
        <div className="p-4 border-t border-border-subtle bg-gray-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-text-muted">Widgets marked &ldquo;Soon&rdquo; are coming in future updates</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm"
              style={{ backgroundColor: "#003366" }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
