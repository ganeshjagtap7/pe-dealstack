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
  const getStatusBadgeClass = (color: string, status: string) => {
    const baseClass = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold';
    const colorMap: Record<string, string> = {
      green: 'bg-secondary-light text-secondary',
      orange: 'bg-orange-100 text-orange-700',
      yellow: 'bg-yellow-100 text-yellow-700',
      slate: 'bg-gray-100 text-text-secondary',
    };
    return `${baseClass} ${colorMap[color] || colorMap.slate}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1">
      {folders.map((folder) => {
        const isActive = folder.id === activeFolder;
        const isRestricted = folder.isRestricted;

        return (
          <div
            key={folder.id}
            className={`group flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-all ${
              isActive
                ? 'bg-primary-light ring-1 ring-primary/20'
                : isRestricted
                ? 'opacity-60 hover:bg-background-light'
                : 'hover:bg-background-light'
            }`}
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
                isActive
                  ? 'text-primary'
                  : isRestricted
                  ? 'text-text-muted'
                  : 'text-text-muted group-hover:text-primary'
              }`}
              style={{ fontVariationSettings: isActive ? "'FILL' 1" : undefined }}
            >
              {isRestricted ? 'lock' : 'folder'}
            </span>
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex justify-between items-center w-full">
                <span
                  className={`text-sm ${
                    isActive
                      ? 'font-semibold text-text-main'
                      : 'font-medium text-text-secondary group-hover:text-text-main'
                  }`}
                >
                  {folder.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusBadgeClass(folder.statusColor, folder.statusLabel)}>
                  {folder.statusLabel}
                </span>
                {!isRestricted && (
                  <span className="text-[10px] text-text-muted">{folder.fileCount} files</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
