/**
 * VDR API Service
 * Handles all API calls for the Virtual Data Room
 */

const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

// Get auth token from PEAuth if available (async because getAccessToken is async)
async function getAuthToken(): Promise<string | null> {
  try {
    const token = await (window as any).PEAuth?.getAccessToken?.();
    return token || null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Helper for authenticated fetch
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Redirect to login if unauthorized
    window.location.href = '/login.html';
    throw new Error('Unauthorized');
  }

  return response;
}

// API Types (matching backend)
export interface APIFolder {
  id: string;
  dealId: string;
  parentId: string | null;
  name: string;
  description?: string;
  isRestricted: boolean;
  sortOrder: number;
  fileCount?: number;
  createdAt: string;
  updatedAt: string;
  FolderInsight?: APIFolderInsight[];
}

export interface APIFolderInsight {
  id: string;
  folderId: string;
  summary: string;
  completionPercent: number;
  redFlags: any[];
  missingDocuments: any[];
  generatedAt: string;
}

export interface APIDocument {
  id: string;
  dealId: string;
  folderId?: string;
  name: string;
  type: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  extractedData?: any;
  aiAnalysis?: any;
  aiAnalyzedAt?: string;
  tags?: string[];
  isHighlighted?: boolean;
  uploadedBy?: string;
  uploader?: {
    id: string;
    fullName: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch folders for a deal
 */
export async function fetchFolders(dealId: string): Promise<APIFolder[]> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals/${dealId}/folders`);
    if (!response.ok) throw new Error('Failed to fetch folders');
    return await response.json();
  } catch (error) {
    console.error('Error fetching folders:', error);
    return [];
  }
}

/**
 * Fetch a single folder with its documents
 */
export async function fetchFolder(folderId: string): Promise<APIFolder | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/folders/${folderId}`);
    if (!response.ok) throw new Error('Failed to fetch folder');
    return await response.json();
  } catch (error) {
    console.error('Error fetching folder:', error);
    return null;
  }
}

/**
 * Create a new folder
 */
export async function createFolder(dealId: string, name: string, parentId?: string): Promise<APIFolder | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals/${dealId}/folders`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        parentId: parentId || null,
      }),
    });
    if (!response.ok) throw new Error('Failed to create folder');
    return await response.json();
  } catch (error) {
    console.error('Error creating folder:', error);
    return null;
  }
}

/**
 * Delete a folder
 */
export async function deleteFolder(folderId: string, cascade = false): Promise<boolean> {
  try {
    const response = await authFetch(
      `${API_BASE_URL}/folders/${folderId}${cascade ? '?cascade=true' : ''}`,
      { method: 'DELETE' }
    );
    return response.ok;
  } catch (error) {
    console.error('Error deleting folder:', error);
    return false;
  }
}

/**
 * Rename a folder
 */
export async function renameFolder(folderId: string, newName: string): Promise<boolean> {
  try {
    const response = await authFetch(`${API_BASE_URL}/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error renaming folder:', error);
    return false;
  }
}

/**
 * Fetch documents for a deal or folder
 */
export async function fetchDocuments(dealId: string, folderId?: string): Promise<APIDocument[]> {
  try {
    const url = folderId
      ? `${API_BASE_URL}/folders/${folderId}/documents`
      : `${API_BASE_URL}/deals/${dealId}/documents`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch documents');
    return await response.json();
  } catch (error) {
    console.error('Error fetching documents:', error);
    return [];
  }
}

/**
 * Upload a document to a folder
 */
export async function uploadDocument(
  dealId: string,
  folderId: string,
  file: File,
  options?: { autoUpdateDeal?: boolean }
): Promise<APIDocument & { dealUpdated?: boolean; updatedFields?: string[] } | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folderId', folderId);
    formData.append('type', 'OTHER');
    if (options?.autoUpdateDeal) {
      formData.append('autoUpdateDeal', 'true');
    }

    const token = await getAuthToken();
    const response = await fetch(`${API_BASE_URL}/deals/${dealId}/documents`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload document');
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

/**
 * Link (copy) a document to another deal
 */
export async function linkDocumentToDeal(
  documentId: string,
  targetDealId: string
): Promise<APIDocument | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/documents/${documentId}/link`, {
      method: 'POST',
      body: JSON.stringify({ targetDealId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to link document');
    }

    return await response.json();
  } catch (error) {
    console.error('Error linking document:', error);
    throw error;
  }
}

/**
 * Fetch all deals (for deal picker in link-to-deal modal)
 */
export async function fetchAllDeals(): Promise<Array<{ id: string; name: string; industry?: string; revenue?: number }>> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals?limit=100`);
    if (!response.ok) throw new Error('Failed to fetch deals');
    const data = await response.json();
    return Array.isArray(data) ? data : data.deals || [];
  } catch (error) {
    console.error('Error fetching deals:', error);
    return [];
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<boolean> {
  try {
    const response = await authFetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting document:', error);
    return false;
  }
}

/**
 * Rename a document
 */
export async function renameDocument(documentId: string, newName: string): Promise<boolean> {
  try {
    const response = await authFetch(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName }),
    });
    return response.ok;
  } catch (error) {
    console.error('Error renaming document:', error);
    return false;
  }
}

/**
 * Get download URL for a document
 */
export async function getDocumentDownloadUrl(documentId: string): Promise<string | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/documents/${documentId}/download`);
    if (!response.ok) throw new Error('Failed to get download URL');
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error getting download URL:', error);
    return null;
  }
}

/**
 * Fetch folder insights
 */
export async function fetchFolderInsights(folderId: string): Promise<APIFolderInsight | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/folders/${folderId}/insights`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch insights');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching folder insights:', error);
    return null;
  }
}

/**
 * Get deal info
 */
export async function fetchDeal(dealId: string): Promise<any | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals/${dealId}`);
    if (!response.ok) throw new Error('Failed to fetch deal');
    return await response.json();
  } catch (error) {
    console.error('Error fetching deal:', error);
    return null;
  }
}

/**
 * Create a new deal (for VDR without existing deal)
 */
export async function createDeal(name: string): Promise<any | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        companyName: name, // Use deal name as company name
        status: 'ACTIVE',
        stage: 'SCREENING',
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      // Check for permission error
      if (response.status === 403) {
        throw new Error('You need Associate role or higher to create data rooms. Contact your admin.');
      }
      throw new Error(errorData.error || 'Failed to create deal');
    }
    return await response.json();
  } catch (error) {
    console.error('Error creating deal:', error);
    throw error;
  }
}

/**
 * Initialize default folders for a deal (if none exist)
 */
export async function initializeDealFolders(dealId: string): Promise<{ created: boolean; folders: APIFolder[] }> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals/${dealId}/folders/init`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to initialize folders');
    return await response.json();
  } catch (error) {
    console.error('Error initializing folders:', error);
    return { created: false, folders: [] };
  }
}

/**
 * Transform API folder to VDR Folder type
 */
export function transformFolder(apiFolder: APIFolder): import('../types/vdr.types').Folder {
  const insight = apiFolder.FolderInsight?.[0];
  const completionPercent = insight?.completionPercent || 0;
  const hasRedFlags = (insight?.redFlags?.length || 0) > 0;

  let status: 'ready' | 'attention' | 'reviewing' | 'restricted' = 'reviewing';
  let statusLabel = 'Reviewing';
  let statusColor: 'green' | 'orange' | 'yellow' | 'slate' = 'yellow';

  if (apiFolder.isRestricted) {
    status = 'restricted';
    statusLabel = 'Access Restricted';
    statusColor = 'slate';
  } else if (completionPercent >= 80 && !hasRedFlags) {
    status = 'ready';
    statusLabel = `${completionPercent}% Ready`;
    statusColor = 'green';
  } else if (hasRedFlags) {
    status = 'attention';
    statusLabel = 'Attention';
    statusColor = 'orange';
  }

  return {
    id: apiFolder.id,
    name: apiFolder.name,
    status,
    readinessPercent: completionPercent,
    fileCount: apiFolder.fileCount || 0,
    statusLabel,
    statusColor,
    isRestricted: apiFolder.isRestricted,
  };
}

/**
 * Transform API document to VDR File type
 */
export function transformDocument(apiDoc: APIDocument): import('../types/vdr.types').VDRFile {
  // Determine file type from mime type or name
  let fileType: 'excel' | 'pdf' | 'doc' | 'other' = 'other';
  const mimeType = apiDoc.mimeType || '';
  const name = apiDoc.name.toLowerCase();

  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    fileType = 'excel';
  } else if (mimeType.includes('pdf') || name.endsWith('.pdf')) {
    fileType = 'pdf';
  } else if (mimeType.includes('word') || mimeType.includes('document') || name.endsWith('.doc') || name.endsWith('.docx')) {
    fileType = 'doc';
  }

  // Format file size
  let sizeStr = '0 KB';
  if (apiDoc.fileSize) {
    if (apiDoc.fileSize >= 1024 * 1024) {
      sizeStr = `${(apiDoc.fileSize / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      sizeStr = `${Math.round(apiDoc.fileSize / 1024)} KB`;
    }
  }

  // Determine analysis info
  let analysisType: 'key-insight' | 'warning' | 'standard' | 'complete' = 'standard';
  let analysisLabel = 'Pending Analysis';
  let analysisDescription = 'Document awaiting AI analysis.';
  let analysisColor: 'primary' | 'orange' | 'slate' = 'slate';

  if (apiDoc.aiAnalysis) {
    const ai = apiDoc.aiAnalysis;
    if (ai.type === 'warning' || ai.hasRisks) {
      analysisType = 'warning';
      analysisLabel = ai.label || 'Warning';
      analysisDescription = ai.description || 'This document contains items requiring attention.';
      analysisColor = 'orange';
    } else if (ai.type === 'key-insight' || ai.keyInsight) {
      analysisType = 'key-insight';
      analysisLabel = ai.label || 'Key Insight';
      analysisDescription = ai.description || ai.keyInsight || 'Important information identified.';
      analysisColor = 'primary';
    } else {
      analysisType = 'complete';
      analysisLabel = 'Analysis Complete';
      analysisDescription = ai.description || ai.summary || 'Document analyzed successfully.';
      analysisColor = 'primary';
    }
  } else if (apiDoc.aiAnalyzedAt) {
    analysisType = 'complete';
    analysisLabel = 'Analysis Complete';
    analysisDescription = 'Document has been analyzed.';
    analysisColor = 'primary';
  }

  return {
    id: apiDoc.id,
    name: apiDoc.name,
    size: sizeStr,
    type: fileType,
    analysis: {
      type: analysisType,
      label: analysisLabel,
      description: analysisDescription,
      color: analysisColor,
    },
    author: {
      name: apiDoc.uploader?.fullName || 'Unknown',
      avatar: apiDoc.uploader?.avatar || 'https://via.placeholder.com/40',
    },
    date: new Date(apiDoc.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    folderId: apiDoc.folderId || '',
    isHighlighted: apiDoc.isHighlighted,
    tags: apiDoc.tags || [],
  };
}

/**
 * Transform API folder insight to VDR FolderInsights type
 */
export function transformInsights(apiInsight: APIFolderInsight | null, folderId: string): import('../types/vdr.types').FolderInsights {
  if (!apiInsight) {
    return {
      folderId,
      summary: 'No insights available for this folder yet.',
      completionPercent: 0,
      redFlags: [],
      missingDocuments: [],
    };
  }

  return {
    folderId: apiInsight.folderId,
    summary: apiInsight.summary || 'No summary available.',
    completionPercent: apiInsight.completionPercent || 0,
    redFlags: (apiInsight.redFlags || []).map((rf: any, idx: number) => ({
      id: rf.id || `rf-${idx}`,
      severity: rf.severity || 'medium',
      title: rf.title || 'Unknown Issue',
      description: rf.description || '',
      fileId: rf.fileId,
      color: rf.severity === 'high' ? 'red' : 'orange',
    })),
    missingDocuments: (apiInsight.missingDocuments || []).map((md: any, idx: number) => ({
      id: md.id || `md-${idx}`,
      name: md.name || 'Unknown Document',
    })),
  };
}

/**
 * Generate AI insights for a folder (calls GPT-4o)
 */
export async function generateInsights(folderId: string): Promise<APIFolderInsight | null> {
  try {
    const response = await authFetch(`${API_BASE_URL}/folders/${folderId}/generate-insights`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate insights');
    }
    return await response.json();
  } catch (error) {
    console.error('Error generating insights:', error);
    throw error;
  }
}

/**
 * Request a missing document (sends email + in-app notification to team)
 */
export async function requestDocument(
  dealId: string,
  documentName: string,
  options?: { folderId?: string; folderName?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await authFetch(`${API_BASE_URL}/deals/${dealId}/document-requests`, {
      method: 'POST',
      body: JSON.stringify({
        documentName,
        folderId: options?.folderId,
        folderName: options?.folderName,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send request');
    }
    return await response.json();
  } catch (error) {
    console.error('Error requesting document:', error);
    throw error;
  }
}
