import { log } from '../../utils/logger.js';
import type {
  GmailListMessagesResponse,
  GmailMessage,
  GmailTokenResponse,
  GmailUserInfo,
} from './types.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function googleClientCreds(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured');
  return { id, secret };
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
  u.searchParams.set('scope', (params.scopes ?? GMAIL_SCOPES).join(' '));
  u.searchParams.set('state', params.state);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GmailTokenResponse> {
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
    const text = await res.text();
    throw new Error(`Gmail token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GmailTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<GmailTokenResponse> {
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
    const text = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GmailTokenResponse;
}

export async function getUserInfo(accessToken: string): Promise<GmailUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail userinfo failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GmailUserInfo;
}

export async function listMessagesSince(
  accessToken: string,
  since: Date,
  knownEmails: string[]
): Promise<{ id: string; threadId: string }[]> {
  if (knownEmails.length === 0) return [];
  const afterUnix = Math.floor(since.getTime() / 1000);
  const orClause = knownEmails
    .map(e => `from:${e} OR to:${e} OR cc:${e}`)
    .join(' OR ');
  const q = `after:${afterUnix} (${orClause})`;

  const out: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  const MAX_PAGES = 20;
  do {
    const params = new URLSearchParams({ q, maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `${GMAIL_BASE}/messages?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail listMessages failed: ${res.status} ${text}`);
    }
    const page = (await res.json()) as GmailListMessagesResponse;
    if (page.messages) out.push(...page.messages);
    pageToken = page.nextPageToken;
    pageCount++;
    if (pageCount >= MAX_PAGES) {
      log.warn('gmail: listMessagesSince hit MAX_PAGES, stopping early', { pageCount });
      break;
    }
  } while (pageToken);
  return out;
}

export async function getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const url = `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail getMessage failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GmailMessage;
}
