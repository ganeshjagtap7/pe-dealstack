"use client";

import { RefObject, useRef } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage } from "./components";

/* ------------------------------------------------------------------ */
/*  Prompt chips                                                       */
/* ------------------------------------------------------------------ */

const PROMPT_CHIPS = [
  "Summarize the key risks",
  "Draft the executive summary",
  "What financial data is missing?",
  "Compare to industry benchmarks",
  "Strengthen the investment thesis",
];

/* ------------------------------------------------------------------ */
/*  MemoChat                                                           */
/* ------------------------------------------------------------------ */

export interface MemoChatProps {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!chatOpen) return null;

  return (
    <aside className="w-[360px] shrink-0 border-l border-border-subtle bg-surface-card flex flex-col overflow-hidden shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border-subtle flex items-center justify-between bg-surface-card">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          </div>
          <span className="font-bold text-text-main text-sm">AI Analyst</span>
        </div>
        <button
          onClick={onToggleChat}
          className="p-1 rounded hover:bg-background-body text-text-muted hover:text-text-secondary transition-colors"
          title="Collapse panel"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4 bg-background-body">
        {messages.map((msg) =>
          msg.role === "assistant" ? (
            <div key={msg.id} className="flex gap-3">
              <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
                <span className="material-symbols-outlined text-[16px]">smart_toy</span>
              </div>
              <div className="flex flex-col gap-1 max-w-[85%]">
                <span className="text-[11px] font-semibold text-text-muted ml-1">
                  AI Analyst &bull; {msg.timestamp}
                </span>
                <div className="bg-surface-card border border-border-subtle rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-text-secondary leading-relaxed">
                  <div
                    className="chat-markdown space-y-1"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex gap-3 flex-row-reverse">
              <div
                className="size-8 shrink-0 rounded-full flex items-center justify-center mt-1"
                style={{ backgroundColor: "#003366" }}
              >
                <span className="text-[11px] text-white font-bold">U</span>
              </div>
              <div className="flex flex-col gap-1 items-end max-w-[85%]">
                <span className="text-[11px] font-semibold text-text-muted mr-1">
                  You &bull; {msg.timestamp}
                </span>
                <div className="bg-primary text-white rounded-2xl rounded-tr-none p-3 shadow-sm text-sm leading-relaxed">
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            </div>
          )
        )}
        {sendingChat && (
          <div className="flex gap-3">
            <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
              <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-text-muted ml-1">
                AI Analyst &bull; typing...
              </span>
              <div className="bg-surface-card border border-border-subtle rounded-2xl rounded-tl-none p-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="size-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-surface-card border-t border-border-subtle">
        {/* Prompt chips */}
        {messages.length < 3 && (
          <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
            {PROMPT_CHIPS.map((chip, i) => (
              <button
                key={chip}
                onClick={() => setChatInput(chip)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors border",
                  i === 0
                    ? "bg-primary-light text-primary border-primary/20"
                    : "bg-background-body text-text-secondary border-border-subtle"
                )}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        {/* Input box */}
        <div className="relative">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={3}
            className="w-full resize-none rounded-xl border border-border-subtle bg-background-body pl-4 pr-12 py-3 text-sm focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-text-muted"
            placeholder="Ask AI to analyze, rewrite, or visualize data..."
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-text-muted hover:text-primary rounded-lg transition-colors"
              title="Upload context"
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <button
              onClick={onSend}
              disabled={!chatInput.trim() || sendingChat}
              className="p-1.5 text-white rounded-lg hover:opacity-90 transition-opacity shadow-sm disabled:opacity-40"
              style={{ backgroundColor: "#003366" }}
              title="Send message"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex justify-between items-center px-1">
          <span className="text-[10px] text-text-muted">
            AI can make mistakes. Review generated financial data.
          </span>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xlsx,.xls,.doc,.docx,.csv"
          multiple
          onChange={() => {
            fileInputRef.current && (fileInputRef.current.value = "");
          }}
        />
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
