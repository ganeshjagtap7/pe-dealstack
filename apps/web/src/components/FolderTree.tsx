import React from 'react';
import { Folder } from '../types/vdr.types';

interface FolderTreeProps {
  folders: Folder[];
  activeFolder: string;
  onFolderSelect: (folderId: string) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  activeFolder,
  onFolderSelect,
}) => {
  const getStatusBadgeStyle = (color: string): { bg: string; text: string } => {
    const colorMap: Record<string, { bg: string; text: string }> = {
      green: { bg: 'bg-green-100', text: 'text-green-700' },
      orange: { bg: 'bg-orange-100', text: 'text-orange-700' },
      yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
      slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
    };
    return colorMap[color] || colorMap.slate;
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      {folders.map((folder) => {
        const isActive = folder.id === activeFolder;
        const isRestricted = folder.isRestricted;
        const badgeStyle = getStatusBadgeStyle(folder.statusColor);

        return (
          <div
            key={folder.id}
            className={`group flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-all ${
              isRestricted ? 'opacity-60' : ''
            } ${
              isActive
                ? 'ring-1'
                : 'hover:bg-slate-50'
            }`}
            style={isActive ? {
              backgroundColor: 'rgba(0, 51, 102, 0.05)',
              boxShadow: 'inset 0 0 0 1px rgba(0, 51, 102, 0.2)'
            } : undefined}
            onClick={() => !isRestricted && onFolderSelect(folder.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isRestricted) {
                e.preventDefault();
                onFolderSelect(folder.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-current={isActive ? 'true' : undefined}
          >
            <span
              className={`material-symbols-outlined mt-0.5 ${
                isRestricted ? 'text-slate-400' : isActive ? '' : 'text-slate-400 group-hover:text-primary'
              }`}
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : undefined,
                color: isActive ? '#003366' : undefined,
              }}
            >
              {isRestricted ? 'lock' : 'folder'}
            </span>
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex justify-between items-center w-full">
                <span
                  className={`text-sm ${
                    isActive
                      ? 'font-semibold text-slate-900'
                      : 'font-medium text-slate-600 group-hover:text-slate-900'
                  }`}
                >
                  {folder.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyle.bg} ${badgeStyle.text}`}>
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
};
