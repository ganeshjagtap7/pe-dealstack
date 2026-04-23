"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
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
  fetchDeal,
  fetchDocuments,
  fetchFolderInsights,
  fetchFolders,
  generateInsights,
  getDocumentDownloadUrl,
  initializeDealFolders,
  renameDocument,
  renameFolder,
  requestDocument,
  transformDocument,
  transformFolder,
  transformInsights,
  uploadDocument,
} from "@/lib/vdr/api";
import { CreateFolderModal, DataRoomHeader, DataRoomLoading } from "./components";

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
  useEffect(() => {
    if (!activeFolderId || insights[activeFolderId]) return;
    (async () => {
      const apiInsight = await fetchFolderInsights(activeFolderId);
      setInsights((prev) => ({
        ...prev,
        [activeFolderId]: transformInsights(apiInsight, activeFolderId),
      }));
    })();
  }, [activeFolderId, insights]);

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

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file
    if (!files.length || !activeFolderId) return;

    setUploading(true);
    setUploadError(null);
    const failures: string[] = [];
    const uploaded: APIDocument[] = [];
    for (const file of files) {
      try {
        const doc = await uploadDocument(dealId, activeFolderId, file);
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
    }
    if (failures.length > 0) {
      setUploadError(failures.join("; "));
      setTimeout(() => setUploadError(null), 6000);
    }
    setUploading(false);
  };

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

  const handleFileClick = async (file: VDRFile) => {
    const url = await getDocumentDownloadUrl(file.id);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  // Re-analyze a document — extract text + RAG embed, then refresh the row.
  const handleReanalyze = useCallback(async (file: VDRFile) => {
    try {
      await analyzeDocument(file.id);
      const docs = await fetchDocuments(dealId);
      setAllFiles(docs.map(transformDocument));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Analysis failed");
    }
  }, [dealId]);

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
        <div className="p-5 border-b border-slate-200/50">
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
          <h2 className="text-lg font-bold text-slate-900">Data Room</h2>
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
        onGenerateReport={handleGenerateInsights}
        onRequestDocument={handleRequestDocument}
        onGenerateInsights={handleGenerateInsights}
        isGenerating={generating}
        isCollapsed={insightsCollapsed}
        onToggleCollapse={() => setInsightsCollapsed((v) => !v)}
      />

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
    </div>
  );
}
