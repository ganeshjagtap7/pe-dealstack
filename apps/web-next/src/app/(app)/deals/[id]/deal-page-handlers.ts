// ---------------------------------------------------------------------------
// Pure event handlers for the deal page. These intentionally don't use React
// hooks — they're plain async functions that take dependencies (state setters,
// router, toast, etc.) as parameters. This keeps page.tsx focused on
// composition and state, while the bodies live in one place.
//
// Do NOT import from "react" here. If you need a hook (useCallback,
// useEffect), define the handler inline in page.tsx instead.
// ---------------------------------------------------------------------------

import type { Dispatch, SetStateAction } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import {
  type DealDetail,
  type DocItem,
  type ChatMessage,
  TERMINAL_STAGES,
} from "./components";

type ShowToast = (
  message: string,
  type?: "success" | "error" | "info" | "warning",
  options?: { title?: string }
) => void;

// ---------------------------------------------------------------------------
// Stage change
// ---------------------------------------------------------------------------

export interface OpenStageModalDeps {
  deal: DealDetail | null;
  setStageModal: Dispatch<SetStateAction<{ from: string; to: string } | null>>;
  setStageNote: Dispatch<SetStateAction<string>>;
}

export function openStageModal(targetStage: string, deps: OpenStageModalDeps): void {
  const { deal, setStageModal, setStageNote } = deps;
  if (!deal || targetStage === deal.stage) return;
  if (TERMINAL_STAGES.includes(deal.stage)) return;
  setStageModal({ from: deal.stage, to: targetStage });
  setStageNote("");
}

export interface OpenTerminalModalDeps {
  deal: DealDetail | null;
  setShowTerminalModal: Dispatch<SetStateAction<boolean>>;
}

export function openTerminalModal(deps: OpenTerminalModalDeps): void {
  const { deal, setShowTerminalModal } = deps;
  if (!deal) return;
  if (TERMINAL_STAGES.includes(deal.stage)) return;
  setShowTerminalModal(true);
}

export interface ConfirmStageChangeDeps {
  dealId: string;
  stageModal: { from: string; to: string } | null;
  deal: DealDetail | null;
  setStageChanging: Dispatch<SetStateAction<boolean>>;
  setStageError: Dispatch<SetStateAction<string>>;
  setDeal: Dispatch<SetStateAction<DealDetail | null>>;
  setStageModal: Dispatch<SetStateAction<{ from: string; to: string } | null>>;
  loadActivities: () => Promise<void>;
}

export async function confirmStageChange(deps: ConfirmStageChangeDeps): Promise<void> {
  const {
    dealId,
    stageModal,
    deal,
    setStageChanging,
    setStageError,
    setDeal,
    setStageModal,
    loadActivities,
  } = deps;
  if (!stageModal || !deal) return;
  setStageChanging(true);
  setStageError("");
  try {
    const updated = await api.patch<DealDetail>(`/deals/${dealId}`, {
      stage: stageModal.to,
    });
    setDeal(updated);
    setStageModal(null);
    loadActivities();
  } catch (err) {
    setStageError(err instanceof Error ? err.message : "Failed to update deal stage");
  } finally {
    setStageChanging(false);
  }
}

export interface SelectTerminalStageDeps {
  dealId: string;
  setShowTerminalModal: Dispatch<SetStateAction<boolean>>;
  setDeal: Dispatch<SetStateAction<DealDetail | null>>;
  loadActivities: () => Promise<void>;
  showToast: ShowToast;
}

export async function selectTerminalStage(
  stage: string,
  deps: SelectTerminalStageDeps,
): Promise<void> {
  const { dealId, setShowTerminalModal, setDeal, loadActivities, showToast } = deps;
  setShowTerminalModal(false);
  try {
    const updated = await api.patch<DealDetail>(`/deals/${dealId}`, { stage });
    setDeal(updated);
    loadActivities();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Failed to update deal stage", "error");
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export interface ConfirmDeleteDealDeps {
  dealId: string;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  router: { push: (href: string) => void };
  showToast: ShowToast;
}

export async function confirmDeleteDeal(deps: ConfirmDeleteDealDeps): Promise<void> {
  const { dealId, setShowDeleteConfirm, router, showToast } = deps;
  setShowDeleteConfirm(false);
  try {
    await api.delete(`/deals/${dealId}`);
    router.push("/deals");
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Failed to delete deal", "error");
  }
}

// ---------------------------------------------------------------------------
// Document upload
// ---------------------------------------------------------------------------

export interface UploadDocumentsDeps {
  dealId: string;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setDocuments: Dispatch<SetStateAction<DocItem[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showToast: ShowToast;
}

export async function uploadDocuments(
  e: React.ChangeEvent<HTMLInputElement>,
  deps: UploadDocumentsDeps,
): Promise<void> {
  const { dealId, setUploading, setDocuments, fileInputRef, showToast } = deps;
  const files = e.target.files;
  if (!files?.length) return;
  setUploading(true);
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    const res = await fetch(`/api/deals/${dealId}/documents`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    const result = await res.json();
    const newDocs: DocItem[] = result.documents || result || [];
    setDocuments((prev) => [...prev, ...newDocs]);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Document upload failed", "error");
  } finally {
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

interface ChatResponseShape {
  response: string;
  model?: string;
  action?: { type: string; label: string; description?: string; url: string };
  updates?: Array<{ field: string; value: unknown }>;
  sideEffects?: Array<{
    type: "note_added" | "extraction_triggered" | "scroll_to";
    section?: string;
    message?: string;
  }>;
}

export interface SendPromptDeps {
  dealId: string;
  chatSending: boolean;
  setChatSending: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  showToast: ShowToast;
  loadDeal: () => Promise<void>;
}

export async function sendPrompt(
  text: string,
  deps: SendPromptDeps,
): Promise<void> {
  const { dealId, chatSending, setChatSending, setMessages, showToast, loadDeal } = deps;
  const trimmed = text.trim();
  if (!trimmed || chatSending) return;

  const userMsg: ChatMessage = {
    id: `temp-${Date.now()}`,
    role: "user",
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  setMessages((prev) => [...prev, userMsg]);
  setChatSending(true);

  try {
    const data = await api.post<ChatResponseShape>(`/deals/${dealId}/chat`, {
      message: trimmed,
    });
    const responseText =
      data.response || (data as unknown as { content?: string }).content || "";

    // Show error-styled message if agent returned an error model
    if ((data as unknown as { model?: string }).model === "error") {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${responseText}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } else if (responseText) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: responseText,
          createdAt: new Date().toISOString(),
          ...(data.action && { action: data.action }),
        },
      ]);
    }

    // If there were deal-field updates, refresh the deal data
    if (data.updates && data.updates.length > 0) {
      showToast("Changes have been applied", "success", { title: "Deal Updated" });
      try {
        await loadDeal();
      } catch (err) {
        console.warn("[deal] loadDeal after side-effect failed:", err);
      }
    }

    // Handle side effects (notes, extraction, scroll)
    if (data.sideEffects && data.sideEffects.length > 0) {
      for (const effect of data.sideEffects) {
        if (effect.type === "note_added") {
          showToast("Activity feed updated", "success", { title: "Note Added" });
          try {
            await loadDeal();
          } catch (err) {
            console.warn("[deal] loadDeal after side-effect failed:", err);
          }
        }
        if (effect.type === "extraction_triggered") {
          showToast(effect.message || "Financial extraction queued", "info", {
            title: "Extraction",
          });
        }
        if (effect.type === "scroll_to") {
          const sectionMap: Record<string, string> = {
            financials: "financials-section",
            analysis: "analysis-section",
            activity: "activity-feed",
            documents: "documents-list",
            risks: "key-risks-list",
          };
          const elId = effect.section ? sectionMap[effect.section] : undefined;
          const el = elId ? document.getElementById(elId) : null;
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    const isServerError =
      msg.includes("API error 5") || msg.includes("API error 429");
    setMessages((prev) => [
      ...prev,
      {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: isServerError
          ? "The server is temporarily unavailable. Please try again in a moment."
          : `Sorry, I couldn't process your request. ${msg}`,
      },
    ]);
  } finally {
    setChatSending(false);
  }
}

export interface ClearChatHistoryDeps {
  dealId: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  showToast: ShowToast;
}

export async function clearChatHistory(deps: ClearChatHistoryDeps): Promise<void> {
  const { dealId, setMessages, showToast } = deps;
  try {
    await api.delete(`/deals/${dealId}/chat/history`);
    setMessages([]);
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : "Failed to clear chat history",
      "error",
    );
  }
}
