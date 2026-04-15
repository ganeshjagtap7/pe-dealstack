"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (showCreateFolder) newFolderInputRef.current?.focus();
  }, [showCreateFolder]);

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
      return;
    }
    fileInputRef.current?.click();
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

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    const confirmed = window.confirm(
      `Delete folder "${folder?.name}"? ${
        (folder?.fileCount || 0) > 0
          ? `This folder contains ${folder?.fileCount} file(s) which will also be deleted.`
          : ""
      }`,
    );
    if (!confirmed) return;

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
    if (!window.confirm(`Delete "${file?.name}"? This cannot be undone.`)) return;
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
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: "#003366" }}
          />
          <p className="text-slate-500">Loading Data Room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden">
      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowCreateFolder(false);
              setNewFolderName("");
            }}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-lg"
                  style={{ backgroundColor: "#E6EEF5" }}
                >
                  <span className="material-symbols-outlined text-primary">create_new_folder</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Create New Folder</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderName("");
                }}
                className="p-1 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-slate-600 mb-2">Folder Name</label>
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateFolder();
                  } else if (e.key === "Escape") {
                    setShowCreateFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="e.g., Tax Documents, Contracts"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-slate-900 placeholder:text-slate-400"
              />
              <p className="mt-2 text-xs text-slate-400">
                The folder will be created in the current deal&apos;s data room.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderName("");
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="px-5 py-2 text-sm font-medium text-white rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-900 hover:bg-slate-800"
              >
                {creatingFolder ? "Creating..." : "Create Folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder sidebar */}
      <aside className="w-[280px] min-w-[280px] flex flex-col border-r border-slate-200 bg-white">
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
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shrink-0">
          <nav className="flex items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center justify-center size-7 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors mr-1"
              title="Go back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <Link href="/deals" className="text-slate-400 hover:text-blue-600 transition-colors">
              Deals
            </Link>
            <span className="material-symbols-outlined text-[14px] text-slate-300">
              chevron_right
            </span>
            <Link
              href={`/deals/${dealId}`}
              className="text-slate-500 hover:text-blue-600 transition-colors truncate max-w-[150px]"
            >
              {dealName || "Deal"}
            </Link>
            <span className="material-symbols-outlined text-[14px] text-slate-300">
              chevron_right
            </span>
            {activeFolder ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveFolderId(null)}
                  className="text-slate-500 hover:text-blue-600 cursor-pointer transition-colors"
                >
                  Data Room
                </button>
                <span className="material-symbols-outlined text-[14px] text-slate-300">
                  chevron_right
                </span>
                <span className="font-medium text-slate-900 truncate max-w-[150px]">
                  {activeFolder.name}
                </span>
              </>
            ) : (
              <span className="font-medium text-slate-900">Data Room</span>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading || !activeFolderId}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#003366" }}
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Uploading...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  Upload Files
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
          </div>
        </header>

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
    </div>
  );
}
