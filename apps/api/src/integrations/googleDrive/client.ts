// ─── Google Drive client (lightweight, NDA-focused) ─────────
// No OAuth flow lives here — access tokens come from
// `googleAuthService.getUserGoogleAccessToken(userId)`, fed by
// the Supabase Google sign-in session.
//
// Used directly by `legalDocSendService` to:
//   1. Create a Google Doc from a LegalDocument's HTML content
//   2. Grant the counterparty `writer` access on that Doc
//
// We are deliberately NOT registering this with the integrations
// platform — there's no "Connect Google Drive" UX anymore.
// ─────────────────────────────────────────────────────────────

import { log } from '../../utils/logger.js';
import {
  GoogleDriveError,
  type CreateDocResult,
  type DocMetadataResult,
  type DriveFileResource,
} from './types.js';

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

function buildBoundary(): string {
  return `pe-dealstack-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function mapHttpError(status: number, body: string): GoogleDriveError {
  if (status === 401) {
    return new GoogleDriveError('INVALID_TOKEN', 'Google rejected the access token', status, body);
  }
  if (status === 403) {
    return new GoogleDriveError('PERMISSION_DENIED', 'Google denied permission', status, body);
  }
  return new GoogleDriveError('DRIVE_API_ERROR', `Drive API call failed (${status})`, status, body);
}

/**
 * Creates a Google Doc by POSTing HTML content as a multipart upload
 * with `mimeType: 'application/vnd.google-apps.document'` — Drive
 * auto-converts the body to a native Google Doc.
 */
export async function createDocFromHtml(
  accessToken: string,
  name: string,
  html: string,
  folderId?: string,
): Promise<CreateDocResult> {
  const boundary = buildBoundary();
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.document',
  };
  if (folderId) metadata.parents = [folderId];

  // RFC 2046 multipart/related body. Two parts:
  //   1. application/json — the file metadata
  //   2. text/html        — the file body
  const parts = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`,
    '',
  ];
  const body = parts.join('\r\n');

  const url = `${UPLOAD_BASE}?uploadType=multipart&fields=id,webViewLink`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('googleDrive.createDocFromHtml: fetch failed', err);
    throw new GoogleDriveError('DRIVE_API_ERROR', 'Drive upload network error', undefined, message);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error('googleDrive.createDocFromHtml: bad response', { status: res.status, body: text });
    throw mapHttpError(res.status, text);
  }

  const json = (await res.json()) as Partial<DriveFileResource>;
  if (!json.id || !json.webViewLink) {
    throw new GoogleDriveError(
      'DRIVE_API_ERROR',
      'Drive response missing id/webViewLink',
      res.status,
      JSON.stringify(json),
    );
  }
  return { id: json.id, webViewLink: json.webViewLink };
}

/**
 * Grants a permission on the file. We disable Drive's own
 * notification email (`sendNotificationEmail=false`) because we
 * send the cover email via Resend ourselves.
 */
export async function setDocPermission(
  accessToken: string,
  fileId: string,
  emailAddress: string,
  role: 'writer' | 'commenter' | 'reader',
): Promise<void> {
  const url = `${DRIVE_BASE}/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'user', role, emailAddress }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('googleDrive.setDocPermission: fetch failed', err);
    throw new GoogleDriveError(
      'DRIVE_API_ERROR',
      'Drive permission network error',
      undefined,
      message,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error('googleDrive.setDocPermission: bad response', {
      status: res.status,
      body: text,
      fileId,
    });
    throw mapHttpError(res.status, text);
  }
}

/**
 * Future-use: fetch a Doc's current metadata (e.g. for re-syncing
 * counterparty edits). Out of scope for the send flow but included
 * so the rest of the app can call it without a second client file.
 */
export async function getDocMetadata(
  accessToken: string,
  fileId: string,
): Promise<DocMetadataResult> {
  const url = `${DRIVE_BASE}/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,webViewLink`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('googleDrive.getDocMetadata: fetch failed', err);
    throw new GoogleDriveError(
      'DRIVE_API_ERROR',
      'Drive metadata network error',
      undefined,
      message,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw mapHttpError(res.status, text);
  }

  const json = (await res.json()) as Partial<DriveFileResource>;
  if (!json.id || !json.name || !json.modifiedTime || !json.webViewLink) {
    throw new GoogleDriveError(
      'DRIVE_API_ERROR',
      'Drive metadata response missing fields',
      res.status,
      JSON.stringify(json),
    );
  }
  return {
    id: json.id,
    name: json.name,
    modifiedTime: json.modifiedTime,
    webViewLink: json.webViewLink,
  };
}

export { GoogleDriveError } from './types.js';
