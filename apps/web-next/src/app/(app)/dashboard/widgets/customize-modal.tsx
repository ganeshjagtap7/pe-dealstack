"use client";

import { useEffect, useState } from "react";
import { WIDGETS, WidgetId } from "./registry";

// ---------------------------------------------------------------------------
// Category configuration — matches dashboard-widgets.js CATEGORY_LABELS
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, { name: string; icon: string }> = {
  productivity: { name: "Productivity", icon: "task_alt" },
  deals:        { name: "Deal Flow & Pipeline", icon: "work" },
  market:       { name: "Market & Research", icon: "insights" },
  team:         { name: "Team & Contacts", icon: "groups" },
  documents:    { name: "Documents & Alerts", icon: "folder" },
};

// Map each widget id to a category (mirrors dashboard-widgets.js WIDGET_CONFIG)
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

const CATEGORY_ORDER = ["productivity", "deals", "market", "team", "documents"];

// ---------------------------------------------------------------------------
// Customize Dashboard modal — matches apps/web/dashboard.html #add-widget-modal
// Legacy layout: grouped checkboxes by category, Cancel + Save Changes buttons.
// ---------------------------------------------------------------------------
export function CustomizeDashboardModal({
  open,
  visible,
  onToggle,
  onClose,
}: {
  open: boolean;
  visible: Set<WidgetId>;
  onToggle: (id: WidgetId) => void;
  onClose: () => void;
}) {
  // Local draft state so the user can Cancel without saving
  const [draft, setDraft] = useState<Set<WidgetId>>(new Set(visible));

  // Sync draft when modal opens
  useEffect(() => {
    if (open) setDraft(new Set(visible));
  }, [open, visible]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Group WIDGETS by category in category order
  const grouped: Record<string, typeof WIDGETS> = {};
  WIDGETS.forEach((w) => {
    const cat = WIDGET_CATEGORY[w.id] || "productivity";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(w);
  });

  const handleSave = () => {
    // Apply diff: toggle widgets that changed
    WIDGETS.forEach((w) => {
      const wasOn = visible.has(w.id);
      const nowOn = draft.has(w.id);
      if (wasOn !== nowOn) onToggle(w.id);
    });
    onClose();
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
            <p className="text-xs text-text-secondary mt-0.5">Select widgets to show on your dashboard</p>
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
                    {grouped[cat].map((w) => {
                      const isOn = draft.has(w.id);
                      return (
                        <label
                          key={w.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all group ${
                            isOn
                              ? "border-primary bg-primary-light/30"
                              : "border-border-subtle hover:border-primary/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={isOn}
                            onChange={() => {
                              setDraft((prev) => {
                                const next = new Set(prev);
                                if (next.has(w.id)) next.delete(w.id);
                                else next.add(w.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`material-symbols-outlined text-[18px] ${isOn ? "text-primary" : "text-text-muted"}`}>{w.icon}</span>
                              <span className="font-medium text-sm text-text-main truncate">{w.title}</span>
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{w.description}</p>
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
