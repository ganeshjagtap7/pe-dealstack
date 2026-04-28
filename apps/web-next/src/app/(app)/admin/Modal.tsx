"use client";

import { useEffect, type ReactNode } from "react";

// Shared modal shell used by the four admin action modals. Handles backdrop
// click, Escape key, body scroll lock, and consistent header/footer chrome.

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon?: { name: string; className?: string };
  maxWidth?: string;
  children: ReactNode;
  footer: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  titleIcon,
  maxWidth = "max-w-lg",
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div
          className={`relative bg-white rounded-xl shadow-2xl w-full ${maxWidth} transform transition-all`}
        >
          <div className="p-6 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-main flex items-center gap-2">
                {titleIcon && (
                  <span
                    className={`material-symbols-outlined ${titleIcon.className || "text-primary"}`}
                  >
                    {titleIcon.name}
                  </span>
                )}
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-text-muted hover:text-text-main hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
          <div className="p-6 space-y-5">{children}</div>
          <div className="p-6 border-t border-border-subtle bg-gray-50 rounded-b-xl flex justify-end gap-3">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
