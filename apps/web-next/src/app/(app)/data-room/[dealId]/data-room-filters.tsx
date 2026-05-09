"use client";

// Data-room-specific filter bar — mirrors the chips/sort layout from
// apps/web-next/src/app/(app)/deals/page.tsx so the two pages feel consistent.
// Filtering happens client-side on the already-fetched documents array — no
// new API params needed.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { Folder, VDRFile } from "@/lib/vdr/types";

export type FileTypeFilter = "" | "PDF" | "Word" | "Excel" | "Image" | "Other";
export type DataRoomSortBy = "name" | "date" | "size";
export type DataRoomSortOrder = "asc" | "desc";

export interface DataRoomFilterState {
  fileType: FileTypeFilter;
  folderId: string; // "" = all folders
  sortBy: DataRoomSortBy;
  sortOrder: DataRoomSortOrder;
}

export const DEFAULT_DATA_ROOM_FILTERS: DataRoomFilterState = {
  fileType: "",
  folderId: "",
  sortBy: "date",
  sortOrder: "desc",
};

// Map a filename extension to a coarse type bucket. Mirrors the suggestion
// in the agent task brief and is shared with the filter logic so the dropdown
// labels and the predicate stay in sync.
const EXT_TO_TYPE: Record<string, FileTypeFilter> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  csv: "Excel",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  gif: "Image",
  webp: "Image",
};

export function getFileTypeBucket(file: VDRFile): FileTypeFilter {
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return "Other";
  const ext = file.name.slice(dot + 1).toLowerCase();
  return EXT_TO_TYPE[ext] || "Other";
}

const FILE_TYPE_OPTIONS: Array<{ value: FileTypeFilter; label: string; icon: string }> = [
  { value: "", label: "All Types", icon: "description" },
  { value: "PDF", label: "PDF", icon: "picture_as_pdf" },
  { value: "Word", label: "Word", icon: "article" },
  { value: "Excel", label: "Excel", icon: "table_chart" },
  { value: "Image", label: "Image", icon: "image" },
  { value: "Other", label: "Other", icon: "draft" },
];

const SORT_OPTIONS: Array<{
  label: string;
  sortBy: DataRoomSortBy;
  sortOrder: DataRoomSortOrder;
}> = [
  { label: "Newest First", sortBy: "date", sortOrder: "desc" },
  { label: "Oldest First", sortBy: "date", sortOrder: "asc" },
  { label: "Name (A → Z)", sortBy: "name", sortOrder: "asc" },
  { label: "Name (Z → A)", sortBy: "name", sortOrder: "desc" },
  { label: "Size (Largest)", sortBy: "size", sortOrder: "desc" },
  { label: "Size (Smallest)", sortBy: "size", sortOrder: "asc" },
];

// Apply file-type, folder, and sort filters on a list of files. Search +
// smart filters are applied separately (in <FiltersBar>); these compose.
export function applyDataRoomFilters(
  files: VDRFile[],
  filters: DataRoomFilterState,
): VDRFile[] {
  let out = files;
  if (filters.fileType) {
    out = out.filter((f) => getFileTypeBucket(f) === filters.fileType);
  }
  if (filters.folderId) {
    out = out.filter((f) => f.folderId === filters.folderId);
  }
  // Sort copy so we don't mutate the input.
  out = [...out].sort((a, b) => {
    const dir = filters.sortOrder === "asc" ? 1 : -1;
    if (filters.sortBy === "name") {
      return a.name.localeCompare(b.name) * dir;
    }
    if (filters.sortBy === "size") {
      return (parseSize(a.size) - parseSize(b.size)) * dir;
    }
    // date — file.date is already a localised string. Use Date.parse which
    // accepts the "Mon DD, YYYY" form produced by transformDocument.
    return (Date.parse(a.date) - Date.parse(b.date)) * dir;
  });
  return out;
}

// Parse "12.3 MB" / "456 KB" back into a comparable number (bytes-ish).
function parseSize(size: string): number {
  const match = size.match(/([\d.]+)\s*(KB|MB|GB)/i);
  if (!match) return 0;
  const v = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "GB") return v * 1024 * 1024 * 1024;
  if (unit === "MB") return v * 1024 * 1024;
  return v * 1024;
}

// ---------------------------------------------------------------------------
// Local FilterDropdown — slim copy of deals/components.tsx FilterDropdown
// styled to match the white surface of the data-room shell.
// ---------------------------------------------------------------------------
function FilterDropdown({
  label,
  active,
  icon,
  align = "left",
  children,
}: {
  label: string;
  active: boolean;
  icon?: string;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          active
            ? "border-primary/20 bg-primary/5 text-primary"
            : "border-slate-200 bg-white text-slate-600 hover:border-primary/50 hover:text-primary",
        )}
      >
        {icon && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
        {label}
        <span className="material-symbols-outlined text-[14px] opacity-60">
          keyboard_arrow_down
        </span>
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-2 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[200px] max-h-64 overflow-y-auto",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataRoomFilters — the bar itself
// ---------------------------------------------------------------------------
interface DataRoomFiltersProps {
  filters: DataRoomFilterState;
  onChange: (next: DataRoomFilterState) => void;
  folders: Folder[];
}

export function DataRoomFilters({ filters, onChange, folders }: DataRoomFiltersProps) {
  const fileTypeLabel =
    FILE_TYPE_OPTIONS.find((o) => o.value === filters.fileType)?.label || "All Types";
  const folderLabel = filters.folderId
    ? folders.find((f) => f.id === filters.folderId)?.name || "Folder"
    : "All Folders";
  const sortLabel =
    SORT_OPTIONS.find(
      (o) => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder,
    )?.label || "Newest First";

  const hasActive =
    !!filters.fileType ||
    !!filters.folderId ||
    !(filters.sortBy === DEFAULT_DATA_ROOM_FILTERS.sortBy &&
      filters.sortOrder === DEFAULT_DATA_ROOM_FILTERS.sortOrder);

  const clear = () => onChange({ ...DEFAULT_DATA_ROOM_FILTERS });

  return (
    <div className="px-6 py-2.5 bg-white border-b border-slate-200/50 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 uppercase mr-1 shrink-0">
        Filters:
      </span>

      <FilterDropdown
        label={`Type: ${fileTypeLabel}`}
        active={!!filters.fileType}
        icon="description"
      >
        {(close) =>
          FILE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              onClick={() => {
                onChange({ ...filters, fileType: opt.value });
                close();
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left",
                filters.fileType === opt.value && "font-medium text-primary",
              )}
            >
              <span className="material-symbols-outlined text-[16px] text-slate-400">
                {opt.icon}
              </span>
              {opt.label}
            </button>
          ))
        }
      </FilterDropdown>

      <FilterDropdown
        label={filters.folderId ? `Folder: ${folderLabel}` : "Folder: All"}
        active={!!filters.folderId}
        icon="folder"
      >
        {(close) => (
          <>
            <button
              type="button"
              onClick={() => {
                onChange({ ...filters, folderId: "" });
                close();
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left",
                !filters.folderId && "font-medium text-primary",
              )}
            >
              <span className="material-symbols-outlined text-[16px] text-slate-400">
                folder_open
              </span>
              All Folders
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => {
                  onChange({ ...filters, folderId: folder.id });
                  close();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left",
                  filters.folderId === folder.id && "font-medium text-primary",
                )}
              >
                <span className="material-symbols-outlined text-[16px] text-slate-400">
                  folder
                </span>
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-xs text-slate-400 shrink-0">
                  {folder.fileCount}
                </span>
              </button>
            ))}
          </>
        )}
      </FilterDropdown>

      <FilterDropdown label={`Sort: ${sortLabel}`} active={false} icon="sort" align="right">
        {(close) =>
          SORT_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onChange({ ...filters, sortBy: opt.sortBy, sortOrder: opt.sortOrder });
                close();
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-slate-50 whitespace-nowrap",
                filters.sortBy === opt.sortBy &&
                  filters.sortOrder === opt.sortOrder &&
                  "font-medium text-primary",
              )}
            >
              {opt.label}
            </button>
          ))
        }
      </FilterDropdown>

      {hasActive && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
          Clear
        </button>
      )}
    </div>
  );
}
