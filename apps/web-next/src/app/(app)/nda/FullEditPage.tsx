"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import { Editor, type EditorHandle } from "./Editor";
import { SendModal } from "./SendModal";
import { STATUS_LABELS, STATUS_ORDER } from "./constants";
import type {
  DocStatus,
  LegalDocument,
  LegalDocumentWithDeal,
  SendDocResponse,
  UpdateDocBody,
} from "./types";

interface FullEditPageProps {
  doc: LegalDocumentWithDeal;
  onBack: () => void;
  onSaved: (updated: LegalDocument) => void;
}

interface FormState {
  title: string;
  content: string;
  status: DocStatus;
  counterpartyName: string;
  counterpartyEmail: string;
  counterpartyAddress: string;
  jurisdiction: string;
  effectiveDate: string;
  expiresAt: string;
  signedAt: string;
}

function initialForm(doc: LegalDocumentWithDeal): FormState {
  return {
    title: doc.title ?? "",
    content: doc.content ?? "",
    status: doc.status,
    counterpartyName: doc.counterpartyName ?? "",
    counterpartyEmail: doc.counterpartyEmail ?? "",
    counterpartyAddress: doc.counterpartyAddress ?? "",
    jurisdiction: doc.jurisdiction ?? "",
    effectiveDate: doc.effectiveDate ?? "",
    expiresAt: doc.expiresAt ?? "",
    signedAt: doc.signedAt ? toDatetimeLocal(doc.signedAt) : "",
  };
}

/**
 * Full-screen NDA editor: left = HTML body, right = metadata sidebar. Lives
 * inline in the /nda route — not a modal — because legal documents are too
 * big to fit a centered popup comfortably.
 *
 * `status === "SENT"` switches the left pane to a read-only view of
 * `contentSnapshot` (the frozen copy that went out the door) with a yellow
 * banner telling the user that live edits live in Google Docs now. A
 * prominent action bar above the editor surfaces the doc URL + recipient.
 */
export function FullEditPage({ doc, onBack, onSaved }: FullEditPageProps) {
  const { showToast } = useToast();
  const editorRef = useRef<EditorHandle | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(doc));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  // When viewing a SENT doc we default to the snapshot; user can toggle.
  const [showSnapshot, setShowSnapshot] = useState(doc.status === "SENT");

  // If the user navigates to a different doc inside the same mount, reset.
  // We intentionally watch `doc.id` / `doc.status` rather than `doc` so that
  // a parent state echo on every `handleSaved` doesn't wipe the form mid-typing.
  useEffect(() => {
    setForm(initialForm(doc));
    setShowSnapshot(doc.status === "SENT");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.status]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const dealLabel = doc.deal.target || doc.deal.projectName || "Unknown deal";
  const isSent = form.status === "SENT";
  const hasSnapshot = !!doc.contentSnapshot;
  // Snapshot view is the default-on for SENT docs; we hide the Save button in
  // this view because edits don't go anywhere (Google Docs owns the live copy).
  const inSnapshotView = isSent && showSnapshot && hasSnapshot;

  async function handleSave() {
    if (saving) return;
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const body: UpdateDocBody = {
      title: trimmedTitle,
      status: form.status,
      content: form.content,
      counterpartyName: form.counterpartyName.trim() || null,
      counterpartyEmail: form.counterpartyEmail.trim() || null,
      counterpartyAddress: form.counterpartyAddress.trim() || null,
      jurisdiction: form.jurisdiction.trim() || null,
      effectiveDate: form.effectiveDate || null,
      expiresAt: form.expiresAt || null,
      signedAt: form.signedAt ? new Date(form.signedAt).toISOString() : null,
    };
    try {
      const updated = await api.patch<LegalDocument>(
        `/legal-documents/${doc.id}`,
        body,
      );
      onSaved(updated);
      showToast("NDA saved", "success");
    } catch (err) {
      console.warn("[nda] save failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleSent(resp: SendDocResponse) {
    setSendOpen(false);
    // After a successful send the server has flipped the status to SENT,
    // frozen a snapshot, AND minted a Google Doc + URL. Reflect all three
    // locally + bubble up so the gallery updates without a full refetch.
    const updated: LegalDocument = {
      ...doc,
      status: "SENT",
      sentAt: resp.sentAt,
      sentToEmail: form.counterpartyEmail.trim() || doc.sentToEmail,
      googleDocUrl: resp.googleDocUrl,
      // Snapshot will be the content we just sent.
      contentSnapshot: form.content,
      content: form.content,
    };
    onSaved(updated);
    const recipient = form.counterpartyEmail.trim() || "the counterparty";
    showToast(`NDA sent — Google Doc shared with ${recipient}`, "success");
    setForm((prev) => ({ ...prev, status: "SENT" }));
    setShowSnapshot(true);
  }

  const displayedContent = useMemo(() => {
    if (showSnapshot && hasSnapshot) return doc.contentSnapshot ?? "";
    return form.content;
  }, [showSnapshot, hasSnapshot, doc.contentSnapshot, form.content]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
          aria-label="Back to gallery"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-[#003366] font-medium truncate">
            {dealLabel}
          </div>
          <div className="text-sm font-semibold text-slate-900 truncate">
            {form.title || "Untitled NDA"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSent && hasSnapshot && (
            <button
              type="button"
              onClick={() => setShowSnapshot((s) => !s)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              {showSnapshot ? "View current draft" : "View sent snapshot"}
            </button>
          )}
          {!isSent && (
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#003366] border border-[#003366]/30 hover:bg-[#E6EEF5]/50"
            >
              Send NDA
            </button>
          )}
          {!inSnapshotView && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold text-white inline-flex items-center gap-1.5",
                saving ? "opacity-70 cursor-not-allowed" : "hover:opacity-90",
              )}
              style={{ backgroundColor: "#003366" }}
            >
              {saving && (
                <span className="material-symbols-outlined text-[14px] animate-spin">
                  progress_activity
                </span>
              )}
              Save
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left pane — editor */}
        <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
          {error && (
            <div className="mb-4 rounded-lg px-3 py-2.5 text-sm border bg-red-50 border-red-200 text-red-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
              <div className="flex-1 min-w-0">{error}</div>
            </div>
          )}

          {isSent && doc.googleDocUrl && (
            <SentActionBar
              googleDocUrl={doc.googleDocUrl}
              sentToEmail={doc.sentToEmail}
              sentAt={doc.sentAt}
              snapshotView={showSnapshot && hasSnapshot}
              hasSnapshot={hasSnapshot}
              onToggleSnapshot={() => setShowSnapshot((s) => !s)}
            />
          )}

          {showSnapshot && hasSnapshot && (
            <div className="mb-3 rounded-lg px-3 py-2.5 text-xs border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] mt-0.5">lock</span>
              <div className="leading-snug">
                This is the version that was sent. Edits here won&rsquo;t
                propagate to the counterparty — switch to Google Docs for
                live edits.
              </div>
            </div>
          )}

          <div className="max-w-[820px] mx-auto bg-white shadow-sm rounded-md border border-slate-200">
            <Editor
              ref={editorRef}
              value={displayedContent}
              onChange={(html) => patch("content", html)}
              placeholder="Document body…"
              readOnly={showSnapshot && hasSnapshot}
            />
          </div>
        </div>

        {/* Right pane — metadata sidebar */}
        <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto px-5 py-6 space-y-4">
          <Field label="Title" required>
            <input
              value={form.title}
              onChange={(e) => patch("title", e.target.value)}
              className={inputCls}
              required
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => patch("status", e.target.value as DocStatus)}
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
              value={form.counterpartyName}
              onChange={(e) => patch("counterpartyName", e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Counterparty email">
            <input
              type="email"
              value={form.counterpartyEmail}
              onChange={(e) => patch("counterpartyEmail", e.target.value)}
              className={inputCls}
            />
          </Field>

          <Field label="Counterparty address">
            <textarea
              value={form.counterpartyAddress}
              onChange={(e) => patch("counterpartyAddress", e.target.value)}
              rows={3}
              className={cn(inputCls, "resize-y")}
            />
          </Field>

          <Field label="Jurisdiction">
            <input
              value={form.jurisdiction}
              onChange={(e) => patch("jurisdiction", e.target.value)}
              placeholder="State of Delaware"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective date">
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => patch("effectiveDate", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Expires at">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => patch("expiresAt", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          {form.status === "SIGNED" && (
            <Field label="Signed at">
              <input
                type="datetime-local"
                value={form.signedAt}
                onChange={(e) => patch("signedAt", e.target.value)}
                className={inputCls}
              />
            </Field>
          )}

          {doc.sentAt && (
            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-0.5">
              <div>
                <span className="font-medium text-slate-700">Sent:</span>{" "}
                {new Date(doc.sentAt).toLocaleString()}
              </div>
              {doc.sentToEmail && (
                <div className="truncate">
                  <span className="font-medium text-slate-700">To:</span>{" "}
                  {doc.sentToEmail}
                </div>
              )}
              {doc.googleDocUrl && (
                <div className="truncate">
                  <span className="font-medium text-slate-700">Doc:</span>{" "}
                  <a
                    href={doc.googleDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#003366] hover:underline"
                  >
                    Open in Google Docs
                  </a>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <SendModal
        open={sendOpen}
        doc={doc}
        onCancel={() => setSendOpen(false)}
        onSent={handleSent}
      />
    </div>
  );
}

interface SentActionBarProps {
  googleDocUrl: string;
  sentToEmail: string | null;
  sentAt: string | null;
  snapshotView: boolean;
  hasSnapshot: boolean;
  onToggleSnapshot: () => void;
}

function SentActionBar({
  googleDocUrl,
  sentToEmail,
  sentAt,
  snapshotView,
  hasSnapshot,
  onToggleSnapshot,
}: SentActionBarProps) {
  const recipient = sentToEmail ?? "the counterparty";
  const when = sentAt ? new Date(sentAt).toLocaleString() : "earlier";
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px]">check</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-emerald-900">
          Sent to {recipient} on {when}.
        </div>
        <div className="text-xs text-emerald-700/90 mt-0.5">
          Counterparty has edit access in Google Docs.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => window.open(googleDocUrl, "_blank", "noopener,noreferrer")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          Open in Google Docs
        </button>
        {hasSnapshot && (
          <button
            type="button"
            onClick={onToggleSnapshot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50"
          >
            {snapshotView ? "View current draft" : "View snapshot here"}
          </button>
        )}
      </div>
    </div>
  );
}

// Convert an ISO timestamp into "YYYY-MM-DDTHH:MM" that <input
// type="datetime-local"> expects. Bare `.toISOString().slice(0, 16)` would
// render in UTC; we want the user's wall clock to match.
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
