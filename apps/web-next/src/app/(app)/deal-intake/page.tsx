"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatFileSize } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DealOption {
  id: string;
  name: string;
}

interface ExtractionField {
  value: string | number | null;
  confidence: number;
  source?: string;
}

interface ExtractionResult {
  companyName?: ExtractionField;
  industry?: ExtractionField;
  revenue?: ExtractionField;
  ebitda?: ExtractionField;
  overallConfidence?: number;
  needsReview?: boolean;
  reviewReasons?: string[];
}

interface IngestResponse {
  deal?: { id: string; name: string };
  extraction?: ExtractionResult;
  isUpdate?: boolean;
  summary?: { imported: number; failed: number; total: number };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: "file", label: "Upload File", icon: "upload_file" },
  { key: "text", label: "Paste Text", icon: "content_paste" },
  { key: "url", label: "Enter URL", icon: "link" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TEXT_SOURCE_TYPES = [
  { value: "cim", label: "CIM / Teaser" },
  { value: "research", label: "Research Report" },
  { value: "financials", label: "Financial Summary" },
  { value: "notes", label: "Meeting Notes" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ */
/*  Helper: raw authed fetch (for FormData — no JSON content-type)     */
/* ------------------------------------------------------------------ */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function authFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DealIntakePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("file");

  /* ---- Deal selector ---- */
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [dealSearch, setDealSearch] = useState("");
  const [dealOptions, setDealOptions] = useState<DealOption[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<DealOption | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [showDealDropdown, setShowDealDropdown] = useState(false);

  /* ---- File upload ---- */
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Text ---- */
  const [textInput, setTextInput] = useState("");
  const [textSourceType, setTextSourceType] = useState("cim");

  /* ---- URL ---- */
  const [urlInput, setUrlInput] = useState("");
  const [urlCompanyName, setUrlCompanyName] = useState("");

  /* ---- Processing ---- */
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");

  /* ---- Result ---- */
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ================================================================ */
  /*  Deal search                                                      */
  /* ================================================================ */

  const searchDeals = useCallback(async (query: string) => {
    if (query.length < 2) {
      setDealOptions([]);
      return;
    }
    setLoadingDeals(true);
    try {
      const res = await api.get<{ deals: DealOption[] }>(`/deals?search=${encodeURIComponent(query)}&limit=10`);
      setDealOptions(res.deals || []);
    } catch {
      setDealOptions([]);
    } finally {
      setLoadingDeals(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (dealSearch) searchDeals(dealSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [dealSearch, searchDeals]);

  /* Close deal dropdown on outside click */
  useEffect(() => {
    if (!showDealDropdown) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-deal-dropdown]")) {
        setShowDealDropdown(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showDealDropdown]);

  /* ================================================================ */
  /*  File drag & drop                                                 */
  /* ================================================================ */

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  /* ================================================================ */
  /*  Submission handlers                                              */
  /* ================================================================ */

  const formatCurrencyValue = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "N/A";
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}B`;
    if (Math.abs(val) >= 1) return `$${val.toFixed(1)}M`;
    return `$${(val * 1000).toFixed(0)}K`;
  };

  const resetForm = () => {
    setSelectedFile(null);
    setTextInput("");
    setUrlInput("");
    setUrlCompanyName("");
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;
    if (mode === "existing" && !selectedDeal) {
      setError("Please select a deal first.");
      return;
    }

    setProcessing(true);
    setProgressMessage("Uploading and analyzing document...");
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (mode === "existing" && selectedDeal) {
        formData.append("dealId", selectedDeal.id);
      }

      const isExcel = /\.(xlsx|xls|csv)$/i.test(selectedFile.name);
      const useBulk = isExcel && mode !== "existing";
      const endpoint = useBulk ? "/ingest/bulk" : "/ingest";

      const response = await authFetchRaw(endpoint, { method: "POST", body: formData });
      const data: IngestResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as unknown as { error?: string }).error || "Upload failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProcessing(false);
      setProgressMessage("");
    }
  };

  const handleExtractText = async () => {
    if (textInput.trim().length < 50) {
      setError("Please enter at least 50 characters of text.");
      return;
    }
    if (mode === "existing" && !selectedDeal) {
      setError("Please select a deal first.");
      return;
    }

    setProcessing(true);
    setProgressMessage("Analyzing text content...");
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { text: textInput, sourceType: textSourceType };
      if (mode === "existing" && selectedDeal) body.dealId = selectedDeal.id;

      const data = await api.post<IngestResponse>("/ingest/text", body);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Text extraction failed");
    } finally {
      setProcessing(false);
      setProgressMessage("");
    }
  };

  const handleExtractUrl = async () => {
    if (!urlInput.trim()) {
      setError("Please enter a URL.");
      return;
    }
    if (mode === "existing" && !selectedDeal) {
      setError("Please select a deal first.");
      return;
    }

    setProcessing(true);
    setProgressMessage("Scraping and analyzing URL...");
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { url: urlInput };
      if (urlCompanyName) body.companyName = urlCompanyName;
      if (mode === "existing" && selectedDeal) body.dealId = selectedDeal.id;

      const data = await api.post<IngestResponse>("/ingest/url", body);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL scraping failed");
    } finally {
      setProcessing(false);
      setProgressMessage("");
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="p-6 mx-auto max-w-4xl flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-main tracking-tight">Deal Intake</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Upload files, paste text, or enter a URL to create or update deals with AI-powered extraction.
        </p>
      </div>

      {/* Deal mode selector */}
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

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 bg-background-body rounded-lg border border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(null); setResult(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === tab.key
                ? "bg-surface-card text-primary shadow-sm"
                : "text-text-secondary hover:text-text-main"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-surface-card rounded-xl border border-border-subtle shadow-card p-6">
        {/* ---- File upload ---- */}
        {activeTab === "file" && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all",
                dragOver
                  ? "border-primary bg-blue-50/50"
                  : "border-border-subtle hover:border-primary/30 hover:bg-background-body"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
                onChange={handleFileSelect}
              />
              <div className="bg-background-body p-3 rounded-full mb-3">
                <span className="material-symbols-outlined text-[28px] text-text-muted">cloud_upload</span>
              </div>
              <p className="text-sm font-medium text-text-main mb-1">
                {dragOver ? "Drop file here" : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-text-muted">PDF, Word, Excel, CSV, or Text files up to 25MB</p>
            </div>

            {/* File info */}
            {selectedFile && (
              <div className="mt-4 flex items-center justify-between bg-background-body rounded-lg px-4 py-3 border border-border-subtle">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px] text-primary">description</span>
                  <div>
                    <p className="text-sm font-medium text-text-main">{selectedFile.name}</p>
                    <p className="text-xs text-text-muted">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-text-muted hover:text-red-500 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            )}

            <button
              onClick={handleUploadFile}
              disabled={!selectedFile || processing}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#003366" }}
            >
              {processing ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">upload</span>
              )}
              {processing ? "Processing..." : "Upload & Analyze"}
            </button>
          </div>
        )}

        {/* ---- Text input ---- */}
        {activeTab === "text" && (
          <div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-text-main mb-1">Source Type</label>
              <select
                value={textSourceType}
                onChange={(e) => setTextSourceType(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary"
              >
                {TEXT_SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-4 py-3 text-sm text-text-main leading-relaxed placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-y"
              placeholder="Paste CIM text, deal teaser, or other deal-related content here..."
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-text-muted">
                {textInput.length} characters {textInput.length < 50 && textInput.length > 0 ? "(minimum 50)" : ""}
              </p>
            </div>

            <button
              onClick={handleExtractText}
              disabled={textInput.trim().length < 50 || processing}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#003366" }}
            >
              {processing ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              )}
              {processing ? "Analyzing..." : "Extract & Create Deal"}
            </button>
          </div>
        )}

        {/* ---- URL input ---- */}
        {activeTab === "url" && (
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-main mb-1">URL</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <span className="material-symbols-outlined text-text-muted text-[16px]">link</span>
                </div>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-background-body py-2 pl-9 pr-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="https://example.com/company-profile"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-text-main mb-1">Company Name (optional)</label>
              <input
                type="text"
                value={urlCompanyName}
                onChange={(e) => setUrlCompanyName(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="Helps improve extraction accuracy"
              />
            </div>

            <button
              onClick={handleExtractUrl}
              disabled={!urlInput.trim() || processing}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#003366" }}
            >
              {processing ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">travel_explore</span>
              )}
              {processing ? "Scraping..." : "Scrape & Create Deal"}
            </button>
          </div>
        )}
      </div>

      {/* Processing indicator */}
      {processing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-main">{progressMessage || "Processing..."}</p>
            <p className="text-xs text-text-muted mt-0.5">This may take a few moments depending on the document size.</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
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
              onClick={resetForm}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-background-body transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
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
