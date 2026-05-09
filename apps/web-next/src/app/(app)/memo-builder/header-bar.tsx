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
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-slate-200 bg-white px-6 py-3 shrink-0 z-20 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 items-center justify-center rounded text-white"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined">description</span>
          </div>
          <div>
            <h2 className="text-[#0d131b] text-base font-bold leading-tight tracking-[-0.015em]">
              {memo.projectName || memo.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{memo.title}</span>
              <span className="size-1 rounded-full bg-slate-300" />
              <span className={cn("font-medium px-1.5 rounded", statusStyle.bg, statusStyle.text)}>
                {memo.status}
              </span>
              <span className="size-1 rounded-full bg-slate-300" />
              <span>Last edited {formatRelativeTime(memo.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Generate All button — only shown when the memo has a deal attached.
            Without dealId the backend 400s on /generate-all because it can't
            pull deal-level financial / extraction context to feed the LLM. */}
        {sections.length > 0 && memo.dealId && (
          <button
            onClick={onGenerateAll}
            disabled={generatingAll}
            className="flex items-center justify-center rounded-lg h-9 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors gap-2 disabled:opacity-50"
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
        {sections.length > 0 && !memo.dealId && (
          <span
            className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg"
            title="AI generation requires a deal attached to this memo. Edit the memo to attach one."
          >
            <span className="material-symbols-outlined text-[14px]">info</span>
            Attach a deal to enable AI generation
          </span>
        )}
        {/* Share button — matches legacy */}
        <button
          onClick={onShare}
          className="flex items-center justify-center rounded-lg h-9 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">share</span>
          <span>Share</span>
        </button>
        {/* Export split button — matches legacy exactly */}
        <div className="relative" ref={exportMenuRef}>
          <div className="flex items-center rounded-lg overflow-visible" style={{ border: "1px solid #003366" }}>
            <button
              onClick={onExportPDF}
              disabled={disabled}
              className="flex items-center justify-center h-9 px-4 text-white text-sm font-bold hover:opacity-90 transition-opacity rounded-l-lg disabled:opacity-50"
              style={{ backgroundColor: "#003366" }}
            >
              Export to PDF
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExportMenuOpen((v) => !v);
              }}
              disabled={disabled}
              className="flex items-center justify-center h-9 px-2 text-white hover:opacity-90 transition-opacity rounded-r-lg disabled:opacity-50"
              style={{ backgroundColor: "#003366", borderLeft: "1px solid rgba(255,255,255,0.2)" }}
              aria-label="Export options"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_drop_down</span>
            </button>
          </div>
          {/* Export dropdown menu */}
          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
              <button
                onClick={onExportPDF}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-red-500">picture_as_pdf</span>
                Export as PDF
              </button>
              <button
                onClick={onExportMarkdown}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[18px] text-slate-500">code</span>
                Export as Markdown
              </button>
              <button
                onClick={onExportClipboard}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
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
