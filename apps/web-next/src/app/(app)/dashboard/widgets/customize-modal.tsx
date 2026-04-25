"use client";

import { useEffect, useState } from "react";
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
}

// ---------------------------------------------------------------------------
// Customize Dashboard modal — shows ALL widgets including core sections.
// Matches apps/web/dashboard-widgets.js openWidgetModal() full widget list.
// ---------------------------------------------------------------------------
export function CustomizeDashboardModal({
  open,
  visible,
  coreVisible,
  onToggle,
  onToggleCore,
  onClose,
}: {
  open: boolean;
  visible: Set<WidgetId>;
  coreVisible: Set<CoreWidgetId>;
  onToggle: (id: WidgetId) => void;
  onToggleCore: (id: CoreWidgetId) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();

  // Local draft state so the user can Cancel without saving
  const [draft, setDraft] = useState<DraftState>({
    core: new Set(coreVisible) as Set<CoreOrComingSoonId>,
    optional: new Set(visible),
  });

  // Sync draft when modal opens
  useEffect(() => {
    if (open) {
      setDraft({
        core: new Set(coreVisible) as Set<CoreOrComingSoonId>,
        optional: new Set(visible),
      });
    }
  }, [open, visible, coreVisible]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Group all entries by category
  const grouped: Record<string, ModalEntry[]> = {};
  ALL_ENTRIES.forEach((entry) => {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  });

  const isEntryOn = (entry: ModalEntry): boolean => {
    if (entry.comingSoon) return false;
    if (entry.isCore) return draft.core.has(entry.id as CoreOrComingSoonId);
    return draft.optional.has(entry.id as WidgetId);
  };

  const toggleDraft = (entry: ModalEntry) => {
    if (entry.comingSoon) return; // cannot toggle coming-soon widgets
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
            <p className="text-xs text-text-secondary mt-0.5">Show or hide any section on your dashboard</p>
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

        {/* Body — 2-column grid matching legacy #widget-options */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="grid md:grid-cols-2 gap-x-6">
            {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
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
                    {grouped[cat].map((entry) => {
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
