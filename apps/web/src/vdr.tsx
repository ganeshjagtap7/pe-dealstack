import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FolderTree } from './components/FolderTree';
import { FiltersBar } from './components/FiltersBar';
import { FileTable } from './components/FileTable';
import { InsightsPanel } from './components/InsightsPanel';
import {
  smartFilters as defaultSmartFilters,
  mockFolders,
  mockFiles,
  mockInsights
} from './data/vdrMockData';
import { VDRFile, SmartFilter, Folder, FolderInsights } from './types/vdr.types';
import {
  fetchFolders,
  fetchDocuments,
  fetchFolderInsights,
  fetchDeal,
  fetchAllDeals,
  initializeDealFolders,
  createDeal,
  createFolder,
  deleteFolder,
  renameFolder,
  uploadDocument,
  deleteDocument,
  renameDocument,
  getDocumentDownloadUrl,
  linkDocumentToDeal,
  transformFolder,
  transformDocument,
  transformInsights,
} from './services/vdrApi';

const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

// Get dealId from URL params
function getDealIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('dealId') || params.get('id');
}

// Data Rooms Overview Component (when no dealId is provided)
const DataRoomsOverview: React.FC<{ onSelectDeal: (dealId: string) => void }> = ({ onSelectDeal }) => {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      try {
        const fetchedDeals = await fetchAllDeals();
        setDeals(fetchedDeals);
      } catch (error) {
        console.error('Error loading deals:', error);
      } finally {
        setLoading(false);
      }
    };
    loadDeals();
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (showCreateModal && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [showCreateModal]);

  const handleCreateDataRoom = async () => {
    if (!newRoomName.trim() || creating) return;

    setCreating(true);
    try {
      const newDeal = await createDeal(newRoomName.trim());
      if (newDeal && newDeal.id) {
        // Navigate to the new data room
        window.location.href = `/vdr.html?dealId=${newDeal.id}`;
      }
    } catch (error: any) {
      console.error('Error creating data room:', error);
      alert(error.message || 'Failed to create data room. Please try again.');
    } finally {
      setCreating(false);
      setShowCreateModal(false);
      setNewRoomName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateDataRoom();
    } else if (e.key === 'Escape') {
      setShowCreateModal(false);
      setNewRoomName('');
    }
  };

  const handleDealClick = (dealId: string) => {
    // Navigate to the deal's data room
    window.location.href = `/vdr.html?dealId=${dealId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: '#003366' }}></div>
          <p className="text-slate-500">Loading Data Rooms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* Create Data Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowCreateModal(false); setNewRoomName(''); }}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: '#E6EEF5' }}>
                  <span className="material-symbols-outlined text-primary">add_box</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Create Data Room</h3>
              </div>
              <button
                onClick={() => { setShowCreateModal(false); setNewRoomName(''); }}
                className="p-1 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            {/* Content */}
            <div className="p-5">
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Data Room Name
              </label>
              <input
                ref={createInputRef}
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Project Apollo, Acme Corp Acquisition"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-slate-900 placeholder:text-slate-400"
              />
              <p className="mt-2 text-xs text-slate-400">
                A new data room will be created with default folders for due diligence.
              </p>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 bg-slate-50/50">
              <button
                onClick={() => { setShowCreateModal(false); setNewRoomName(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDataRoom}
                disabled={!newRoomName.trim() || creating}
                className="px-5 py-2 text-sm font-medium text-white rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Creating...
                  </>
                ) : (
                  'Create Data Room'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Data Rooms</h1>
          <p className="text-sm text-slate-500">{deals.length} active deals</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create Data Room
        </button>
      </header>

      {/* Deals Grid */}
      <div className="flex-1 overflow-auto p-6">
        {deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">folder_open</span>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No Data Rooms Yet</h3>
            <p className="text-slate-500 mb-6">Create your first data room to get started with due diligence</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Create Data Room
              </button>
              <span className="text-slate-400">or</span>
              <a href="/crm.html" className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors font-medium">
                Go to Deals
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {deals.map((deal) => (
              <div
                key={deal.id}
                onClick={() => handleDealClick(deal.id)}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-primary/10 transition-colors">
                    <span className="material-symbols-outlined text-slate-600 group-hover:text-primary">folder_open</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{deal.name || deal.companyName || 'Untitled Deal'}</h3>
                    <p className="text-sm text-slate-500">{deal.Company?.industry || deal.industry || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    deal.stage === 'DUE_DILIGENCE' ? 'bg-blue-100 text-blue-700' :
                    deal.stage === 'IOI_SUBMITTED' ? 'bg-purple-100 text-purple-700' :
                    deal.stage === 'SCREENING' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {(deal.stage || 'SCREENING').replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {new Date(deal.updatedAt || deal.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const VDRApp: React.FC = () => {
  const [dealId, setDealId] = useState<string | null>(getDealIdFromUrl());
  const [dealName, setDealName] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SmartFilter[]>(defaultSmartFilters);
  const [allFiles, setAllFiles] = useState<VDRFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [insights, setInsights] = useState<Record<string, FolderInsights>>({});
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [insightsPanelCollapsed, setInsightsPanelCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [useMockData, setUseMockData] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [autoUpdateDeal, setAutoUpdateDeal] = useState(false);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [linkModalFile, setLinkModalFile] = useState<VDRFile | null>(null);
  const [linkDeals, setLinkDeals] = useState<Array<{ id: string; name: string; industry?: string }>>([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linking, setLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // Open share modal (uses global ShareModal from shareModal.js)
  const handleOpenShareModal = () => {
    if (dealId && typeof (window as any).ShareModal !== 'undefined') {
      // Set callback to refresh team when modal closes
      (window as any).onShareModalClose = async () => {
        // Refetch deal to get updated team
        const deal = await fetchDeal(dealId);
        if (deal?.teamMembers) {
          setTeamMembers(deal.teamMembers);
        }
      };
      (window as any).ShareModal.open(dealId);
    }
  };

  // Get initials from name
  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // Derived state
  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const activeFolderInsights = activeFolderId ? insights[activeFolderId] : null;

  // Filter files by folder, search, and smart filters - MUST be before any conditional returns
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

  // File select handler — shows confirmation modal (stage 1)
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !activeFolderId) return;

    if (useMockData) {
      // Demo mode - add files locally
      for (const file of Array.from(files)) {
        const newFile: VDRFile = {
          id: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? 'excel' : 'doc',
          analysis: {
            type: 'standard',
            label: 'Processing...',
            description: 'AI analysis pending for this document.',
            color: 'slate',
          },
          author: {
            name: 'You',
            avatar: '',
          },
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          folderId: activeFolderId,
          tags: [],
        };
        setAllFiles((prev) => [newFile, ...prev]);
      }
      event.target.value = '';
      return;
    }

    const maxFileSize = 50 * 1024 * 1024;
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxFileSize) {
        alert(`File ${file.name} exceeds maximum size of 50MB`);
        continue;
      }
      if (!allowedTypes.includes(file.type)) {
        alert(`File ${file.name} has unsupported file type`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      // Smart default: auto-check toggle for CIM/financials/teaser documents
      const hasHighValueDoc = validFiles.some(f => {
        const name = f.name.toLowerCase();
        return name.includes('cim') || name.includes('teaser') || name.includes('financial') || name.includes('model');
      });
      setAutoUpdateDeal(hasHighValueDoc);
      setPendingFiles(validFiles);
    }

    event.target.value = '';
  }, [activeFolderId, useMockData]);

  // Confirm upload handler — uploads with options (stage 2)
  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFiles || !dealId || !activeFolderId) return;

    setUploading(true);
    setPendingFiles(null);
    let anyDealUpdated = false;
    let lastUpdatedDoc = '';

    for (const file of pendingFiles) {
      try {
        const uploadedDoc = await uploadDocument(dealId, activeFolderId, file, { autoUpdateDeal });
        if (uploadedDoc) {
          const transformedFile = transformDocument(uploadedDoc);
          setAllFiles((prev) => [transformedFile, ...prev]);
          setFolders((prev) =>
            prev.map((folder) =>
              folder.id === activeFolderId
                ? { ...folder, fileCount: folder.fileCount + 1 }
                : folder
            )
          );
          if ((uploadedDoc as any).dealUpdated) {
            anyDealUpdated = true;
            lastUpdatedDoc = file.name;
          }
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        alert(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setUploading(false);

    if (anyDealUpdated) {
      setUploadToast(`Deal updated with extracted data from ${lastUpdatedDoc}`);
      setTimeout(() => setUploadToast(null), 5000);
    }
  }, [pendingFiles, dealId, activeFolderId, autoUpdateDeal]);

  // Link document to another deal
  const handleLinkToDeal = useCallback(async (file: VDRFile) => {
    setLinkModalFile(file);
    setLinkSearchQuery('');
    const deals = await fetchAllDeals();
    // Filter out current deal
    setLinkDeals(deals.filter(d => d.id !== dealId));
  }, [dealId]);

  const confirmLinkToDeal = useCallback(async (targetDealId: string) => {
    if (!linkModalFile) return;
    setLinking(true);
    try {
      await linkDocumentToDeal(linkModalFile.id, targetDealId);
      const targetDeal = linkDeals.find(d => d.id === targetDealId);
      setUploadToast(`"${linkModalFile.name}" linked to ${targetDeal?.name || 'deal'}`);
      setTimeout(() => setUploadToast(null), 5000);
      setLinkModalFile(null);
    } catch (error) {
      alert(`Failed to link document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    setLinking(false);
  }, [linkModalFile, linkDeals]);

  // File click handler - MUST be before any conditional returns
  const handleFileClick = useCallback(async (file: VDRFile) => {
    if (useMockData) {
      alert(`Preview: ${file.name}\n\nThis is a demo. In production, the document would open in a preview modal.`);
      return;
    }

    // Try to get download URL and show preview
    try {
      const downloadUrl = await getDocumentDownloadUrl(file.id);
      if (downloadUrl) {
        // Use PEDocPreview if available, otherwise open in new tab
        if ((window as any).PEDocPreview) {
          (window as any).PEDocPreview.preview(downloadUrl, file.name);
        } else {
          window.open(downloadUrl, '_blank');
        }
      } else {
        alert(`Unable to load document: ${file.name}`);
      }
    } catch (error) {
      console.error('Error loading file:', error);
      alert(`Error loading file: ${file.name}`);
    }
  }, [useMockData]);

  // Create folder handler - MUST be before any conditional returns
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    let currentDealId = dealId;

    // If no deal exists, create one first
    if (!currentDealId) {
      try {
        const newDeal = await createDeal(newFolderName.trim());
        if (newDeal && newDeal.id) {
          currentDealId = newDeal.id;
          setDealId(currentDealId);
          setDealName(newDeal.name || newFolderName.trim());
          setUseMockData(false);
          // Clear mock data
          setFolders([]);
          setAllFiles([]);
          setInsights({});
          // Update URL without reload
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('dealId', currentDealId);
          window.history.pushState({}, '', newUrl.toString());
        } else {
          throw new Error('Failed to create deal');
        }
      } catch (error) {
        console.error('Error creating deal:', error);
        alert('Failed to create data room. Please try again.');
        setShowNewFolderModal(false);
        setNewFolderName('');
        return;
      }
    }

    // Now create the folder
    try {
      const newApiFolder = await createFolder(currentDealId, newFolderName.trim());
      if (newApiFolder) {
        const newFolder = transformFolder(newApiFolder);
        setFolders((prev) => [...prev, newFolder]);
        setActiveFolderId(newFolder.id);

        // Initialize empty insights for new folder
        setInsights((prev) => ({
          ...prev,
          [newFolder.id]: transformInsights(null, newFolder.id),
        }));
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert('Failed to create folder');
    }

    setShowNewFolderModal(false);
    setNewFolderName('');
  }, [newFolderName, dealId]);

  // Delete file handler - MUST be before any conditional returns
  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (useMockData) {
      // Demo mode - delete locally
      setAllFiles((prev) => prev.filter((f) => f.id !== fileId));
      return;
    }

    const success = await deleteDocument(fileId);
    if (success) {
      setAllFiles((prev) => prev.filter((f) => f.id !== fileId));
      // Update folder file count
      setFolders((prev) =>
        prev.map((folder) => {
          const filesInFolder = allFiles.filter(
            (f) => f.folderId === folder.id && f.id !== fileId
          ).length;
          return { ...folder, fileCount: filesInFolder };
        })
      );
    } else {
      alert('Failed to delete file');
    }
  }, [allFiles, useMockData]);

  // Rename file handler - MUST be before any conditional returns
  const handleRenameFile = useCallback(async (fileId: string, newName: string) => {
    if (useMockData) {
      // Demo mode - rename locally
      setAllFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
      );
      return;
    }

    const success = await renameDocument(fileId, newName);
    if (success) {
      setAllFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
      );
    } else {
      alert('Failed to rename file');
    }
  }, [useMockData]);

  // Rename folder handler
  const handleRenameFolder = useCallback(async (folderId: string, newName: string) => {
    const success = await renameFolder(folderId, newName);
    if (success) {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f))
      );
      setUploadToast(`Folder renamed to "${newName}"`);
      setTimeout(() => setUploadToast(null), 3000);
    } else {
      alert('Failed to rename folder');
    }
  }, []);

  // Delete folder handler
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    const success = await deleteFolder(folderId, true);
    if (success) {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setAllFiles((prev) => prev.filter((f) => f.folderId !== folderId));
      // If we deleted the active folder, switch to another
      if (activeFolderId === folderId) {
        setActiveFolderId((prev) => {
          const remaining = folders.filter((f) => f.id !== folderId);
          return remaining.length > 0 ? remaining[0].id : null;
        });
      }
      setUploadToast('Folder deleted');
      setTimeout(() => setUploadToast(null), 3000);
    } else {
      alert('Failed to delete folder');
    }
  }, [activeFolderId, folders]);

  // Load data when dealId changes or on initial load
  useEffect(() => {
    const loadData = async () => {
      // If no dealId, the overview component will be shown instead
      if (!dealId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Fetch deal info
        const deal = await fetchDeal(dealId);
        if (deal) {
          setDealName(deal.name || deal.companyName || 'Data Room');
          // Set team members for collaboration display
          if (deal.teamMembers) {
            setTeamMembers(deal.teamMembers);
          }
        } else {
          // Deal not found, redirect to overview
          window.location.href = '/vdr.html';
          return;
        }

        // Try to fetch existing folders
        let apiFolders = await fetchFolders(dealId);

        // If no folders exist, auto-create default folders
        if (apiFolders.length === 0) {
          console.log('No folders found, initializing default folders...');
          const initResult = await initializeDealFolders(dealId);
          apiFolders = initResult.folders;
        }

        if (apiFolders.length > 0) {
          // Use mock files for visualization, mapped to real folder IDs
          const demoFiles: VDRFile[] = [];
          const transformedFolders = apiFolders.map((apiFolder, idx) => {
            const folder = transformFolder(apiFolder);

            // Get corresponding mock folder for visual properties
            const mockFolder = mockFolders[idx % mockFolders.length];

            // Map some mock files to this folder
            const filesForFolder = mockFiles
              .filter((_, fileIdx) => fileIdx % apiFolders.length === idx)
              .map(file => ({
                ...file,
                id: `demo-${folder.id}-${file.id}`,
                folderId: folder.id,
              }));
            demoFiles.push(...filesForFolder);

            // Use mock folder visual properties for better visualization
            return {
              ...folder,
              fileCount: filesForFolder.length,
              status: mockFolder?.status || folder.status,
              statusLabel: mockFolder?.statusLabel || folder.statusLabel,
              statusColor: mockFolder?.statusColor || folder.statusColor,
              readinessPercent: mockFolder?.readinessPercent || folder.readinessPercent,
            };
          });

          setFolders(transformedFolders);
          setAllFiles(demoFiles);

          // Set first folder as active
          setActiveFolderId(transformedFolders[0].id);

          // Use mock insights for visualization
          const insightsMap: Record<string, FolderInsights> = {};
          const mockInsightKeys = Object.keys(mockInsights);
          transformedFolders.forEach((folder, idx) => {
            const mockKey = mockInsightKeys[idx % mockInsightKeys.length];
            if (mockKey && mockInsights[mockKey]) {
              insightsMap[folder.id] = {
                ...mockInsights[mockKey],
                folderId: folder.id,
              };
            } else {
              insightsMap[folder.id] = transformInsights(null, folder.id);
            }
          });
          setInsights(insightsMap);
          setUseMockData(true); // Mark as demo mode for visualization
        } else {
          // Still no folders (init failed) - show empty state
          setUseMockData(false);
          setFolders([]);
          setAllFiles([]);
          setInsights({});
        }
      } catch (error) {
        console.error('Error loading VDR data:', error);
        // On error, show empty state (not mock data)
        setUseMockData(false);
        setFolders([]);
        setAllFiles([]);
        setInsights({});
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [dealId]);

  // Load documents when active folder changes (only for real data)
  useEffect(() => {
    const loadDocuments = async () => {
      if (!dealId || !activeFolderId || useMockData) return;

      try {
        const docs = await fetchDocuments(dealId, activeFolderId);
        const transformedDocs = docs.map(transformDocument);
        // Only update files for current folder
        setAllFiles(prev => {
          const otherFiles = prev.filter(f => f.folderId !== activeFolderId);
          return [...otherFiles, ...transformedDocs];
        });
      } catch (error) {
        console.error('Error loading documents:', error);
      }
    };

    loadDocuments();
  }, [dealId, activeFolderId, useMockData]);

  // Auto-focus the new folder input when modal opens
  useEffect(() => {
    if (showNewFolderModal && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [showNewFolderModal]);

  // Event handlers (non-hooks)
  const handleFilterToggle = (filterId: string) => {
    setFilters((prev) =>
      prev.map((f) => (f.id === filterId ? { ...f, active: !f.active } : f))
    );
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleGenerateReport = () => {
    const folder = activeFolder;
    const folderInsights = activeFolderInsights;

    if (!folder) return;

    // Generate markdown report
    const report = `# VDR Analysis Report - ${folder.name}
Generated: ${new Date().toLocaleString()}

## Summary
${folderInsights?.summary || 'No summary available.'}

**Completion Status:** ${folderInsights?.completionPercent || 0}%
**Total Files:** ${folder.fileCount}

## Red Flags (${folderInsights?.redFlags?.length || 0})
${(folderInsights?.redFlags || [])
  .map(
    (flag) => `
### ${flag.title} [${flag.severity.toUpperCase()}]
${flag.description}
`
  )
  .join('\n')}

## Missing Documents (${folderInsights?.missingDocuments?.length || 0})
${(folderInsights?.missingDocuments || []).map((doc) => `- ${doc.name}`).join('\n')}

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

  const handleOpenNewFolderModal = () => {
    setNewFolderName('');
    setShowNewFolderModal(true);
  };

  const handleCloseNewFolderModal = () => {
    setShowNewFolderModal(false);
    setNewFolderName('');
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      handleCloseNewFolderModal();
    }
  };

  const handleToggleInsightsPanel = () => {
    setInsightsPanelCollapsed((prev) => !prev);
  };

  // If no dealId, show the overview of all data rooms
  if (!dealId) {
    return <DataRoomsOverview onSelectDeal={(id) => setDealId(id)} />;
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: '#003366' }}></div>
          <p className="text-slate-500">Loading Data Room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 text-slate-900 flex h-full w-full overflow-hidden antialiased selection:bg-primary/20">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx"
        onChange={handleFileSelect}
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
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: '#E6EEF5' }}>
                  <span className="material-symbols-outlined text-primary">create_new_folder</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Create New Folder</h3>
              </div>
              <button
                onClick={handleCloseNewFolderModal}
                className="p-1 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>
            {/* Content */}
            <div className="p-5">
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Folder Name
              </label>
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeyDown}
                placeholder="e.g., Tax Documents, Contracts"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-slate-900 placeholder:text-slate-400"
              />
              <p className="mt-2 text-xs text-slate-400">
                The folder will be created in the current deal's data room.
              </p>
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 bg-slate-50/50">
              <button
                onClick={handleCloseNewFolderModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-5 py-2 text-sm font-medium text-white rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Sidebar (Folder Tree) */}
      <aside className="w-[280px] min-w-[280px] flex flex-col border-r border-slate-200 bg-white">
        <div className="p-5 border-b border-slate-200/50">
          {/* Back to all data rooms link */}
          <a
            href="/vdr.html"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-primary mb-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            All Data Rooms
          </a>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#003366' }}>{dealName}</span>
            {useMockData && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">Demo</span>
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900">Data Room</h2>
        </div>

        <FolderTree
          folders={folders}
          activeFolder={activeFolderId || ''}
          onFolderSelect={setActiveFolderId}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />

        {/* Bottom Action */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={handleOpenNewFolderModal}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Folder
          </button>
        </div>
      </aside>

      {/* 3. Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        {/* Top Header & Breadcrumbs */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <nav className="flex items-center gap-1.5 text-sm">
            <button
              onClick={() => history.back()}
              className="flex items-center justify-center size-7 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors mr-1"
              title="Go back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <a href="/crm.html" className="text-slate-400 hover:text-blue-600 transition-colors">Deals</a>
            <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
            <a href={`/deal.html?id=${dealId}`} className="text-slate-500 hover:text-blue-600 transition-colors truncate max-w-[150px]">{dealName || 'Deal'}</a>
            <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
            {activeFolder ? (
              <>
                <span className="text-slate-500">Data Room</span>
                <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                <span className="font-medium text-slate-900 truncate max-w-[150px]">{activeFolder.name}</span>
              </>
            ) : (
              <span className="font-medium text-slate-900">Data Room</span>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {/* Team Members Avatar Group */}
            <div
              className="flex -space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleOpenShareModal}
              title="Click to manage team access"
            >
              {teamMembers.length > 0 ? (
                <>
                  {teamMembers.slice(0, 3).map((member, idx) => {
                    const user = member.user;
                    return user?.avatar ? (
                      <img
                        key={member.id}
                        src={user.avatar}
                        alt={user.name}
                        title={`${user.name} (${member.role})`}
                        className="size-8 rounded-full border-2 border-white bg-slate-200 object-cover"
                        style={{ zIndex: 3 - idx }}
                      />
                    ) : (
                      <div
                        key={member.id}
                        className="flex size-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold"
                        style={{ backgroundColor: '#E6EEF5', color: '#003366', zIndex: 3 - idx }}
                        title={`${user?.name || 'Unknown'} (${member.role})`}
                      >
                        {getInitials(user?.name || '')}
                      </div>
                    );
                  })}
                  {teamMembers.length > 3 && (
                    <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-xs font-bold text-slate-600">
                      +{teamMembers.length - 3}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"
                  title="Add team members"
                >
                  <span className="material-symbols-outlined text-[16px]">group_add</span>
                </div>
              )}
            </div>
            <div className="h-4 w-px bg-slate-200 mx-2"></div>
            <button
              onClick={handleUploadClick}
              disabled={uploading || !activeFolderId}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  Upload Files
                </>
              )}
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
        {activeFolderId ? (
          <FileTable
            files={filteredFiles}
            folderName={activeFolder?.name || 'Folder'}
            onFileClick={handleFileClick}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onLinkToDeal={handleLinkToDeal}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">folder_open</span>
              <p className="text-slate-500">Select a folder to view files</p>
            </div>
          </div>
        )}
      </main>

      {/* 4. Quick Insights Panel (Right Sidebar) */}
      <InsightsPanel
        insights={activeFolderInsights || undefined}
        folderName={activeFolder?.name || ''}
        onGenerateReport={handleGenerateReport}
        onViewFile={handleViewFile}
        onRequestDocument={handleRequestDocument}
        isCollapsed={insightsPanelCollapsed}
        onToggleCollapse={handleToggleInsightsPanel}
      />

      {/* Upload Confirmation Modal */}
      {pendingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPendingFiles(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Upload {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''}
              </h3>
              <button onClick={() => setPendingFiles(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="p-5">
              <ul className="mb-4 space-y-1.5 max-h-40 overflow-y-auto">
                {pendingFiles.map((f, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-slate-400">description</span>
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </li>
                ))}
              </ul>
              {pendingFiles.some(f => f.type === 'application/pdf') && (
                <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={autoUpdateDeal}
                    onChange={(e) => setAutoUpdateDeal(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      Auto-update deal with extracted data
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Merge financial data (revenue, EBITDA, industry) from PDF into the deal card
                    </div>
                  </div>
                </label>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200">
              <button onClick={() => setPendingFiles(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={uploading}
                className="px-5 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link to Deal Modal */}
      {linkModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setLinkModalFile(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Link to Deal</h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">"{linkModalFile.name}"</p>
              </div>
              <button onClick={() => setLinkModalFile(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="p-5">
              <input
                type="text"
                placeholder="Search deals..."
                value={linkSearchQuery}
                onChange={(e) => setLinkSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                autoFocus
              />
              <ul className="max-h-60 overflow-y-auto space-y-1">
                {linkDeals
                  .filter(d => !linkSearchQuery || d.name.toLowerCase().includes(linkSearchQuery.toLowerCase()))
                  .map(deal => (
                    <li key={deal.id}>
                      <button
                        onClick={() => confirmLinkToDeal(deal.id)}
                        disabled={linking}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[20px] text-slate-400">business_center</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{deal.name}</div>
                          {deal.industry && <div className="text-xs text-slate-500">{deal.industry}</div>}
                        </div>
                      </button>
                    </li>
                  ))}
                {linkDeals.filter(d => !linkSearchQuery || d.name.toLowerCase().includes(linkSearchQuery.toLowerCase())).length === 0 && (
                  <li className="text-sm text-slate-400 text-center py-4">No deals found</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {uploadToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg animate-in slide-in-from-bottom-4">
          <span className="material-symbols-outlined text-green-400 text-xl">check_circle</span>
          <span className="text-sm">{uploadToast}</span>
          <button onClick={() => setUploadToast(null)} className="text-white/60 hover:text-white ml-2">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}
    </div>
  );
};
