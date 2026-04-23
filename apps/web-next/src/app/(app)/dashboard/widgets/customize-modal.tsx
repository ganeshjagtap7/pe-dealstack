"use client";

import { useEffect } from "react";
import { WIDGETS, WidgetId } from "./registry";

// Customize Dashboard modal — matches the modal markup in apps/web/dashboard.html
// (c9dcc6d, lines 483-540). Lets the user toggle optional widgets; Stats Cards,
// Active Priorities, Tasks, Portfolio Allocation, AI Signals are always visible
// so they don't appear here.
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-text-main">Customize Dashboard</h2>
            <p className="text-xs text-text-secondary mt-0.5">Select widgets to show on your dashboard</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-main"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {WIDGETS.map((w) => {
              const isOn = visible.has(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onToggle(w.id)}
                  className={`text-left p-4 rounded-lg border transition-colors flex items-start gap-3 ${
                    isOn
                      ? "border-primary bg-primary-light/30"
                      : "border-border-subtle hover:border-primary/50 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isOn ? "text-white" : "text-text-muted bg-gray-50"
                    }`}
                    style={isOn ? { backgroundColor: "#003366" } : undefined}
                  >
                    <span className="material-symbols-outlined text-[20px]">{w.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-main">{w.title}</p>
                    <p className="text-xs text-text-muted mt-0.5 leading-snug">{w.description}</p>
                  </div>
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${
                      isOn ? "text-primary" : "text-text-muted/40"
                    }`}
                  >
                    {isOn ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border-subtle bg-gray-50 text-xs text-text-muted text-center shrink-0">
          Your selection is saved to this browser.
        </div>
      </div>
    </div>
  );
}
