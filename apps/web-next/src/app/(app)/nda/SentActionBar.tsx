"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";

interface SentActionBarProps {
  docId: string;
  sentToEmail: string | null;
  sentAt: string | null;
  googleDocUrl: string;
  // Sender's Gmail from the most recent /send response; null on a
  // server-loaded SENT doc (not persisted). Omits provenance line when null.
  senderEmail: string | null;
  showSnapshot: boolean;
  onToggleView: () => void;
}

// Response shape for POST /legal-documents/:id/request-signature. See
// apps/api/src/services/legalDocSignatureService.ts for the server contract.
// `signatureRequestId` is always null today because Google has no public
// eSignature API (verified — no Drive v3 endpoint exists, Issue Tracker
// #239527000 still open). Field is reserved for the forward-compatible
// swap once Google ships a programmatic API.
interface RequestSignatureResponse {
  ok: true;
  deeplinkUrl: string;
  signatureRequestedAt: string;
  signatureRequestId: string | null;
}

/**
 * Emerald banner shown above the editor for SENT docs with a live Google
 * Doc. Surfaces the Open-in-Docs link, snapshot/current-draft toggle, the
 * Request Signature deep-link button, and (when known) a muted "Email sent
 * from <addr>" provenance line.
 */
export function SentActionBar({
  docId,
  sentToEmail,
  sentAt,
  googleDocUrl,
  senderEmail,
  showSnapshot,
  onToggleView,
}: SentActionBarProps) {
  const { showToast } = useToast();
  const [requestingSig, setRequestingSig] = useState(false);
  const recipientLabel = sentToEmail || "the counterparty";
  const dateLabel = sentAt ? new Date(sentAt).toLocaleString() : "—";

  async function handleRequestSignature() {
    if (requestingSig) return;
    setRequestingSig(true);
    try {
      // Backend returns the Google Doc's webViewLink + persists a
      // signatureRequestedAt marker. User then clicks Tools -> eSignature
      // inside the opened Doc to add signer fields. Once Google ships a
      // programmatic eSignature API the backend will populate
      // `signatureRequestId` and `deeplinkUrl` will point at the signer
      // landing page — both code paths handled by the same window.open.
      const resp = await api.post<RequestSignatureResponse>(
        `/legal-documents/${docId}/request-signature`,
        {},
      );
      window.open(resp.deeplinkUrl, "_blank");
      showToast(
        "Opening Google Docs — use Tools > eSignature to request a signature",
        "success",
      );
    } catch (err) {
      console.warn("[nda] request signature failed:", err);
      showToast(
        err instanceof Error ? err.message : "Failed to request signature",
        "error",
      );
    } finally {
      setRequestingSig(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg px-4 py-3 border border-emerald-200 bg-emerald-50 text-emerald-900 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0">
        <span className="material-symbols-outlined text-[18px] mt-0.5 text-emerald-700">
          check_circle
        </span>
        <div className="text-xs leading-snug min-w-0">
          <span className="font-semibold">
            Sent to {recipientLabel} on {dateLabel}.
          </span>{" "}
          <span className="text-emerald-800/80">
            Counterparty has edit access in Google Docs.
          </span>
          {senderEmail && (
            <div className="mt-0.5 text-[11px] text-emerald-800/70">
              Email sent from {senderEmail}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleView}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
        >
          {showSnapshot ? "View current draft" : "View snapshot"}
        </button>
        <button
          type="button"
          onClick={() => window.open(googleDocUrl, "_blank")}
          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white inline-flex items-center gap-1.5 hover:opacity-90"
          style={{ backgroundColor: "#047857" }}
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          Open in Google Docs
        </button>
        <button
          type="button"
          onClick={handleRequestSignature}
          disabled={requestingSig}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-semibold text-white inline-flex items-center gap-1.5",
            requestingSig ? "opacity-70 cursor-not-allowed" : "hover:opacity-90",
          )}
          style={{ backgroundColor: "#047857" }}
        >
          <span
            className={cn(
              "material-symbols-outlined text-[14px]",
              requestingSig && "animate-spin",
            )}
          >
            {requestingSig ? "progress_activity" : "draw"}
          </span>
          Request Signature
        </button>
      </div>
    </div>
  );
}
