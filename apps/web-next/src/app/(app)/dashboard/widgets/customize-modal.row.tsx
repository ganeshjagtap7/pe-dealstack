"use client";

import type { ModalEntry } from "./customize-modal.entries";

// Reorderable + non-core entry row components for the CustomizeDashboardModal.
// Extracted from customize-modal.tsx so the parent module stays under the
// 500-line cap.

export function ReorderableEntryRow({
  entry,
  isOn,
  isDragTarget,
  isFirst,
  isLast,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  entry: ModalEntry;
  isOn: boolean;
  isDragTarget: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
        isDragTarget
          ? "border-primary bg-primary-light/50 scale-[1.01]"
          : isOn
            ? "border-primary bg-primary-light/30"
            : "border-border-subtle hover:border-primary/50"
      }`}
    >
      {/* Drag handle */}
      <span
        className="material-symbols-outlined text-[18px] text-text-muted cursor-grab active:cursor-grabbing shrink-0 select-none"
        title="Drag to reorder"
      >
        drag_indicator
      </span>

      {/* Checkbox + content — click area */}
      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
          checked={isOn}
          onChange={onToggle}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[18px] ${isOn ? "text-primary" : "text-text-muted"}`}>
              {entry.icon}
            </span>
            <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
            {entry.category === "ai" && (
              <span className="text-[10px] bg-primary-light text-primary px-1.5 py-0.5 rounded font-medium shrink-0">
                AI
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
        </div>
      </label>

      {/* Up / down arrow buttons — keyboard-accessible fallback */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 rounded hover:bg-gray-100 text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label={`Move ${entry.title} up`}
        >
          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 rounded hover:bg-gray-100 text-text-muted hover:text-text-main disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label={`Move ${entry.title} down`}
        >
          <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
        </button>
      </div>
    </div>
  );
}

export function ComingSoonEntryRow({ entry }: { entry: ModalEntry }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-border-subtle opacity-60">
      <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0 select-none">drag_indicator</span>
      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-default">
        <input
          type="checkbox"
          className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
          checked={false}
          disabled
          onChange={() => undefined}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-text-muted">{entry.icon}</span>
            <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
            <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-medium shrink-0">
              Soon
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
        </div>
      </label>
      <div className="w-8" />
    </div>
  );
}

export function NonCoreEntryRow({
  entry,
  isOn,
  onToggle,
}: {
  entry: ModalEntry;
  isOn: boolean;
  onToggle: () => void;
}) {
  const disabled = !!entry.comingSoon;
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
        disabled
          ? "border-border-subtle opacity-60 cursor-default"
          : isOn
            ? "border-primary bg-primary-light/30 cursor-pointer"
            : "border-border-subtle hover:border-primary/50 cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="widget-checkbox size-4 rounded border-gray-300 text-primary focus:ring-primary"
        checked={isOn}
        disabled={disabled}
        onChange={onToggle}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-[18px] ${isOn && !disabled ? "text-primary" : "text-text-muted"}`}>
            {entry.icon}
          </span>
          <span className="font-medium text-sm text-text-main truncate">{entry.title}</span>
          {disabled && (
            <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-medium shrink-0">
              Soon
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{entry.description}</p>
      </div>
    </label>
  );
}
