"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Skill } from "@/lib/dealchat-skills";
import { unmetRequirements } from "@/lib/dealchat-skills";
import type { DealDetail } from "./components";

// ---------------------------------------------------------------------------
// SlashMenu — popover rendered ABOVE the chat textarea when the user types
// a leading `/`. Keyboard nav (ArrowUp/Down, Enter, Escape) is owned by
// the parent textarea's onKeyDown — we just render the visual state and
// emit the pick. Mouse hover sets `selectedIdx` via `onHoverIndex`.
//
// Why parent-owned keyboard nav: the textarea must keep focus so the user
// can keep typing without an extra Tab back to it. We mirror the pattern
// used by the @mention picker in deal-overview.tsx (~line 293-320).
// ---------------------------------------------------------------------------

export function SlashMenu({
  deal,
  skills,
  selectedIdx,
  onHoverIndex,
  onPick,
}: {
  deal: DealDetail | null;
  skills: Skill[];
  selectedIdx: number;
  onHoverIndex: (i: number) => void;
  onPick: (skill: Skill) => void;
}) {
  // Auto-scroll the highlighted row into view as the user arrows through.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-skill-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (skills.length === 0) {
    return (
      <div className="absolute left-3 right-3 bottom-full mb-2 z-40 bg-white border border-border-subtle rounded-xl shadow-lg overflow-hidden">
        <div className="px-3 py-3 text-xs text-text-muted">
          No matching skills. Press <kbd className="px-1 py-0.5 bg-surface-muted rounded text-[10px] font-mono">Esc</kbd> to keep typing.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Slash commands"
      className="absolute left-3 right-3 bottom-full mb-2 z-40 bg-white border border-border-subtle rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto custom-scrollbar"
    >
      {skills.map((s, i) => {
        const unmet = unmetRequirements(s, deal);
        const selected = i === selectedIdx;
        return (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={selected}
            data-skill-idx={i}
            // mousedown beats the textarea's onBlur so the pick lands before
            // any focus shuffle can swallow it (same pattern as the mention
            // picker in deal-overview.tsx:353).
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s);
            }}
            onMouseEnter={() => onHoverIndex(i)}
            className={cn(
              "w-full text-left px-3 py-2 flex items-start gap-3 transition-colors border-b border-border-subtle last:border-b-0",
              selected ? "bg-primary/5" : "hover:bg-primary/5"
            )}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold text-text-main">
                  {s.command}
                </span>
                <span className="text-xs font-medium text-text-secondary truncate">
                  {s.label}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide"
                  style={{
                    color: "#003366",
                    background: "#f0f4f8",
                    border: "1px solid rgba(0,51,102,0.15)",
                  }}
                >
                  {s.category}
                </span>
                {unmet.length > 0 && (
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    {unmet.join(" · ")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                {s.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
