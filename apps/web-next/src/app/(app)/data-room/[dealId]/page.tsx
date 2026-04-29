"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FolderTree } from "@/components/vdr/FolderTree";
import { FiltersBar } from "@/components/vdr/FiltersBar";
import { FileTable } from "@/components/vdr/FileTable";
import { InsightsPanel } from "@/components/vdr/InsightsPanel";
import { DEFAULT_SMART_FILTERS } from "@/lib/vdr/filters";
import type {
  APIDocument,
  APIFolder,
  Folder,
  FolderInsights,
  SmartFilter,
  VDRFile,
} from "@/lib/vdr/types";
import {
  analyzeDocument,
  createFolder,
  deleteDocument,
  deleteFolder,
  extractFinancials,
  fetchAllDeals,
  fetchDeal,
  fetchDocuments,
  fetchFolderInsights,
  fetchFolders,
  generateInsights,
  getDocumentDownloadUrl,
  initializeDealFolders,
  linkDocumentToDeal,
  renameDocument,
  renameFolder,
  requestDocument,
  transformDocument,
  transformFolder,
  transformInsights,
  uploadDocument,
} from "@/lib/vdr/api";
import {
  CreateFolderModal,
  DataRoomHeader,
  DataRoomLoading,
  LinkToDealModal,
  UploadConfirmModal,
  VDRToast,
} from "./components";

interface PageProps {
  params: Promise<{ dealId: string }>;
}

export default function DataRoomDealPage({ params }: PageProps) {
  const { dealId } = use(params);
  const router = useRouter();

  const [dealName, setDealName] = useState<string>("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState<VDRFile[]>([]);
  const [insights, setInsights] = useState<Record<string, FolderInsights>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SmartFilter[]>(DEFAULT_SMART_FILTERS);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; role: string; user?: { name?: string; avatar?: string } }>>([]);
  // Upload confirmation modal state (two-stage upload like legacy)
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(null);
  const [autoUpdateDeal, setAutoUpdateDeal] = useState(false);
  // Link-to-deal modal state
  const [linkModalFile, setLinkModalFile] = useState<VDRFile | null>(null);
  const [linkDeals, setLinkDeals] = useState<Array<{ id: string; name: string; industry?: string }>>([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState("");
  const [linking, setLinking] = useState(false);
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  // ─── Initial load: deal name + folders (init if empty) + documents ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [dealData, apiFolders] = await Promise.all([
          fetchDeal(dealId),
          fetchFolders(dealId),
        ]);
        if (cancelled) return;

        if (dealData?.name) setDealName(dealData.name);
        if ((dealData as Record<string, unknown>)?.teamMembers) {
          setTeamMembers((dealData as Record<string, unknown>).teamMembers as typeof teamMembers);
        }

        let folderList: APIFolder[] = apiFolders;
        if (folderList.length === 0) {
          const init = await initializeDealFolders(dealId);
          if (cancelled) return;
          folderList = init.folders;
        }
        const transformed = folderList.map(transformFolder);
        setFolders(transformed);
        if (transformed.length > 0 && !activeFolderId) {
          setActiveFolderId(transformed[0].id);
        }

        // Load all documents across the deal so smart-filter search works globally
        const docs = await fetchDocuments(dealId);
        if (cancelled) return;
        setAllFiles(docs.map(transformDocument));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  // ─── Load insights for active folder ──────────────────────────────
  // Track which folders we've already attempted to fetch insights for so that
  // a 404 (no insights yet) doesn't cause an infinite retry loop. We use a ref
  // instead of putting `insights` in the dependency array — the old code had
  // `insights` as a dep which caused the effect to re-fire every time the
  // state object changed, potentially hammering a 404 endpoint.
  const insightsFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeFolderId) return;
    if (insightsFetchedRef.current.has(activeFolderId)) return;
    insightsFetchedRef.current.add(activeFolderId);
    (async () => {
      const apiInsight = await fetchFolderInsights(activeFolderId);
      setInsights((prev) => ({
        ...prev,
        [activeFolderId]: transformInsights(apiInsight, activeFolderId),
      }));
    })();
  }, [activeFolderId]);

  // ─── Derived data ────────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    const base = isSearching
      ? allFiles
      : allFiles.filter((f) => f.folderId === activeFolderId);

    const activeFilters = filters.filter((f) => f.active);
    const afterFilters = activeFilters.length
      ? base.filter((file) => activeFilters.every((f) => f.filterFn(file)))
      : base;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return afterFilters;

    return afterFilters.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.analysis.description.toLowerCase().includes(q) ||
        (f.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [allFiles, activeFolderId, isSearching, filters, searchQuery]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const activeFolderInsights = activeFolderId ? insights[activeFolderId] : null;

  // ─── Handlers ────────────────────────────────────────────────────
  const handleFilterToggle = (id: string) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f)));
  };

  const handleAddCustomFilter = (f: SmartFilter) => setFilters((prev) => [...prev, f]);
  const handleRemoveCustomFilter = (id: string) =>
    setFilters((prev) => prev.filter((f) => f.id !== id));

  const handleUploadClick = () => {
    setUploadError(null);
    if (!activeFolderId) {
      setUploadError("Select a folder first.");
    }
  };

  // Stage 1: Files selected -> show confirmation modal
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file
    if (!files.length || !activeFolderId) return;

    const maxFileSize = 50 * 1024 * 1024;
    const allowedTypes = [
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > maxFileSize) {
        showToast(`File "${file.name}" exceeds maximum size of 50MB`, "error");
        continue;
      }
      if (!allowedTypes.includes(file.type)) {
        showToast(`File "${file.name}" has an unsupported file type`, "error");
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      // Smart default: auto-check toggle for CIM/financials/teaser documents
      const hasHighValueDoc = validFiles.some((f) => {
        const name = f.name.toLowerCase();
        return name.includes("cim") || name.includes("teaser") || name.includes("financial") || name.includes("model");
      });
      setAutoUpdateDeal(hasHighValueDoc);
      setPendingUploadFiles(validFiles);
    }
  };

  // Stage 2: User confirms upload
  const handleConfirmUpload = useCallback(async () => {
    if (!pendingUploadFiles || !activeFolderId) return;

    setUploading(true);
    setPendingUploadFiles(null);
    setUploadError(null);
    const failures: string[] = [];
    const uploaded: APIDocument[] = [];

    for (const file of pendingUploadFiles) {
      try {
        const doc = await uploadDocument(dealId, activeFolderId, file, { autoUpdateDeal });
        if (doc) uploaded.push(doc);
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }

    if (uploaded.length > 0) {
      const newFiles = uploaded.map(transformDocument);
      setAllFiles((prev) => [...newFiles, ...prev]);
      setFolders((prev) =>
        prev.map((f) =>
          f.id === activeFolderId ? { ...f, fileCount: f.fileCount + uploaded.length } : f,
        ),
      );
      showToast(`${uploaded.length} file(s) uploaded successfully`, "success");
    }
    if (failures.length > 0) {
      setUploadError(failures.join("; "));
      setTimeout(() => setUploadError(null), 6000);
    }
    setUploading(false);
  }, [pendingUploadFiles, dealId, activeFolderId, autoUpdateDeal, showToast]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingFolder) return;
    setCreatingFolder(true);
    try {
      const created = await createFolder(dealId, name);
      if (created) {
        const folder = transformFolder(created);
        setFolders((prev) => [...prev, folder]);
        setActiveFolderId(folder.id);
        setShowCreateFolder(false);
        setNewFolderName("");
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const [pendingDelete, setPendingDelete] = useState<{ type: "folder" | "file"; id: string; name: string; extra?: string } | null>(null);

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    setPendingDelete({
      type: "folder",
      id: folderId,
      name: folder?.name || "folder",
      extra: (folder?.fileCount || 0) > 0
        ? `This folder contains ${folder?.fileCount} file(s) which will also be deleted.`
        : undefined,
    });
  };

  const confirmDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);

    const cascade = (folder?.fileCount || 0) > 0;
    const ok = await deleteFolder(folderId, cascade);
    if (!ok) return;
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setAllFiles((prev) => prev.filter((f) => f.folderId !== folderId));
    if (activeFolderId === folderId) {
      const remaining = folders.filter((f) => f.id !== folderId);
      setActiveFolderId(remaining[0]?.id || null);
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    const ok = await renameFolder(folderId, newName);
    if (!ok) return;
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f)));
  };

  const handleDeleteFile = async (fileId: string) => {
    const file = allFiles.find((f) => f.id === fileId);
    setPendingDelete({ type: "file", id: fileId, name: file?.name || "file" });
  };

  const confirmDeleteFile = async (fileId: string) => {
    const file = allFiles.find((f) => f.id === fileId);
    const ok = await deleteDocument(fileId);
    if (!ok) return;
    setAllFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (file?.folderId) {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === file.folderId ? { ...f, fileCount: Math.max(0, f.fileCount - 1) } : f,
        ),
      );
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    const ok = await renameDocument(fileId, newName);
    if (!ok) return;
    setAllFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f)));
  };

  // -------------------------------------------------------------------------
  // In-app document preview — intentional MVP decision (audit A3)
  //
  // The legacy apps/web/js/docPreview.js rendered PDF, Excel, Word, and CSV
  // files entirely in-browser using PDF.js (PDF), SheetJS (XLSX), and
  // Mammoth.js (DOCX). That 543-line subsystem was intentionally NOT ported
  // during the migration to web-next.
  //
  // The current approach — window.open(signedUrl, "_blank") — covers the 80%
  // case: modern browsers render PDFs inline in a new tab, XLSX/DOCX files
  // get downloaded by the browser (there is no in-app renderer), and CSV
  // opens as plaintext. This is sufficient for MVP.
  //
  // NOTE: The API currently returns a raw Supabase signed URL without setting
  // Content-Disposition: inline. Browsers still render PDFs inline by default
  // when opened in a new tab, but explicit inline disposition would make the
  // behaviour more reliable across browsers. That is a separate concern in
  // the API layer — do not change it here.
  //
  // If product wants in-app Excel/Word rendering back: port
  // apps/web/js/docPreview.js and add `xlsx` + `mammoth` to
  // apps/web-next/package.json. Reference: docs/MIGRATION-AUDIT-REPORT.md A3.
  // -------------------------------------------------------------------------
  const handleFileClick = useCallback(async (file: VDRFile) => {
    try {
      const url = await getDocumentDownloadUrl(file.id);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        showToast(`Unable to load document: ${file.name}`, "error");
      }
    } catch (err) {
      console.warn("[vdr] handleFileClick failed:", err);
      showToast(`Error loading file: ${file.name}`, "error");
    }
  }, [showToast]);

  // Re-analyze a document — extract text + RAG embed, then refresh the row.
  const handleReanalyze = useCallback(async (file: VDRFile) => {
    showToast(`Analyzing "${file.name}"...`, "info");
    try {
      await analyzeDocument(file.id);
      const docs = await fetchDocuments(dealId);
      setAllFiles(docs.map(transformDocument));
      showToast(`"${file.name}" analyzed successfully`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Analysis failed", "error");
    }
  }, [dealId, showToast]);

  // Extract financials from a VDR document
  const handleExtractFinancials = useCallback(async (file: VDRFile) => {
    showToast(`Extracting financials from "${file.name}"... This may take 30-90 seconds.`, "info");
    try {
      const result = await extractFinancials(dealId, file.id);
      const count = result?.result?.periodsStored ?? result?.stored ?? 0;
      showToast(`Financials extracted -- ${count} period${count !== 1 ? "s" : ""} stored`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Financial extraction failed", "error");
    }
  }, [dealId, showToast]);

  // Link document to another deal
  const handleLinkToDeal = useCallback(async (file: VDRFile) => {
    setLinkModalFile(file);
    setLinkSearchQuery("");
    const deals = await fetchAllDeals();
    setLinkDeals(deals.filter((d) => d.id !== dealId));
  }, [dealId]);

  const confirmLinkToDeal = useCallback(async (targetDealId: string) => {
    if (!linkModalFile) return;
    setLinking(true);
    try {
      await linkDocumentToDeal(linkModalFile.id, targetDealId);
      const targetDeal = linkDeals.find((d) => d.id === targetDealId);
      showToast(`"${linkModalFile.name}" linked to ${targetDeal?.name || "deal"}`, "success");
      setLinkModalFile(null);
    } catch (err) {
      showToast(`Failed to link document: ${err instanceof Error ? err.message : "Unknown error"}`, "error");
    }
    setLinking(false);
  }, [linkModalFile, linkDeals, showToast]);

  const handleGenerateInsights = useCallback(async () => {
    if (!activeFolderId || generating) return;
    setGenerating(true);
    try {
      const apiInsight = await generateInsights(activeFolderId);
      if (apiInsight) {
        const transformed = transformInsights(apiInsight, activeFolderId);
        setInsights((prev) => ({ ...prev, [activeFolderId]: transformed }));
        // Reflect new readiness/red flags back on the folder card
        setFolders((prev) =>
          prev.map((f) => {
            if (f.id !== activeFolderId) return f;
            const pct = transformed.completionPercent;
            const hasFlags = transformed.redFlags.length > 0;
            if (pct >= 80 && !hasFlags) {
              return { ...f, status: "ready", statusColor: "green", statusLabel: `${pct}% Ready`, readinessPercent: pct };
            }
            if (hasFlags) {
              return { ...f, status: "attention", statusColor: "orange", statusLabel: "Attention", readinessPercent: pct };
            }
            return { ...f, readinessPercent: pct };
          }),
        );
      }
    } catch (err) {
      console.warn("[vdr] generateInsights failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [activeFolderId, generating]);

  // Generate Full Report — downloads a markdown file (matching legacy behavior)
  const handleGenerateReport = useCallback(() => {
    if (!activeFolder) return;
    const folderInsights = activeFolderInsights;

    const report = `# VDR Analysis Report - ${activeFolder.name}
Generated: ${new Date().toLocaleString()}

## Summary
${folderInsights?.summary || "No summary available."}

**Completion Status:** ${folderInsights?.completionPercent || 0}%
**Total Files:** ${activeFolder.fileCount}

## Red Flags (${folderInsights?.redFlags?.length || 0})
${(folderInsights?.redFlags || [])
  .map(
    (flag) => `
### ${flag.title} [${flag.severity.toUpperCase()}]
${flag.description}
`,
  )
  .join("\n")}

## Missing Documents (${folderInsights?.missingDocuments?.length || 0})
${(folderInsights?.missingDocuments || []).map((doc) => `- ${doc.name}`).join("\n")}

## Files in Folder
${filteredFiles
  .map(
    (file) => `
- **${file.name}** (${file.size})
  - Analysis: ${file.analysis.label}
  - ${file.analysis.description}
  - Author: ${file.author.name}
  - Date: ${file.date}
`,
  )
  .join("\n")}

---
Generated by PE OS VDR System
`;

    const blob = new Blob([report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VDR_Report_${activeFolder.name.replace(/\s+/g, "_")}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeFolder, activeFolderInsights, filteredFiles]);

  // Handle "View File" from insights panel red flags
  const handleViewFile = useCallback((fileId: string) => {
    const file = allFiles.find((f) => f.id === fileId);
    if (file) handleFileClick(file);
  }, [allFiles, handleFileClick]);

  const handleRequestDocument = async (docId: string) => {
    const doc = activeFolderInsights?.missingDocuments.find((d) => d.id === docId);
    if (!doc) return;
    try {
      await requestDocument(dealId, doc.name, {
        folderId: activeFolderId || undefined,
        folderName: activeFolder?.name,
      });
    } catch (err) {
      console.warn("[vdr] requestDocument failed:", err);
    }
  };

  if (loading) {
    return <DataRoomLoading />;
  }

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      {showCreateFolder && (
        <CreateFolderModal
          newFolderName={newFolderName}
          onNameChange={setNewFolderName}
          creatingFolder={creatingFolder}
          onSubmit={handleCreateFolder}
          onClose={() => {
            setShowCreateFolder(false);
            setNewFolderName("");
          }}
        />
      )}

      {/* Folder sidebar */}
      <aside className="hidden md:flex w-[280px] min-w-[280px] flex-col border-r border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200/50">
          <Link
            href="/data-room"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary mb-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            All Data Rooms
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#003366" }}>
              {dealName || "Data Room"}
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900">Data Room</h2>
        </div>

        <FolderTree
          folders={folders}
          activeFolder={activeFolderId || ""}
          onFolderSelect={setActiveFolderId}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />

        <div className="p-4 border-t border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setShowCreateFolder(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Folder
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <DataRoomHeader
          dealId={dealId}
          dealName={dealName}
          activeFolder={activeFolder}
          activeFolderId={activeFolderId}
          uploading={uploading}
          teamMembers={teamMembers}
          onBack={() => router.back()}
          onClearFolder={() => setActiveFolderId(null)}
          onUploadClick={handleUploadClick}
          onFilesSelected={handleFilesSelected}
        />

        <FiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFilterToggle={handleFilterToggle}
          onAddCustomFilter={handleAddCustomFilter}
          onRemoveCustomFilter={handleRemoveCustomFilter}
        />

        {isSearching && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]" style={{ color: "#003366" }}>
              search
            </span>
            <span className="text-sm text-slate-700">
              Searching across all folders — <strong>{filteredFiles.length}</strong> result
              {filteredFiles.length !== 1 ? "s" : ""} for &quot;<em>{searchQuery}</em>&quot;
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              Clear
            </button>
          </div>
        )}

        {uploadError && (
          <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {uploadError}
          </div>
        )}

        {activeFolderId || isSearching ? (
          <FileTable
            files={filteredFiles}
            folderName={isSearching ? "Search Results" : activeFolder?.name || "Folder"}
            onFileClick={handleFileClick}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onLinkToDeal={handleLinkToDeal}
            onExtractFinancials={handleExtractFinancials}
            onReanalyze={handleReanalyze}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
                folder_open
              </span>
              <p className="text-slate-500">Select a folder to view files</p>
            </div>
          </div>
        )}
      </main>

      <InsightsPanel
        insights={activeFolderInsights}
        folderName={activeFolder?.name || ""}
        onGenerateReport={handleGenerateReport}
        onViewFile={handleViewFile}
        onRequestDocument={handleRequestDocument}
        onGenerateInsights={handleGenerateInsights}
        isGenerating={generating}
        isCollapsed={insightsCollapsed}
        onToggleCollapse={() => setInsightsCollapsed((v) => !v)}
      />

      {pendingUploadFiles && (
        <UploadConfirmModal
          files={pendingUploadFiles}
          autoUpdateDeal={autoUpdateDeal}
          uploading={uploading}
          onAutoUpdateChange={setAutoUpdateDeal}
          onConfirm={handleConfirmUpload}
          onCancel={() => setPendingUploadFiles(null)}
        />
      )}

      {linkModalFile && (
        <LinkToDealModal
          file={linkModalFile}
          deals={linkDeals}
          searchQuery={linkSearchQuery}
          onSearchChange={setLinkSearchQuery}
          linking={linking}
          onSelect={confirmLinkToDeal}
          onClose={() => setLinkModalFile(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.type === "folder" ? "Delete Folder" : "Delete File"}
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This cannot be undone.${pendingDelete.extra ? ` ${pendingDelete.extra}` : ""}`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.type === "folder") confirmDeleteFolder(pendingDelete.id);
          else confirmDeleteFile(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      {toast && (
        <VDRToast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
