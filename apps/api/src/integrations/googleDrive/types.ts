// Shape definitions for the slim Google Drive client used by
// the NDA send flow. We only need a handful of fields off each
// Drive API response — keep these focused.

export interface DriveFileResource {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface DrivePermissionResource {
  id?: string;
  type?: string;
  role?: string;
  emailAddress?: string;
}

export interface CreateDocResult {
  id: string;
  webViewLink: string;
}

export interface DocMetadataResult {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
}

export type GoogleDriveErrorCode =
  | 'DRIVE_API_ERROR'
  | 'INVALID_TOKEN'
  | 'PERMISSION_DENIED';

export class GoogleDriveError extends Error {
  code: GoogleDriveErrorCode;
  status?: number;
  details?: string;
  constructor(code: GoogleDriveErrorCode, message: string, status?: number, details?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
