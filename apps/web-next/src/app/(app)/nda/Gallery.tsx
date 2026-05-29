"use client";

import { cn } from "@/lib/cn";
import { DOC_TYPE_LABELS, STATUS_COLOR_CLASSES, STATUS_LABELS } from "./constants";
import type { LegalDocumentWithDeal } from "./types";

interface CreateTileProps {
  onClick: () => void;
}

function CreateTile({ onClick }: CreateTileProps) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/40 hover:border-[#003366] hover:bg-[#E6EEF5]/60 transition flex items-center justify-center"
    >
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-6 rounded-lg border-2 border-dashed border-slate-300 group-hover:border-[#003366] transition">
        <div className="w-11 h-11 rounded-full bg-white border border-slate-200 group-hover:border-[#003366] flex items-center justify-center text-slate-500 group-hover:text-[#003366] shadow-sm">
          <span className="material-symbols-outlined text-[24px]">add</span>
        </div>
        <div className="text-sm font-medium text-slate-700 group-hover:text-[#003366]">
          New NDA
        </div>
        <div className="text-[11px] text-slate-400 -mt-1.5">
          Draft a fresh NDA from a template or blank Google Doc
        </div>
      </div>
    </button>
  );
}

interface DocCardProps {
  doc: LegalDocumentWithDeal;
  onOpen: (doc: LegalDocumentWithDeal) => void;
  onEdit: (doc: LegalDocumentWithDeal) => void;
  onDelete: (doc: LegalDocumentWithDeal) => void;
}

function formatDateShort(d: string | null): string | null {
  if (!d) return null;
  // The wire format is YYYY-MM-DD or an ISO string. Parsing without TZ on a
  // bare date causes "Apr 30" to flip to "Apr 29" in UTC- timezones, so we
  // pin to noon UTC for bare dates to keep the day stable.
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d;
  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DocCard({ doc, onOpen, onEdit, onDelete }: DocCardProps) {
  const dealLabel = doc.deal.target || doc.deal.projectName || "Unknown deal";
  const statusCls = STATUS_COLOR_CLASSES[doc.status];
  const effective = formatDateShort(doc.effectiveDate);
  const expires = formatDateShort(doc.expiresAt);
  const counterparty = doc.counterpartyName?.trim();

  return (
    <div className="group relative aspect-[4/3] rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
      {/* Card body — clicking opens the Google Doc in a new tab. That's the
          primary action; pencil/trash are hover-only affordances. */}
      <button
        onClick={() => onOpen(doc)}
        className="absolute inset-0 text-left"
        aria-label={`Open ${doc.title} in Google Docs`}
      >
        <span className="sr-only">Open in Google Docs</span>
      </button>

      <div className="relative px-4 pt-3 pb-1 pointer-events-none">
        <div className="text-[10px] uppercase tracking-wider text-[#003366] font-medium truncate">
          {dealLabel}
        </div>
        <div className="flex items-start justify-between gap-2 mt-0.5">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 truncate">
              {doc.title}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {counterparty ? counterparty : (
                <span className="text-slate-400">No counterparty</span>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
              statusCls.bg,
              statusCls.text,
              statusCls.border,
            )}
          >
            {STATUS_LABELS[doc.status]}
          </span>
        </div>
      </div>

      {/* Bottom strip — effective / expires dates if present, doc-type
          fallback otherwise. Keeps the card visually balanced even when an
          NDA has zero metadata filled in yet. */}
      <div className="absolute inset-x-0 bottom-0 top-[72px] px-4 py-3 pointer-events-none">
        <div className="h-full rounded-lg border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center px-3 gap-1.5">
          {effective || expires ? (
            <>
              {effective && (
                <DateRow icon="event_available" label="Effective" value={effective} />
              )}
              {expires && (
                <DateRow icon="event_busy" label="Expires" value={expires} />
              )}
            </>
          ) : (
            <span className="text-[11px] text-slate-400">
              {DOC_TYPE_LABELS[doc.docType]} · no dates set
            </span>
          )}
        </div>
      </div>

      {/* Hover affordances */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-1 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(doc);
          }}
          className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-[#003366] hover:border-[#003366] shadow-sm flex items-center justify-center"
          title="Edit metadata"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(doc);
          }}
          className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-rose-700 hover:border-rose-300 shadow-sm flex items-center justify-center"
          title="Delete"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>
      </div>
    </div>
  );
}

function DateRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className="material-symbols-outlined text-[14px] text-slate-400">
        {icon}
      </span>
      <span className="text-slate-400">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

interface GalleryProps {
  docs: LegalDocumentWithDeal[];
  loading: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (doc: LegalDocumentWithDeal) => void;
  onDelete: (doc: LegalDocumentWithDeal) => void;
  onDismissError: () => void;
}

export function Gallery({
  docs,
  loading,
  error,
  onCreate,
  onEdit,
  onDelete,
  onDismissError,
}: GalleryProps) {
  function handleOpen(doc: LegalDocumentWithDeal) {
    // Direct hand-off to Google Docs. The doc lives there — the gallery card
    // is a launcher, not a viewer. noopener/noreferrer for the usual reasons.
    window.open(doc.googleDocUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="max-w-[1280px] mx-auto px-8 py-7">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NDAs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live NDAs stored as Google Docs. Click a card to open the doc;
            metadata edits stay here so dashboards and reports can read them.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {loading ? "Loading…" : `${docs.length} saved`}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
          <button
            onClick={onDismissError}
            className="ml-auto text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <CreateTile onClick={onCreate} />

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : docs.length === 0 ? (
          <EmptyCard />
        ) : (
          docs.map((d) => (
            <DocCard
              key={d.id}
              doc={d}
              onOpen={handleOpen}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="relative aspect-[4/3] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="px-4 pt-3 pb-1 space-y-2">
        <div className="h-2.5 w-24 bg-slate-200 rounded" />
        <div className="h-3.5 w-3/4 bg-slate-200 rounded" />
        <div className="h-2.5 w-1/3 bg-slate-100 rounded" />
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[72px] px-4 py-3">
        <div className="h-full rounded-lg bg-slate-50 border border-dashed border-slate-200" />
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="aspect-[4/3] rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
        <span className="material-symbols-outlined text-[24px]">gavel</span>
      </div>
      <div className="text-sm font-medium text-slate-700">No NDAs yet</div>
      <div className="text-[12px] text-slate-500 max-w-xs mt-1">
        Open a deal and click{" "}
        <span className="inline-flex items-center gap-0.5 text-[#003366] font-medium">
          New NDA
        </span>
        , or pick a deal here to start one.
      </div>
    </div>
  );
}
