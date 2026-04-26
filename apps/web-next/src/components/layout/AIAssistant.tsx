"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useParams, usePathname } from "next/navigation";
import { api, NotFoundError } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import {
  detectContext,
  getWelcomeMessage,
  type ChatContext,
  type ChatMessage,
  type ChatResponse,
  type ContextType,
} from "./ai-assistant-shared";
import { AIAssistantDrawer } from "./AIAssistantDrawer";

// ── Persistence ──────────────────────────────────────────────────────────────
// Per-context history bucket so deal/portfolio/contacts/memo conversations
// don't bleed into each other when the user moves between pages.

const MAX_PERSISTED_MESSAGES = 40;

type HistoryStore = Partial<Record<ContextType, ChatMessage[]>>;

function historyKey(): string {
  return STORAGE_KEYS.aiAssistantHistory;
}

function loadHistory(ctx: ChatContext): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(historyKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryStore;
    const bucket = parsed?.[ctx.type];
    if (!Array.isArray(bucket)) return [];
    return bucket.filter(
      (m) =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

function saveHistory(ctx: ChatContext, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(historyKey());
    const parsed: HistoryStore = raw ? JSON.parse(raw) : {};
    parsed[ctx.type] = messages.slice(-MAX_PERSISTED_MESSAGES);
    window.localStorage.setItem(historyKey(), JSON.stringify(parsed));
  } catch {
    // Quota or parse error — silent fail, history is best-effort
  }
}

// ── FAB style (drawer styles live in AIAssistantDrawer.tsx) ──────────────────

const fabStyle: CSSProperties = {
  position: "fixed", bottom: 84, right: 24, zIndex: 9970,
  width: 52, height: 52, borderRadius: 16,
  background: "#003366", color: "#fff", border: "none",
  boxShadow: "0 4px 16px rgba(0,51,102,0.35), 0 0 0 0 rgba(0,51,102,0.2)",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
};

// Routes where the global FAB+drawer should not render. Deal-detail pages
// have their own integrated chat panel, the data-room renders its own header,
// and unauth pages obviously shouldn't surface the assistant.
function isHiddenRoute(pathname: string): boolean {
  if (/^\/deals\/[^/]+$/.test(pathname)) return true;
  if (/^\/data-room\/[^/]/.test(pathname)) return true;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/verify-email")
  ) return true;
  return false;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AIAssistant() {
  const pathname = usePathname();
  const params = useParams();

  const context = useMemo<ChatContext>(
    () => detectContext(pathname, params as Record<string, string | string[] | undefined>),
    [pathname, params],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [fabHover, setFabHover] = useState(false);

  // Track which context's history is currently loaded so we re-hydrate when
  // the user navigates between contexts while the drawer is open.
  const loadedCtxRef = useRef<ContextType | null>(null);
  const hidden = isHiddenRoute(pathname);

  // Hydrate messages for the active context (load persisted history, prepend
  // welcome if empty). Runs whenever context.type changes.
  useEffect(() => {
    if (loadedCtxRef.current === context.type) return;
    const persisted = loadHistory(context);
    if (persisted.length > 0) {
      setMessages(persisted);
    } else {
      setMessages([{ role: "assistant", content: getWelcomeMessage(context) }]);
    }
    loadedCtxRef.current = context.type;
  }, [context]);

  // Persist on every change (cheap; bucket is small).
  useEffect(() => {
    if (loadedCtxRef.current !== context.type) return;
    saveHistory(context, messages);
  }, [messages, context]);

  // Keyboard shortcuts: Shift+Space toggle, Escape close.
  const toggleDrawer = useCallback(() => setIsOpen((v) => !v), []);
  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.shiftKey &&
        e.code === "Space" &&
        !isTypingTarget(document.activeElement)
      ) {
        e.preventDefault();
        // Don't open the AI drawer when a modal overlay is active.
        if (!isOpen && document.querySelector("[data-modal-overlay]")) return;
        toggleDrawer();
      }
      if (e.key === "Escape" && isOpen) closeDrawer();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleDrawer, isOpen, closeDrawer]);

  // ── Send message ───────────────────────────────────────────────────────────

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setIsLoading(true);

      try {
        let data: ChatResponse;
        if (context.type === "deal" && context.dealId) {
          data = await api.post<ChatResponse>(`/deals/${context.dealId}/chat`, {
            message: trimmed,
          });
        } else {
          data = await api.post<ChatResponse>("/ai/chat", {
            message: trimmed,
            context: context.type,
          });
        }

        const rawText =
          data.response || data.message || data.reply || data.content ||
          "I received your message but couldn't generate a response.";
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
      }
    },
    [isLoading, context],
  );

  const handleSend = useCallback(() => {
    const text = inputValue;
    setInputValue("");
    void send(text);
  }, [inputValue, send]);

  const handleSendPrompt = useCallback(
    (prompt: string) => {
      setInputValue("");
      void send(prompt);
    },
    [send],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (hidden) return null;

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={openDrawer}
          onMouseEnter={() => setFabHover(true)}
          onMouseLeave={() => setFabHover(false)}
          title="Ask AI (Shift+Space)"
          aria-label="Open AI Assistant"
          className="ai-fab-btn"
          style={{
            ...fabStyle,
            ...(fabHover
              ? { transform: "scale(1.08)", boxShadow: "0 6px 24px rgba(0,51,102,0.4)" }
              : {}),
          }}
        >
          <span className="material-symbols-outlined text-2xl">auto_awesome</span>
        </button>
      )}

      {isOpen && (
        <AIAssistantDrawer
          context={context}
          messages={messages}
          isLoading={isLoading}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onClose={closeDrawer}
          onSend={handleSend}
          onSendPrompt={handleSendPrompt}
        />
      )}
    </>
  );
}
