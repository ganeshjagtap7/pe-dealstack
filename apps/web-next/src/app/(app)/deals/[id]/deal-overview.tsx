"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { formatRelativeTime, formatFileSize, getDocIcon } from "@/lib/formatters";
import { api } from "@/lib/api";
import type { DealDetail, Activity, DocItem } from "./components";

// ---------------------------------------------------------------------------
// Overview Tab — always-visible left-panel content (Key Risks, AI Thesis,
// Add Note, Activity Feed, Recent Documents).
// Ported from deal.html left-panel + deal-activity.js + deal-stages.js
// ---------------------------------------------------------------------------

export function OverviewTab({
  deal,
  activities,
  activitiesLoading,
  onRefreshActivities,
}: {
  deal: DealDetail;
  activities: Activity[];
  activitiesLoading: boolean;
  onRefreshActivities: () => void;
}) {
  const risks = deal.aiRisks?.keyRisks || [];
  const highlights = deal.aiRisks?.investmentHighlights || [];

  return (
    <div className="flex flex-col gap-5">
      <KeyRisksSection risks={risks} highlights={highlights} />

      {/* AI Thesis */}
      <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[20px] text-primary">auto_awesome</span>
          <h3 className="text-sm font-semibold text-text-main">AI Investment Thesis</h3>
        </div>
        {deal.aiThesis ? (
          <p className="text-sm text-text-secondary leading-relaxed">{deal.aiThesis}</p>
        ) : (
          <p className="text-sm text-text-muted italic">
            No AI thesis generated yet. Upload documents and use the chat to analyze this deal.
          </p>
        )}
      </div>

      {deal.description && (
        <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
          <h3 className="text-sm font-semibold text-text-main mb-3">Description</h3>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {deal.description}
          </p>
        </div>
      )}

      <AddNoteSection dealId={deal.id} onNoteAdded={onRefreshActivities} />

      <InlineActivityFeed
        activities={activities}
        loading={activitiesLoading}
        onRefresh={onRefreshActivities}
      />

      {(deal.documents?.length ?? 0) > 0 && (
        <RecentDocuments documents={deal.documents || []} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key Risks (ported from deal-stages.js renderKeyRisks)
// ---------------------------------------------------------------------------

function KeyRisksSection({ risks, highlights }: { risks: string[]; highlights: string[] }) {
  if (risks.length === 0 && highlights.length === 0) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-lg text-amber-500">warning</span>
          <h3 className="text-sm font-bold text-text-main uppercase tracking-wider">Key Risks</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-text-muted">
          <span className="material-symbols-outlined text-2xl mb-2">shield</span>
          <p className="text-sm">No risks identified yet</p>
          <p className="text-xs mt-1">Upload documents or use AI chat to analyze risks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-lg text-amber-500">warning</span>
        <h3 className="text-sm font-bold text-text-main uppercase tracking-wider">Key Risks</h3>
      </div>
      <ul className="space-y-2">
        {risks.map((risk, i) => (
          <li
            key={i}
            className={cn(
              "bg-white border border-border-subtle p-3 rounded-lg hover:shadow-sm transition-all",
              i === 0 ? "border-l-2 border-l-red-400" : "border-l-2 border-l-orange-300"
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className={cn("material-symbols-outlined text-base mt-0.5 shrink-0", i === 0 ? "text-red-400" : "text-orange-400")}>
                {i === 0 ? "error" : "warning"}
              </span>
              <p className="text-xs text-text-secondary leading-snug">{risk}</p>
            </div>
          </li>
        ))}
        {highlights.map((h, i) => (
          <li key={`h-${i}`} className="bg-white border border-border-subtle border-l-2 border-l-emerald-500 p-3 rounded-lg hover:shadow-sm transition-all">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-emerald-500 text-base mt-0.5 shrink-0">check_circle</span>
              <p className="text-xs text-text-secondary leading-snug">{h}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Note (ported from deal-activity.js addNote + initActivityFeed)
// ---------------------------------------------------------------------------

function AddNoteSection({ dealId, onNoteAdded }: { dealId: string; onNoteAdded: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const addNote = useCallback(async () => {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    try {
      await api.post(`/deals/${dealId}/activities`, {
        type: "NOTE_ADDED",
        title: "Note added",
        description: text,
      });
      setNote("");
      onNoteAdded();
    } catch { /* non-critical */ } finally {
      setSaving(false);
    }
  }, [dealId, note, onNoteAdded]);

  return (
    <div className="bg-surface-card border border-border-subtle rounded-lg p-4 shadow-card">
      <h3 className="text-sm font-bold text-text-main uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-500 text-lg">sticky_note_2</span>
        Add Note
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
          placeholder="Add a note about this deal..."
          className="flex-1 px-3 py-2 border border-border-subtle rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          onClick={addNote}
          disabled={!note.trim() || saving}
          className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-60"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Activity Feed (ported from deal-activity.js renderActivityFeed)
// ---------------------------------------------------------------------------

const ACTIVITY_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  DOCUMENT_UPLOADED: { icon: "upload_file", color: "text-blue-600", bg: "bg-blue-100" },
  STAGE_CHANGED: { icon: "swap_horiz", color: "text-purple-600", bg: "bg-purple-100" },
  NOTE_ADDED: { icon: "sticky_note_2", color: "text-amber-600", bg: "bg-amber-100" },
  MEETING_SCHEDULED: { icon: "event", color: "text-green-600", bg: "bg-green-100" },
  CALL_LOGGED: { icon: "call", color: "text-cyan-600", bg: "bg-cyan-100" },
  EMAIL_SENT: { icon: "mail", color: "text-red-600", bg: "bg-red-100" },
  STATUS_UPDATED: { icon: "update", color: "text-indigo-600", bg: "bg-indigo-100" },
  TEAM_MEMBER_ADDED: { icon: "person_add", color: "text-emerald-600", bg: "bg-emerald-100" },
};

function InlineActivityFeed({ activities, loading, onRefresh }: { activities: Activity[]; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-lg p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">history</span>
          Activity Feed
        </h3>
        <button onClick={onRefresh} className="text-xs text-primary font-medium flex items-center gap-1 transition-colors hover:opacity-80">
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh
        </button>
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <span className="material-symbols-outlined animate-spin text-primary mr-2">sync</span>
            Loading activities...
          </div>
        )}
        {!loading && activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-2">inbox</span>
            <p className="text-sm">No activities yet</p>
          </div>
        )}
        {!loading && activities.slice(0, 10).map((activity) => {
          const iconDef = ACTIVITY_ICONS[activity.type || ""] || { icon: "info", color: "text-gray-600", bg: "bg-gray-100" };
          const userName = activity.user?.name || activity.userName;
          return (
            <div key={activity.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-border-subtle hover:border-primary/30 transition-colors">
              <div className={cn("size-8 rounded-full flex items-center justify-center shrink-0", iconDef.bg)}>
                <span className={cn("material-symbols-outlined text-sm", iconDef.color)}>{iconDef.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-main leading-tight">{activity.title || activity.action}</p>
                {activity.description && <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{activity.description}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-text-muted font-medium">{formatRelativeTime(activity.createdAt)}</span>
                  {userName && (
                    <>
                      <span className="text-[10px] text-text-muted">&middot;</span>
                      <span className="text-[10px] text-text-muted">{userName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Documents (bottom of left panel)
// ---------------------------------------------------------------------------

function RecentDocuments({ documents }: { documents: DocItem[] }) {
  return (
    <div className="pt-5 border-t border-border-subtle">
      <h3 className="text-sm font-bold text-text-main mb-3">Recent Documents</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {documents.slice(0, 5).map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 p-2 pr-4 bg-white rounded-lg border border-border-subtle shrink-0 hover:border-primary/50 hover:bg-blue-50/30 cursor-pointer transition-colors group shadow-sm">
            <div className="size-10 bg-gray-50 rounded flex items-center justify-center text-text-muted group-hover:bg-blue-50 transition-colors">
              <span className="material-symbols-outlined">{getDocIcon(doc.name)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-text-main">{doc.name}</span>
              <span className="text-xs text-text-muted">{formatFileSize(doc.fileSize)} - Added {formatRelativeTime(doc.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
