"use client";

import { useEffect, useRef, useState } from "react";
import { WIDGETS, WidgetId, CoreWidgetId, CORE_WIDGETS } from "./registry";
import { useToast } from "@/providers/ToastProvider";

// ---------------------------------------------------------------------------
// Category configuration — matches dashboard-widgets.js CATEGORY_LABELS
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, { name: string; icon: string }> = {
  core:         { name: "Core Widgets", icon: "dashboard" },
  ai:           { name: "AI-Powered", icon: "auto_awesome" },
  productivity: { name: "Productivity", icon: "task_alt" },
  deals:        { name: "Deal Flow & Pipeline", icon: "work" },
  portfolio:    { name: "Portfolio & Fund", icon: "account_balance" },
  market:       { name: "Market & Research", icon: "insights" },
  team:         { name: "Team & Contacts", icon: "groups" },
  documents:    { name: "Documents & Alerts", icon: "folder" },
};

// Map each optional widget id to a category (mirrors dashboard-widgets.js WIDGET_CONFIG)
const WIDGET_CATEGORY: Record<WidgetId, string> = {
  "quick-actions":      "productivity",
  "quick-notes":        "productivity",
  "upcoming-deadlines": "productivity",
  "calendar":           "productivity",
  "deal-funnel":        "deals",
  "recent-activity":    "deals",
  "watchlist":          "deals",
  "key-contacts":       "team",
  "team-performance":   "team",
  "document-alerts":    "documents",
  "market-multiples":   "market",
};

// Core widgets that are not "coming soon" have CoreWidgetId; "market-sentiment"
// is a special entry in CORE_WIDGETS that has no CoreWidgetId counterpart.
type CoreOrComingSoonId = CoreWidgetId | "market-sentiment";

const CATEGORY_ORDER = ["core", "ai", "productivity", "deals", "portfolio", "market", "team", "documents"];

// ---------------------------------------------------------------------------
// Unified entry type covering both core and optional widgets in the modal
// ---------------------------------------------------------------------------
interface ModalEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  isCore: boolean;
  comingSoon?: boolean;
}

// Build the full list of entries the modal should show, in legacy order.
function buildModalEntries(): ModalEntry[] {
  const entries: ModalEntry[] = [];

  // Core widgets (stats-cards through ai-deal-signals + market-sentiment)
  CORE_WIDGETS.forEach((w) => {
    // ai-deal-signals and market-sentiment go into "ai" category;
    // everything else is "core".
    const isAi = w.id === "ai-deal-signals" || w.id === "market-sentiment";
    entries.push({
      id: w.id,
      title: w.title,
      description: w.description,
      icon: w.icon,
      category: isAi ? "ai" : "core",
      isCore: true,
      comingSoon: w.comingSoon,
    });
  });

  // Optional sidebar widgets
  WIDGETS.forEach((w) => {
    entries.push({
      id: w.id,
      title: w.title,
      description: w.description,
      icon: w.icon,
      category: WIDGET_CATEGORY[w.id] || "productivity",
      isCore: false,
    });
  });

  return entries;
}

const ALL_ENTRIES = buildModalEntries();

// ---------------------------------------------------------------------------
// Draft state holds both core and optional visibility as string sets so we
// can handle them uniformly in the UI.
// ---------------------------------------------------------------------------
interface DraftState {
  core: Set<CoreOrComingSoonId>;
  optional: Set<WidgetId>;
  /** Ordered list of reorderable core IDs (excludes coming-soon entries) */
  coreOrder: CoreWidgetId[];
}

// The reorderable core categories — entries in these categories can be dragged
// to change their display position on the dashboard.
const REORDERABLE_CATEGORIES = new Set(["core", "ai"]);

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
              {orderedReorderable.map((entry, idx) => {
                const isOn = isEntryOn(entry);
                const isDragTarget = dragOver === entry.id;
                return (
                  <div
                    key={entry.id}
                    draggable
                    onDragStart={() => handleDragStart(entry.id)}
                    onDragOver={(e) => handleDragOver(e, entry.id)}
                    onDrop={() => handleDrop(entry.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                      isDragTarget
                        ? "border-primary bg-primary-light/50 scale-[1.01]"
                        : isOn
                          ? "border-primary bg-primary-light/30"
                          : "border-border-subtle hover:border-primary/50"
                    }`}
                  >
                    {/* Drag handle */}
                    <span
                      className="material-symbols-outlined text-[18px] text-text-muted cursor-grab active:cursor-grabbing shrink-0 select-none"
                      title="Drag to reorder"
                    >
                      drag_indicator
                    </span>

                    {/* Checkbox + content — click area */}
                    <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                        checked={isOn}
                        onChange={() => toggleDraft(entry)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[18px] ${isOn ? "text-primary" : "text-text-muted"}`}>
                            {entry.icon}
                          </span>
                          <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
                          {entry.category === "ai" && (
                            <span className="text-[10px] bg-primary-light text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                              AI
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
                      </div>
                    </label>

                    {/* Up / down arrow buttons — keyboard-accessible fallback */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveCore(entry.id, "up")}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-gray-100 text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-default transition-colors"
                        aria-label={`Move ${entry.title} up`}
                      >
                        <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCore(entry.id, "down")}
                        disabled={idx === orderedReorderable.length - 1}
                        className="p-0.5 rounded hover:bg-gray-100 text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-default transition-colors"
                        aria-label={`Move ${entry.title} down`}
                      >
                        <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Coming-soon entries — shown at bottom, not draggable */}
              {comingSoonEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 p-3 rounded-lg border border-border-subtle opacity-60"
                >
                  <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0 select-none">drag_indicator</span>
                  <label className="flex items-center gap-3 flex-1 min-w-0 cursor-default">
                    <input
                      type="checkbox"
                      className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                      checked={false}
                      disabled
                      onChange={() => undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-text-muted">{entry.icon}</span>
                        <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
                        <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-medium shrink-0">
                          Soon
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
                    </div>
                  </label>
                  <div className="w-8" />
                </div>
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
                    {nonCoreGrouped[cat].map((entry) => {
                      const isOn = isEntryOn(entry);
                      const disabled = !!entry.comingSoon;
                      return (
                        <label
                          key={entry.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
                            disabled
                              ? "border-border-subtle opacity-60 cursor-default"
                              : isOn
                                ? "border-primary bg-primary-light/30 cursor-pointer"
                                : "border-border-subtle hover:border-primary/50 cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={isOn}
                            disabled={disabled}
                            onChange={() => toggleDraft(entry)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`material-symbols-outlined text-[18px] ${isOn && !disabled ? "text-primary" : "text-text-muted"}`}>
                                {entry.icon}
                              </span>
                              <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
                              {disabled && (
                                <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-medium shrink-0">
                                  Soon
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
                          </div>
                        </label>
                      );
                    })}
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
