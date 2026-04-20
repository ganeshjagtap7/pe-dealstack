"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime, formatFileSize, getDocIcon } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealDetail {
  id: string;
  name: string;
  companyName?: string;
  stage: string;
  industry?: string;
  dealSize?: number;
  revenue?: number;
  ebitda?: number;
  targetReturn?: number;
  evMultiple?: number;
  priority?: string;
  status?: string;
  aiThesis?: string;
  aiRisks?: { keyRisks?: string[]; investmentHighlights?: string[] };
  description?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  documents?: DocItem[];
  team?: TeamMember[];
}

export interface DocItem {
  id: string;
  name: string;
  type?: string;
  fileSize?: number;
  createdAt: string;
  url?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface Activity {
  id: string;
  action: string;
  description?: string;
  userName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage pipeline config (matches the constants used in the old app)
// ---------------------------------------------------------------------------

export const PIPELINE_STAGES = [
  { key: "SOURCING", label: "Sourcing", icon: "search" },
  { key: "SCREENING", label: "Screening", icon: "filter_alt" },
  { key: "DILIGENCE", label: "Due Diligence", icon: "fact_check" },
  { key: "IC_REVIEW", label: "IC Review", icon: "groups" },
  { key: "CLOSING", label: "Closing", icon: "gavel" },
  { key: "CLOSED", label: "Closed", icon: "check_circle" },
];

export const TERMINAL_STAGES = ["CLOSED", "PASSED"];

export const TABS = ["Overview", "Documents", "Chat", "Activity"] as const;
export type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

export function OverviewTab({ deal }: { deal: DealDetail }) {
  const metrics = [
    { label: "Deal Size", value: formatCurrency(deal.dealSize), icon: "payments" },
    { label: "Revenue", value: formatCurrency(deal.revenue), icon: "trending_up" },
    { label: "EBITDA", value: formatCurrency(deal.ebitda), icon: "analytics" },
    {
      label: "Target Return",
      value: deal.targetReturn != null ? `${deal.targetReturn}%` : "N/A",
      icon: "target",
    },
    {
      label: "EV Multiple",
      value: deal.evMultiple != null ? `${deal.evMultiple}x` : "N/A",
      icon: "calculate",
    },
  ];

  const risks = deal.aiRisks?.keyRisks || [];
  const highlights = deal.aiRisks?.investmentHighlights || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column: metrics + thesis */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-surface-card border border-border-subtle rounded-lg p-3 shadow-card"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  {m.icon}
                </span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {m.label}
                </span>
              </div>
              <p className="text-lg font-bold text-text-main">{m.value}</p>
            </div>
          ))}
        </div>

        {/* AI Thesis */}
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
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

        {/* Description */}
        {deal.description && (
          <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
            <h3 className="text-sm font-semibold text-text-main mb-3">Description</h3>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {deal.description}
            </p>
          </div>
        )}
      </div>

      {/* Right column: risks + highlights */}
      <div className="flex flex-col gap-6">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-red-400">shield</span>
            <h3 className="text-sm font-semibold text-text-main">Key Risks</h3>
          </div>
          {risks.length === 0 && highlights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-text-muted">
              <span className="material-symbols-outlined text-2xl mb-2">shield</span>
              <p className="text-sm">No risks identified yet</p>
              <p className="text-xs mt-1">Upload documents or use AI chat to analyze risks</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {risks.map((risk, i) => (
                <li
                  key={i}
                  className={cn(
                    "bg-white border border-border-subtle p-3 rounded-lg",
                    i === 0 ? "border-l-2 border-l-red-400" : "border-l-2 border-l-orange-300"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "material-symbols-outlined text-base mt-0.5 shrink-0",
                        i === 0 ? "text-red-400" : "text-orange-400"
                      )}
                    >
                      {i === 0 ? "error" : "warning"}
                    </span>
                    <p className="text-xs text-text-secondary leading-snug">{risk}</p>
                  </div>
                </li>
              ))}
              {highlights.map((h, i) => (
                <li
                  key={`h-${i}`}
                  className="bg-white border border-border-subtle border-l-2 border-l-emerald-500 p-3 rounded-lg"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-emerald-500 text-base mt-0.5 shrink-0">
                      check_circle
                    </span>
                    <p className="text-xs text-text-secondary leading-snug">{h}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Deal info */}
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <h3 className="text-sm font-semibold text-text-main mb-3">Deal Info</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text-main font-medium">{formatRelativeTime(deal.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Updated</dt>
              <dd className="text-text-main font-medium">{formatRelativeTime(deal.updatedAt)}</dd>
            </div>
            {deal.assignee && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Assignee</dt>
                <dd className="text-text-main font-medium">{deal.assignee}</dd>
              </div>
            )}
            {deal.priority && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Priority</dt>
                <dd className="text-text-main font-medium capitalize">{deal.priority}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------

export function DocumentsTab({
  documents,
  uploading,
  fileInputRef,
  onUpload,
}: {
  documents: DocItem[];
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-main">
          Documents ({documents.length})
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">
              {uploading ? "progress_activity" : "upload_file"}
            </span>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
          <span className="material-symbols-outlined text-4xl text-text-muted">folder_open</span>
          <p className="mt-2 text-sm text-text-muted">No documents yet</p>
          <p className="text-xs text-text-muted mt-1">Upload files to get started</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-border-subtle rounded-xl shadow-card divide-y divide-border-subtle">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[22px] text-text-muted">
                {getDocIcon(doc.name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-main truncate">{doc.name}</p>
                <p className="text-xs text-text-muted">
                  {formatFileSize(doc.fileSize)}{" "}
                  {doc.createdAt && <>· {formatRelativeTime(doc.createdAt)}</>}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-text-muted hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export ChatTab & ActivityTab from deal-tabs.tsx
// ---------------------------------------------------------------------------

export { ChatTab } from "./deal-tabs";
export { ActivityTab } from "./deal-tabs";

// ---------------------------------------------------------------------------
// Stage Change Modal
// ---------------------------------------------------------------------------

export function StageChangeModal({
  from,
  to,
  note,
  setNote,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  from: string;
  to: string;
  note: string;
  setNote: (v: string) => void;
  loading: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const fromLabel = STAGE_LABELS[from] || from;
  const toLabel = STAGE_LABELS[to] || to;
  const fromIdx = PIPELINE_STAGES.findIndex((s) => s.key === from);
  const toIdx = PIPELINE_STAGES.findIndex((s) => s.key === to);
  const isMovingBack = toIdx < fromIdx;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-text-main text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">swap_horiz</span>
              Change Deal Stage
            </h3>
            <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="text-center">
              <div className="size-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                <span className="material-symbols-outlined text-gray-500">circle</span>
              </div>
              <span className="text-sm font-medium text-text-secondary">{fromLabel}</span>
            </div>
            <span
              className={cn(
                "material-symbols-outlined text-2xl",
                isMovingBack ? "text-amber-500" : "text-primary"
              )}
            >
              {isMovingBack ? "arrow_back" : "arrow_forward"}
            </span>
            <div className="text-center">
              <div
                className={cn(
                  "size-12 rounded-full flex items-center justify-center mx-auto mb-2",
                  isMovingBack ? "bg-amber-100" : "bg-blue-50"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined",
                    isMovingBack ? "text-amber-600" : "text-primary"
                  )}
                >
                  circle
                </span>
              </div>
              <span
                className={cn(
                  "text-sm font-bold",
                  isMovingBack ? "text-amber-600" : "text-primary"
                )}
              >
                {toLabel}
              </span>
            </div>
          </div>

          {isMovingBack && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">
                  warning
                </span>
                <p className="text-sm text-amber-700">
                  You are moving this deal backwards in the pipeline. This will be logged in the
                  activity feed.
                </p>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-main mb-2">
              Add a note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary resize-none"
              rows={2}
              placeholder="Reason for stage change..."
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-red-500 text-sm">error</span>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border-subtle rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium text-sm disabled:opacity-60 transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              {loading ? "Updating..." : "Confirm Change"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
