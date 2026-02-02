import React from 'react';
import { SmartFilter } from '../types/vdr.types';

interface FiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: SmartFilter[];
  onFilterToggle: (filterId: string) => void;
}

export const FiltersBar: React.FC<FiltersBarProps> = ({
  searchQuery,
  onSearchChange,
  filters,
  onFilterToggle,
}) => {
  return (
    <div className="px-6 py-4 bg-white border-b border-slate-200/50 sticky top-0 z-10">
      <div className="flex flex-col gap-3">
        {/* AI Search Input */}
        <div className="relative w-full group/search">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 group-focus-within/search:text-primary transition-colors">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <input
            className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-20 text-slate-900 shadow-inner ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 transition-all"
            placeholder="Ask AI to filter files (e.g., 'Show only audit reports from 2023' or 'Files with unsigned clauses')..."
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <div className="absolute inset-y-0 right-2 flex items-center">
            <kbd className="hidden rounded border border-slate-200 px-2 py-0.5 text-xs font-light text-slate-400 sm:inline-block">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Smart Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
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
            </button>
          ))}
          <button className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-slate-200 bg-transparent px-3 py-1 text-xs font-medium text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Custom
          </button>
        </div>
      </div>
    </div>
  );
};
