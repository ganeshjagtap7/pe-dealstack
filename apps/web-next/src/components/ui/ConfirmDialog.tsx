"use client";

import { useCallback, useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
    [onCancel],
  );

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                isDanger ? "bg-red-50" : "bg-blue-50"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[20px] ${
                  isDanger ? "text-red-500" : "text-primary"
                }`}
              >
                {isDanger ? "warning" : "help"}
              </span>
            </div>
            <h3 className="text-base font-bold text-text-main">{title}</h3>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 p-4 pt-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-border-subtle rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium text-sm transition-colors ${
              isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "hover:opacity-90"
            }`}
            style={isDanger ? undefined : { backgroundColor: "#003366" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
