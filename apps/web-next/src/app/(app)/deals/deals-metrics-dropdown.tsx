"use client";

import { useEffect, useState, useRef } from "react";
import {
  METRIC_CONFIG,
  DEFAULT_CARD_METRICS,
  ALL_METRIC_KEYS,
  type MetricKey,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Customize Metrics Dropdown
// ---------------------------------------------------------------------------
export function MetricsDropdown({
  activeMetrics,
  onApply,
}: {
  activeMetrics: MetricKey[];
  onApply: (metrics: MetricKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<MetricKey>>(new Set(activeMetrics));
  const ref = useRef<HTMLDivElement>(null);

  // Sync local checked state when activeMetrics prop changes. Using the
  // "track previous prop" idiom (a state update during render) instead of
  // an effect so we don't double-render on prop change.
  const [prevActiveMetrics, setPrevActiveMetrics] = useState(activeMetrics);
  if (activeMetrics !== prevActiveMetrics) {
    setPrevActiveMetrics(activeMetrics);
    setChecked(new Set(activeMetrics));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (key: MetricKey) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) setChecked(new Set(activeMetrics)); }}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 hover:bg-primary-light transition-all"
        title="Customize Metrics"
      >
        <span className="material-symbols-outlined text-text-muted text-[16px]">tune</span>
        <span className="text-text-secondary text-xs font-medium hidden lg:block">Metrics</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 bg-surface-card border border-border-subtle rounded-lg shadow-lg z-50 min-w-[220px] py-2">
          <div className="px-4 py-2 border-b border-border-subtle">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Visible Metrics</p>
          </div>
          <div className="py-1">
            {ALL_METRIC_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 px-4 py-2 hover:bg-primary-light cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-gray-300 text-[#003366] focus:ring-[#003366]"
                  checked={checked.has(key)}
                  onChange={() => toggle(key)}
                />
                <span className="text-sm text-text-main font-medium">{METRIC_CONFIG[key].label}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-border-subtle px-4 py-2 flex items-center justify-between">
            <button
              onClick={() => setChecked(new Set(DEFAULT_CARD_METRICS))}
              className="text-xs text-text-muted hover:text-[#003366] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => {
                const arr = ALL_METRIC_KEYS.filter((k) => checked.has(k));
                if (arr.length === 0) return; // Must have at least one
                onApply(arr);
                setOpen(false);
              }}
              className="text-xs font-medium text-white px-3 py-1 rounded-md hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
