"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import type { Folder } from "@/lib/vdr/types";

/* ────────────────────────────────────────────────────────────────────── */
/*  Loading spinner shown while the data room is initialising            */
/* ────────────────────────────────────────────────────────────────────── */

export function DataRoomLoading() {
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

/* ────────────────────────────────────────────────────────────────────── */
/*  Modal for creating a new folder                                      */
/* ────────────────────────────────────────────────────────────────────── */

interface CreateFolderModalProps {
  newFolderName: string;
  onNameChange: (name: string) => void;
  creatingFolder: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function CreateFolderModal({
  newFolderName,
  onNameChange,
  creatingFolder,
  onSubmit,
  onClose,
}: CreateFolderModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
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
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400">close</span>
          </button>
        </div>
        <div className="p-5">
          <label className="block text-sm font-medium text-slate-600 mb-2">Folder Name</label>
          <input
            ref={inputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              } else if (e.key === "Escape") {
                onClose();
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
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!newFolderName.trim() || creatingFolder}
            className="px-5 py-2 text-sm font-medium text-white rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: "#003366" }}
          >
            {creatingFolder ? "Creating..." : "Create Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Breadcrumb header with upload button                                 */
/* ────────────────────────────────────────────────────────────────────── */

interface DataRoomHeaderProps {
  dealId: string;
  dealName: string;
  activeFolder: Folder | undefined;
  activeFolderId: string | null;
  uploading: boolean;
  onBack: () => void;
  onClearFolder: () => void;
  onUploadClick: () => void;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function DataRoomHeader({
  dealId,
  dealName,
  activeFolder,
  activeFolderId,
  uploading,
  onBack,
  onClearFolder,
  onUploadClick,
  onFilesSelected,
}: DataRoomHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (!activeFolderId) return;
    onUploadClick();
    fileInputRef.current?.click();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 shrink-0">
      <nav className="flex items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={onBack}
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
              onClick={onClearFolder}
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
          onClick={handleUpload}
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
          onChange={onFilesSelected}
          className="hidden"
        />
      </div>
    </header>
  );
}
