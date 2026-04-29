"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/providers/ToastProvider";
import { formatRelativeTime, formatFileSize, getDocIcon } from "@/lib/formatters";
import type { DocItem } from "./components";

// ---------------------------------------------------------------------------
// Document row — ported from apps/web/deal-documents.js (updateDocumentsList +
// fetchAndPreviewDocument + fetchAndShowAnalysis). Whole row is keyboard- and
// click-activatable; an explicit Download button on the right edge triggers
// the same signed URL but forces a download instead of a preview.
// ---------------------------------------------------------------------------

interface DocumentRowProps {
  doc: DocItem;
  onShowAnalysis: (doc: DocItem) => void;
}

// Heuristic for "AI-generated" docs that have no backing file. Mirrors the
// legacy `isGenerated` check in deal-documents.js:17 — `Deal Overview` /
// `Web Research` are the two flows that produce analysis-only documents.
function isAIOnlyDoc(doc: DocItem): boolean {
  if (doc.fileUrl) return false;
  if (doc.aiAnalysis) return true;
  return doc.name.includes("Deal Overview") || doc.name.includes("Web Research");
}

export function DocumentRow({ doc, onShowAnalysis }: DocumentRowProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const aiOnly = isAIOnlyDoc(doc);

  /**
   * Fetch a signed URL for the doc. Returns null on failure (and surfaces a
   * toast). Mirrors fetchAndPreviewDocument in deal-documents.js:90-105.
   */
  async function fetchSignedUrl(): Promise<string | null> {
    try {
      const data = await api.get<{ url?: string }>(`/documents/${doc.id}/download`);
      if (!data?.url) {
        showToast("Could not generate preview URL", "error");
        return null;
      }
      return data.url;
    } catch (err) {
      console.error("[doc-row] download URL failed", err);
      showToast("Failed to load document", "error");
      return null;
    }
  }

  async function handleActivate() {
    if (busy) return;
    if (aiOnly) {
      // AI-generated doc — fetch full record and show its aiAnalysis text.
      onShowAnalysis(doc);
      return;
    }
    setBusy(true);
    try {
      const url = await fetchSignedUrl();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(e: React.MouseEvent | React.KeyboardEvent) {
    // Prevent the row's activate handler from firing.
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (aiOnly) {
      // No file to download — open the analysis modal instead so the user
      // can copy the text. Same fallback the legacy flow takes.
      onShowAnalysis(doc);
      return;
    }
    setBusy(true);
    try {
      const url = await fetchSignedUrl();
      if (!url) return;
      // Trigger a download via a temporary <a download>. Browsers honour the
      // attribute when the URL is same-origin or the response carries the
      // appropriate Content-Disposition header — Supabase signed URLs include
      // it for direct download, so this works for our pipeline.
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Enter / Space activate, matching native button semantics.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${doc.name}`}
      aria-busy={busy}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer transition-colors"
    >
      <span className="material-symbols-outlined text-[20px] text-text-muted">
        {getDocIcon(doc.name)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-main truncate flex items-center gap-1.5">
          {doc.name}
          {aiOnly && (
            <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
              AI
            </span>
          )}
        </p>
        <p className="text-xs text-text-muted">
          {doc.fileSize ? formatFileSize(doc.fileSize) : "AI Generated"}
          {doc.createdAt && <> · {formatRelativeTime(doc.createdAt)}</>}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        onKeyDown={(e) => {
          // Don't let Space/Enter on the button bubble up and re-trigger the
          // row activation handler.
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        disabled={busy}
        aria-label={aiOnly ? `View analysis for ${doc.name}` : `Download ${doc.name}`}
        title={aiOnly ? "View analysis" : "Download"}
        className="p-1.5 text-text-muted hover:text-primary hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[20px]">
          {busy ? "progress_activity" : aiOnly ? "summarize" : "download"}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI analysis modal — shows the aiAnalysis (or extractedText) of an
// AI-generated document. Modal pattern mirrors edit-deal-modal.tsx:
// fixed overlay, centered card, Esc + backdrop close, body scroll lock.
// ---------------------------------------------------------------------------

interface DocumentAnalysisModalProps {
  doc: DocItem;
  onClose: () => void;
}

export function DocumentAnalysisModal({ doc, onClose }: DocumentAnalysisModalProps) {
  const { showToast } = useToast();
  const [text, setText] = useState<string | null>(doc.aiAnalysis || null);
  const [loading, setLoading] = useState(!doc.aiAnalysis);

  // Esc key + body scroll lock.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Lazy-fetch the doc record if we don't have aiAnalysis already.
  useEffect(() => {
    if (text != null) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await api.get<{ aiAnalysis?: string; extractedText?: string }>(
          `/documents/${doc.id}`,
        );
        if (cancelled) return;
        setText(full.aiAnalysis || full.extractedText || "No content available");
      } catch (err) {
        if (cancelled) return;
        console.error("[doc-row] fetch analysis failed", err);
        showToast("Failed to load document", "error");
        setText("Failed to load document content.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, text, showToast]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-purple-500">summarize</span>
            <h3 className="text-lg font-bold text-text-main truncate">{doc.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-text-muted">close</span>
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-text-muted">
              <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
              Loading analysis…
            </div>
          ) : (
            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
