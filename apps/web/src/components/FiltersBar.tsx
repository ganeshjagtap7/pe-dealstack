import React, { useState, useRef, useEffect } from 'react';
import { SmartFilter, VDRFile } from '../types/vdr.types';

// Available custom filter presets
const customFilterPresets: Array<{ id: string; label: string; icon: string; filterFn: (file: VDRFile) => boolean }> = [
  {
    id: 'docs',
    label: 'Word Documents',
    icon: 'description',
    filterFn: (file) => file.type === 'doc',
  },
  {
    id: 'large-files',
    label: 'Large Files (>5 MB)',
    icon: 'hard_drive',
    filterFn: (file) => {
      const match = file.size.match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (!match) return false;
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const mb = unit === 'GB' ? val * 1024 : unit === 'MB' ? val : val / 1024;
      return mb > 5;
    },
  },
  {
    id: 'small-files',
    label: 'Small Files (<1 MB)',
    icon: 'file_present',
    filterFn: (file) => {
      const match = file.size.match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (!match) return false;
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const mb = unit === 'GB' ? val * 1024 : unit === 'MB' ? val : val / 1024;
      return mb < 1;
    },
  },
  {
    id: 'last-7-days',
    label: 'Last 7 Days',
    icon: 'today',
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return fileDate >= cutoff;
    },
  },
  {
    id: 'last-90-days',
    label: 'Last 90 Days',
    icon: 'date_range',
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      return fileDate >= cutoff;
    },
  },
  {
    id: 'ai-analyzed',
    label: 'AI Analyzed',
    icon: 'auto_awesome',
    filterFn: (file) => file.analysis.type === 'key-insight' || file.analysis.type === 'complete',
  },
  {
    id: 'pending-analysis',
    label: 'Pending Analysis',
    icon: 'hourglass_top',
    filterFn: (file) => file.analysis.type === 'standard' && file.analysis.label.toLowerCase().includes('pending'),
  },
];

interface FiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: SmartFilter[];
  onFilterToggle: (filterId: string) => void;
  onAddCustomFilter?: (filter: SmartFilter) => void;
  onRemoveCustomFilter?: (filterId: string) => void;
}

export const FiltersBar: React.FC<FiltersBarProps> = ({
  searchQuery,
  onSearchChange,
  filters,
  onFilterToggle,
  onAddCustomFilter,
  onRemoveCustomFilter,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Filter out presets that are already added
  const existingIds = new Set(filters.map((f) => f.id));
  const availablePresets = customFilterPresets.filter((p) => !existingIds.has(p.id));

  const handleAddPreset = (preset: typeof customFilterPresets[number]) => {
    onAddCustomFilter?.({
      id: preset.id,
      label: preset.label,
      icon: preset.icon,
      active: true,
      isCustom: true,
      filterFn: preset.filterFn,
    });
    setShowDropdown(false);
  };

  return (
    <div className="px-6 py-4 bg-white border-b border-slate-200/50 sticky top-0 z-10">
      <div className="flex flex-col gap-3">
        {/* AI Search Input */}
        <div className="relative w-full group/search">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 group-focus-within/search:text-primary transition-colors">
            <span className="material-symbols-outlined">search</span>
          </div>
          <input
            className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-20 text-slate-900 shadow-inner ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 transition-all"
            placeholder="Search files by name, content, or tags..."
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            {searchQuery ? (
              <button
                onClick={() => onSearchChange('')}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            ) : (
              <kbd className="hidden rounded border border-slate-200 px-2 py-0.5 text-xs font-light text-slate-400 sm:inline-block">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* Smart Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap pb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase mr-2 shrink-0">
            Smart Filters:
          </span>
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => onFilterToggle(filter.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter.active
                  ? 'border-primary/20 bg-primary/5 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{filter.icon}</span>
              {filter.label}
              {/* Remove button for custom filters */}
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

          {/* Custom Filter Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                showDropdown
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-dashed border-slate-200 bg-transparent text-slate-400 hover:text-slate-600 hover:border-slate-400'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {showDropdown ? 'expand_less' : 'add'}
              </span>
              Custom
            </button>

            {showDropdown && (
              <div
                className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50"
                style={{ animation: 'filterDropIn 150ms ease-out' }}
              >
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
                      onClick={() => handleAddPreset(preset)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px] text-slate-400">{preset.icon}</span>
                      {preset.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes filterDropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
