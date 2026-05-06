"use client";

import { GROUP_ICON_STYLES, PaletteResult } from "./CommandPalette.types";

// Single result item rendered inside the palette result list.
// Extracted from CommandPalette.tsx so the parent module stays under the
// 500-line cap.

export function PaletteItem({
  item,
  isActive,
  onClick,
  onMouseEnter,
}: {
  item: PaletteResult;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const sub = item.kind === "deal" || item.kind === "contact" ? item.sub : "";
  return (
    <div
      data-palette-item
      className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive ? "text-white" : "hover:bg-[#E6EEF5]"
      }`}
      style={isActive ? { backgroundColor: "#003366" } : undefined}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={
          isActive
            ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
            : {
                backgroundColor: GROUP_ICON_STYLES[item.kind].bg,
                color: GROUP_ICON_STYLES[item.kind].color,
              }
        }
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          {item.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.label}</p>
        {sub && (
          <p
            className="text-[11px] truncate"
            style={
              isActive
                ? { color: "rgba(255,255,255,0.7)" }
                : { color: "#9CA3AF" }
            }
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
