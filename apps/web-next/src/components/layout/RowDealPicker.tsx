"use client";

import { useEffect, useRef, useState } from "react";

export interface DealOption {
  id: string;
  name: string;
}

export interface InviteRowDealsShape {
  deals: DealOption[];
}

/**
 * Multi-select deal picker for a single invite row. Extracted from
 * InviteTeamModal to keep that file under the 500-line cap.
 */
export function RowDealPicker({
  row,
  available,
  onAdd,
  onRemove,
}: {
  row: InviteRowDealsShape;
  available: DealOption[];
  onAdd: (deal: DealOption) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedIds = new Set(row.deals.map((d) => d.id));
  const filtered = available.filter(
    (d) => !selectedIds.has(d.id) && d.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen(true)}
        className="relative w-full rounded-lg border border-[#EBEBEB] bg-white min-h-[48px] px-2 py-1.5 flex items-center flex-wrap gap-2 focus-within:ring-1 focus-within:ring-[#003366] focus-within:border-[#003366] transition-all cursor-text group"
      >
        {row.deals.map((deal) => (
          <div
            key={deal.id}
            className="bg-[#E6EDF5] border border-[#CCDBE8] text-[#003366] font-medium px-2 py-1 rounded-md flex items-center gap-1 text-xs"
          >
            <span>{deal.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(deal.id);
              }}
              className="hover:text-[#4A6D8A] text-[#8099B3]"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={row.deals.length > 0 ? "Add deal..." : "Search workspaces..."}
          className="bg-transparent border-none focus:ring-0 text-[#343A40] text-sm placeholder-[#868E96]/40 p-0 h-6 min-w-[60px] flex-1 outline-none"
        />
        <span className="material-symbols-outlined absolute right-3 text-[#868E96]/60 pointer-events-none text-lg group-focus-within:text-[#003366] transition-colors">
          search
        </span>
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-[#EBEBEB] rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-2 text-sm text-[#868E96]">
              {available.length === 0 ? "No deals available" : "No matching deals"}
            </div>
          ) : (
            filtered.map((deal) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => {
                  onAdd(deal);
                  setQuery("");
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-[#F0F4F8] text-[#343A40] transition-colors"
              >
                {deal.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
