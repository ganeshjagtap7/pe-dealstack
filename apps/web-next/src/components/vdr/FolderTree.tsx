"use client";

import { useEffect, useRef, useState } from "react";
import type { Folder } from "@/lib/vdr/types";

interface Props {
  folders: Folder[];
  activeFolder: string;
  onFolderSelect: (folderId: string) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  green: { bg: "bg-green-100", text: "text-green-700" },
  orange: { bg: "bg-orange-100", text: "text-orange-700" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-700" },
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
};

export function FolderTree({
  folders,
  activeFolder,
  onFolderSelect,
  onRenameFolder,
  onDeleteFolder,
}: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (renamingFolderId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFolderId]);

  const submitRename = (folderId: string) => {
    const original = folders.find((f) => f.id === folderId)?.name;
    if (renameValue.trim() && renameValue !== original) {
      onRenameFolder?.(folderId, renameValue.trim());
    }
    setRenamingFolderId(null);
    setRenameValue("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
      {folders.map((folder) => {
        const isActive = folder.id === activeFolder;
        const isRestricted = folder.isRestricted;
        const badge = STATUS_STYLES[folder.statusColor] || STATUS_STYLES.slate;
        return (
          <div
            key={folder.id}
            className={`group flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-all ${
              isRestricted ? "opacity-60" : ""
            } ${isActive ? "ring-1" : "hover:bg-slate-50"}`}
            style={
              isActive
                ? {
                    backgroundColor: "rgba(0, 51, 102, 0.05)",
                    boxShadow: "inset 0 0 0 1px rgba(0, 51, 102, 0.2)",
                  }
                : undefined
            }
            onClick={() => !isRestricted && onFolderSelect(folder.id)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isRestricted) {
                e.preventDefault();
                onFolderSelect(folder.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-current={isActive ? "true" : undefined}
          >
            <span
              className={`material-symbols-outlined mt-0.5 ${
                isRestricted
                  ? "text-slate-400"
                  : isActive
                    ? ""
                    : "text-slate-400 group-hover:text-primary"
              }`}
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : undefined,
                color: isActive ? "#003366" : undefined,
              }}
            >
              {isRestricted ? "lock" : "folder"}
            </span>
            <div className="flex flex-col flex-1 gap-1 min-w-0">
              <div className="flex justify-between items-center w-full">
                {renamingFolderId === folder.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitRename(folder.id);
                      } else if (e.key === "Escape") {
                        setRenamingFolderId(null);
                        setRenameValue("");
                      }
                    }}
                    onBlur={() => submitRename(folder.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-medium text-slate-900 px-2 py-0.5 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/20 w-full"
                  />
                ) : (
                  <span
                    className={`text-sm truncate ${
                      isActive
                        ? "font-semibold text-slate-900"
                        : "font-medium text-slate-600 group-hover:text-slate-900"
                    }`}
                  >
                    {folder.name}
                  </span>
                )}
                {!isRestricted && !renamingFolderId && (
                  <div
                    className="relative flex-shrink-0"
                    ref={openMenuId === folder.id ? menuRef : null}
                  >
                    <button
                      type="button"
                      className="text-slate-400 hover:text-primary transition-colors p-0.5 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100"
                      style={openMenuId === folder.id ? { opacity: 1 } : undefined}
                      aria-label="Folder options"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === folder.id ? null : folder.id);
                      }}
                    >
                      <span className="material-symbols-outlined text-[18px]">more_vert</span>
                    </button>
                    {openMenuId === folder.id && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingFolderId(folder.id);
                            setRenameValue(folder.name);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                          Rename
                        </button>
                        <div className="border-t border-slate-200 my-1" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFolder?.(folder.id);
                            setOpenMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
                >
                  {folder.statusLabel}
                </span>
                {!isRestricted && (
                  <span className="text-[10px] text-slate-400">{folder.fileCount} files</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
