"use client";

import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/formatters";
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
    <div className="flex flex-col bg-surface-card border border-border-subtle rounded-xl shadow-card overflow-hidden" style={{ height: "500px" }}>
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
          <div
            key={msg.id}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.role === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div
              className={cn(
                "size-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-purple-100 text-purple-700"
              )}
            >
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div
              className={cn(
                "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-gray-50 border border-border-subtle text-text-main"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {chatSending && (
          <div className="flex gap-3">
            <div className="size-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-xs font-semibold text-purple-700">
              AI
            </div>
            <div className="bg-gray-50 border border-border-subtle rounded-lg px-3.5 py-2.5">
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
