// Subset of Drive / Docs API response shapes that the NDA library
// touches. Keep this narrow — only the fields we actually read.

export interface GoogleDriveUserInfo {
  email: string;
  name?: string;
  verified_email?: boolean;
}

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
}

export interface DriveFileListResponse {
  files?: DriveFile[];
  nextPageToken?: string;
}

export interface DrivePermission {
  id?: string;
  type?: 'user' | 'group' | 'domain' | 'anyone';
  role?: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
}

// Docs API batchUpdate request — minimal request type used here.
export interface DocsReplaceAllTextRequest {
  replaceAllText: {
    containsText: { text: string; matchCase: boolean };
    replaceText: string;
  };
}

export interface DocsBatchUpdateRequest {
  requests: DocsReplaceAllTextRequest[];
}
