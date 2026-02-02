import React, { useState, useRef, useEffect } from 'react';
import { VDRFile } from '../types/vdr.types';

interface FileTableProps {
  files: VDRFile[];
  folderName?: string;
  onFileClick?: (file: VDRFile) => void;
  onDeleteFile?: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ files, folderName = 'Folder', onFileClick, onDeleteFile, onRenameFile }) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus rename input when starting rename
  useEffect(() => {
    if (renamingFileId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFileId]);

  const handleMenuToggle = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === fileId ? null : fileId);
  };

  const handleDelete = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this file?')) {
      onDeleteFile?.(fileId);
    }
    setOpenMenuId(null);
  };

  const handleRenameStart = (e: React.MouseEvent, file: VDRFile) => {
    e.stopPropagation();
    setRenamingFileId(file.id);
    setRenameValue(file.name);
    setOpenMenuId(null);
  };

  const handleRenameSubmit = (fileId: string) => {
    if (renameValue.trim() && renameValue !== files.find(f => f.id === fileId)?.name) {
      onRenameFile?.(fileId, renameValue.trim());
    }
    setRenamingFileId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, fileId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit(fileId);
    } else if (e.key === 'Escape') {
      setRenamingFileId(null);
      setRenameValue('');
    }
  };

  const getFileIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      excel: 'table_view',
      pdf: 'picture_as_pdf',
      doc: 'description',
      other: 'description',
    };
    return iconMap[type] || iconMap.other;
  };

  const getFileIconStyle = (type: string): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      excel: { bg: 'bg-green-50', text: 'text-green-600' },
      pdf: { bg: 'bg-red-50', text: 'text-red-600' },
      doc: { bg: 'bg-blue-50', text: 'text-blue-600' },
      other: { bg: 'bg-slate-50', text: 'text-slate-600' },
    };
    return colorMap[type] || colorMap.other;
  };

  const getAnalysisStyle = (color: string, type: string): { className: string; icon: string } => {
    if (type === 'key-insight' || type === 'complete') {
      return { className: 'text-primary', icon: 'auto_awesome' };
    } else if (type === 'warning') {
      return { className: 'text-orange-600', icon: 'warning' };
    }
    return { className: 'text-slate-400', icon: 'check_circle' };
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <div className="min-w-full inline-block align-middle">
        <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-slate-500 sm:pl-6" scope="col">
                  <div className="flex items-center gap-2">
                    <input
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      type="checkbox"
                      aria-label="Select all files"
                    />
                    Name
                  </div>
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-500 w-[40%]" scope="col">
                  AI Analysis
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-500" scope="col">
                  Author
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-slate-500" scope="col">
                  Date
                </th>
                <th className="relative py-3.5 pl-3 pr-4 sm:pr-6" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 block">folder_open</span>
                    <p className="text-sm text-slate-500">No files in this folder yet</p>
                    <p className="text-xs text-slate-400 mt-1">Upload files to get started</p>
                  </td>
                </tr>
              ) : (
                files.map((file) => {
                  const iconStyle = getFileIconStyle(file.type);
                  const analysisStyle = getAnalysisStyle(file.analysis.color, file.analysis.type);

                  return (
                    <tr
                      key={file.id}
                      className={`group hover:bg-slate-50 transition-colors cursor-pointer ${
                        file.isHighlighted ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => onFileClick?.(file)}
                    >
                      <td
                        className={`whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6 ${
                          file.isHighlighted ? 'border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex size-10 shrink-0 items-center justify-center rounded ${iconStyle.bg}`}>
                            <span className={`material-symbols-outlined ${iconStyle.text}`}>{getFileIcon(file.type)}</span>
                          </div>
                          <div className="flex flex-col">
                            {renamingFileId === file.id ? (
                              <input
                                ref={renameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, file.id)}
                                onBlur={() => handleRenameSubmit(file.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium text-slate-900 px-2 py-1 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
                              />
                            ) : (
                              <div className="font-medium text-slate-900 group-hover:text-primary transition-colors">
                                {file.name}
                              </div>
                            )}
                            <div className="text-xs text-slate-400">{file.size}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-500">
                        <div className="flex flex-col gap-1">
                          <div className={`flex items-center gap-1.5 text-xs font-medium ${analysisStyle.className}`}>
                            <span className="material-symbols-outlined text-[14px]">{analysisStyle.icon}</span>
                            {file.analysis.label}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-600 line-clamp-2">
                            {file.analysis.description}
                          </p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-6 rounded-full bg-cover bg-slate-200"
                            style={{ backgroundImage: `url('${file.author.avatar}')` }}
                            aria-label={file.author.name}
                          />
                          <span className="text-xs">{file.author.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{file.date}</td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="relative" ref={openMenuId === file.id ? menuRef : null}>
                          <button
                            className="text-slate-400 hover:text-primary transition-colors p-1 rounded hover:bg-slate-100"
                            aria-label="More options"
                            onClick={(e) => handleMenuToggle(e, file.id)}
                          >
                            <span className="material-symbols-outlined">more_vert</span>
                          </button>

                          {/* Dropdown Menu */}
                          {openMenuId === file.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                              <button
                                onClick={(e) => handleRenameStart(e, file)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                Rename
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onFileClick?.(file);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">download</span>
                                Download
                              </button>
                              <div className="border-t border-slate-200 my-1"></div>
                              <button
                                onClick={(e) => handleDelete(e, file.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex justify-center mt-4">
          <button className="text-xs font-medium text-slate-500 hover:text-primary transition-colors">
            View all {files.length} files in {folderName}
          </button>
        </div>
      )}
    </div>
  );
};
