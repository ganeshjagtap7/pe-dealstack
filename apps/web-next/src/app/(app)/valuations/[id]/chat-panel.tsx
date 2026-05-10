"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";

const PROMPT_CHIPS: { icon: string; label: string; prompt: string }[] = [
  { icon: "trending_up", label: "Push IRR to 25%", prompt: "What's the smallest single change I could make to push IRR above 25%?" },
  { icon: "warning", label: "Stress: high rates", prompt: "Stress test with interest rate at 12% and exit multiple at 8x. What happens to MOIC?" },
  { icon: "savings", label: "Lower leverage", prompt: "Drop debt to 40% of EV and tell me the new IRR." },
  { icon: "speed", label: "3-year hold", prompt: "Re-run the model with a 3-year hold period." },
  { icon: "summarize", label: "Explain returns", prompt: "Walk me through how MOIC and IRR are calculated for this model." },
];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  onSend: () => void;
}

export function ChatPanel({ messages, input, setInput, sending, onSend }: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  return (
    <aside
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-white"
      style={{ width: "400px", boxShadow: "-4px 0 24px -12px rgba(0,0,0,0.1)" }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-3">
        <div className="size-6 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
        </div>
        <span className="text-sm font-bold text-text-primary">LBO Analyst</span>
        <span className="ml-auto text-[11px] text-text-secondary">Talk to modify the model</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-4 py-4 flex flex-col gap-4">
        {messages.length === 0 && !sending && <EmptyState onPick={(p) => setInput(p)} />}
        {messages.map((m) => (m.role === "assistant" ? <AssistantBubble key={m.id} message={m} /> : <UserBubble key={m.id} message={m} />))}
        {sending && <TypingBubble />}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-white p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setInput(chip.prompt)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-slate-100 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-primary-light hover:text-primary"
            >
              <span className="material-symbols-outlined text-[14px]">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={3}
            placeholder="Ask the analyst — try “raise debt to 60%” or “stress test the exit multiple”…"
            className="w-full resize-none rounded-xl border border-border bg-slate-50 pl-3 pr-12 py-3 text-sm focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim() || sending}
            className="absolute right-2 bottom-2 rounded-lg p-1.5 text-white shadow-sm hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: "#003366" }}
            title="Send"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
        <p className="mt-2 px-1 text-[10px] text-text-secondary">
          AI can make mistakes — review changes in the grid before relying on them.
        </p>
      </div>
    </aside>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center px-4 pt-6">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mb-3">
        <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
      </div>
      <h3 className="text-sm font-semibold text-text-primary">Talk to modify the model</h3>
      <p className="mt-1 text-xs text-text-secondary max-w-[260px]">
        I can read the current model, run stress tests, and update assumptions on your behalf. Try a prompt below.
      </p>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
        <span className="material-symbols-outlined text-[16px]">smart_toy</span>
      </div>
      <div className="flex flex-col gap-1 max-w-[85%]">
        <span className="text-[11px] font-semibold text-text-secondary ml-1">
          LBO Analyst &bull; {message.timestamp}
        </span>
        <div className="rounded-2xl rounded-tl-none border border-border bg-white p-3 shadow-sm text-sm text-text-primary leading-relaxed">
          <div
            className="chat-markdown space-y-1"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(message.content)) }}
          />
        </div>
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex gap-3 flex-row-reverse">
      <div
        className="size-8 shrink-0 rounded-full border border-white flex items-center justify-center mt-1"
        style={{ backgroundColor: "#003366" }}
      >
        <span className="text-[11px] text-white font-bold">U</span>
      </div>
      <div className="flex flex-col gap-1 items-end max-w-[85%]">
        <span className="text-[11px] font-semibold text-text-secondary mr-1">
          You &bull; {message.timestamp}
        </span>
        <div
          className="rounded-2xl rounded-tr-none p-3 text-sm leading-relaxed text-white shadow-sm"
          style={{ backgroundColor: "#003366" }}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex gap-3">
      <div className="size-8 shrink-0 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm mt-1">
        <span className="material-symbols-outlined text-[16px]">smart_toy</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-text-secondary ml-1">LBO Analyst &bull; thinking…</span>
        <div className="rounded-2xl rounded-tl-none border border-border bg-white p-3 shadow-sm">
          <div className="flex gap-1">
            <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
