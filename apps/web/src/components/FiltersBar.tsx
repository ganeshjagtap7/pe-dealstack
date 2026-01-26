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
    <div className="px-6 py-4 bg-surface-light border-b border-border-light/50 sticky top-0 z-10">
      <div className="flex flex-col gap-3">
        <div className="relative w-full group/search">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
            <span className="material-symbols-outlined">auto_awesome</span>
          </div>
          <input
            className="block w-full rounded-xl border-0 bg-background-light py-3 pl-10 pr-20 text-text-main shadow-inner ring-1 ring-inset ring-border-light placeholder:text-text-muted focus:bg-white focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6 transition-all"
            style={{ '--tw-ring-color': '#003366' } as React.CSSProperties}
            placeholder="Ask AI to filter files (e.g., 'Show only audit reports from 2023' or 'Files with unsigned clauses')..."
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={(e) => {
              const icon = e.currentTarget.parentElement?.querySelector('.material-symbols-outlined');
              if (icon) (icon as HTMLElement).style.color = '#003366';
            }}
            onBlur={(e) => {
              const icon = e.currentTarget.parentElement?.querySelector('.material-symbols-outlined');
              if (icon) (icon as HTMLElement).style.color = '#9CA3AF';
            }}
          />
          <div className="absolute inset-y-0 right-2 flex items-center">
            <kbd className="hidden rounded border border-border-light px-2 py-0.5 text-xs font-light text-text-muted sm:inline-block">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <span className="text-xs font-semibold text-text-secondary uppercase mr-2 shrink-0">
            Smart Filters:
          </span>
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => onFilterToggle(filter.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
              style={
                filter.active
                  ? { borderColor: 'rgba(0, 51, 102, 0.2)', backgroundColor: '#E6EEF5', color: '#003366' }
                  : { borderColor: '#E5E7EB', backgroundColor: 'white', color: '#4B5563' }
              }
              onMouseOver={(e) => {
                if (!filter.active) {
                  e.currentTarget.style.borderColor = 'rgba(0, 51, 102, 0.5)';
                  e.currentTarget.style.color = '#003366';
                }
              }}
              onMouseOut={(e) => {
                if (!filter.active) {
                  e.currentTarget.style.borderColor = '#E5E7EB';
                  e.currentTarget.style.color = '#4B5563';
                }
              }}
            >
              <span className="material-symbols-outlined text-[16px]">{filter.icon}</span>
              {filter.label}
            </button>
          ))}
          <button className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-light bg-transparent px-3 py-1 text-xs font-medium text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Custom
          </button>
        </div>
      </div>
    </div>
  );
};
