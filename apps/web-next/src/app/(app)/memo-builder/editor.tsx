"use client";

import React, { RefObject, useState } from "react";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import type { MemoSection, ChatMessage } from "./components";

// Sanitize AI-generated HTML for safe rendering. The content comes from our
// own API (memo section generate), not from user input, but we strip script
// tags and event handlers as defense-in-depth.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");
}

/* ------------------------------------------------------------------ */
/*  MemoEditor                                                         */
/* ------------------------------------------------------------------ */

export interface MemoEditorProps {
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
  onAddSection: () => void;
}

export function MemoEditor({
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
  onAddSection,
}: MemoEditorProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Section nav */}
      <div className="w-48 shrink-0 border-r border-border-subtle bg-background-body p-3 overflow-y-auto custom-scrollbar hidden md:block">
        <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2 px-2">Sections</p>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={cn(
              "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left mb-0.5",
              activeSection === section.id
                ? "bg-surface-card shadow-sm border border-border-subtle text-primary"
                : "text-text-secondary hover:bg-surface-card/50"
            )}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                activeSection === section.id ? "text-primary" : "text-text-muted"
              )}
            >
              drag_indicator
            </span>
            <span className="truncate">{section.title}</span>
            {activeSection === section.id && <div className="ml-auto size-1.5 rounded-full bg-primary shrink-0" />}
          </button>
        ))}

        {sections.length === 0 && (
          <p className="text-[11px] text-text-muted text-center py-6">No sections yet</p>
        )}

        <button
          onClick={onAddSection}
          className="flex items-center gap-1.5 w-full px-2.5 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/5 transition-colors mt-2"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Add Section
        </button>
      </div>

      {/* Content editor */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-background-body p-6">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-text-muted mb-2">article</span>
            <p className="text-sm font-medium text-text-main mb-1">No sections</p>
            <p className="text-xs text-text-muted">This memo has no sections yet. They will be created from the template.</p>
          </div>
        ) : (
          sections.map((section) => (
            <div
              key={section.id}
              id={`section-${section.id}`}
              className={cn(
                "mb-6 bg-surface-card rounded-xl border shadow-card p-5 transition-all",
                activeSection === section.id ? "border-primary/30 shadow-card-hover" : "border-border-subtle"
              )}
              onClick={() => setActiveSection(section.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-text-main">{section.title}</h3>
                  {section.aiGenerated && (
                    <span className="flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                      <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                      AI
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerate(section.id); }}
                    disabled={generatingSection === section.id}
                    className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    title="AI Generate"
                  >
                    {generatingSection === section.id ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    )}
                    Generate
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSave(section.id); }}
                    disabled={savingSection === section.id}
                    className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:bg-background-body transition-colors disabled:opacity-50"
                    title="Save section"
                  >
                    {savingSection === section.id ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">save</span>
                    )}
                    Save
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete({ id: section.id, title: section.title }); }}
                    className="h-7 px-1.5 rounded-md flex items-center text-text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete section"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              </div>
              <SectionContent
                sectionId={section.id}
                content={editingContent[section.id] || ""}
                onChange={(val) =>
                  setEditingContent((prev) => ({ ...prev, [section.id]: val }))
                }
                isActive={activeSection === section.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SectionContent — view/edit toggle                                  */
/* ------------------------------------------------------------------ */

function SectionContent({
  sectionId,
  content,
  onChange,
  isActive,
}: {
  sectionId: string;
  content: string;
  onChange: (val: string) => void;
  isActive: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  // Show rendered HTML when content has tags and we're not in edit mode
  if (hasHtml && !editing) {
    return (
      <div className="relative group">
        <div
          className="prose prose-sm max-w-none text-text-main leading-relaxed [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_p]:mb-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
          onClick={() => setEditing(true)}
        />
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-primary hover:bg-primary/5 transition-all bg-white/80 backdrop-blur-sm border border-border-subtle"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
          Edit
        </button>
      </div>
    );
  }

  return (
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
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-border-subtle bg-background-body px-4 py-3 text-sm text-text-main leading-relaxed placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-y"
        placeholder="Write section content here or click Generate to use AI..."
        autoFocus={isActive && editing}
      />
    </div>
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
    <div className="w-80 shrink-0 border-l border-border-subtle bg-surface-card flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
          <h3 className="text-sm font-bold text-text-main">AI Analyst</h3>
        </div>
        <button onClick={onToggleChat} className="text-text-muted hover:text-text-main transition-colors">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-background-body text-text-main border border-border-subtle rounded-bl-sm"
              )}
            >
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <div
                  className="chat-markdown space-y-1"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
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
            <div className="bg-background-body border border-border-subtle rounded-xl rounded-bl-sm px-4 py-3">
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
    </div>
  );
}
