"use client";

import { cn } from "@/lib/cn";

// Ported from apps/web/js/widgets/layout-editor.js.
//
// In legacy apps/web, LayoutEditor was a complex DOM-mutating module that
// added drag handles, a banner, and HTML5 drag-and-drop reorder to widgets
// in-place. In web-next that responsibility has shifted: reorder, show/hide,
// and persistence all live inside the CustomizeDashboardModal (drag-to-reorder
// of core/AI cards, checkboxes for optional widgets, Save Changes button).
//
// Per the port plan: layout-editor is now a small button that opens the
// customize modal. Pass `onOpen` from the parent (dashboard/page.tsx already
// owns the modal's open state). Variants:
//   - "compact" (default): icon + label pill, suitable for widget toolbars.
//   - "full":              full-width button, matches the bottom-of-dashboard
//                          "Customize Dashboard" CTA in legacy.
//
// This component intentionally does NOT render the modal itself. The modal is
// already mounted in dashboard/page.tsx, and reusing it here would create two
// copies of customize state. Callers wire `onOpen` to setCustomizeOpen(true).

export function LayoutEditorButton({
  onOpen,
  variant = "compact",
  className,
}: {
  onOpen: () => void;
  variant?: "compact" | "full";
  className?: string;
}) {
  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-card/50 p-4 text-sm font-medium text-text-muted transition-all hover:border-primary hover:text-primary hover:bg-primary-light/50",
          className,
        )}
      >
        <span className="material-symbols-outlined text-[18px]">tune</span>
        Customize Dashboard
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Customize dashboard layout"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary",
        className,
      )}
    >
      <span className="material-symbols-outlined text-[16px]">tune</span>
      Edit Layout
    </button>
  );
}
