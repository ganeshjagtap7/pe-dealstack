"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Filter Dropdown (reusable popover)
// ---------------------------------------------------------------------------
export function FilterDropdown({
  label,
  active,
  children,
  icon,
  borderless,
  compact,
  align = "left",
}: {
  label: string;
  active: boolean;
  children: (close: () => void) => React.ReactNode;
  icon?: string;
  borderless?: boolean;
  /** Slightly smaller sizing — used for right-side controls (sort, etc.) */
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const buttonClass = borderless
    ? cn(
        "flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-all",
        compact ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
        active
          ? "text-[#003366] bg-blue-50"
          : "text-text-secondary hover:bg-primary-light"
      )
    : cn(
        "flex shrink-0 items-center gap-2 rounded-lg border font-medium transition-all group",
        compact ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm",
        active
          ? "border-[#B3C2D1] bg-primary-light text-[#003366]"
          : "border-border-subtle bg-surface-card text-text-secondary hover:border-primary/30 hover:shadow-sm"
      );

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={buttonClass}>
        {icon && (
          <span className={cn("material-symbols-outlined text-text-muted", compact ? "text-[15px]" : "text-[18px]")}>{icon}</span>
        )}
        {label}
        {!borderless && (
          <span className={cn("material-symbols-outlined text-text-muted", compact ? "text-[14px]" : "text-[16px]")}>
            keyboard_arrow_down
          </span>
        )}
      </button>
      {open && (
        <div className={cn(
          "absolute top-full mt-2 bg-surface-card rounded-lg shadow-lg border border-border-subtle py-1 z-50 min-w-[180px]",
          align === "right" ? "right-0" : "left-0"
        )}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
