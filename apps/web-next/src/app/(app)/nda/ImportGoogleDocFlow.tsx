"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import { DealPicker, type PickableDeal } from "./DealPicker";
import type { LegalDocument } from "./types";

interface ImportGoogleDocFlowProps {
  /**
   * Pre-resolved deal context. When provided we skip the deal picker step and
   * go straight to the URL form. Mirrors UploadExistingFlow.initialDeal — the
   * page.tsx state machine can pass this through from a deal-scoped entry
   * point later. v1 always starts at pickDeal.
   */
  initialDeal?: PickableDeal;
  onCancel: () => void;
  onImported: (doc: LegalDocument) => void;
}

type Step =
  | { kind: "pickDeal" }
  | { kind: "form"; deal: PickableDeal };

// Body for POST /deals/:dealId/legal-documents/import-gdoc. All fields besides
// `url` are optional — the server reads the Doc's real title/webViewLink from
// Drive, so the form values here are just user overrides / counterparty hints.
interface ImportGdocBody {
  url: string;
  title?: string;
  counterpartyName?: string;
  counterpartyEmail?: string;
  counterpartyAddress?: string;
  jurisdiction?: string;
  effectiveDate?: string;
}

// Cheap client-side sanity check before we POST. The SERVER does the
// authoritative parse (it has to fetch the file id from Drive anyway), so this
// only needs to catch obvious typos — a pasted Drive folder link, a bare
// company URL, etc. Accepts the common Google Docs URL shapes:
//   https://docs.google.com/document/d/<id>/edit
//   https://docs.google.com/document/d/<id>
//   https://drive.google.com/file/d/<id>/view  (a Doc opened from Drive)
const GDOC_URL_RE =
  /^https:\/\/(docs|drive)\.google\.com\/(document\/d\/|file\/d\/)[^/\s]+/i;

function looksLikeGoogleDocUrl(url: string): boolean {
  return GDOC_URL_RE.test(url.trim());
}

/**
 * Two-step "bring your own Google Doc" flow. The user pastes the URL of a Doc
 * they already prepared in their own Drive (where they can add a Google-native
 * eSignature field — something Google offers no API for); we import a reference
 * to it as a LegalDocument row (content stays null, the Doc stays the source of
 * truth) and hand it back so the page can drop into GoogleDocImportView.
 *
 * Steps:
 *   1) pickDeal — DealPicker modal (skipped if initialDeal supplied)
 *   2) form     — Google Doc URL (required) + optional title/counterparty;
 *                 submit fires the JSON POST and hands the row to the parent
 *
 * Mirrors UploadExistingFlow's deal-acquisition + metadata pattern, but the
 * import is a single JSON round-trip (no file upload) since the Doc already
 * lives in Drive.
 */
export function ImportGoogleDocFlow({
  initialDeal,
  onCancel,
  onImported,
}: ImportGoogleDocFlowProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>(
    initialDeal ? { kind: "form", deal: initialDeal } : { kind: "pickDeal" },
  );

  function handleDealSelect(deal: PickableDeal) {
    setStep({ kind: "form", deal });
  }

  if (step.kind === "pickDeal") {
    return <DealPicker open onCancel={onCancel} onSelect={handleDealSelect} />;
  }

  // step.kind === "form"
  return (
    <ImportGdocForm
      deal={step.deal}
      onBack={
        // Only offer "back to deal picker" when the user actually came through
        // it (no pre-resolved deal). With an initialDeal there's nowhere back.
        initialDeal ? undefined : () => setStep({ kind: "pickDeal" })
      }
      onCancel={onCancel}
      onImported={onImported}
      showToast={showToast}
    />
  );
}

interface ImportGdocFormProps {
  deal: PickableDeal;
  onBack?: () => void;
  onCancel: () => void;
  onImported: (doc: LegalDocument) => void;
  showToast: ReturnType<typeof useToast>["showToast"];
}

function ImportGdocForm({
  deal,
  onBack,
  onCancel,
  onImported,
  showToast,
}: ImportGdocFormProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyEmail, setCounterpartyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Paste the Google Doc URL to import.");
      return;
    }
    if (!looksLikeGoogleDocUrl(trimmedUrl)) {
      setError(
        "That doesn't look like a Google Docs link. Copy the URL from the address bar of the open Doc (it should start with https://docs.google.com/document/d/…).",
      );
      return;
    }

    const body: ImportGdocBody = {
      url: trimmedUrl,
      title: title.trim() || undefined,
      counterpartyName: counterpartyName.trim() || undefined,
      counterpartyEmail: counterpartyEmail.trim() || undefined,
    };

    setSubmitting(true);
    setError(null);
    try {
      const doc = await api.post<LegalDocument>(
        `/deals/${deal.id}/legal-documents/import-gdoc`,
        body,
      );
      onImported(doc);
    } catch (err) {
      console.warn("[nda] import-gdoc failed:", err);
      const message = importErrorMessage(err);
      setError(message);
      showToast(message, "error", { title: "Couldn't import Google Doc" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
      onClick={(e) => e.target === e.currentTarget && !submitting && onCancel()}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              Import from Google Docs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              For{" "}
              <span className="text-[#003366] font-medium">{deal.label}</span>
              {" · "}Bring a Doc you prepared in your own Drive — add an
              eSignature field there, then send it from here.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-3 text-sm border bg-red-50 border-red-200 text-red-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">
                error
              </span>
              <div className="flex-1 min-w-0 leading-snug">{error}</div>
            </div>
          )}

          <Field label="Google Doc URL" required>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
              inputMode="url"
              placeholder="https://docs.google.com/document/d/…/edit"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Open the Doc in Google Docs and copy the link from your browser&rsquo;s
              address bar. It must live in the Google account you connected in
              Settings &rarr; Integrations.
            </p>
          </Field>

          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to use the Doc's own title"
              className={inputCls}
            />
          </Field>

          <Field label="Counterparty name">
            <input
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="Acme Corp"
              className={inputCls}
            />
          </Field>

          <Field label="Counterparty email">
            <input
              type="email"
              value={counterpartyEmail}
              onChange={(e) => setCounterpartyEmail(e.target.value)}
              placeholder="legal@acme.com"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Pre-fills the recipient when you send the Doc. You can change it
              at send time.
            </p>
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">
                arrow_back
              </span>
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-semibold text-white inline-flex items-center gap-1.5",
                submitting ? "opacity-70 cursor-not-allowed" : "hover:opacity-90",
              )}
              style={{ backgroundColor: "#003366" }}
            >
              {submitting && (
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? "Importing…" : "Import Doc"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Maps the backend's typed error codes (see the import-gdoc contract) to
// actionable copy. Falls back to the server's own `error` message for unknown
// codes, then to a generic string for non-API errors.
function importErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "INVALID_GDOC_URL":
        return "We couldn't read a Google Doc id from that URL. Double-check you copied the full link from the open Doc.";
      case "GOOGLE_NOT_CONNECTED":
        return "Google isn't connected yet. Connect it in Settings → Integrations, then try again.";
      case "GOOGLE_SCOPES_MISSING":
        return "Google is connected but needs a re-authorize to read your Docs. Reconnect in Settings → Integrations.";
      case "GDOC_NOT_ACCESSIBLE":
        return `${err.message} Make sure the doc lives in the Google account you connected (Settings → Integrations).`;
      case "DRIVE_API_ERROR":
        return `Google Drive error: ${err.message}`;
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : "Failed to import Google Doc";
}

const inputCls =
  "w-full px-3 py-2 text-sm rounded-md border border-slate-200 focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15 outline-none";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </div>
      {children}
    </label>
  );
}
