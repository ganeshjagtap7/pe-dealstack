"use client";

import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatMessage, Activity, DealDetail } from "./components";

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
    <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border-subtle bg-white">
      {prompts.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.prompt)}
          className="flex items-start gap-2 px-3.5 py-2.5 text-left text-xs font-medium rounded-xl transition-colors cursor-pointer"
          style={{
            border: "1px solid #00336622",
            color: "#003366",
            background: "#f0f4f8",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e0e8f0";
            e.currentTarget.style.borderColor = "#00336644";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f0f4f8";
            e.currentTarget.style.borderColor = "#00336622";
          }}
        >
          <span className="material-symbols-outlined text-sm mt-px shrink-0">{p.icon}</span>
          <span className="leading-relaxed">{p.label}</span>
        </button>
      ))}
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
  chatEndRef,
}: {
  deal: DealDetail | null;
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatSending: boolean;
  onSend: () => void;
  onSendPrompt: (text: string) => void;
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

      {/* Suggestion chips — always visible above the input (per cf67cea) */}
      <SuggestionChips deal={deal} onPick={onSendPrompt} />

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
