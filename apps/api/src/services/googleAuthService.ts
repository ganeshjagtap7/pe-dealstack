// ─── googleAuthService ───────────────────────────────────────
// Per-user Google OAuth token store (table: UserGoogleAuth).
//
// Supabase's `signInWithOAuth({ provider: 'google' })` returns
// the Google access + refresh tokens on the session, but does NOT
// auto-refresh `provider_token` once it expires. So we stash the
// tokens here on each fresh login and refresh on demand.
//
// Trust model: the caller (an auth-middleware-guarded route) is
// responsible for passing the right userId. This service does no
// org-scope check; it trusts the input.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_SAFETY_SECONDS = 60;

export type GoogleAuthErrorCode = 'NOT_CONNECTED' | 'REFRESH_FAILED' | 'NO_CREDENTIALS';

export class GoogleAuthError extends Error {
  code: GoogleAuthErrorCode;
  details?: string;
  constructor(code: GoogleAuthErrorCode, details?: string) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export interface UpsertGoogleTokensInput {
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds until access token expiry, as returned by Google / Supabase session. */
  expiresIn: number;
  /** Space-separated scope list, as returned by Supabase session. */
  scopes: string;
}

interface UserGoogleAuthRow {
  userId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  scopes: string;
  createdAt?: string;
  updatedAt?: string;
}

function googleClientCreds(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new GoogleAuthError(
      'NO_CREDENTIALS',
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured',
    );
  }
  return { id, secret };
}

function computeExpiresAtIso(expiresInSeconds: number): string {
  const ms = Math.max(0, (expiresInSeconds - REFRESH_SAFETY_SECONDS)) * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export async function upsertUserGoogleTokens(input: UpsertGoogleTokensInput): Promise<void> {
  const now = new Date().toISOString();
  const row: UserGoogleAuthRow = {
    userId: input.userId,
    googleEmail: input.googleEmail,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessTokenExpiresAt: computeExpiresAtIso(input.expiresIn),
    scopes: input.scopes,
    updatedAt: now,
  };
  const { error } = await supabase
    .from('UserGoogleAuth')
    .upsert({ ...row, createdAt: now }, { onConflict: 'userId' });
  if (error) {
    log.error('googleAuthService: upsert failed', error, { userId: input.userId });
    throw new GoogleAuthError('REFRESH_FAILED', `Failed to persist tokens: ${error.message}`);
  }
}

async function loadRow(userId: string): Promise<UserGoogleAuthRow | null> {
  const { data, error } = await supabase
    .from('UserGoogleAuth')
    .select('userId, googleEmail, accessToken, refreshToken, accessTokenExpiresAt, scopes')
    .eq('userId', userId)
    .maybeSingle();
  if (error) {
    log.warn('googleAuthService: loadRow error', error as any);
    throw new GoogleAuthError('REFRESH_FAILED', `Failed to load tokens: ${error.message}`);
  }
  return (data as UserGoogleAuthRow | null) ?? null;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
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
    const text = await res.text().catch(() => '');
    throw new GoogleAuthError('REFRESH_FAILED', `${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Returns a non-expired Google access token for the given Supabase user id.
 * Refreshes via Google's token endpoint when expired and persists the new
 * token. Throws `GoogleAuthError('NOT_CONNECTED')` if no row exists for
 * the user, or `GoogleAuthError('REFRESH_FAILED', details)` if the refresh
 * call fails.
 */
export async function getUserGoogleAccessToken(userId: string): Promise<string> {
  const row = await loadRow(userId);
  if (!row) throw new GoogleAuthError('NOT_CONNECTED');

  const expiresAt = Date.parse(row.accessTokenExpiresAt);
  if (!Number.isFinite(expiresAt)) {
    throw new GoogleAuthError('REFRESH_FAILED', 'stored accessTokenExpiresAt is not parseable');
  }
  if (expiresAt > Date.now()) {
    return row.accessToken;
  }

  // Token expired — refresh via Google.
  let refreshed: GoogleTokenResponse;
  try {
    refreshed = await refreshAccessToken(row.refreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    throw new GoogleAuthError(
      'REFRESH_FAILED',
      err instanceof Error ? err.message : String(err),
    );
  }

  const newExpiresAt = computeExpiresAtIso(refreshed.expires_in);
  const { error: updateErr } = await supabase
    .from('UserGoogleAuth')
    .update({
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: newExpiresAt,
      // Google occasionally returns an updated refresh_token; persist if so.
      refreshToken: refreshed.refresh_token ?? row.refreshToken,
      updatedAt: new Date().toISOString(),
    })
    .eq('userId', userId);
  if (updateErr) {
    log.warn('googleAuthService: failed to persist refreshed token', updateErr as any);
    // Still return the freshly minted token to the caller — the next
    // call will just refresh again if the persist failed transiently.
  }

  return refreshed.access_token;
}
