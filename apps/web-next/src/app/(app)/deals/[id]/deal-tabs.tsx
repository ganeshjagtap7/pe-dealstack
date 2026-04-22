"use client";

import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/formatters";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage, Activity } from "./components";

// ---------------------------------------------------------------------------
// Chat Tab
// ---------------------------------------------------------------------------

export function ChatTab({
  messages,
  chatInput,
  setChatInput,
  chatSending,
  onSend,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatSending: boolean;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex flex-col bg-surface-card border border-border-subtle rounded-xl shadow-card overflow-hidden h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
        <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-sm font-bold text-text-main tracking-wide">Deal Assistant AI</span>
        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-50 text-primary border border-primary/20">
          Beta
        </span>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <span className="material-symbols-outlined text-4xl mb-2">auto_awesome</span>
            <p className="text-sm font-medium">AI Deal Assistant</p>
            <p className="text-xs mt-1">Ask questions about this deal, request analysis, or get insights.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="size-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-emerald-700 text-[14px]">smart_toy</span>
              </div>
            )}
            <div className={cn(
              "max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-primary text-white rounded-br-sm"
                : "bg-white border border-border-subtle text-text-main rounded-bl-sm"
            )}>
              {msg.role === "assistant" && (
                <p className="text-[10px] text-text-muted font-medium mb-1">PE OS AI</p>
              )}
              {msg.role === "user" ? (
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div
                  className="chat-markdown space-y-1 break-words [&_p]:mb-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:mb-0.5 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }}
                />
              )}
            </div>
            {msg.role === "user" && (
              <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5 text-white text-xs font-bold">
                U
              </div>
            )}
          </div>
        ))}
        {chatSending && (
          <div className="flex gap-2.5">
            <div className="size-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-emerald-700 text-[14px]">smart_toy</span>
            </div>
            <div className="bg-white border border-border-subtle rounded-xl rounded-bl-sm px-3.5 py-2.5">
              <span className="material-symbols-outlined text-sm animate-spin text-text-muted">
                progress_activity
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-subtle p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted resize-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            placeholder="Ask about this deal..."
            rows={1}
          />
          <button
            onClick={onSend}
            disabled={!chatInput.trim() || chatSending}
            className="p-2 rounded-lg text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Tab
// ---------------------------------------------------------------------------

export function ActivityTab({
  activities,
  loading,
}: {
  activities: Activity[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="text-center py-16 text-text-muted">
        <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
        <p className="mt-2 text-sm">Loading activity...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
        <span className="material-symbols-outlined text-4xl text-text-muted">history</span>
        <p className="mt-2 text-sm text-text-muted">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl shadow-card p-5">
      <div className="relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border-subtle" />
        <div className="space-y-6">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-4 relative">
              <div className="size-6 rounded-full bg-blue-100 border-2 border-white z-10 shrink-0 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[12px] text-primary">circle</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-main">
                  {activity.userName && (
                    <span className="font-semibold">{activity.userName} </span>
                  )}
                  {activity.description || activity.action}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatRelativeTime(activity.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
