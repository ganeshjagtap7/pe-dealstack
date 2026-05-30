"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { STATUS_LABELS, STATUS_ORDER } from "./constants";
import type {
  DocStatus,
  LegalDocument,
  LegalDocumentWithDeal,
  UpdateDocBody,
} from "./types";

interface EditDocModalProps {
  open: boolean;
  doc: LegalDocumentWithDeal | null;
  onCancel: () => void;
  onSaved: (doc: LegalDocument) => void;
}

// The edit form mirrors the create form's metadata fields plus a status
// dropdown and signed-at / expires-at pickers. Doc *content* lives in Google
// Docs — the user opens it with the prominent button at the top.
export function EditDocModal({
  open,
  doc,
  onCancel,
  onSaved,
}: EditDocModalProps) {
  // All fields are nullable on the row; we hold them as strings here and
  // convert back to null on submit so the diff against the original is small.
  const [title, setTitle] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyEmail, setCounterpartyEmail] = useState("");
  const [status, setStatus] = useState<DocStatus>("DRAFT");
  const [effectiveDate, setEffectiveDate] = useState("");
  // `signedAt` is a full timestamp on the wire — we render <input type="datetime-local">
  // which gives "YYYY-MM-DDTHH:MM"; both the create and patch endpoints accept
  // ISO so we re-stringify on submit.
  const [signedAt, setSignedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !doc) return;
    setTitle(doc.title ?? "");
    setCounterpartyName(doc.counterpartyName ?? "");
    setCounterpartyEmail(doc.counterpartyEmail ?? "");
    setStatus(doc.status);
    setEffectiveDate(doc.effectiveDate ?? "");
    setSignedAt(doc.signedAt ? toDatetimeLocal(doc.signedAt) : "");
    setExpiresAt(doc.expiresAt ?? "");
    setError(null);
    setSubmitting(false);
  }, [open, doc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, submitting]);

  if (!open || !doc) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc || submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }

    // Build the patch payload — convert "" back to null on optional fields
    // so users can intentionally clear a value. Datetime-local strings get
    // re-serialised as ISO via `new Date(...).toISOString()`.
    const body: UpdateDocBody = {
      title: trimmed,
      status,
      counterpartyName: counterpartyName.trim() || null,
      counterpartyEmail: counterpartyEmail.trim() || null,
      effectiveDate: effectiveDate || null,
      signedAt: signedAt ? new Date(signedAt).toISOString() : null,
      expiresAt: expiresAt || null,
    };

    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<LegalDocument>(
        `/legal-documents/${doc.id}`,
        body,
      );
      onSaved(updated);
    } catch (err) {
      console.warn("[nda] update failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSubmitting(false);
    }
  }

  function openInDocs() {
    if (!doc) return;
    window.open(doc.googleDocUrl, "_blank", "noopener,noreferrer");
  }

  const showSignedAt = status === "SIGNED";
  const dealLabel =
    doc.deal.target ?? doc.deal.projectName ?? "Unknown deal";

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
            <h2 className="text-base font-bold text-slate-900">Edit NDA</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              For{" "}
              <span className="text-[#003366] font-medium">{dealLabel}</span>{" "}
              · metadata only — content edits happen in Google Docs
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
          <button
            type="button"
            onClick={openInDocs}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">
              open_in_new
            </span>
            Open in Google Docs
          </button>

          {error && (
            <div className="rounded-lg px-3 py-2.5 text-sm border bg-red-50 border-red-200 text-red-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] mt-0.5">
                error
              </span>
              <div className="flex-1 min-w-0">{error}</div>
            </div>
          )}

          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputCls}
            />
          </Field>

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DocStatus)}
              className={inputCls}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Counterparty name">
            <input
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Counterparty email">
            <input
              type="email"
              value={counterpartyEmail}
              onChange={(e) => setCounterpartyEmail(e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective date">
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Expires at">
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {showSignedAt && (
            <Field label="Signed at">
              <input
                type="datetime-local"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
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
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Convert an ISO timestamp into the `YYYY-MM-DDTHH:MM` format that the
// `<input type="datetime-local">` widget expects. Bare `.toISOString().slice(0, 16)`
// would render in UTC; we want the user's local clock to match what they see
// in Google Calendar / Gmail.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
