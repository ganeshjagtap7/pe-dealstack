"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import type { LegalDocumentWithDeal, SendDocResponse } from "./types";

interface SendModalProps {
  open: boolean;
  doc: LegalDocumentWithDeal | null;
  onCancel: () => void;
  onSent: (resp: SendDocResponse) => void;
}

type Banner =
  | { kind: "none" }
  // Drive connection lost / refresh failed — same UX (re-auth button).
  | { kind: "googleNotConnected" }
  | { kind: "resendNotConfigured" }
  | { kind: "noRecipient" }
  | { kind: "noContent" }
  | { kind: "driveError"; details: string }
  | { kind: "sendFailed"; details: string }
  | { kind: "generic"; message: string };

// Keep this list in lockstep with the /login page and /callback handler —
// Google rejects an OAuth restart that requests fewer scopes than the
// existing grant.
const GOOGLE_OAUTH_SCOPES =
  "email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents";

function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

function defaultSubject(doc: LegalDocumentWithDeal | null): string {
  if (!doc) return "";
  const dealName = doc.deal.target || doc.deal.projectName || doc.title;
  return `${dealName} — NDA`;
}

/**
 * Modal that ships the current document. The backend creates a Google Doc
 * in Drive, grants the counterparty edit access, then sends a cover email
 * via Resend containing only the link. Pre-fills To from
 * `counterpartyEmail`; the user can override.
 */
export function SendModal({ open, doc, onCancel, onSent }: SendModalProps) {
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reAuthing, setReAuthing] = useState(false);
  const [banner, setBanner] = useState<Banner>({ kind: "none" });

  useEffect(() => {
    if (!open) return;
    setToEmail(doc?.counterpartyEmail ?? "");
    setSubject(defaultSubject(doc));
    setMessage("");
    setBanner({ kind: "none" });
    setSubmitting(false);
    setReAuthing(false);
  }, [open, doc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting && !reAuthing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, submitting, reAuthing]);

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
      onSent(resp);
    } catch (err) {
      console.warn("[nda] send failed:", err);
      setBanner(bannerForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReAuth() {
    if (reAuthing) return;
    setReAuthing(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: GOOGLE_OAUTH_SCOPES,
          // Force a fresh consent + offline grant so we get a refresh token.
          queryParams: { access_type: "offline", prompt: "consent" },
          redirectTo: `${appOrigin()}/callback`,
        },
      });
      if (oauthError) {
        setBanner({
          kind: "generic",
          message: `Couldn't restart Google sign-in: ${oauthError.message}`,
        });
        setReAuthing(false);
      }
      // On success the page redirects away; no need to clear state.
    } catch (err) {
      console.warn("[nda] re-auth failed:", err);
      setBanner({
        kind: "generic",
        message: err instanceof Error ? err.message : "Re-auth failed",
      });
      setReAuthing(false);
    }
  }

  const isFailed =
    banner.kind === "sendFailed" || banner.kind === "driveError";
  const needsReAuth = banner.kind === "googleNotConnected";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
      onClick={(e) =>
        e.target === e.currentTarget && !submitting && !reAuthing && onCancel()
      }
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
            <h2 className="text-base font-bold text-slate-900">Send NDA</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              Creates a Google Doc, grants edit access to the counterparty,
              and emails them the link via Resend.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting || reAuthing}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {banner.kind !== "none" && (
            <ErrorBanner
              banner={banner}
              onReAuth={handleReAuth}
              reAuthing={reAuthing}
            />
          )}

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
            disabled={submitting || reAuthing}
            className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || reAuthing || needsReAuth}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-semibold text-white inline-flex items-center gap-1.5",
              submitting || needsReAuth
                ? "opacity-70 cursor-not-allowed"
                : "hover:opacity-90",
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
      case "GOOGLE_TOKEN_REFRESH_FAILED":
        return { kind: "googleNotConnected" };
      case "RESEND_NOT_CONFIGURED":
        return { kind: "resendNotConfigured" };
      case "NO_RECIPIENT":
        return { kind: "noRecipient" };
      case "NO_CONTENT":
        return { kind: "noContent" };
      case "DRIVE_API_ERROR":
        return { kind: "driveError", details: err.message };
      case "EMAIL_SEND_FAILED":
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

interface ErrorBannerProps {
  banner: Banner;
  onReAuth: () => void;
  reAuthing: boolean;
}

function ErrorBanner({ banner, onReAuth, reAuthing }: ErrorBannerProps) {
  if (banner.kind === "none") return null;

  // Workspace re-auth banner — primary CTA inside the banner itself so the
  // user can fix the connection without leaving the modal.
  if (banner.kind === "googleNotConnected") {
    return (
      <div className="rounded-lg px-3 py-3 text-sm border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">
          warning
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold leading-snug">
            Your Google Workspace connection expired
          </p>
          <p className="text-[12px] mt-1 leading-snug">
            Sign in with Google Workspace again to refresh your Drive
            permission so we can create the NDA doc.
          </p>
          <button
            type="button"
            onClick={onReAuth}
            disabled={reAuthing}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            {reAuthing ? (
              <>
                <span className="material-symbols-outlined text-[14px] animate-spin">
                  progress_activity
                </span>
                Redirecting…
              </>
            ) : (
              "Sign in again"
            )}
          </button>
        </div>
      </div>
    );
  }

  const isInfo =
    banner.kind === "resendNotConfigured" ||
    banner.kind === "noRecipient" ||
    banner.kind === "noContent";

  const message =
    banner.kind === "resendNotConfigured"
      ? "Email isn't configured for this firm yet. Talk to your admin."
      : banner.kind === "noRecipient"
        ? "Fill in counterparty email first"
        : banner.kind === "noContent"
          ? "Add some content to the NDA before sending"
          : banner.kind === "driveError"
            ? `Google Drive error: ${banner.details}`
            : banner.kind === "sendFailed"
              ? `Email send failed: ${banner.details}`
              : banner.kind === "generic"
                ? banner.message
                : "";

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
      <div className="flex-1 min-w-0 leading-snug">{message}</div>
    </div>
  );
}
