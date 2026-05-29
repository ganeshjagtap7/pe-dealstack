"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { LegalDocTemplate } from "./types";

interface TemplatePickerProps {
  open: boolean;
  dealLabel: string;
  onCancel: () => void;
  // `null` means "blank document" — caller knows to dispatch the blank-mode
  // path on the next step.
  onSelect: (template: LegalDocTemplate | null) => void;
}

// Second-step modal in the NDA-create flow. Sits between DealPicker and
// CreateDocModal: the user picks an NDA template (or "Blank document") and
// the page transitions to the create form with the chosen template id (or
// "blank") locked in.
export function TemplatePicker({
  open,
  dealLabel,
  onCancel,
  onSelect,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<LegalDocTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<LegalDocTemplate[]>(
        "/legal-document-templates?docType=NDA",
      );
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[nda] template list failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load templates");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Pin the default template first so the most common choice shows up where
  // the eye lands. Stable sort within each bucket keeps order predictable
  // for users with several templates.
  const ordered = [...templates].sort((a, b) => {
    if (a.isDefault === b.isDefault) return a.name.localeCompare(b.name);
    return a.isDefault ? -1 : 1;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              Pick an NDA template
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              For <span className="text-[#003366] font-medium">{dealLabel}</span>{" "}
              · placeholders are substituted server-side
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && (
            <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center text-slate-500">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#003366] mb-3" />
              <span className="text-xs">Loading templates…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ordered.map((t) => (
                <TemplateTile
                  key={t.id}
                  template={t}
                  onClick={() => onSelect(t)}
                />
              ))}
              <BlankTile
                noTemplates={ordered.length === 0}
                onClick={() => onSelect(null)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TemplateTileProps {
  template: LegalDocTemplate;
  onClick: () => void;
}

function TemplateTile({ template, onClick }: TemplateTileProps) {
  const placeholderCount = Object.keys(template.placeholderMap ?? {}).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group text-left rounded-lg border bg-white p-4 transition",
        "border-slate-200 hover:border-[#003366] hover:bg-[#E6EEF5]/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#E6EEF5", color: "#003366" }}
        >
          <span className="material-symbols-outlined text-[20px]">article</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {template.name}
            </div>
            {template.isDefault && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#003366] text-white shrink-0">
                Default
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {placeholderCount} placeholder{placeholderCount === 1 ? "" : "s"} will
            be substituted
          </div>
        </div>
      </div>
    </button>
  );
}

interface BlankTileProps {
  noTemplates: boolean;
  onClick: () => void;
}

function BlankTile({ noTemplates, onClick }: BlankTileProps) {
  // When the firm has zero templates the tooltip becomes the primary message,
  // not a footnote. We still let users start a blank doc — they can paste
  // their own boilerplate into Google Docs after the fact.
  const tooltip = noTemplates
    ? "No templates yet. Admins can register one in Settings → Templates."
    : "Start with an empty Google Doc you can paste boilerplate into.";
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={cn(
        "group text-left rounded-lg border-2 border-dashed bg-slate-50/40 p-4 transition",
        "border-slate-300 hover:border-[#003366] hover:bg-[#E6EEF5]/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-white border border-slate-200 text-slate-500 group-hover:border-[#003366] group-hover:text-[#003366]">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            Blank document
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{tooltip}</div>
        </div>
      </div>
    </button>
  );
}
