"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatFileSize } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  type DealOption,
  type IngestResponse,
  type TabKey,
  TABS,
  TEXT_SOURCE_TYPES,
  authFetchRaw,
  DealSelector,
  ResultDisplay,
} from "./components";

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

  const resetForm = () => {
    setSelectedFile(null);
    setTextInput("");
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

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="p-4 md:p-6 mx-auto max-w-4xl w-full flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-main tracking-tight">Deal Intake</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Upload files or paste text to create or update deals with AI-powered extraction.
        </p>
      </div>

      {/* Deal mode selector */}
      <DealSelector
        mode={mode}
        setMode={setMode}
        selectedDeal={selectedDeal}
        setSelectedDeal={setSelectedDeal}
        dealSearch={dealSearch}
        setDealSearch={setDealSearch}
        dealOptions={dealOptions}
        loadingDeals={loadingDeals}
        showDealDropdown={showDealDropdown}
        setShowDealDropdown={setShowDealDropdown}
      />

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
      {result && <ResultDisplay result={result} onReset={resetForm} />}
    </div>
  );
}
