"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useUser } from "@/providers/UserProvider";
import type { LegalDocumentWithDeal, SendDocResponse } from "./types";

interface SendModalProps {
  open: boolean;
  doc: LegalDocumentWithDeal | null;
  onCancel: () => void;
  onSent: (resp: SendDocResponse, toEmail: string) => void;
}

// Discriminated union for all banner states the modal can render. Adding a
// new error code? Add a variant here, map it in `bannerForError`, and add the
// render branch in `ErrorBanner`.
//
// Note: there is no `resendNotConfigured` variant — NDA sends now go through
// the user's own Workspace Gmail, not the firm-wide Resend account. The
// equivalent failure modes are now `googleNotConnected` /
// `googleScopesMissing` (account-level) or `sendFailed` (Gmail API blew up).
type Banner =
  | { kind: "none" }
  | { kind: "googleNotConnected" }
  | { kind: "googleScopesMissing" }
  | { kind: "noRecipient" }
  | { kind: "noContent" }
  | { kind: "driveError"; details: string }
  | { kind: "sendFailed"; details: string }
  | { kind: "generic"; message: string };

function defaultSubject(doc: LegalDocumentWithDeal | null): string {
  if (!doc) return "";
  const dealName = doc.deal.target || doc.deal.projectName || doc.title;
  return `${dealName} — NDA`;
}

/**
 * Modal that ships the current document by:
 *   1. Creating a Google Doc copy in the sender's Drive,
 *   2. Granting the counterparty edit access,
 *   3. Emailing them the link via the sender's own Workspace Gmail.
 *
 * The whole chain requires the user's Google Workspace OAuth connection to be
 * present AND scoped for both Drive (file creation/share) and `gmail.send`
 * (compose+send) — error codes from the backend map to actionable yellow/red
 * banners below. Each user sends as themselves, so the recipient sees the
 * sender's actual work address in the From header (no firm-wide domain
 * verification needed).
 */
export function SendModal({ open, doc, onCancel, onSent }: SendModalProps) {
  const { user } = useUser();
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<Banner>({ kind: "none" });

  useEffect(() => {
    if (!open) return;
    setToEmail(doc?.counterpartyEmail ?? "");
    setSubject(defaultSubject(doc));
    setMessage("");
    setBanner({ kind: "none" });
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

  async function handleSend() {
    if (!doc || submitting) return;
    const trimmed = toEmail.trim();
    if (!trimmed) {
      setBanner({ kind: "noRecipient" });
      return;
    }
    setSubmitting(true);
    setBanner({ kind: "none" });
    try {
      const resp = await api.post<SendDocResponse>(
        `/legal-documents/${doc.id}/send`,
        {
          toEmail: trimmed,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
        },
      );
      onSent(resp, trimmed);
    } catch (err) {
      console.warn("[nda] send failed:", err);
      setBanner(bannerForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isFailed =
    banner.kind === "sendFailed" || banner.kind === "driveError";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
      onClick={(e) => e.target === e.currentTarget && !submitting && onCancel()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">Send NDA via email</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Creates a Google Doc, grants edit access to the counterparty,
              and emails them the link from your Gmail.
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

          <Field label="To" required>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="legal@acme.com"
              required
              className={inputCls}
            />
          </Field>

          {/* Provenance line: shows the user *which* Workspace inbox the
              email will appear to come from. Rendered up here (before the
              API call returns) using the cached UserProvider record so users
              can sanity-check their identity before hitting Send. Falls back
              to a generic label if `useUser` hasn't hydrated yet. */}
          <SenderLine email={user?.email} />

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Cover message">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Optional note that appears in the email body above the Google Doc link."
              className={cn(inputCls, "resize-y")}
            />
          </Field>
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
            {isFailed ? "Retry send" : submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

// --------------------------- error mapping --------------------------- //

function bannerForError(err: unknown): Banner {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "GOOGLE_NOT_CONNECTED":
        return { kind: "googleNotConnected" };
      case "GOOGLE_SCOPES_MISSING":
        return { kind: "googleScopesMissing" };
      case "NO_RECIPIENT":
        return { kind: "noRecipient" };
      case "NO_CONTENT":
        return { kind: "noContent" };
      case "DRIVE_API_ERROR":
        return { kind: "driveError", details: err.message };
      case "EMAIL_SEND_FAILED":
        // Backend reuses the EMAIL_SEND_FAILED code for Gmail API failures
        // (network blip, quota, transient 5xx). Copy below reflects Gmail.
        return { kind: "sendFailed", details: err.message };
      default:
        return { kind: "generic", message: err.message };
    }
  }
  return {
    kind: "generic",
    message: err instanceof Error ? err.message : "Failed to send",
  };
}

// --------------------------- small UI bits --------------------------- //

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

/**
 * Muted "From: <user.email>" line displayed under the To field. Surfaces
 * which Workspace address the email will appear to come from — important
 * because the multi-tenant Gmail flow means there's no firm-wide From; the
 * sender's personal work address is on the message.
 *
 * Renders a generic fallback while `useUser()` is hydrating so the layout
 * doesn't pop in.
 */
function SenderLine({ email }: { email?: string }) {
  return (
    <div className="flex items-start gap-1.5 -mt-1 text-xs text-slate-500 leading-snug">
      <span className="material-symbols-outlined text-[14px] mt-0.5 text-slate-400">
        outgoing_mail
      </span>
      <div className="min-w-0">
        {email ? (
          <>
            From: <span className="font-medium text-slate-700">{email}</span>{" "}
            <span className="text-slate-400">
              (sent via your Google Workspace Gmail)
            </span>
          </>
        ) : (
          <>From: your Google Workspace Gmail</>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ banner }: { banner: Banner }) {
  if (banner.kind === "none") return null;

  // "Info"-style yellow banners are for fixable configuration issues (Google
  // not connected / scopes missing / no recipient / no content). Hard
  // failures from Google Drive or Gmail are red.
  const isInfo =
    banner.kind === "googleNotConnected" ||
    banner.kind === "googleScopesMissing" ||
    banner.kind === "noRecipient" ||
    banner.kind === "noContent";

  const message = (() => {
    switch (banner.kind) {
      case "googleNotConnected":
        return "Google Workspace isn't connected yet. Connect it in Settings to send NDAs.";
      case "googleScopesMissing":
        return "Google Workspace is connected but needs a re-authorize to send mail. Reconnect in Settings.";
      case "noRecipient":
        return "Fill in counterparty email first";
      case "noContent":
        return "Add some content to the NDA before sending";
      case "driveError":
        return `Google Drive error: ${banner.details}`;
      case "sendFailed":
        return `Gmail send failed: ${banner.details}`;
      case "generic":
        return banner.message;
      default:
        return "";
    }
  })();

  // The two "Google needs setup" banners get a CTA that drops the user into
  // the Integrations card in Settings; the rest are message-only.
  const showSettingsCta =
    banner.kind === "googleNotConnected" ||
    banner.kind === "googleScopesMissing";

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
      <div className="flex-1 min-w-0 leading-snug">
        {message}
        {showSettingsCta && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/settings#section-integrations";
              }}
              className="text-xs font-semibold rounded-md px-3 py-1.5 text-white hover:opacity-90"
              style={{ backgroundColor: "#003366" }}
            >
              Open Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
