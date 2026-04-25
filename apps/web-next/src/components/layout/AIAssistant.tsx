"use client";

import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { api, NotFoundError } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";

// ── Types ────────────────────────────────────────────────────────────────────

type ContextType = "deal" | "dashboard" | "contacts" | "deals" | "memo" | "general";

interface ChatContext {
  type: ContextType;
  dealId?: string;
  dealName?: string;
}

interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

interface ChatResponse {
  response?: string;
  message?: string;
  reply?: string;
  content?: string;
  error?: string;
}

// ── Context helpers ──────────────────────────────────────────────────────────

function detectContext(pathname: string): ChatContext {
  // /deals/[id] — deal detail page
  const dealMatch = pathname.match(/^\/deals\/([^/]+)$/);
  if (dealMatch && dealMatch[1] !== "new") {
    return { type: "deal", dealId: dealMatch[1] };
  }
  if (pathname.startsWith("/dashboard")) return { type: "dashboard" };
  if (pathname.startsWith("/contacts")) return { type: "contacts" };
  if (pathname.startsWith("/deals")) return { type: "deals" };
  if (pathname.startsWith("/memo-builder")) return { type: "memo" };
  return { type: "general" };
}

function getContextIcon(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return "work";
    case "dashboard": return "dashboard";
    case "contacts": return "groups";
    case "deals": return "filter_alt";
    case "memo": return "description";
    default: return "auto_awesome";
  }
}

function getContextLabel(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return ctx.dealName || "Deal";
    case "dashboard": return "Portfolio";
    case "contacts": return "Contacts";
    case "deals": return "Deal Pipeline";
    case "memo": return "Memo";
    default: return "General";
  }
}

function getPlaceholder(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return `Ask about ${ctx.dealName || "this deal"}...`;
    case "dashboard": return "Ask about your portfolio...";
    case "contacts": return "Ask about relationships...";
    case "deals": return "Ask about your deal pipeline...";
    case "memo": return "Ask about this memo...";
    default: return "Ask AI anything...";
  }
}

function getWelcomeMessage(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal":
      return `I have full context on **${ctx.dealName || "this deal"}** — financials, documents, team, and activity. What would you like to know?`;
    case "dashboard":
      return "I can help you analyze your portfolio, spot trends, and surface insights across all your deals. What would you like to explore?";
    case "contacts":
      return "I can help with relationship insights, suggest follow-ups, and analyze your network. What do you need?";
    case "deals":
      return "I can help analyze your deal pipeline, compare deals, and identify patterns. What are you looking for?";
    default:
      return "Hi! I'm your AI assistant. Ask me anything about your deals, portfolio, or contacts.";
  }
}

// ── Inline style objects ─────────────────────────────────────────────────────
// Animations are defined in globals.css (ai-fab-pulse, ai-fade-in, etc.).
// Layout/color styles live here as inline style objects to avoid styled-jsx.

const S = {
  fab: {
    position: "fixed", bottom: 84, right: 24, zIndex: 9970,
    width: 52, height: 52, borderRadius: 16,
    background: "#003366", color: "#fff", border: "none",
    boxShadow: "0 4px 16px rgba(0,51,102,0.35), 0 0 0 0 rgba(0,51,102,0.2)",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
  } satisfies CSSProperties,

  overlay: {
    position: "fixed", inset: 0, zIndex: 9971,
    background: "rgba(0,0,0,0.2)", backdropFilter: "blur(2px)",
    animation: "aiFadeIn 0.15s ease-out",
  } satisfies CSSProperties,

  drawer: {
    position: "fixed", bottom: 24, right: 24, zIndex: 9972,
    width: 400, maxWidth: "calc(100vw - 48px)",
    height: 560, maxHeight: "calc(100vh - 48px)",
    background: "#fff", borderRadius: 16,
    boxShadow: "0 25px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)",
    display: "flex", flexDirection: "column", overflow: "hidden",
    animation: "aiDrawerIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
  } satisfies CSSProperties,

  header: {
    padding: "16px 16px 12px", borderBottom: "1px solid #E5E7EB",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "linear-gradient(135deg, #003366 0%, #004488 100%)",
    color: "#fff", borderRadius: "16px 16px 0 0",
  } satisfies CSSProperties,

  closeBtn: {
    background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
    width: 28, height: 28, borderRadius: 8,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s",
  } satisfies CSSProperties,

  messagesArea: {
    flex: 1, overflowY: "auto", padding: 16,
    display: "flex", flexDirection: "column", gap: 12,
  } satisfies CSSProperties,

  msgBase: {
    maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
    fontSize: 13, lineHeight: 1.5,
    animation: "aiMsgIn 0.2s ease-out",
  } satisfies CSSProperties,

  msgAssistant: {
    alignSelf: "flex-start", background: "#F3F4F6", color: "#111827",
    borderBottomLeftRadius: 4,
  } satisfies CSSProperties,

  msgUser: {
    alignSelf: "flex-end", background: "#003366", color: "#fff",
    borderBottomRightRadius: 4,
  } satisfies CSSProperties,

  typingWrap: {
    alignSelf: "flex-start", background: "#F3F4F6",
    padding: "10px 18px", borderRadius: 12, borderBottomLeftRadius: 4,
    display: "flex", gap: 4,
  } satisfies CSSProperties,

  typingDot: {
    width: 6, height: 6, background: "#9CA3AF", borderRadius: "50%",
    animation: "aiTypingDot 1.4s ease-in-out infinite",
  } satisfies CSSProperties,

  inputBar: {
    padding: "12px 16px", borderTop: "1px solid #E5E7EB",
    display: "flex", gap: 8, alignItems: "center", background: "#FAFAFA",
  } satisfies CSSProperties,

  input: {
    flex: 1, border: "1px solid #E5E7EB", borderRadius: 10,
    padding: "10px 14px", fontSize: 13, color: "#111827",
    background: "#fff", outline: "none", fontFamily: "'Inter', sans-serif",
    transition: "border-color 0.15s",
  } satisfies CSSProperties,

  sendBtn: {
    width: 36, height: 36, borderRadius: 10,
    background: "#003366", color: "#fff", border: "none",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s", flexShrink: 0,
  } satisfies CSSProperties,
} as const;

// ── Component ────────────────────────────────────────────────────────────────

export function AIAssistant() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [context, setContext] = useState<ChatContext>(() => detectContext(pathname));
  const [fabHover, setFabHover] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitRef = useRef(false);

  // Re-detect context on route change
  useEffect(() => {
    const ctx = detectContext(pathname);
    setContext(ctx);
    if (ctx.type === "deal" && ctx.dealId && !ctx.dealName) {
      const titleEl = document.getElementById("deal-title");
      if (titleEl?.textContent?.trim()) {
        setContext((prev) => ({ ...prev, dealName: titleEl.textContent!.trim() }));
      }
    }
  }, [pathname]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Add welcome message on first open (per session)
  const openDrawer = useCallback(() => {
    if (!hasInitRef.current) {
      const ctx = detectContext(pathname);
      setMessages([{ role: "assistant", content: getWelcomeMessage(ctx) }]);
      hasInitRef.current = true;
    }
    setIsOpen(true);
  }, [pathname]);

  const closeDrawer = useCallback(() => setIsOpen(false), []);

  const toggleDrawer = useCallback(() => {
    if (isOpen) closeDrawer();
    else openDrawer();
  }, [isOpen, openDrawer, closeDrawer]);

  // Keyboard shortcuts: Shift+Space toggle, Escape close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.shiftKey &&
        e.code === "Space" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (document.activeElement as HTMLElement)?.tagName ?? "",
        )
      ) {
        e.preventDefault();
        toggleDrawer();
      }
      if (e.key === "Escape" && isOpen) {
        closeDrawer();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleDrawer, isOpen, closeDrawer]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInputValue("");
    setIsLoading(true);

    try {
      let data: ChatResponse;

      if (context.type === "deal" && context.dealId) {
        data = await api.post<ChatResponse>(`/deals/${context.dealId}/chat`, {
          message: text,
        });
      } else {
        data = await api.post<ChatResponse>("/ai/chat", {
          message: text,
          context: context.type,
        });
      }

      const rawText =
        data.response || data.message || data.reply || data.content ||
        "I received your message but couldn't generate a response.";
      // Guard against non-string content (API may return an object on error)
      const aiText = typeof rawText === "string"
        ? rawText
        : (rawText as unknown as { message?: string; error?: string })?.message
          ?? (rawText as unknown as { message?: string; error?: string })?.error
          ?? JSON.stringify(rawText);

      setMessages((prev) => [...prev, { role: "assistant", content: aiText }]);
    } catch (err) {
      const errContent = err instanceof NotFoundError
        ? "The AI assistant service isn't available yet. Please check back soon."
        : "Sorry, I couldn't connect to the AI service. Please check your connection and try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: errContent }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputValue, isLoading, context]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────────────────── */}
      {!isOpen && (
        <button
          type="button"
          onClick={openDrawer}
          onMouseEnter={() => setFabHover(true)}
          onMouseLeave={() => setFabHover(false)}
          title="Ask AI (Shift+Space)"
          className="ai-fab-btn"
          style={{
            ...S.fab,
            ...(fabHover
              ? { transform: "scale(1.08)", boxShadow: "0 6px 24px rgba(0,51,102,0.4)" }
              : {}),
          }}
        >
          <span className="material-symbols-outlined text-2xl">auto_awesome</span>
        </button>
      )}

      {/* ── Overlay + Drawer ───────────────────────────────────────────── */}
      {isOpen && (
        <>
          <div style={S.overlay} onClick={closeDrawer} />

          <div style={S.drawer}>
            {/* header */}
            <div style={S.header}>
              <div>
                <div className="flex items-center gap-2 text-[15px] font-bold text-white">
                  <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                  AI Assistant
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-[11px] font-medium text-white/80">
                  {context.type !== "general" && (
                    <span className="material-symbols-outlined text-[14px]">
                      {getContextIcon(context)}
                    </span>
                  )}
                  {getContextLabel(context)}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="ai-close-btn"
                style={S.closeBtn}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {/* messages */}
            <div className="ai-messages-area" style={S.messagesArea}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={msg.role === "assistant" ? "ai-msg-assistant" : undefined}
                  style={{
                    ...S.msgBase,
                    ...(msg.role === "user" ? S.msgUser : S.msgAssistant),
                  }}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(
                      typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
                    ),
                  }}
                />
              ))}

              {/* typing indicator */}
              {isLoading && (
                <div style={S.typingWrap}>
                  <span style={{ ...S.typingDot }} />
                  <span style={{ ...S.typingDot, animationDelay: "0.2s" }} />
                  <span style={{ ...S.typingDot, animationDelay: "0.4s" }} />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* input bar */}
            <div style={S.inputBar}>
              <input
                ref={inputRef}
                className="ai-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={getPlaceholder(context)}
                autoComplete="off"
                style={{
                  ...S.input,
                  ...(inputFocused ? { borderColor: "#003366" } : {}),
                }}
              />
              <button
                type="button"
                className="ai-send-btn"
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                style={{
                  ...S.sendBtn,
                  ...(isLoading || !inputValue.trim()
                    ? { opacity: 0.4, cursor: "not-allowed" }
                    : {}),
                }}
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
