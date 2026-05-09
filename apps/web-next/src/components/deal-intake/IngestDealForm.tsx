"use client";

// ---------------------------------------------------------------------------
// IngestDealForm — extracted from app/(app)/deal-intake/page.tsx so the same
// upload + extraction + follow-up flow can be rendered both:
//   - as a full-page route (/deal-intake), and
//   - as the body of the IngestDealModal popup opened from the header,
//     command palette, dashboard quick actions, and deals page.
//
// All form state, API wiring, and validation matches the legacy full-page
// version 1:1 — only the surrounding chrome (page heading vs. modal header)
// is conditional via the `variant` prop. The `onClose` callback fires after a
// successful "View Deal" navigation so the modal can dismiss itself.
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatFileSize } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  type DealOption,
  type IngestResponse,
  type TabKey,
  type FollowUpQuestion,
  MAX_FILE_SIZE,
  TABS,
  authFetchRaw,
  DealSelector,
  ResultDisplay,
} from "@/app/(app)/deal-intake/components";
import { FollowUpQuestions, WarningBanner } from "@/app/(app)/deal-intake/intake-widgets";
import { FileUploadPanel, TextInputPanel } from "@/app/(app)/deal-intake/tab-panels";

interface IngestDealFormProps {
  /** "page" renders the standalone /deal-intake page chrome (heading + outer scroll
   *  wrapper). "modal" omits those — the IngestDealModal supplies its own header
   *  and scroll container. */
  variant?: "page" | "modal";
  /** Called when the user finishes (e.g. after navigating to the new deal). The
   *  modal uses this to close itself; the page route ignores it. */
  onClose?: () => void;
}

export function IngestDealForm({ variant = "page", onClose }: IngestDealFormProps) {
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
  const [textSourceType, setTextSourceType] = useState("other");

  /* ---- Processing ---- */
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");

  /* ---- Result ---- */
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ title: string; message: string } | null>(null);

  /* ---- Follow-up questions ---- */
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [followUpLoading, setFollowUpLoading] = useState(false);

  /* ================================================================ */
  /*  Deal search                                                      */
  /* ================================================================ */

  const searchDeals = useCallback(async (query: string) => {
    if (query.length < 2) { setDealOptions([]); return; }
    setLoadingDeals(true);
    try {
      const res = await api.get<DealOption[] | { deals: DealOption[] }>(`/deals?search=${encodeURIComponent(query)}&limit=10`);
      setDealOptions(Array.isArray(res) ? res.slice(0, 10) : (res?.deals ?? []));
    } catch (err) {
      console.warn("[deal-intake] searchDeals failed:", err);
      setDealOptions([]);
    }
    finally { setLoadingDeals(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (dealSearch) searchDeals(dealSearch); }, 300);
    return () => clearTimeout(timer);
  }, [dealSearch, searchDeals]);

  useEffect(() => {
    if (!showDealDropdown) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-deal-dropdown]")) setShowDealDropdown(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showDealDropdown]);

  /* ================================================================ */
  /*  File handling                                                     */
  /* ================================================================ */

  const validateAndSetFile = (file: File) => {
    setWarning(null);
    if (file.size > MAX_FILE_SIZE) {
      setWarning({
        title: "File too large",
        message: `This file is ${formatFileSize(file.size)}, but the maximum upload size is 50MB. Please compress the file or use a smaller version.`,
      });
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null); setWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ================================================================ */
  /*  Follow-up questions                                              */
  /* ================================================================ */

  const fetchFollowUpQuestions = useCallback(async (dealId: string, extraction: IngestResponse["extraction"]) => {
    if (!extraction) return;
    setFollowUpLoading(true);
    try {
      const res = await api.post<{ questions: FollowUpQuestion[] }>(`/deals/${dealId}/follow-up-questions`, {
        extraction: {
          companyName: extraction.companyName?.value || null,
          industry: extraction.industry?.value || null,
          revenue: extraction.revenue?.value || null,
          ebitda: extraction.ebitda?.value || null,
          currency: extraction.currency || "USD",
          summary: extraction.summary || null,
          keyRisks: extraction.keyRisks || [],
          investmentHighlights: extraction.investmentHighlights || [],
          overallConfidence: extraction.overallConfidence || 0,
        },
      });
      setFollowUpQuestions(res.questions || []);
    } catch (err) {
      console.warn("[deal-intake] fetchFollowUpQuestions failed:", err);
    }
    finally { setFollowUpLoading(false); }
  }, []);

  const handleFollowUpAnswer = (questionId: string, answer: string) => {
    setFollowUpAnswers((prev) => {
      const next = { ...prev };
      if (answer.trim()) next[questionId] = answer; else delete next[questionId];
      return next;
    });
  };

  /* ================================================================ */
  /*  Submission handlers                                              */
  /* ================================================================ */

  const actionLabel = mode === "existing" ? "Update Deal" : "Create Deal";

  const clearState = () => {
    setError(null); setResult(null); setFollowUpQuestions([]); setFollowUpAnswers({});
  };

  const resetForm = () => {
    setSelectedFile(null); setTextInput("");
    setWarning(null); clearState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const beginProcessing = (msg: string) => {
    setProcessing(true); setProgressMessage(msg); clearState();
  };

  const endProcessing = () => {
    setProcessing(false); setProgressMessage("");
  };

  const fireFollowUp = (data: IngestResponse) => {
    if (data.deal?.id && data.extraction) {
      setTimeout(() => fetchFollowUpQuestions(data.deal!.id, data.extraction), 800);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;
    if (mode === "existing" && !selectedDeal) { setError("Please select a deal first."); return; }
    beginProcessing("Extracting deal data...");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (mode === "existing" && selectedDeal) formData.append("dealId", selectedDeal.id);
      const isExcel = /\.(xlsx|xls|csv)$/i.test(selectedFile.name);
      const useBulk = isExcel && mode !== "existing";
      const response = await authFetchRaw(useBulk ? "/ingest/bulk" : "/ingest", { method: "POST", body: formData });
      if (response.status === 413) {
        setWarning({ title: "File too large", message: "Maximum upload size is 50MB. Please compress the file or try a smaller version." });
        return;
      }
      const data: IngestResponse = await response.json();
      if (!response.ok) throw new Error((data as unknown as { message?: string; error?: string }).message || (data as unknown as { error?: string }).error || "Upload failed");
      setResult(data);
      fireFollowUp(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { endProcessing(); }
  };

  const handleUploadDirect = async () => {
    if (!selectedFile || !selectedDeal) return;
    beginProcessing("Uploading to Data Room...");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await authFetchRaw(`/deals/${selectedDeal.id}/documents`, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");
      setResult({ deal: { id: selectedDeal.id, name: selectedDeal.name }, isUpdate: true });
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { endProcessing(); }
  };

  const handleExtractText = async () => {
    if (textInput.trim().length < 50) { setError("Please enter at least 50 characters of text."); return; }
    if (mode === "existing" && !selectedDeal) { setError("Please select a deal first."); return; }
    beginProcessing("Extracting deal data...");
    try {
      const body: Record<string, string> = { text: textInput, sourceType: textSourceType };
      if (mode === "existing" && selectedDeal) body.dealId = selectedDeal.id;
      const data = await api.post<IngestResponse>("/ingest/text", body);
      setResult(data);
      fireFollowUp(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Text extraction failed"); }
    finally { endProcessing(); }
  };

  const handleSaveFollowUpAndGoToDeal = async () => {
    if (!result?.deal?.id || Object.keys(followUpAnswers).length === 0) return;
    try {
      await api.patch(`/deals/${result.deal.id}`, {
        customFields: { aiFollowUp: { generatedAt: new Date().toISOString(), questions: followUpQuestions, answers: followUpAnswers } },
      });
    } catch (err) {
      console.warn("[deal-intake] save follow-up answers failed:", err);
    }
    // Close modal (if any) before navigating so the overlay doesn't flash
    // briefly over the destination page.
    onClose?.();
    window.location.href = `/deals/${result.deal.id}`;
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  // Inner content shared between page/modal variants. The modal supplies its
  // own outer wrapper (overflow + padding) so we only render the column here.
  const inner = (
    <div className={cn("mx-auto max-w-3xl flex flex-col gap-6", variant === "modal" && "max-w-none")}>
      {variant === "page" && (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-main tracking-tight font-display">Deal Intake</h1>
          <p className="text-text-secondary text-sm">Upload a document or paste text to create a new deal.</p>
        </div>
      )}

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
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); clearState(); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all",
              activeTab === tab.key ? "bg-white text-primary shadow-sm" : "text-text-secondary hover:text-text-main",
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!processing && !result && (
        <>
          {activeTab === "file" && (
            <FileUploadPanel
              selectedFile={selectedFile}
              dragOver={dragOver}
              setDragOver={setDragOver}
              fileInputRef={fileInputRef}
              onDrop={handleDrop}
              onFileSelect={handleFileSelect}
              onClear={clearFile}
              onUpload={handleUploadFile}
              onUploadDirect={handleUploadDirect}
              processing={processing}
              actionLabel={actionLabel}
              showDirectUpload={mode === "existing"}
              directUploadDisabled={!selectedFile || !selectedDeal || processing}
            />
          )}
          {activeTab === "text" && (
            <TextInputPanel
              textInput={textInput}
              setTextInput={setTextInput}
              textSourceType={textSourceType}
              setTextSourceType={setTextSourceType}
              onExtract={handleExtractText}
              processing={processing}
              actionLabel={actionLabel}
            />
          )}
        </>
      )}

      {/* Loading state */}
      {processing && (
        <div className="rounded-lg border border-primary/20 bg-primary-light/30 p-8 shadow-card text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <span className="material-symbols-outlined text-primary text-2xl animate-spin">progress_activity</span>
          </div>
          <p className="text-sm font-medium text-text-main">{progressMessage || "Extracting deal data..."}</p>
          <p className="text-xs text-text-secondary mt-1">AI is analyzing the content and extracting company information</p>
        </div>
      )}

      {/* Warning */}
      {warning && <WarningBanner title={warning.title} message={warning.message} onDismiss={() => setWarning(null)} />}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-500 mt-0.5">error</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {activeTab === "text" ? "Text extraction failed" : "Upload failed"}
              </p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div>
          <ResultDisplay result={result} onReset={resetForm} />
          {result.deal && (followUpLoading || followUpQuestions.length > 0) && (
            <div className="bg-surface-card rounded-lg border border-border-subtle shadow-card p-5 mt-4">
              <FollowUpQuestions
                questions={followUpQuestions}
                answers={followUpAnswers}
                onAnswer={handleFollowUpAnswer}
                loading={followUpLoading}
              />
              {Object.keys(followUpAnswers).length > 0 && (
                <div className="mt-5">
                  <button
                    onClick={handleSaveFollowUpAndGoToDeal}
                    className="w-full py-2.5 px-4 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#003366" }}
                  >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Save & View Deal
                  </button>
                  <p className="text-center mt-2">
                    <button
                      onClick={() => {
                        if (result.deal) {
                          onClose?.();
                          window.location.href = `/deals/${result.deal.id}`;
                        }
                      }}
                      className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                    >
                      Skip -- I&apos;ll add context later
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (variant === "modal") {
    // The modal shell handles its own padding/scroll; just return the column.
    return inner;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {inner}
    </div>
  );
}
