"use client";

import { useState, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage, Activity, DealDetail, DocItem } from "./components";
import { ClearChatModal } from "./components";
import { AISettingsModal } from "./deal-panels";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Suggestion Chips — personalized prompts based on deal data.
// Ported from apps/web/deal-chat.js (63dd4a0 + cf67cea): always visible,
// contextual copy when deal data is loaded, fall back to defaults otherwise.
// ---------------------------------------------------------------------------

type SuggestionPrompt = { icon: string; label: string; prompt: string };

function buildSuggestionPrompts(deal: DealDetail | null): SuggestionPrompt[] {
  if (!deal) return DEFAULT_PROMPTS;

  const name = deal.name || deal.companyName || "this company";
  const industry = deal.industry || null;
  const revenue = deal.revenue;
  const ebitda = deal.ebitda;
  const hasDocs = (deal.documents?.length || 0) > 0;

  const prompts: SuggestionPrompt[] = [];

  // 1. Deal-specific risk analysis
  prompts.push(industry
    ? {
        icon: "warning",
        label: `Risks in ${industry}`,
        prompt: `What are the top 3 risks for ${name} in the ${industry} space? Flag anything from the uploaded documents that concerns you.`,
      }
    : {
        icon: "warning",
        label: "Key risks & red flags",
        prompt: `What are the biggest risks and red flags for ${name}? Pull specific data points from the documents to support your analysis.`,
      });

  // 2. Financial deep-dive
  if (revenue != null && ebitda != null) {
    const fmtRev = formatCurrency(revenue, deal.currency);
    const fmtEbitda = formatCurrency(ebitda, deal.currency);
    const margin = revenue > 0 ? ((ebitda / revenue) * 100).toFixed(1) : null;
    prompts.push({
      icon: "analytics",
      label: "Margin & valuation analysis",
      prompt: `${name} shows ${fmtRev} revenue and ${fmtEbitda} EBITDA${margin ? ` (${margin}% margin)` : ""}. How do these margins compare to ${industry || "industry"} benchmarks? What valuation range would you estimate?`,
    });
  } else {
    prompts.push({
      icon: "analytics",
      label: "Financial health check",
      prompt: `Analyze the financial health of ${name}. What do the revenue, margins, and cash flow tell us? Compare to ${industry || "industry"} benchmarks.`,
    });
  }

  // 3. Investment thesis
  prompts.push({
    icon: "lightbulb",
    label: "Build investment thesis",
    prompt: `Write a 3-paragraph investment thesis for ${name}. Cover: (1) why this is an attractive opportunity, (2) key value creation levers post-acquisition, and (3) primary risks and mitigants. Use specific data from the documents.`,
  });

  // 4. DD questions
  prompts.push({
    icon: "checklist",
    label: "Due diligence questions",
    prompt: `Generate 10 targeted due diligence questions for ${name}'s management team. Focus on areas where the documents are weak or data is missing. Organize by category (financial, operational, legal, commercial).`,
  });

  // 5. Docs summary OR growth prompt
  prompts.push(hasDocs
    ? {
        icon: "description",
        label: "Summarize all documents",
        prompt: `Give me a structured summary of all uploaded documents for ${name}. For each document, list: key data points, anything surprising, and what's missing that we'd need for a full DD.`,
      }
    : {
        icon: "trending_up",
        label: "Growth & exit potential",
        prompt: `What is the growth potential for ${name}${industry ? ` in ${industry}` : ""}? Outline 3 realistic exit scenarios with estimated timeline and return multiples.`,
      });

  return prompts;
}

const DEFAULT_PROMPTS: SuggestionPrompt[] = [
  { icon: "warning", label: "Key risks & red flags", prompt: "What are the biggest risks and red flags for this deal? Pull specific data points from the documents." },
  { icon: "analytics", label: "Financial health check", prompt: "Analyze the financial health of this company. What do revenue, margins, and cash flow tell us?" },
  { icon: "lightbulb", label: "Build investment thesis", prompt: "Write a 3-paragraph investment thesis covering: why it's attractive, value creation levers, and key risks with mitigants." },
  { icon: "checklist", label: "Due diligence questions", prompt: "Generate 10 targeted due diligence questions for management, organized by category (financial, operational, legal, commercial)." },
  { icon: "trending_up", label: "Growth & exit potential", prompt: "Outline 3 realistic exit scenarios with estimated timeline and return multiples." },
];

function SuggestionChips({ deal, onPick }: { deal: DealDetail | null; onPick: (prompt: string) => void }) {
  const prompts = buildSuggestionPrompts(deal);
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1.5 border-t border-border-subtle bg-surface-card">
      {prompts.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.prompt)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium rounded-full border transition-all cursor-pointer hover:shadow-sm"
          style={{ color: "#003366", background: "#f0f4f8", borderColor: "rgba(0,51,102,0.15)" }}
          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#e4ecf4"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,51,102,0.3)"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f0f4f8"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,51,102,0.15)"; }}
        >
          <span className="material-symbols-outlined text-[14px] shrink-0" style={{ color: "#003366" }}>{p.icon}</span>
          <span className="whitespace-nowrap">{p.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Document Indicators (colored doc circles in chat header)
// ---------------------------------------------------------------------------

function ContextDocIndicators({ documents }: { documents: DocItem[] }) {
  if (!documents || documents.length === 0) return null;

  const icons: Record<string, string> = { pdf: "P", xlsx: "X", xls: "X", csv: "C" };
  const bgColors = ["bg-red-100", "bg-emerald-100", "bg-blue-100", "bg-purple-100"];
  const textColors = ["text-red-700", "text-emerald-700", "text-blue-700", "text-purple-700"];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted font-medium">Context:</span>
      <div className="flex -space-x-2">
        {documents.slice(0, 3).map((doc, i) => {
          const ext = doc.name.split(".").pop()?.toLowerCase() || "";
          const icon = icons[ext] || "D";
          return (
            <div
              key={doc.id}
              className={cn(
                "size-6 rounded-full border border-white flex items-center justify-center text-[10px] font-bold shadow-sm",
                bgColors[i % bgColors.length],
                textColors[i % textColors.length]
              )}
              style={{ zIndex: 20 - i * 10 }}
              title={doc.name}
            >
              {icon}
            </div>
          );
        })}
        {documents.length > 3 && (
          <div className="size-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[10px] text-text-secondary z-0 shadow-sm">
            +{documents.length - 3}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI message action buttons (Helpful / Copy) — ported from deal-chat.js
// ---------------------------------------------------------------------------

function AIMessageActions({ content }: { content: string }) {
  const [helpful, setHelpful] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-2 ml-1 mt-1">
      <button
        onClick={() => setHelpful(true)}
        className={cn(
          "text-[10px] flex items-center gap-1 transition-colors font-medium",
          helpful ? "text-primary" : "text-text-muted hover:text-primary"
        )}
      >
        <span className="material-symbols-outlined text-sm">thumb_up</span>
        {helpful ? "Marked helpful" : "Helpful"}
      </button>
      <button
        onClick={async () => {
          try {
            // Strip HTML for plain text copy
            const tmp = document.createElement("div");
            tmp.innerHTML = DOMPurify.sanitize(renderMarkdown(content));
            await navigator.clipboard.writeText(tmp.innerText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // ignore
          }
        }}
        className={cn(
          "text-[10px] flex items-center gap-1 transition-colors font-medium",
          copied ? "text-primary" : "text-text-muted hover:text-primary"
        )}
      >
        <span className="material-symbols-outlined text-sm">
          {copied ? "check" : "content_copy"}
        </span>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Tab
// ---------------------------------------------------------------------------

export function ChatTab({
  deal,
  messages,
  chatInput,
  setChatInput,
  chatSending,
  onSend,
  onSendPrompt,
  onClearChat,
  chatEndRef,
}: {
  deal: DealDetail | null;
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatSending: boolean;
  onSend: () => void;
  onSendPrompt: (text: string) => void;
  onClearChat?: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; status: "uploading" | "done" | "error" }>>([]);
  const [textareaFocused, setTextareaFocused] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !deal) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Validate size (25MB max)
    if (file.size > 25 * 1024 * 1024) return;

    const entry = { name: file.name, status: "uploading" as const };
    setAttachedFiles((prev) => [...prev, entry]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/deals/${deal.id}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");

      setAttachedFiles((prev) =>
        prev.map((f) => (f.name === file.name && f.status === "uploading" ? { ...f, status: "done" } : f))
      );
    } catch {
      setAttachedFiles((prev) =>
        prev.map((f) => (f.name === file.name && f.status === "uploading" ? { ...f, status: "error" } : f))
      );
    }
  }, [deal]);

  const removeAttached = (name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const documents = deal?.documents || [];

  return (
    <>
      <div className="flex flex-col overflow-hidden h-full">
        {/* Header — matches legacy chat header */}
        <div className="h-12 border-b border-border-subtle flex items-center justify-between px-4 bg-surface-card/80 backdrop-blur z-20 sticky top-0">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-sm font-bold text-text-main tracking-wide">Deal Assistant AI</span>
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-primary-light text-primary border border-primary/20">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ContextDocIndicators documents={documents} />
            <button
              onClick={() => setShowClearModal(true)}
              className="text-text-muted hover:text-red-500 transition-colors"
              title="Clear chat history"
            >
              <span className="material-symbols-outlined text-lg">delete_sweep</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="text-text-muted hover:text-text-main transition-colors"
              title="AI settings"
            >
              <span className="material-symbols-outlined text-lg">settings</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col custom-scrollbar">
          {/* Welcome message when no history (matches legacy ai-intro-message) */}
          {messages.length === 0 && (
            <div className="ai-intro-message flex gap-4 max-w-[90%]">
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <span className="material-symbols-outlined text-white text-lg">smart_toy</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-text-muted ml-1">PE OS AI</span>
                <div className="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                  {deal?.aiThesis ? (
                    <>
                      <p>I&apos;ve analyzed the documents for <strong>{deal.name}</strong>. {deal.aiThesis}</p>
                      <p className="mt-2">What would you like to know about this deal?</p>
                    </>
                  ) : (
                    <>
                      <p>I&apos;m ready to help analyze this deal. Ask me about financials, risks, or any uploaded documents.</p>
                      <p className="mt-2">What would you like to know?</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              /* User message — matches legacy addUserMessage / addUserMessageFromHistory */
              <div key={msg.id} className="flex gap-4 max-w-[80%] self-end flex-row-reverse animate-fadeIn">
                <div className="size-8 rounded-full bg-[#003366] border border-white shrink-0 flex items-center justify-center shadow-sm">
                  <span className="text-[11px] text-white font-bold">U</span>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className="text-xs font-bold text-text-muted mr-1">You</span>
                  <div className="bg-white text-text-main border border-border-subtle rounded-2xl rounded-tr-none p-4 text-sm shadow-sm">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* AI message — matches legacy addAIResponseFromAPI / addAIResponseFromHistory */
              <div key={msg.id} className="flex gap-4 max-w-[90%] animate-fadeIn">
                <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                  <span className="material-symbols-outlined text-white text-lg">smart_toy</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-text-muted ml-1">PE OS AI</span>
                  <div className="ai-bubble-gradient border border-border-subtle rounded-2xl rounded-tl-none p-4 text-sm text-text-secondary shadow-sm">
                    <div
                      className="chat-markdown space-y-1 break-words [&_p]:mb-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:mb-0.5 [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }}
                    />
                  </div>
                  {/* Helpful / Copy buttons */}
                  <AIMessageActions content={msg.content} />
                </div>
              </div>
            )
          )}

          {/* Typing indicator */}
          {chatSending && (
            <div className="flex gap-4 max-w-[90%] animate-fadeIn">
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <span className="material-symbols-outlined text-white text-lg">smart_toy</span>
              </div>
              <div className="flex flex-col gap-1 justify-center">
                <div className="bg-white border border-border-subtle rounded-2xl rounded-tl-none px-4 py-3 text-sm text-text-secondary shadow-sm w-16">
                  <div className="flex gap-1">
                    <div className="size-1.5 bg-text-muted rounded-full animate-bounce" />
                    <div className="size-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <div className="size-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Suggestion chips — always visible above the input (per cf67cea) */}
        <SuggestionChips deal={deal} onPick={onSendPrompt} />

        {/* Input area with attachment support */}
        <div className="p-3 bg-surface-card border-t-0 relative z-30">
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto custom-scrollbar">
              {attachedFiles.map((f) => (
                <div
                  key={f.name}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs",
                    f.status === "uploading" && "bg-primary-light border border-primary/20",
                    f.status === "done" && "bg-primary-light border border-primary/20",
                    f.status === "error" && "bg-red-50 border border-red-200"
                  )}
                >
                  <span className={cn(
                    "material-symbols-outlined text-sm",
                    f.status === "uploading" && "text-primary animate-spin",
                    f.status === "done" && "text-green-600",
                    f.status === "error" && "text-red-500"
                  )}>
                    {f.status === "uploading" ? "sync" : f.status === "done" ? "check_circle" : "error"}
                  </span>
                  <span className="text-text-secondary font-medium truncate max-w-[150px]">{f.name}</span>
                  {f.status !== "uploading" && (
                    <button
                      onClick={() => removeAttached(f.name)}
                      className="text-text-muted hover:text-red-500 transition-colors ml-1"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="relative bg-background-body rounded-xl border border-border-subtle shadow-inner focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setTextareaFocused(true)}
              onBlur={() => setTextareaFocused(false)}
              className="w-full bg-transparent border-none text-text-main placeholder:text-text-muted px-4 py-3 pr-24 focus:ring-0 resize-none min-h-[50px] max-h-32 text-sm leading-relaxed"
              placeholder="Ask about the deal, financials, or risks..."
              rows={1}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
                onChange={handleFileAttach}
              />
              {(textareaFocused || attachedFiles.length > 0) && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-colors"
                  title="Attach File"
                >
                  <span className="material-symbols-outlined text-[20px]">attach_file</span>
                </button>
              )}
              <button
                onClick={onSend}
                disabled={!chatInput.trim() || chatSending}
                className="p-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-md shadow-primary/30 disabled:opacity-40"
                title="Send Message"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
              </button>
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-text-muted">
              AI can make mistakes. Verify critical data from original documents.
            </p>
          </div>
        </div>
      </div>

      {/* Clear Chat Confirmation Modal */}
      {showClearModal && (
        <ClearChatModal
          onConfirm={() => {
            setShowClearModal(false);
            onClearChat?.();
          }}
          onCancel={() => setShowClearModal(false)}
        />
      )}

      {/* AI Settings Modal */}
      {showSettings && <AISettingsModal onClose={() => setShowSettings(false)} />}
    </>
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
      <div className="text-center py-12 text-text-muted">
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
        <p className="mt-2 text-sm">Loading activity...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border-subtle rounded-lg">
        <span className="material-symbols-outlined text-3xl text-text-muted">history</span>
        <p className="mt-2 text-sm text-text-muted">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5" style={{ background: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(229, 231, 235, 0.8)", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
      <div className="relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border-subtle" />
        <div className="space-y-5">
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
