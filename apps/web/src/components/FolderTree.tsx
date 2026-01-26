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
              isRestricted
                ? 'opacity-60 hover:bg-background-light'
                : 'hover:bg-background-light'
            }`}
            style={isActive ? { backgroundColor: '#E6EEF5', boxShadow: 'inset 0 0 0 1px rgba(0, 51, 102, 0.2)' } : undefined}
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
                isRestricted ? 'text-text-muted' : ''
              }`}
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : undefined,
                color: isActive ? '#003366' : isRestricted ? undefined : '#9CA3AF'
              }}
              onMouseOver={(e) => {
                if (!isActive && !isRestricted) e.currentTarget.style.color = '#003366';
              }}
              onMouseOut={(e) => {
                if (!isActive && !isRestricted) e.currentTarget.style.color = '#9CA3AF';
              }}
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
