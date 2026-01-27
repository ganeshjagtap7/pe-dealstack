import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FolderTree } from './components/FolderTree';
import { FiltersBar } from './components/FiltersBar';
import { FileTable } from './components/FileTable';
import { InsightsPanel } from './components/InsightsPanel';
import { mockFolders, mockFiles, mockInsights, smartFilters, mockCollaborators } from './data/vdrMockData';
import { VDRFile, SmartFilter, Folder } from './types/vdr.types';

export const VDRApp: React.FC = () => {
  const [activeFolderId, setActiveFolderId] = useState('100');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SmartFilter[]>(smartFilters);
  const [allFiles, setAllFiles] = useState(mockFiles);
  const [folders, setFolders] = useState<Folder[]>(mockFolders);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [insightsPanelCollapsed, setInsightsPanelCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const activeFolderInsights = mockInsights[activeFolderId];

  // Filter files by folder, search, and smart filters
  const filteredFiles = useMemo(() => {
    let results = allFiles.filter((file) => file.folderId === activeFolderId);

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (file) =>
          file.name.toLowerCase().includes(query) ||
          file.analysis.description.toLowerCase().includes(query) ||
          file.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply active smart filters
    const activeFilters = filters.filter((f) => f.active);
    if (activeFilters.length > 0) {
      results = results.filter((file) =>
        activeFilters.every((filter) => filter.filterFn(file))
      );
    }

    return results;
  }, [allFiles, activeFolderId, searchQuery, filters]);

  const handleFilterToggle = (filterId: string) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === filterId ? { ...f, active: !f.active } : f))
    );
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const maxFileSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const newFiles: VDRFile[] = [];

    Array.from(files).forEach((file) => {
      // Validate file size
      if (file.size > maxFileSize) {
        alert(`File ${file.name} exceeds maximum size of 50MB`);
        return;
      }

      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        alert(`File ${file.name} has unsupported file type`);
        return;
      }

      // Determine file type
      let fileType: 'excel' | 'pdf' | 'doc' | 'other' = 'other';
      if (file.type.includes('excel') || file.type.includes('spreadsheet')) {
        fileType = 'excel';
      } else if (file.type.includes('pdf')) {
        fileType = 'pdf';
      } else if (file.type.includes('word') || file.type.includes('document')) {
        fileType = 'doc';
      }

      const newFile: VDRFile = {
        id: `f-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: fileType,
        analysis: {
          type: 'standard',
          label: 'Processing...',
          description: 'AI analysis in progress. This may take a few moments.',
          color: 'slate',
        },
        author: {
          name: 'You',
          avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCO6GIn4UhlI4C8A-rUopfedCoExgcFNw9lqL74O0ToVnyDYmuppE4SCK4e3w9Snc4Y7YC1yLHg4yXxzD33Vi8s1dIbVkhAY-dl5yzQJHrFbK1c4DN55KR9cuMqFyTgHh3eHxtD7Qj1QeCZ3vWiJ8dwrdWaSGLpz1z8qzxvy3sU1R1YIbHA6Guqw-7hBQwlCzDkElLXcbLutbv8jFvGenyTIkJ78xTEd9CkpcKw8oiErdB0yqZ9A6MdYsW6e1laJqopTVEsy78RrWs',
        },
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        folderId: activeFolderId,
        tags: ['uploaded'],
      };

      newFiles.push(newFile);
    });

    if (newFiles.length > 0) {
      setAllFiles((prev) => [...newFiles, ...prev]);

      // Simulate AI processing after 2 seconds
      setTimeout(() => {
        setAllFiles((prev) =>
          prev.map((f) =>
            newFiles.find((nf) => nf.id === f.id)
              ? {
                  ...f,
                  analysis: {
                    type: 'complete',
                    label: 'Analysis Complete',
                    description: 'Document successfully processed and indexed.',
                    color: 'primary',
                  },
                }
              : f
          )
        );
      }, 2000);
    }

    // Reset input
    event.target.value = '';
  };

  const handleGenerateReport = () => {
    const folder = activeFolder;
    const insights = activeFolderInsights;

    if (!folder || !insights) return;

    // Generate markdown report
    const report = `# VDR Analysis Report - ${folder.name}
Generated: ${new Date().toLocaleString()}

## Summary
${insights.summary}

**Completion Status:** ${insights.completionPercent}%
**Total Files:** ${folder.fileCount}

## Red Flags (${insights.redFlags.length})
${insights.redFlags
  .map(
    (flag) => `
### ${flag.title} [${flag.severity.toUpperCase()}]
${flag.description}
`
  )
  .join('\n')}

## Missing Documents (${insights.missingDocuments.length})
${insights.missingDocuments.map((doc) => `- ${doc.name}`).join('\n')}

## Files in Folder
${filteredFiles
  .map(
    (file) => `
- **${file.name}** (${file.size})
  - Analysis: ${file.analysis.label}
  - ${file.analysis.description}
  - Author: ${file.author.name}
  - Date: ${file.date}
`
  )
  .join('\n')}

---
Generated by PE OS VDR System
`;

    // Download as text file
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VDR_Report_${folder.name.replace(/\s+/g, '_')}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileClick = (file: VDRFile) => {
    alert(`File clicked: ${file.name}\n\nIn a production app, this would open a file viewer or download the file.`);
  };

  const handleViewFile = (fileId: string) => {
    const file = allFiles.find((f) => f.id === fileId);
    if (file) {
      handleFileClick(file);
    }
  };

  const handleRequestDocument = (docId: string) => {
    const doc = activeFolderInsights?.missingDocuments.find((d) => d.id === docId);
    if (doc) {
      alert(`Document request sent: ${doc.name}\n\nIn a production app, this would notify the relevant parties.`);
    }
  };

  // Auto-focus the new folder input when modal opens
  useEffect(() => {
    if (showNewFolderModal && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderModal]);

  const handleOpenNewFolderModal = () => {
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  const handleCloseNewFolderModal = () => {
    setShowNewFolderModal(false);
    setNewFolderName('');
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    // Generate a unique folder ID based on existing folders
    const existingNumbers = folders
      .map((f) => parseInt(f.id))
      .filter((n) => !isNaN(n))
      .sort((a, b) => b - a);
    const nextNumber = existingNumbers.length > 0 ? existingNumbers[0] + 100 : 100;
    const newId = nextNumber.toString();

    const newFolder: Folder = {
      id: newId,
      name: `${newId} ${newFolderName.trim()}`,
      status: 'reviewing',
      fileCount: 0,
      statusLabel: 'New',
      statusColor: 'yellow',
    };

    setFolders((prev) => [...prev, newFolder]);
    setActiveFolderId(newId);
    handleCloseNewFolderModal();
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      handleCloseNewFolderModal();
    }
  };

  // File actions
  const handleDeleteFile = (fileId: string) => {
    setAllFiles((prev) => prev.filter((f) => f.id !== fileId));
    // Update folder file count
    setFolders((prev) =>
      prev.map((folder) => {
        const filesInFolder = allFiles.filter((f) => f.folderId === folder.id && f.id !== fileId).length;
        return { ...folder, fileCount: filesInFolder };
      })
    );
  };

  const handleRenameFile = (fileId: string, newName: string) => {
    setAllFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
    );
  };

  // Insights panel toggle
  const handleToggleInsightsPanel = () => {
    setInsightsPanelCollapsed((prev) => !prev);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark text-text-main dark:text-gray-100 flex h-full w-full overflow-hidden antialiased selection:bg-primary/20">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseNewFolderModal}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-light">
                  <span className="material-symbols-outlined text-primary">create_new_folder</span>
                </div>
                <h3 className="text-lg font-semibold text-text-main">Create New Folder</h3>
              </div>
              <button
                onClick={handleCloseNewFolderModal}
                className="p-1 rounded-lg hover:bg-background-light transition-colors"
              >
                <span className="material-symbols-outlined text-text-muted">close</span>
              </button>
            </div>
            {/* Content */}
            <div className="p-5">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Folder Name
              </label>
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeyDown}
                placeholder="e.g., Tax Documents, Contracts"
                className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text-main placeholder:text-text-muted"
              />
              <p className="mt-2 text-xs text-text-muted">
                The folder will be automatically numbered based on existing folders.
              </p>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-border-light bg-background-light/50">
              <button
                onClick={handleCloseNewFolderModal}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-5 py-2 text-sm font-medium text-white rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: newFolderName.trim() ? '#003366' : '#9CA3AF' }}
                onMouseOver={(e) => { if (newFolderName.trim()) e.currentTarget.style.backgroundColor = '#002855'; }}
                onMouseOut={(e) => { if (newFolderName.trim()) e.currentTarget.style.backgroundColor = '#003366'; }}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Sidebar (Folder Tree) */}
      <aside className="w-[280px] min-w-[280px] flex flex-col border-r border-border-light bg-surface-light">
        <div className="p-5 border-b border-border-light/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Project Apex</span>
          </div>
          <h2 className="text-lg font-bold text-text-main">Data Room Index</h2>
        </div>

        <FolderTree folders={folders} activeFolder={activeFolderId} onFolderSelect={setActiveFolderId} />

        {/* Bottom Action */}
        <div className="p-4 border-t border-border-light bg-background-light/50">
          <button
            onClick={handleOpenNewFolderModal}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-border-light bg-white py-2 text-sm font-medium text-text-secondary transition-colors shadow-sm"
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#E6EEF5'; e.currentTarget.style.color = '#003366'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = '#4B5563'; }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Folder
          </button>
        </div>
      </aside>

      {/* 3. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background-light relative">
        {/* Top Header & Breadcrumbs */}
        <header className="flex h-16 items-center justify-between border-b border-border-light bg-surface-light px-6">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <a
              href="crm.html"
              className="cursor-pointer"
              onMouseOver={(e) => e.currentTarget.style.color = '#003366'}
              onMouseOut={(e) => e.currentTarget.style.color = '#4B5563'}
            >Deals</a>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span
              className="cursor-pointer"
              onMouseOver={(e) => e.currentTarget.style.color = '#003366'}
              onMouseOut={(e) => e.currentTarget.style.color = '#4B5563'}
            >Project Apex</span>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="font-semibold text-text-main">{activeFolder?.name || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {mockCollaborators.map((collab, idx) => (
                <div
                  key={idx}
                  className="size-8 rounded-full border-2 border-white bg-cover"
                  style={{ backgroundImage: `url('${collab.avatar}')` }}
                  aria-label={collab.name}
                />
              ))}
              <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-background-light text-xs font-bold text-text-secondary">
                +4
              </div>
            </div>
            <div className="h-4 w-px bg-border-light mx-2"></div>
            <button
              onClick={handleUploadClick}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition-colors"
              style={{ backgroundColor: '#003366' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#002855'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#003366'}
            >
              <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
              Upload Files
            </button>
          </div>
        </header>

        {/* Smart Filter Bar */}
        <FiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFilterToggle={handleFilterToggle}
        />

        {/* File List Table */}
        <FileTable
          files={filteredFiles}
          onFileClick={handleFileClick}
          onDeleteFile={handleDeleteFile}
          onRenameFile={handleRenameFile}
        />
      </main>

      {/* 4. Quick Insights Panel (Right Sidebar) */}
      <InsightsPanel
        insights={activeFolderInsights}
        folderName={activeFolder?.name || ''}
        onGenerateReport={handleGenerateReport}
        onViewFile={handleViewFile}
        onRequestDocument={handleRequestDocument}
        isCollapsed={insightsPanelCollapsed}
        onToggleCollapse={handleToggleInsightsPanel}
      />
    </div>
  );
};
