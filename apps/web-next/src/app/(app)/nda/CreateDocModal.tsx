"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { CreateDocBody, LegalDocTemplate, LegalDocument } from "./types";

interface CreateDocModalProps {
  open: boolean;
  dealId: string;
  dealLabel: string;
  template: LegalDocTemplate | null; // null = blank document
  onCancel: () => void;
  onCreated: (doc: LegalDocument) => void;
}

// Banner type so the catch block can pick the right CTA without parsing
// `error.code` from JSX. Each branch is wired to a specific backend error
// code defined in the task brief — keep them in sync if the API adds more.
type Banner =
  | { kind: "none" }
  | { kind: "driveNotConnected"; message: string }
  | { kind: "driveFolderNotConfigured"; message: string }
  | { kind: "templateMissing"; message: string }
  | { kind: "driveApi"; message: string }
  | { kind: "generic"; message: string };

// Default title pattern matches the convention legal teams already use in
// shared drives — saves a keystroke for the common case while still allowing
// the analyst to override.
function defaultTitle(counterpartyName: string): string {
  const cp = counterpartyName.trim();
  return cp ? `NDA — ${cp}` : "NDA";
}

export function CreateDocModal({
  open,
  dealId,
  dealLabel,
  template,
  onCancel,
  onCreated,
}: CreateDocModalProps) {
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyEmail, setCounterpartyEmail] = useState("");
  // titleDirty tracks whether the user has hand-edited the title; until then
  // we keep it in lockstep with the auto-pattern "NDA — {counterparty}" so the
  // friendly default updates as they type the counterparty name.
  const [title, setTitle] = useState("NDA");
  const [titleDirty, setTitleDirty] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner>({ kind: "none" });

  // Reset every time the modal re-opens so a previous session's banner /
  // partial input doesn't leak into the next NDA.
  useEffect(() => {
    if (!open) return;
    setCounterpartyName("");
    setCounterpartyEmail("");
    setTitle(defaultTitle(""));
    setTitleDirty(false);
    setEffectiveDate("");
    setBanner({ kind: "none" });
    setSubmitting(false);
  }, [open]);

  // Keep the auto-title in sync until the user takes the wheel.
  useEffect(() => {
    if (titleDirty) return;
    setTitle(defaultTitle(counterpartyName));
  }, [counterpartyName, titleDirty]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, submitting]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setBanner({ kind: "generic", message: "Title is required." });
      return;
    }

    // Build the discriminated payload — `mode: "fromTemplate"` when a
    // template was picked, `mode: "blank"` otherwise. Optional fields are
    // omitted when empty so the API doesn't have to special-case "" vs
    // undefined.
    const shared = {
      title: trimmedTitle,
      counterpartyName: counterpartyName.trim() || undefined,
      counterpartyEmail: counterpartyEmail.trim() || undefined,
      effectiveDate: effectiveDate || undefined,
    };
    const body: CreateDocBody = template
      ? { mode: "fromTemplate", templateId: template.id, ...shared }
      : { mode: "blank", docType: "NDA", ...shared };

    setSubmitting(true);
    setBanner({ kind: "none" });
    try {
      const doc = await api.post<LegalDocument>(
        `/deals/${dealId}/legal-documents`,
        body,
      );
      // Open the live Google Doc immediately — that's the analyst's next
      // action 100% of the time, and we'd rather pop it before the modal
      // animates closed than after (browsers block window.open when too far
      // from the original click).
      if (doc.googleDocUrl) {
        window.open(doc.googleDocUrl, "_blank", "noopener,noreferrer");
      }
      onCreated(doc);
    } catch (err) {
      console.warn("[nda] create failed:", err);
      setBanner(bannerForError(err));
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
            <h2 className="text-base font-bold text-slate-900">New NDA</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              For{" "}
              <span className="text-[#003366] font-medium">{dealLabel}</span> ·{" "}
              {template ? `Template: ${template.name}` : "Blank document"}
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
          {banner.kind !== "none" && <ErrorBanner banner={banner} />}

          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleDirty(true);
              }}
              required
              placeholder="NDA — Acme Corp"
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
          </Field>

          <Field label="Effective date">
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className={inputCls}
            />
          </Field>

          <p className="text-[11px] text-slate-500">
            We&rsquo;ll create a fresh Google Doc in your firm&rsquo;s legal-docs
            folder and open it in a new tab. Substitution of template
            placeholders happens server-side.
          </p>
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
            {submitting ? "Creating…" : "Create NDA"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------- error mapping ------------------------------ //

function bannerForError(err: unknown): Banner {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "DRIVE_NOT_CONNECTED":
        return {
          kind: "driveNotConnected",
          message:
            "We can't reach Google Drive yet. Connect it in Settings to create NDAs.",
        };
      case "DRIVE_FOLDER_NOT_CONFIGURED":
        return {
          kind: "driveFolderNotConfigured",
          message:
            "Your firm's legal-docs folder isn't configured. Ask an admin to set it up.",
        };
      case "TEMPLATE_NOT_FOUND":
        return {
          kind: "templateMissing",
          message:
            "That template no longer exists. Close this dialog and pick another.",
        };
      case "DRIVE_API_ERROR":
        return {
          kind: "driveApi",
          message:
            "Google Drive returned an error. Try again in a moment — if it persists, contact support.",
        };
      default:
        return { kind: "generic", message: err.message };
    }
  }
  return {
    kind: "generic",
    message: err instanceof Error ? err.message : "Failed to create NDA",
  };
}

// ----------------------------- small UI bits ------------------------------ //

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

function ErrorBanner({ banner }: { banner: Banner }) {
  if (banner.kind === "none") return null;
  const isInfo =
    banner.kind === "driveNotConnected" ||
    banner.kind === "driveFolderNotConfigured" ||
    banner.kind === "templateMissing";
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-3 text-sm border flex items-start gap-2",
        isInfo
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-red-50 border-red-200 text-red-700",
      )}
    >
      <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">
        {isInfo ? "info" : "error"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="leading-snug">{banner.message}</div>
        {banner.kind === "driveNotConnected" && (
          <Link
            href="/settings#section-integrations"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#003366] hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]">
              open_in_new
            </span>
            Connect Google Drive
          </Link>
        )}
        {banner.kind === "driveFolderNotConfigured" && (
          <Link
            href="/settings#section-integrations"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#003366] hover:underline"
          >
            <span className="material-symbols-outlined text-[14px]">
              open_in_new
            </span>
            Open Settings → Integrations
          </Link>
        )}
      </div>
    </div>
  );
}
