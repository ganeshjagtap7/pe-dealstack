"use client";

import { useEffect, useRef, useState } from "react";
import type { SmartFilter } from "@/lib/vdr/types";
import { CUSTOM_FILTER_PRESETS } from "@/lib/vdr/filters";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filters: SmartFilter[];
  onFilterToggle: (id: string) => void;
  onAddCustomFilter?: (filter: SmartFilter) => void;
  onRemoveCustomFilter?: (id: string) => void;
}

export function FiltersBar({
  searchQuery,
  onSearchChange,
  filters,
  onFilterToggle,
  onAddCustomFilter,
  onRemoveCustomFilter,
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const existingIds = new Set(filters.map((f) => f.id));
  const availablePresets = CUSTOM_FILTER_PRESETS.filter((p) => !existingIds.has(p.id));

  return (
    <div className="px-6 py-4 bg-white border-b border-slate-200/50">
      <div className="flex flex-col gap-3">
        <div className="relative w-full group/search">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 group-focus-within/search:text-primary transition-colors">
            <span className="material-symbols-outlined">search</span>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files by name, content, or tags..."
            className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-20 text-slate-900 shadow-inner ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-primary text-sm leading-6 transition-all outline-none"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            ) : (
              <kbd className="hidden sm:inline-block rounded border border-slate-200 px-2 py-0.5 text-xs font-light text-slate-400">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase mr-2 shrink-0">
            Smart Filters:
          </span>
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onFilterToggle(filter.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter.active
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{filter.icon}</span>
              {filter.label}
              {filter.isCustom && (
                <span
                  className="material-symbols-outlined text-[14px] ml-0.5 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustomFilter?.(filter.id);
                  }}
                >
                  close
                </span>
              )}
            </button>
          ))}

          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowDropdown((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                showDropdown
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-dashed border-slate-200 bg-transparent text-slate-400 hover:text-slate-600 hover:border-slate-400"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {showDropdown ? "expand_less" : "add"}
              </span>
              Custom
            </button>

            {showDropdown && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Add Filter
                </div>
                {availablePresets.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 text-center">
                    All filters already added
                  </div>
                ) : (
                  availablePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onAddCustomFilter?.({
                          id: preset.id,
                          label: preset.label,
                          icon: preset.icon,
                          active: true,
                          isCustom: true,
                          filterFn: preset.filterFn,
                        });
                        setShowDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-400">
                        {preset.icon}
                      </span>
                      {preset.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
