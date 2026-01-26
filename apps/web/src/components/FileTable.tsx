import React from 'react';
import { VDRFile } from '../types/vdr.types';

interface FileTableProps {
  files: VDRFile[];
  onFileClick?: (file: VDRFile) => void;
}

export const FileTable: React.FC<FileTableProps> = ({ files, onFileClick }) => {
  const getFileIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      excel: 'table_view',
      pdf: 'picture_as_pdf',
      doc: 'description',
      other: 'description',
    };
    return iconMap[type] || iconMap.other;
  };

  const getFileIconColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      excel: 'bg-secondary-light text-secondary',
      pdf: 'bg-red-50 text-red-600',
      doc: 'bg-primary-light text-primary',
      other: 'bg-background-light text-text-secondary',
    };
    return colorMap[type] || colorMap.other;
  };

  const getAnalysisColorClass = (color: string): string => {
    const colorMap: Record<string, string> = {
      primary: 'text-primary',
      orange: 'text-orange-600',
      slate: 'text-text-muted',
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
                      className="h-4 w-4 rounded border-border-light text-primary focus:ring-primary"
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
                    className={`group hover:bg-background-light transition-colors cursor-pointer ${
                      file.isHighlighted ? 'bg-primary-light' : ''
                    }`}
                    onClick={() => onFileClick?.(file)}
                  >
                    <td
                      className={`whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6 ${
                        file.isHighlighted ? 'border-l-4 border-l-primary' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded ${getFileIconColor(
                            file.type
                          )}`}
                        >
                          <span className="material-symbols-outlined">{getFileIcon(file.type)}</span>
                        </div>
                        <div className="flex flex-col">
                          <div className="font-medium text-text-main group-hover:text-primary transition-colors">
                            {file.name}
                          </div>
                          <div className="text-xs text-text-muted">{file.size}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-sm text-text-secondary">
                      <div className="flex flex-col gap-1">
                        <div className={`flex items-center gap-1.5 text-xs font-medium ${getAnalysisColorClass(file.analysis.color)}`}>
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
                      <button
                        className="text-text-muted hover:text-primary transition-colors"
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Handle menu open
                        }}
                      >
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
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
          <button className="text-xs font-medium text-text-secondary hover:text-primary">
            View all {files.length} files in Financials
          </button>
        </div>
      )}
    </div>
  );
};
