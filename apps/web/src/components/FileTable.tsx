import React, { useState, useRef, useEffect } from 'react';
import { VDRFile } from '../types/vdr.types';

interface FileTableProps {
  files: VDRFile[];
  onFileClick?: (file: VDRFile) => void;
  onDeleteFile?: (fileId: string) => void;
  onRenameFile?: (fileId: string, newName: string) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ files, onFileClick, onDeleteFile, onRenameFile }) => {
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

  const getFileIconColor = (type: string): { className: string; style?: React.CSSProperties } => {
    const colorMap: Record<string, { className: string; style?: React.CSSProperties }> = {
      excel: { className: 'bg-secondary-light text-secondary' },
      pdf: { className: 'bg-red-50 text-red-600' },
      doc: { className: '', style: { backgroundColor: '#E6EEF5', color: '#003366' } },
      other: { className: 'bg-background-light text-text-secondary' },
    };
    return colorMap[type] || colorMap.other;
  };

  const getAnalysisColor = (color: string): { className: string; style?: React.CSSProperties } => {
    const colorMap: Record<string, { className: string; style?: React.CSSProperties }> = {
      primary: { className: '', style: { color: '#003366' } },
      orange: { className: 'text-orange-600' },
      slate: { className: 'text-text-muted' },
    };
    return colorMap[color] || colorMap.slate;
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-4">
      <div className="min-w-full inline-block align-middle">
        <div className="border rounded-lg bg-surface-light shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-border-light">
            <thead className="bg-background-light/80">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold text-text-secondary sm:pl-6" scope="col">
                  <div className="flex items-center gap-2">
                    <input
                      className="h-4 w-4 rounded border-border-light"
                      style={{ accentColor: '#003366' }}
                      type="checkbox"
                      aria-label="Select all files"
                    />
                    Name
                  </div>
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-text-secondary w-[40%]" scope="col">
                  AI Analysis
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-text-secondary" scope="col">
                  Author
                </th>
                <th className="px-3 py-3.5 text-left text-xs font-semibold text-text-secondary" scope="col">
                  Date
                </th>
                <th className="relative py-3.5 pl-3 pr-4 sm:pr-6" scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light bg-white">
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-text-secondary">
                    No files found
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr
                    key={file.id}
                    className="group hover:bg-background-light transition-colors cursor-pointer"
                    style={file.isHighlighted ? { backgroundColor: '#E6EEF5' } : undefined}
                    onClick={() => onFileClick?.(file)}
                  >
                    <td
                      className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6"
                      style={file.isHighlighted ? { borderLeft: '4px solid #003366' } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded ${getFileIconColor(file.type).className}`}
                          style={getFileIconColor(file.type).style}
                        >
                          <span className="material-symbols-outlined">{getFileIcon(file.type)}</span>
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
                              className="font-medium text-text-main px-2 py-1 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
                            />
                          ) : (
                            <div className="font-medium text-text-main transition-colors file-name-hover">
                              {file.name}
                            </div>
                          )}
                          <div className="text-xs text-text-muted">{file.size}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-sm text-text-secondary">
                      <div className="flex flex-col gap-1">
                        <div
                          className={`flex items-center gap-1.5 text-xs font-medium ${getAnalysisColor(file.analysis.color).className}`}
                          style={getAnalysisColor(file.analysis.color).style}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {file.analysis.type === 'key-insight' || file.analysis.type === 'complete'
                              ? 'auto_awesome'
                              : file.analysis.type === 'warning'
                              ? 'warning'
                              : 'check_circle'}
                          </span>
                          {file.analysis.label}
                        </div>
                        <p className="text-xs leading-relaxed text-text-secondary line-clamp-2">
                          {file.analysis.description}
                        </p>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-text-secondary">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-6 rounded-full bg-cover"
                          style={{ backgroundImage: `url('${file.author.avatar}')` }}
                          aria-label={file.author.name}
                        />
                        <span className="text-xs">{file.author.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-text-secondary text-xs">{file.date}</td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <div className="relative" ref={openMenuId === file.id ? menuRef : null}>
                        <button
                          className="text-text-muted transition-colors p-1 rounded hover:bg-background-light"
                          aria-label="More options"
                          onClick={(e) => handleMenuToggle(e, file.id)}
                          onMouseOver={(e) => e.currentTarget.style.color = '#003366'}
                          onMouseOut={(e) => e.currentTarget.style.color = openMenuId === file.id ? '#003366' : '#9CA3AF'}
                          style={{ color: openMenuId === file.id ? '#003366' : undefined }}
                        >
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === file.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-border-light py-1 z-50">
                            <button
                              onClick={(e) => handleRenameStart(e, file)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-background-light hover:text-text-main transition-colors"
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
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-background-light hover:text-text-main transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">download</span>
                              Download
                            </button>
                            <div className="border-t border-border-light my-1"></div>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex justify-center mt-4">
          <button
            className="text-xs font-medium text-text-secondary"
            onMouseOver={(e) => e.currentTarget.style.color = '#003366'}
            onMouseOut={(e) => e.currentTarget.style.color = '#4B5563'}
          >
            View all {files.length} files in Financials
          </button>
        </div>
      )}
    </div>
  );
};
