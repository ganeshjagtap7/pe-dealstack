// Google Drive + Docs HTTP client. Mirrors googleCalendar/client.ts —
// no SDK dependency, just fetch against the v3 / v1 REST surfaces. We
// scope-share the OAuth client creds with googleCalendar.

import { log } from '../../utils/logger.js';
import type {
  DriveFile,
  DriveFileListResponse,
  DocsBatchUpdateRequest,
  GoogleDriveUserInfo,
} from './types.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DOCS_BASE = 'https://docs.googleapis.com/v1';

// drive.file gives us per-file scope (only files we create/open with the
// picker), which is the least-privilege option for an NDA library that
// only touches docs it creates itself. documents lets us run the Docs
// batchUpdate replaceAllText pipeline for placeholder substitution.
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const DOC_MIME = 'application/vnd.google-apps.document';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function googleClientCreds(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  }
  return { id, secret };
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export function buildAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const { id } = googleClientCreds();
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('client_id', id);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', (params.scopes ?? DRIVE_SCOPES).join(' '));
  u.searchParams.set('state', params.state);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  return u.toString();
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const { id, secret } = googleClientCreds();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Drive token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const { id, secret } = googleClientCreds();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Drive token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function getUserInfo(accessToken: string): Promise<GoogleDriveUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Drive userinfo failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleDriveUserInfo;
}

// ============================================================
// Files API
// ============================================================

export interface CopyDocResult {
  id: string;
  webViewLink: string;
}

export async function copyDoc(
  accessToken: string,
  srcDocId: string,
  dstFolderId: string | null,
  name: string,
): Promise<CopyDocResult> {
  // supportsAllDrives covers the Shared Drive case so Workspace customers
  // who set a Shared Drive folderId on the org work without surprises.
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(srcDocId)}/copy`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,webViewLink,name,parents');
  const body: Record<string, unknown> = { name };
  if (dstFolderId) body.parents = [dstFolderId];
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Drive copyDoc failed: ${res.status} ${await res.text()}`);
  }
  const file = (await res.json()) as DriveFile;
  return {
    id: file.id,
    webViewLink: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
  };
}

export async function createBlankDoc(
  accessToken: string,
  dstFolderId: string | null,
  name: string,
): Promise<CopyDocResult> {
  const url = new URL(`${DRIVE_BASE}/files`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,webViewLink,name,parents');
  const body: Record<string, unknown> = {
    name,
    mimeType: DOC_MIME,
  };
  if (dstFolderId) body.parents = [dstFolderId];
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Drive createBlankDoc failed: ${res.status} ${await res.text()}`);
  }
  const file = (await res.json()) as DriveFile;
  return {
    id: file.id,
    webViewLink: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
  };
}

export async function batchUpdateDocPlaceholders(
  accessToken: string,
  docId: string,
  replacements: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(replacements).filter(([key]) => key.length > 0);
  if (entries.length === 0) return;
  const payload: DocsBatchUpdateRequest = {
    requests: entries.map(([find, value]) => ({
      replaceAllText: {
        containsText: { text: find, matchCase: true },
        replaceText: value,
      },
    })),
  };
  const url = `${DOCS_BASE}/documents/${encodeURIComponent(docId)}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      `Docs batchUpdate failed: ${res.status} ${await res.text()}`,
    );
  }
}

export async function addPermission(
  accessToken: string,
  fileId: string,
  emailAddress: string,
  role: 'reader' | 'commenter' | 'writer' = 'writer',
): Promise<void> {
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/permissions`);
  url.searchParams.set('supportsAllDrives', 'true');
  // sendNotificationEmail=false avoids spamming the team with one email
  // per doc; the UI surfaces the link.
  url.searchParams.set('sendNotificationEmail', 'false');
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'user', role, emailAddress }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      `Drive addPermission failed for ${emailAddress}: ${res.status} ${await res.text()}`,
    );
  }
}

export async function trashFile(accessToken: string, fileId: string): Promise<void> {
  // Trash rather than hard-delete — leaves a 30-day recovery window in
  // case the cleanup was triggered by a transient DB error.
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('supportsAllDrives', 'true');
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trashed: true }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Drive trashFile failed: ${res.status} ${await res.text()}`);
  }
}

export async function ensureFolderExists(
  accessToken: string,
  parentId: string | 'root',
  folderName: string,
): Promise<{ id: string }> {
  // Look for an existing non-trashed folder with this name under the
  // parent before creating a new one — repeat onboarding should be a
  // no-op, not a graveyard of duplicate "Legal Docs" folders.
  const escapedName = folderName.replace(/'/g, "\\'");
  const q =
    `mimeType = '${FOLDER_MIME}' and ` +
    `name = '${escapedName}' and ` +
    `'${parentId}' in parents and trashed = false`;
  const listUrl = new URL(`${DRIVE_BASE}/files`);
  listUrl.searchParams.set('q', q);
  listUrl.searchParams.set('fields', 'files(id,name,parents)');
  listUrl.searchParams.set('supportsAllDrives', 'true');
  listUrl.searchParams.set('includeItemsFromAllDrives', 'true');
  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    throw new Error(
      `Drive ensureFolderExists list failed: ${listRes.status} ${await listRes.text()}`,
    );
  }
  const list = (await listRes.json()) as DriveFileListResponse;
  if (list.files && list.files.length > 0 && list.files[0].id) {
    return { id: list.files[0].id };
  }
  // Create
  const createUrl = new URL(`${DRIVE_BASE}/files`);
  createUrl.searchParams.set('fields', 'id');
  createUrl.searchParams.set('supportsAllDrives', 'true');
  const body: Record<string, unknown> = {
    name: folderName,
    mimeType: FOLDER_MIME,
  };
  if (parentId !== 'root') body.parents = [parentId];
  const createRes = await fetch(createUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!createRes.ok) {
    throw new Error(
      `Drive ensureFolderExists create failed: ${createRes.status} ${await createRes.text()}`,
    );
  }
  const created = (await createRes.json()) as DriveFile;
  if (!created.id) {
    throw new Error('Drive ensureFolderExists: created folder missing id');
  }
  log.debug('googleDrive: provisioned folder', { parentId, folderName, id: created.id });
  return { id: created.id };
}

export async function validateFolder(
  accessToken: string,
  folderId: string,
): Promise<{ id: string; name: string }> {
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set('fields', 'id,name,mimeType,trashed');
  url.searchParams.set('supportsAllDrives', 'true');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Drive validateFolder failed: ${res.status} ${await res.text()}`);
  }
  const file = (await res.json()) as DriveFile;
  if (file.trashed) throw new Error('Drive validateFolder: folder is trashed');
  if (file.mimeType !== FOLDER_MIME) {
    throw new Error(`Drive validateFolder: not a folder (mimeType=${file.mimeType ?? 'unknown'})`);
  }
  return { id: file.id, name: file.name ?? '' };
}

export async function getFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<{ id: string; name: string; modifiedTime: string | null; webViewLink: string | null }> {
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', 'id,name,modifiedTime,webViewLink');
  url.searchParams.set('supportsAllDrives', 'true');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Drive getFileMetadata failed: ${res.status} ${await res.text()}`);
  }
  const file = (await res.json()) as DriveFile;
  return {
    id: file.id,
    name: file.name ?? '',
    modifiedTime: file.modifiedTime ?? null,
    webViewLink: file.webViewLink ?? null,
  };
}
