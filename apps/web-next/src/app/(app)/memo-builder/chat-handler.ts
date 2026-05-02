// Chat send handler extracted from page.tsx. Mirrors the legacy
// apps/web/memo-chat.js refresh-on-applied behavior: when the agent
// surfaces an "applied" action (e788eb3 + b609ebd on main), reload the
// memo so the new section state is visible in the editor. Behavior is
// unchanged from the inline implementation in page.tsx.

import { Dispatch, SetStateAction } from "react";
import { api, NotFoundError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { ChatMessage, Memo } from "./components";

// Agent responses can carry an "action" field — see comment above for the
// background. 'applied' means the agent added, removed, or regenerated a
// section server-side. When we see it, reload the memo.
export type MemoChatResponse = {
  role?: string;
  content: string;
  timestamp?: string;
  action?: string;
  sectionId?: string;
  type?: string;
  sectionType?: string;
  title?: string;
};

interface ChatDeps {
  selectedMemo: Memo | null;
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSendingChat: Dispatch<SetStateAction<boolean>>;
  setSuccessToast: Dispatch<SetStateAction<string | null>>;
  loadMemo: (id: string) => Promise<void>;
}

export function createSendMessage(deps: ChatDeps) {
  const {
    selectedMemo,
    chatInput,
    setChatInput,
    setMessages,
    setSendingChat,
    setSuccessToast,
    loadMemo,
  } = deps;

  return async () => {
    if (!chatInput.trim() || !selectedMemo) return;
    const content = chatInput.trim();
    setChatInput("");

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content,
      timestamp: "Now",
    };
    setMessages((prev) => [...prev, userMsg]);
    setSendingChat(true);

    try {
      const res = await api.post<MemoChatResponse>(`/memos/${selectedMemo.id}/chat`, { content });
      const aiMsg: ChatMessage = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: res.content,
        timestamp: res.timestamp ? formatRelativeTime(res.timestamp) : "Now",
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.action === "applied" && selectedMemo) {
        await loadMemo(selectedMemo.id);
        if (res.type === "new_section" && res.title) {
          setSuccessToast(`Section "${res.title}" added.`);
        } else if (res.type === "remove_section") {
          setSuccessToast("Section removed.");
        }
      }
    } catch (err) {
      const msg = err instanceof NotFoundError
        ? "The AI assistant service isn't available for this memo yet."
        : "Sorry, I encountered an error. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "assistant", content: msg, timestamp: "Now" },
      ]);
    } finally {
      setSendingChat(false);
    }
  };
}
