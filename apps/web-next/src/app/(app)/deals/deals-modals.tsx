"use client";

import { STAGES, STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Delete Confirmation Modal
// ---------------------------------------------------------------------------
export function DeleteModal({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-red-50 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 text-[20px]">warning</span>
          </div>
          <h3 className="font-bold text-text-main text-base">{title}</h3>
        </div>
        <p className="text-sm text-text-secondary mb-6">
          This action cannot be undone. The deal and its data will be permanently removed.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Stage Change Modal
// ---------------------------------------------------------------------------
export function StageChangeModal({
  count,
  onSelect,
  onClose,
}: {
  count: number;
  onSelect: (stage: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-bold text-text-main">
            Change Stage for {count} Deal{count > 1 ? "s" : ""}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border-subtle">
          {STAGES.map((stage) => {
            const s = STAGE_STYLES[stage] || STAGE_STYLES.INITIAL_REVIEW;
            return (
              <button
                key={stage}
                onClick={() => onSelect(stage)}
                className="w-full text-left px-4 py-3 hover:bg-primary-light flex items-center gap-3 transition-colors"
              >
                <span className={cn("px-2 py-0.5 rounded text-xs font-bold", s.bg, s.text)}>
                  {STAGE_LABELS[stage]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
