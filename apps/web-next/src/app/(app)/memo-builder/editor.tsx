"use client";

import React, { RefObject, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import type { Memo, MemoSection, ChatMessage } from "./components";

// Allowlist-based HTML sanitization via DOMPurify. Permits only safe tags
// and attributes — strips scripts, iframes, event handlers, javascript: URIs, etc.
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "b", "i", "br", "div", "span", "table", "thead", "tbody", "tr", "th", "td", "a", "blockquote", "code", "pre"],
    ALLOWED_ATTR: ["class", "href", "target", "rel"],
  });
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
        <div className="px-14 pt-14 pb-6 border-b border-border-subtle">
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
        <div className="px-14 py-6 border-t border-border-subtle mt-auto bg-[#f9fafb]">
          <div className="flex justify-between text-xs text-text-muted">
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
            className="w-full rounded-lg border border-border-subtle bg-[#fafbfc] px-4 py-3 text-[13.5px] text-text-main leading-[1.75] placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-y"
            placeholder="Write section content here or click Generate to use AI..."
          />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  MemoChat                                                           */
/* ------------------------------------------------------------------ */

const PROMPT_CHIPS = [
  "Summarize the key risks",
  "Draft the executive summary",
  "What financial data is missing?",
  "Compare to industry benchmarks",
  "Strengthen the investment thesis",
];

interface MemoChatProps {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  sendingChat: boolean;
  onSend: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  chatEndRef: RefObject<HTMLDivElement | null>;
}

export function MemoChat({
  messages,
  chatInput,
  setChatInput,
  sendingChat,
  onSend,
  chatOpen,
  onToggleChat,
  chatEndRef,
}: MemoChatProps) {
  if (!chatOpen) return null;

  return (
    <aside className="w-[360px] shrink-0 border-l border-border-subtle bg-surface-card flex flex-col overflow-hidden shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)]">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          </div>
          <h3 className="text-sm font-bold text-text-main">AI Analyst</h3>
        </div>
        <button
          onClick={onToggleChat}
          className="text-text-muted hover:text-text-main transition-colors"
          title="Collapse panel"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-background-body">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-surface-card text-text-main border border-border-subtle rounded-bl-sm"
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div
                  className="chat-markdown space-y-1"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }}
                />
              )}
              <p className={cn("text-[10px] mt-1.5", msg.role === "user" ? "text-white/60" : "text-text-muted")}>
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
        {sendingChat && (
          <div className="flex justify-start">
            <div className="bg-surface-card border border-border-subtle rounded-xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {messages.length < 3 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setChatInput(chip)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-border-subtle text-text-secondary hover:text-primary hover:border-primary bg-background-body transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-border-subtle">
        <div className="flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            className="flex-1 rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-none"
            placeholder="Ask about this memo..."
          />
          <button
            onClick={onSend}
            disabled={!chatInput.trim() || sendingChat}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white disabled:opacity-40 transition-opacity shrink-0"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsed chat rail — vertical tab when chat is closed             */
/* ------------------------------------------------------------------ */

export function MemoChatCollapsed({ onOpen }: { onOpen: () => void }) {
  return (
    <aside className="w-12 bg-surface-card border-l border-border-subtle flex flex-col shrink-0">
      <button
        onClick={onOpen}
        className="flex flex-col items-center justify-center gap-2 py-4 hover:bg-background-body transition-colors"
        title="Open AI Analyst"
      >
        <div className="size-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
        </div>
        <span
          className="text-[10px] font-medium text-text-muted"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          AI Analyst
        </span>
      </button>
    </aside>
  );
}
