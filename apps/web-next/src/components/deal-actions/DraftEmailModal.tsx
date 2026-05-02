"use client";

// Ported from apps/web/js/ai-email-drafter.js (openEmailDraftModal +
// generateEmailDraft + renderEmailDraft + copyEmailDraft).
// Calls GET /api/ai/email-templates and POST /api/ai/draft-email.
// Response shape: see EmailDraftResult in
// apps/api/src/services/agents/emailDrafter/index.ts.

import { useEffect, useState } from "react";
import { api, NotFoundError } from "@/lib/api";

interface EmailTemplate {
  id: string;
  name: string;
  structure?: string;
}

interface EmailDraftResult {
  status: "ready_for_review" | "compliance_issues" | "failed";
  subject: string;
  draft: string;
  toneScore: number;
  toneNotes: string[];
  complianceIssues: string[];
  isCompliant: boolean;
  suggestions: string[];
  error?: string | null;
}

type Tone = "professional" | "friendly" | "formal" | "direct" | "warm";
const TONES: Tone[] = ["professional", "friendly", "formal", "direct", "warm"];

export function DraftEmailModal({
  dealId,
  dealName,
  onClose,
}: {
  dealId: string;
  dealName: string;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [purpose, setPurpose] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EmailDraftResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Esc-to-close + body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Fetch templates once on mount. 404 / failure is non-fatal — user can
  // still draft without a template.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ templates: EmailTemplate[] }>("/ai/email-templates");
        if (!cancelled) setTemplates(data.templates || []);
      } catch (err) {
        if (!cancelled && !(err instanceof NotFoundError)) {
          // Silently ignore — free-form drafting still works.
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = async () => {
    const trimmedPurpose = purpose.trim();
    if (trimmedPurpose.length < 5) {
      setError("Please enter a purpose (at least 5 characters)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        dealId,
        purpose: trimmedPurpose,
        tone,
      };
      if (templateId) body.templateId = templateId;
      if (context.trim()) body.context = context.trim();

      const data = await api.post<EmailDraftResult>("/ai/draft-email", body);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.draft}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[DraftEmailModal/copy] clipboard write failed:", err);
      setError("Failed to copy to clipboard");
    }
  };

  const reset = () => {
    setResult(null);
    setError("");
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-border-subtle">
        {/* Header */}
        <div
          className="px-6 py-4 border-b border-border-subtle flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #003366, #004488)" }}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white/80 text-xl">edit_note</span>
            <div>
              <h2 className="text-base font-bold text-white">AI Email Drafter</h2>
              <p className="text-xs text-white/60">{dealName || "New Email"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        {!result && !loading && (
          <div className="p-6 overflow-y-auto max-h-[65vh]">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                >
                  <option value="">No template (free-form)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as Tone)}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Purpose <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Follow up on management meeting, request financials"
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Additional Context
              </label>
              <textarea
                rows={3}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Any specific details, references, or instructions..."
                className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-red-500 text-sm">error</span>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button
              onClick={handleGenerate}
              className="w-full py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              style={{ backgroundColor: "#003366" }}
            >
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Generate Draft
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-14 px-6">
            <span className="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span>
            <p className="text-sm font-medium text-text-main">Drafting email...</p>
            <p className="text-xs text-text-muted mt-1">
              Draft → Tone check → Compliance check → Review
            </p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <>
            <div
              className={`px-6 py-3 border-b border-border-subtle flex items-center justify-between ${
                result.status === "ready_for_review" ? "bg-secondary-light" : "bg-amber-50"
              }`}
            >
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  result.status === "ready_for_review" ? "text-secondary" : "text-amber-600"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {result.isCompliant ? "check_circle" : "warning"}
                </span>
                {result.status === "ready_for_review" ? "Ready for Review" : "Compliance Issues"}
              </span>
              <span className="text-xs text-text-muted">Tone: {result.toneScore}/100</span>
            </div>
            <div className="p-6 overflow-y-auto max-h-[55vh]">
              <div className="mb-4">
                <label className="block text-xs font-medium text-text-muted mb-1">Subject</label>
                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-border-subtle text-sm font-medium text-text-main">
                  {result.subject}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-text-muted mb-1">Email Body</label>
                <div
                  className="px-4 py-3 rounded-lg bg-white border border-border-subtle text-sm text-text-secondary leading-relaxed whitespace-pre-wrap"
                  style={{ minHeight: 120 }}
                >
                  {result.draft}
                </div>
              </div>
              {result.toneNotes && result.toneNotes.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-text-muted mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">record_voice_over</span>
                    Tone Feedback
                  </div>
                  <ul className="flex flex-col gap-1">
                    {result.toneNotes.map((n, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">•</span>{n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.complianceIssues && result.complianceIssues.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="text-xs font-bold text-red-700 mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">gavel</span>
                    Compliance Issues
                  </div>
                  <ul className="flex flex-col gap-1">
                    {result.complianceIssues.map((n, i) => (
                      <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                        <span className="mt-0.5">!</span>{n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.suggestions && result.suggestions.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-text-muted mb-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">lightbulb</span>
                    Suggestions
                  </div>
                  <ul className="flex flex-col gap-1">
                    {result.suggestions.map((n, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">•</span>{n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.error && (
                <div className="mb-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {result.error}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border-subtle bg-gray-50 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary-light/50 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copied ? "check" : "content_copy"}
                  </span>
                  {copied ? "Copied" : "Copy to Clipboard"}
                </button>
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  New Draft
                </button>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
