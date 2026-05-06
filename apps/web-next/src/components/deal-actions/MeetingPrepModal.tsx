"use client";

// Ported from ai-tools.js (openMeetingPrepModal + generateMeetingPrep
// + renderMeetingBrief + exportMeetingBrief). Calls POST /api/ai/meeting-prep
// which returns a MeetingBrief — see
// apps/api/src/services/agents/meetingPrep/index.ts for the response shape.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface MeetingBrief {
  headline: string;
  dealSummary: string;
  contactProfile: string | null;
  keyTalkingPoints: string[];
  questionsToAsk: string[];
  risksToAddress: string[];
  documentHighlights: string[];
  suggestedAgenda: string[];
  generatedAt: string;
}

const todayIso = () => new Date().toISOString().split("T")[0];

export function MeetingPrepModal({
  dealId,
  dealName,
  onClose,
}: {
  dealId: string;
  dealName: string;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const [copied, setCopied] = useState(false);

  // Esc-to-close + body scroll lock (matches edit-deal-modal pattern)
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

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.post<MeetingBrief>("/ai/meeting-prep", {
        dealId,
        meetingTopic: topic || undefined,
        meetingDate: date || undefined,
      });
      setBrief(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate brief");
    } finally {
      setLoading(false);
    }
  };

  const briefAsText = (b: MeetingBrief): string => {
    const lines: string[] = [];
    lines.push("MEETING PREP BRIEF");
    lines.push("=".repeat(50));
    lines.push(b.headline || "Meeting Brief");
    lines.push(`Generated: ${new Date(b.generatedAt).toLocaleString()}`);
    lines.push("");
    if (b.dealSummary) { lines.push("DEAL SUMMARY"); lines.push(b.dealSummary); lines.push(""); }
    if (b.contactProfile) { lines.push("CONTACT PROFILE"); lines.push(b.contactProfile); lines.push(""); }
    if (b.keyTalkingPoints?.length) {
      lines.push("KEY TALKING POINTS");
      b.keyTalkingPoints.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
      lines.push("");
    }
    if (b.questionsToAsk?.length) {
      lines.push("QUESTIONS TO ASK");
      b.questionsToAsk.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
      lines.push("");
    }
    if (b.risksToAddress?.length) {
      lines.push("RISKS TO ADDRESS");
      b.risksToAddress.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
      lines.push("");
    }
    if (b.documentHighlights?.length) {
      lines.push("DOCUMENT HIGHLIGHTS");
      b.documentHighlights.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
      lines.push("");
    }
    if (b.suggestedAgenda?.length) {
      lines.push("SUGGESTED AGENDA");
      b.suggestedAgenda.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
      lines.push("");
    }
    return lines.join("\n");
  };

  const handleCopy = async () => {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(briefAsText(brief));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[MeetingPrepModal/copy] clipboard write failed:", err);
      setError("Failed to copy to clipboard");
    }
  };

  const handleDownload = () => {
    if (!brief) return;
    const blob = new Blob([briefAsText(brief)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-prep-${todayIso()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
            <span className="material-symbols-outlined text-white/80 text-xl">event_note</span>
            <div>
              <h2 className="text-base font-bold text-white">AI Meeting Prep</h2>
              <p className="text-xs text-white/60">{dealName || "Deal"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        {!brief && !loading && (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Meeting Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Initial management meeting"
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Meeting Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
                />
              </div>
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
              Generate Meeting Brief
            </button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-14 px-6">
            <span className="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span>
            <p className="text-sm font-medium text-text-main">Generating meeting brief...</p>
            <p className="text-xs text-text-muted mt-1">Analyzing deal data, contacts, and documents</p>
          </div>
        )}

        {brief && !loading && (
          <>
            <div className="px-6 py-4 border-b border-border-subtle bg-primary-light/30">
              <h3 className="text-base font-bold text-primary">{brief.headline || "Meeting Brief"}</h3>
              <p className="text-[10px] text-text-muted mt-1">
                Generated {new Date(brief.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[55vh]">
              <BriefSection icon="summarize" title="Deal Summary" text={brief.dealSummary} />
              <BriefSection icon="person" title="Contact Profile" text={brief.contactProfile} />
              <BriefSection icon="campaign" title="Key Talking Points" list={brief.keyTalkingPoints} />
              <BriefSection icon="help" title="Questions to Ask" list={brief.questionsToAsk} />
              <BriefSection icon="warning" title="Risks to Address" list={brief.risksToAddress} />
              <BriefSection icon="description" title="Document Highlights" list={brief.documentHighlights} />
              <BriefSection icon="calendar_today" title="Suggested Agenda" numbered={brief.suggestedAgenda} />
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
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#003366" }}
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Export
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

function BriefSection({
  icon,
  title,
  text,
  list,
  numbered,
}: {
  icon: string;
  title: string;
  text?: string | null;
  list?: string[];
  numbered?: string[];
}) {
  if (text == null && (!list || list.length === 0) && (!numbered || numbered.length === 0)) return null;
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-primary text-[16px]">{icon}</span>
        {title}
      </h4>
      {text != null && <p className="text-sm text-text-secondary leading-relaxed">{text}</p>}
      {list && list.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {list.map((item, i) => (
            <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
              <span className="text-primary mt-1 text-[6px]">●</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {numbered && numbered.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {numbered.map((item, i) => (
            <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
              <span className="text-primary font-bold text-xs w-4 shrink-0">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
