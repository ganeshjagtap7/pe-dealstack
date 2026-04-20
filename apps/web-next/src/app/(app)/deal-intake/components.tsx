"use client";

import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DealOption {
  id: string;
  name: string;
}

export interface ExtractionField {
  value: string | number | null;
  confidence: number;
  source?: string;
}

export interface ExtractionResult {
  companyName?: ExtractionField;
  industry?: ExtractionField;
  revenue?: ExtractionField;
  ebitda?: ExtractionField;
  overallConfidence?: number;
  needsReview?: boolean;
  reviewReasons?: string[];
}

export interface IngestResponse {
  deal?: { id: string; name: string };
  extraction?: ExtractionResult;
  isUpdate?: boolean;
  summary?: { imported: number; failed: number; total: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const TABS = [
  { key: "file", label: "Upload File", icon: "upload_file" },
  { key: "text", label: "Paste Text", icon: "content_paste" },
  { key: "url", label: "Enter URL", icon: "link" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export const TEXT_SOURCE_TYPES = [
  { value: "cim", label: "CIM / Teaser" },
  { value: "research", label: "Research Report" },
  { value: "financials", label: "Financial Summary" },
  { value: "notes", label: "Meeting Notes" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Helper: raw authed fetch (for FormData — no JSON content-type)     */
/* ------------------------------------------------------------------ */

const API_BASE_URL = "/api";

export async function authFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  // Validate user first (same pattern as the shared api client)
  const { error } = await supabase.auth.getUser();
  if (error) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res;
}

/* ------------------------------------------------------------------ */
/*  DealSelector                                                       */
/* ------------------------------------------------------------------ */

interface DealSelectorProps {
  mode: "new" | "existing";
  setMode: (m: "new" | "existing") => void;
  selectedDeal: DealOption | null;
  setSelectedDeal: (d: DealOption | null) => void;
  dealSearch: string;
  setDealSearch: (s: string) => void;
  dealOptions: DealOption[];
  loadingDeals: boolean;
  showDealDropdown: boolean;
  setShowDealDropdown: (v: boolean) => void;
}

export function DealSelector({
  mode,
  setMode,
  selectedDeal,
  setSelectedDeal,
  dealSearch,
  setDealSearch,
  dealOptions,
  loadingDeals,
  showDealDropdown,
  setShowDealDropdown,
}: DealSelectorProps) {
  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle shadow-card p-5">
      <label className="block text-sm font-medium text-text-main mb-3">Target</label>
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => { setMode("new"); setSelectedDeal(null); }}
          className={cn(
            "flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
            mode === "new"
              ? "border-primary bg-blue-50 text-primary"
              : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30"
          )}
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Create New Deal
        </button>
        <button
          onClick={() => setMode("existing")}
          className={cn(
            "flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
            mode === "existing"
              ? "border-primary bg-blue-50 text-primary"
              : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30"
          )}
        >
          <span className="material-symbols-outlined text-[18px]">update</span>
          Update Existing Deal
        </button>
      </div>

      {/* Deal search (existing mode) */}
      {mode === "existing" && (
        <div className="relative" data-deal-dropdown>
          <label className="block text-xs font-medium text-text-muted mb-1">Select Deal</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="material-symbols-outlined text-text-muted text-[16px]">search</span>
            </div>
            <input
              type="text"
              value={selectedDeal ? selectedDeal.name : dealSearch}
              onChange={(e) => {
                setDealSearch(e.target.value);
                setSelectedDeal(null);
                setShowDealDropdown(true);
              }}
              onFocus={() => setShowDealDropdown(true)}
              className="w-full rounded-lg border border-border-subtle bg-background-body py-2 pl-9 pr-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Search deals by name..."
            />
            {selectedDeal && (
              <button
                onClick={() => { setSelectedDeal(null); setDealSearch(""); }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-main"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Dropdown */}
          {showDealDropdown && !selectedDeal && (
            <div className="absolute z-20 mt-1 w-full bg-surface-card border border-border-subtle rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {loadingDeals ? (
                <div className="flex items-center justify-center py-4">
                  <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
                </div>
              ) : dealOptions.length === 0 ? (
                <div className="px-4 py-3 text-xs text-text-muted text-center">
                  {dealSearch.length < 2 ? "Type to search deals..." : "No deals found"}
                </div>
              ) : (
                dealOptions.map((deal) => (
                  <button
                    key={deal.id}
                    onClick={() => {
                      setSelectedDeal(deal);
                      setDealSearch("");
                      setShowDealDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-text-main hover:bg-background-body transition-colors border-b border-border-subtle last:border-0"
                  >
                    {deal.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ResultDisplay                                                       */
/* ------------------------------------------------------------------ */

function ConfidenceBar({ confidence }: { confidence?: number }) {
  if (confidence === undefined || confidence === null) return null;
  const color =
    confidence >= 80 ? "bg-emerald-500" : confidence >= 60 ? "bg-yellow-400" : "bg-red-400";
  const textColor =
    confidence >= 80 ? "text-emerald-600" : confidence >= 60 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-background-body rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${confidence}%` }} />
      </div>
      <span className={cn("text-xs font-medium", textColor)}>{confidence}%</span>
    </div>
  );
}

function ResultField({
  label,
  value,
  confidence,
  source,
}: {
  label: string;
  value: string;
  confidence?: number;
  source?: string;
}) {
  const barColor =
    confidence !== undefined
      ? confidence >= 80
        ? "bg-emerald-500"
        : confidence >= 60
          ? "bg-yellow-400"
          : "bg-red-400"
      : "";
  const confColor =
    confidence !== undefined
      ? confidence >= 80
        ? "text-emerald-600"
        : confidence >= 60
          ? "text-yellow-600"
          : "text-red-500"
      : "";

  return (
    <div className="bg-background-body rounded-lg p-3">
      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-semibold text-text-main">{value}</p>
      {confidence !== undefined && (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 bg-surface-card rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", barColor)} style={{ width: `${confidence}%` }} />
          </div>
          <span className={cn("text-[10px] font-medium", confColor)}>{confidence}%</span>
        </div>
      )}
      {source && (
        <p className="text-[10px] text-text-muted mt-1 italic truncate" title={source}>
          &ldquo;{source}&rdquo;
        </p>
      )}
    </div>
  );
}

interface ResultDisplayProps {
  result: IngestResponse;
  onReset: () => void;
}

function formatCurrencyValue(val: number | null | undefined): string {
  if (val === null || val === undefined) return "N/A";
  if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}B`;
  if (Math.abs(val) >= 1) return `$${val.toFixed(1)}M`;
  return `$${(val * 1000).toFixed(0)}K`;
}

export function ResultDisplay({ result, onReset }: ResultDisplayProps) {
  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle shadow-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-emerald-50 p-2 rounded-full">
          <span className="material-symbols-outlined text-emerald-600 text-[24px]">
            {result.isUpdate ? "update" : result.summary ? "checklist" : "check_circle"}
          </span>
        </div>
        <div>
          <h3 className="text-base font-bold text-text-main">
            {result.summary
              ? "Bulk Import Complete"
              : result.isUpdate
                ? "Deal Updated"
                : "Deal Created"}
          </h3>
          {result.deal && (
            <p className="text-xs text-text-muted">{result.deal.name}</p>
          )}
        </div>
      </div>

      {/* Extraction fields */}
      {result.extraction && (
        <div className="grid grid-cols-2 gap-4 mb-5">
          <ResultField label="Company" value={result.extraction.companyName?.value as string || "N/A"} confidence={result.extraction.companyName?.confidence} source={result.extraction.companyName?.source} />
          <ResultField label="Industry" value={result.extraction.industry?.value as string || "N/A"} confidence={result.extraction.industry?.confidence} source={result.extraction.industry?.source} />
          <ResultField label="Revenue" value={result.extraction.revenue?.value != null ? formatCurrencyValue(result.extraction.revenue.value as number) : "N/A"} confidence={result.extraction.revenue?.confidence} source={result.extraction.revenue?.source} />
          <ResultField label="EBITDA" value={result.extraction.ebitda?.value != null ? formatCurrencyValue(result.extraction.ebitda.value as number) : "N/A"} confidence={result.extraction.ebitda?.confidence} source={result.extraction.ebitda?.source} />
        </div>
      )}

      {/* Bulk summary */}
      {result.summary && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-background-body rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-emerald-600">{result.summary.imported}</p>
            <p className="text-xs text-text-muted">Imported</p>
          </div>
          <div className="bg-background-body rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-red-500">{result.summary.failed}</p>
            <p className="text-xs text-text-muted">Failed</p>
          </div>
          <div className="bg-background-body rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-text-main">{result.summary.total}</p>
            <p className="text-xs text-text-muted">Total</p>
          </div>
        </div>
      )}

      {/* Overall confidence */}
      {result.extraction?.overallConfidence !== undefined && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-text-secondary">Overall Confidence</span>
            <span className="text-xs font-bold text-text-main">{result.extraction.overallConfidence}%</span>
          </div>
          <ConfidenceBar confidence={result.extraction.overallConfidence} />
        </div>
      )}

      {/* Review needed */}
      {result.extraction?.needsReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-amber-600 text-[16px]">warning</span>
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Needs Review</span>
          </div>
          {result.extraction.reviewReasons && result.extraction.reviewReasons.length > 0 && (
            <ul className="text-xs text-amber-700 list-disc pl-5 mt-1 space-y-0.5">
              {result.extraction.reviewReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-border-subtle">
        {result.deal && (
          <a
            href={`/deals/${result.deal.id}`}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            View Deal
          </a>
        )}
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-background-body transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add Another
        </button>
      </div>
    </div>
  );
}
