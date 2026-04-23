"use client";

import { RefObject } from "react";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Memo, MemoSection, STATUS_STYLES } from "./components";

interface DocumentHeaderBarProps {
  memo: Memo;
  sections: MemoSection[];
  generatingAll: boolean;
  exportMenuOpen: boolean;
  setExportMenuOpen: (fn: (prev: boolean) => boolean) => void;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  onGenerateAll: () => void;
  onShare: () => void;
  onExportPDF: () => void;
  onExportMarkdown: () => void;
  onExportClipboard: () => void;
}

export function DocumentHeaderBar({
  memo,
  sections,
  generatingAll,
  exportMenuOpen,
  setExportMenuOpen,
  exportMenuRef,
  onGenerateAll,
  onShare,
  onExportPDF,
  onExportMarkdown,
  onExportClipboard,
}: DocumentHeaderBarProps) {
  const statusStyle = STATUS_STYLES[memo.status] || STATUS_STYLES.DRAFT;
  const disabled = sections.length === 0;

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-border-subtle bg-surface-card px-6 py-3 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="flex size-8 items-center justify-center rounded text-white"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined">description</span>
        </div>
        <div>
          <h2 className="text-text-main text-base font-bold leading-tight tracking-[-0.015em]">
            {memo.projectName || memo.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{memo.title}</span>
            <span className="size-1 rounded-full bg-text-muted/40" />
            <span className={cn("font-medium px-1.5 rounded", statusStyle.bg, statusStyle.text)}>
              {memo.status.charAt(0) + memo.status.slice(1).toLowerCase()}
            </span>
            <span className="size-1 rounded-full bg-text-muted/40" />
            <span>Last edited {formatRelativeTime(memo.updatedAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {sections.length > 0 && (
          <button
            onClick={onGenerateAll}
            disabled={generatingAll}
            className="flex items-center justify-center rounded-lg h-9 px-3 bg-surface-card border border-border-subtle text-text-secondary text-sm font-semibold hover:bg-background-body transition-colors gap-2 disabled:opacity-50"
            title="Generate all sections with AI"
          >
            {generatingAll ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            )}
            <span>{generatingAll ? "Generating..." : "Generate All"}</span>
          </button>
        )}
        <button
          onClick={onShare}
          className="flex items-center justify-center rounded-lg h-9 px-3 bg-surface-card border border-border-subtle text-text-secondary text-sm font-semibold hover:bg-background-body transition-colors gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">share</span>
          <span>Share</span>
        </button>
        <div className="relative" ref={exportMenuRef}>
          <div
            className="flex items-center rounded-lg overflow-hidden border border-primary"
            style={{ backgroundColor: "#003366" }}
          >
            <button
              onClick={onExportPDF}
              disabled={disabled}
              className="flex items-center justify-center h-9 px-4 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Export to PDF
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExportMenuOpen((v) => !v);
              }}
              disabled={disabled}
              className="flex items-center justify-center h-9 px-2 text-white hover:opacity-90 transition-opacity border-l border-white/20 disabled:opacity-50"
              aria-label="Export options"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_drop_down</span>
            </button>
          </div>
          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-50">
              <button
                onClick={onExportPDF}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-red-500">picture_as_pdf</span>
                Export as PDF
              </button>
              <button
                onClick={onExportMarkdown}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-text-muted">code</span>
                Export as Markdown
              </button>
              <button
                onClick={onExportClipboard}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-blue-500">content_copy</span>
                Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
