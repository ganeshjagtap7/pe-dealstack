// Google Drive provider — auth + token storage only. We don't run a
// sync engine pass on Drive (no IntegrationActivity rows); the provider
// exists so the platform-wide /api/integrations/google_drive/connect
// flow works and so legalDocService can pull a fresh access token.

import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import {
  encryptForStorage,
  decryptFromStorage,
  saveTokens,
} from '../_platform/tokenStore.js';
import { signState, verifyState } from '../_platform/oauth.js';
import type {
  Integration,
  IntegrationProvider,
  InitiateAuthResult,
  SyncResult,
} from '../_platform/types.js';
import {
  DRIVE_SCOPES,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  getUserInfo,
  ensureFolderExists,
} from './client.js';

const TOKEN_REFRESH_SAFETY_MS = 60 * 1000;

function redirectUri(): string {
  const base = process.env.APP_URL ?? 'http://localhost:3001';
  return `${base}/api/integrations/oauth/google_drive/callback`;
}

export async function ensureFreshAccessToken(integration: Integration): Promise<string> {
  const access = decryptFromStorage(integration.accessTokenEncrypted);
  const refresh = decryptFromStorage(integration.refreshTokenEncrypted);
  if (!access) throw new Error('Drive: no access token stored');

  const expiresAt = integration.tokenExpiresAt
    ? Date.parse(integration.tokenExpiresAt)
    : 0;
  if (!expiresAt || expiresAt - Date.now() > TOKEN_REFRESH_SAFETY_MS) return access;
  if (!refresh) throw new Error('Drive: access token expired and no refresh token stored');
  const refreshed = await refreshAccessToken(refresh);
  await saveTokens({
    integrationId: integration.id,
    accessToken: refreshed.access_token,
    refreshToken: refresh,
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}

// Lookup helper used by callers (legalDocService) — we don't want to
// expose 'Integration' table queries to those callers directly.
export async function findUserDriveIntegration(
  userId: string,
  organizationId: string,
): Promise<Integration | null> {
  const { data } = await supabase
    .from('Integration')
    .select('*')
    .eq('userId', userId)
    .eq('organizationId', organizationId)
    .eq('provider', 'google_drive')
    .eq('status', 'connected')
    .maybeSingle();
  return (data as Integration | null) ?? null;
}

async function autoProvisionOrgFolder(params: {
  accessToken: string;
  organizationId: string;
}): Promise<void> {
  const { accessToken, organizationId } = params;
  // Skip provisioning if the org already has a Shared Drive folder
  // pinned by an admin — that path is the Workspace-blessed one and
  // we should never overwrite it.
  const { data: org } = await supabase
    .from('Organization')
    .select('id, name, googleDriveFolderId, googleDriveTemplatesFolderId')
    .eq('id', organizationId)
    .single();
  if (!org) return;

  let folderId = org.googleDriveFolderId as string | null;
  let templatesFolderId = org.googleDriveTemplatesFolderId as string | null;
  if (folderId && templatesFolderId) return;

  const orgName = (org.name as string | undefined) ?? 'Workspace';

  try {
    if (!folderId) {
      const root = await ensureFolderExists(accessToken, 'root', `${orgName} — Legal Docs`);
      folderId = root.id;
    }
    if (!templatesFolderId) {
      const templates = await ensureFolderExists(accessToken, folderId, 'Templates');
      templatesFolderId = templates.id;
    }
    await supabase
      .from('Organization')
      .update({
        googleDriveFolderId: folderId,
        googleDriveTemplatesFolderId: templatesFolderId,
      })
      .eq('id', organizationId);
    log.info('googleDrive: auto-provisioned org folders', {
      organizationId,
      folderId,
      templatesFolderId,
    });
  } catch (err) {
    // Best-effort — the admin can paste a Shared Drive ID later.
    log.warn('googleDrive: auto-provisioning org folders failed', {
      organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export const googleDriveProvider: IntegrationProvider = {
  id: 'google_drive',
  displayName: 'Google Drive',
  scopes: DRIVE_SCOPES,

  async initiateAuth(userId, organizationId): Promise<InitiateAuthResult> {
    const state = signState({ userId, organizationId, provider: 'google_drive' });
    const authUrl = buildAuthorizeUrl({
      redirectUri: redirectUri(),
      state,
      scopes: DRIVE_SCOPES,
    });
    return { mode: 'oauth', authUrl, state };
  },

  async handleCallback({ code, state }): Promise<Integration> {
    const claims = verifyState(state);
    if (claims.provider !== 'google_drive') {
      throw new Error('Drive callback: state provider mismatch');
    }
    const tokens = await exchangeCode(code, redirectUri());
    const userInfo = await getUserInfo(tokens.access_token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { data: existing } = await supabase
      .from('Integration')
      .select('id')
      .eq('userId', claims.userId)
      .eq('provider', 'google_drive')
      .maybeSingle();

    const baseRow = {
      organizationId: claims.organizationId,
      userId: claims.userId,
      provider: 'google_drive' as const,
      status: 'connected' as const,
      externalAccountId: userInfo.email,
      externalAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptForStorage(tokens.access_token),
      refreshTokenEncrypted: encryptForStorage(tokens.refresh_token ?? null),
      tokenExpiresAt: expiresAt,
      scopes: DRIVE_SCOPES,
      settings: { displayName: userInfo.name ?? null },
      lastSyncAt: null,
      lastSyncError: null,
      consecutiveFailures: 0,
      updatedAt: now,
    };

    let integration: Integration;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('Integration')
        .update(baseRow)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) throw new Error(`Drive callback failed: ${error?.message}`);
      integration = data as Integration;
    } else {
      const { data, error } = await supabase
        .from('Integration')
        .insert({ ...baseRow, createdAt: now })
        .select('*')
        .single();
      if (error || !data) throw new Error(`Drive callback failed: ${error?.message}`);
      integration = data as Integration;
    }

    // First-connect provisioning (best-effort, errors logged not thrown).
    await autoProvisionOrgFolder({
      accessToken: tokens.access_token,
      organizationId: claims.organizationId,
    });

    return integration;
  },

  async sync(): Promise<SyncResult> {
    // Drive is not synced into IntegrationActivity — the NDA library
    // pulls data on demand. Return a no-op result so the platform-wide
    // sync engine doesn't error if it ever schedules us.
    return { itemsSynced: 0, itemsMatched: 0, errors: [] };
  },

  async handleWebhook(): Promise<void> {
    // No push notifications wired yet.
  },

  async disconnect(): Promise<void> {
    // Token revocation is best-effort and not wired here; the route
    // layer flips status to 'revoked'.
  },
};
