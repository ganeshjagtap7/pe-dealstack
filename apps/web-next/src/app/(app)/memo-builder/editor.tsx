"use client";

import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import type { Memo, MemoSection, TableData, TableRow } from "./components";

// Allowlist-based HTML sanitization via DOMPurify. Permits only safe tags
// and attributes — strips scripts, iframes, event handlers, javascript: URIs, etc.
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "b", "i", "br", "div", "span", "table", "thead", "tbody", "tr", "th", "td", "a", "blockquote", "code", "pre", "button"],
    ALLOWED_ATTR: ["class", "href", "target", "rel", "data-source", "data-page", "title"],
  });
}

/* ---- Table rendering helper ---- */
function renderTableData(tableData: TableData) {
  if (!tableData.headers || !tableData.rows) return null;

  return (
    <div className="overflow-hidden border border-border-subtle rounded-lg bg-white shadow-sm mb-6">
      <table className="w-full text-sm text-left">
        <thead className="bg-[#f0f4f8] text-text-muted font-medium border-b border-border-subtle">
          <tr>
            {tableData.headers.map((h, i) => (
              <th
                key={i}
                className={cn(
                  "px-4 py-3 font-semibold text-[11px] uppercase tracking-[0.05em]",
                  i === 0 ? "w-1/3 text-left text-primary" : "text-right text-primary"
                )}
                style={{ borderRight: i < tableData.headers.length - 1 ? "1px solid #e2e8f0" : undefined }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {tableData.rows.map((row, rowIdx) => {
            let metric = "";
            let values: string[] = [];
            let isBold = false;
            let isSubMetric = false;

            if (Array.isArray(row)) {
              metric = (row as string[])[0] || "";
              values = (row as string[]).slice(1);
              const ml = metric.toLowerCase();
              isBold = ml.includes("ebitda") || ml.includes("total") || ml.includes("net income");
              isSubMetric = ml.includes("margin") || ml.includes("growth") || ml.includes("%");
            } else {
              const r = row as TableRow;
              metric = r.metric || "";
              values = Array.isArray(r.values) ? r.values : [];
              isBold = !!r.isBold;
              isSubMetric = !!r.isSubMetric;
            }

            return (
              <tr
                key={rowIdx}
                className={cn(
                  "hover:bg-[#f8fafc]",
                  isBold && "bg-[#f8fafc]"
                )}
              >
                <td
                  className={cn(
                    "px-4 py-2.5",
                    isBold ? "font-bold text-text-main" : isSubMetric ? "pl-8 text-text-muted italic" : "font-medium text-text-main"
                  )}
                >
                  {metric}
                </td>
                {values.map((v, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-4 py-2.5 text-right font-mono",
                      isBold ? "font-semibold text-text-main" : isSubMetric ? "text-text-muted" : "text-text-secondary"
                    )}
                  >
                    {v ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {tableData.footnote && (
        <div className="bg-[#f8fafc] border-t border-border-subtle px-4 py-2">
          <p className="text-[10px] text-text-muted">{tableData.footnote}</p>
        </div>
      )}
    </div>
  );
}

function formatDocDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return `Date: ${d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
}

/* ------------------------------------------------------------------ */
/*  MemoEditor — document canvas layout                                */
/* ------------------------------------------------------------------ */

export interface MemoEditorProps {
  memo: Memo;
  sections: MemoSection[];
  activeSection: string | null;
  setActiveSection: (id: string | null) => void;
  editingContent: Record<string, string>;
  setEditingContent: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  generatingSection: string | null;
  savingSection: string | null;
  onGenerate: (sectionId: string) => void;
  onSave: (sectionId: string) => void;
  onDelete: (section: { id: string; title: string }) => void;
}

export function MemoEditor({
  memo,
  sections,
  activeSection,
  setActiveSection,
  editingContent,
  setEditingContent,
  generatingSection,
  savingSection,
  onGenerate,
  onSave,
  onDelete,
}: MemoEditorProps) {
  const containerRef = useRef<HTMLElement | null>(null);

  // Scroll-spy: mark the section closest to the top as active so the outline
  // highlight follows the reader.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || sections.length === 0) return;
    const onScroll = () => {
      const offset = el.getBoundingClientRect().top + 100;
      let current = sections[0].id;
      for (const s of sections) {
        const node = document.getElementById(`section-${s.id}`);
        if (node && node.getBoundingClientRect().top <= offset) current = s.id;
      }
      if (current !== activeSection) setActiveSection(current);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [sections, activeSection, setActiveSection]);

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-y-auto custom-scrollbar flex justify-center items-start p-8"
      style={{ backgroundColor: "#e8eaed" }}
    >
      <div className="w-full max-w-[850px] bg-white flex flex-col rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.10)] min-h-[calc(100vh-120px)]">
        {/* Document header */}
        <div className="px-14 pt-14 pb-6 border-b border-slate-200">
          <h1 className="text-[26px] font-bold text-[#1a1a2e] tracking-tight mb-3 leading-tight">
            {memo.title || "Investment Committee Memo"}
          </h1>
          <div className="flex items-center flex-wrap gap-x-5 gap-y-1 text-[13px] text-text-secondary">
            {memo.projectName && (
              <span className="font-semibold text-text-main">{memo.projectName}</span>
            )}
            <span className="text-text-muted">|</span>
            <span>{formatDocDate(memo.updatedAt)}</span>
            {memo.sponsor && (
              <>
                <span className="text-text-muted">|</span>
                <span>Sponsor: {memo.sponsor}</span>
              </>
            )}
          </div>
        </div>

        {/* Document body — sections rendered continuously */}
        <div className="px-14 py-10 flex-1 flex flex-col gap-10">
          {sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined text-4xl text-text-muted mb-2">
                article
              </span>
              <p className="text-sm font-medium text-text-main mb-1">No sections</p>
              <p className="text-xs text-text-muted">
                This memo has no sections yet. Use &ldquo;Add Section&rdquo; in the outline sidebar.
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <DocSection
                key={section.id}
                section={section}
                isActive={activeSection === section.id}
                content={editingContent[section.id] || ""}
                onContentChange={(val) =>
                  setEditingContent((prev) => ({ ...prev, [section.id]: val }))
                }
                generating={generatingSection === section.id}
                saving={savingSection === section.id}
                onGenerate={() => onGenerate(section.id)}
                onSave={() => onSave(section.id)}
                onDelete={() => onDelete({ id: section.id, title: section.title })}
              />
            ))
          )}
        </div>

        {/* Document footer */}
        <div className="px-14 py-6 border-t border-slate-200 mt-auto bg-slate-50/50">
          <div className="flex justify-between text-xs text-slate-400">
            <span>CONFIDENTIAL - FOR INTERNAL USE ONLY</span>
            <span>Page 1 of {Math.max(1, sections.length)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  DocSection — one section rendered inside the document canvas       */
/* ------------------------------------------------------------------ */

interface DocSectionProps {
  section: MemoSection;
  isActive: boolean;
  content: string;
  onContentChange: (val: string) => void;
  generating: boolean;
  saving: boolean;
  onGenerate: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function DocSection({
  section,
  isActive,
  content,
  onContentChange,
  generating,
  saving,
  onGenerate,
  onSave,
  onDelete,
}: DocSectionProps) {
  const [editing, setEditing] = useState(false);
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  return (
    <section id={`section-${section.id}`} className="group/section scroll-mt-8">
      <div className="flex items-center justify-between mb-2.5 pb-1.5 border-b-2 border-primary">
        <h2 className="text-[15px] font-bold text-primary uppercase tracking-[0.06em] flex items-center gap-2">
          {section.title}
          {section.aiGenerated && (
            <span className="flex items-center gap-0.5 bg-purple-50 text-purple-600 text-[9px] font-medium px-1.5 py-0.5 rounded normal-case tracking-normal">
              <span className="material-symbols-outlined text-[11px]">auto_awesome</span>
              AI
            </span>
          )}
        </h2>
        <div
          className={cn(
            "flex items-center gap-0.5 transition-opacity",
            isActive ? "opacity-100" : "opacity-0 group-hover/section:opacity-100"
          )}
        >
          <button
            onClick={onGenerate}
            disabled={generating}
            className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            title="Generate with AI"
          >
            {generating ? (
              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            )}
            Generate
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:bg-background-body transition-colors disabled:opacity-50"
            title="Save"
          >
            {saving ? (
              <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">save</span>
            )}
            Save
          </button>
          <button
            onClick={onDelete}
            className="h-7 px-1.5 rounded-md flex items-center text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete section"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>
          </button>
        </div>
      </div>

      {hasHtml && !editing ? (
        <div className="relative">
          <div
            className="memo-section-content max-w-none text-text-main text-[13.5px] leading-[1.75]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
            onClick={() => setEditing(true)}
          />
          <button
            onClick={() => setEditing(true)}
            className="mt-2 text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            Edit
          </button>
        </div>
      ) : (
        <div>
          {hasHtml && (
            <button
              onClick={() => setEditing(false)}
              className="mb-2 text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">visibility</span>
              Preview
            </button>
          )}
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-border-subtle bg-[#fafbfc] px-4 py-3 text-[13.5px] text-text-main leading-[1.75] placeholder-text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
            placeholder="Write section content here or click Generate to use AI..."
          />
        </div>
      )}

      {/* Table data rendering */}
      {section.tableData && renderTableData(section.tableData)}

      {/* Placeholder for missing content */}
      {section.hasPlaceholder && section.placeholderText && (
        <div className="p-4 bg-[#f8fafc] rounded-lg border border-dashed border-border-subtle text-center">
          <button className="inline-flex flex-col items-center gap-2 text-text-muted hover:text-primary transition-colors group/add">
            <div className="size-8 rounded-full bg-border-subtle flex items-center justify-center group-hover/add:bg-primary/10 transition-colors">
              <span className="material-symbols-outlined group-hover/add:text-primary">add</span>
            </div>
            <span className="text-sm font-medium">{section.placeholderText}</span>
          </button>
        </div>
      )}
    </section>
  );
}

// MemoChat and MemoChatCollapsed moved to chat.tsx
