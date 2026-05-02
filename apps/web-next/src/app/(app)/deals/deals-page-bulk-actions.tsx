"use client";

// ---------------------------------------------------------------------------
// Bulk Actions Bar for the deals page.
// Extracted from deals/page.tsx for file-size budget.
// ---------------------------------------------------------------------------

export function BulkActionsBar({
  count,
  onClear,
  onChangeStage,
  onExport,
  onMarkPassed,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onChangeStage: () => void;
  onExport: () => void;
  onMarkPassed: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-[#003366] text-white rounded-xl p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <button onClick={onClear} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        <span className="font-bold text-sm">
          {count} deal{count > 1 ? "s" : ""} selected
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onChangeStage}
          className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
          Change Stage
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          Export CSV
        </button>
        <button
          onClick={onMarkPassed}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">block</span>
          Mark as Passed
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-2 px-4 py-2 bg-red-600/90 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
          Delete
        </button>
      </div>
    </div>
  );
}
