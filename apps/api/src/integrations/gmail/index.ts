import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import {
  encryptForStorage,
  decryptFromStorage,
  saveTokens,
} from '../_platform/tokenStore.js';
import { matchEmailAddressesToDeals } from '../_platform/matcher.js';
import { signState, verifyState } from '../_platform/oauth.js';
import type {
  Integration,
  IntegrationProvider,
  InitiateAuthResult,
  SyncOptions,
  SyncResult,
} from '../_platform/types.js';
import {
  GMAIL_SCOPES,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  getUserInfo,
  listMessagesSince,
  getMessage,
} from './client.js';
import { gmailMessageToIntegrationActivity, extractAddressEmails } from './mapper.js';

const DEFAULT_BACKFILL_DAYS = 90;
const TOKEN_REFRESH_SAFETY_MS = 60 * 1000;

function redirectUri(): string {
  const base = process.env.APP_URL ?? 'http://localhost:3001';
  return `${base}/api/integrations/oauth/gmail/callback`;
}

async function getOrgContactEmails(organizationId: string): Promise<string[]> {
  const { data } = await supabase
    .from('Contact')
    .select('email')
    .eq('organizationId', organizationId);
  return Array.from(
    new Set(
      (data ?? [])
        .map((r: { email: string | null }) => r.email?.trim().toLowerCase())
        .filter((e): e is string => !!e)
    )
  );
}

async function ensureFreshAccessToken(integration: Integration): Promise<string> {
  const access = decryptFromStorage(integration.accessTokenEncrypted);
  const refresh = decryptFromStorage(integration.refreshTokenEncrypted);
  if (!access) throw new Error('Gmail: no access token stored');

  const expiresAt = integration.tokenExpiresAt
    ? Date.parse(integration.tokenExpiresAt)
    : 0;
  const now = Date.now();
  if (!expiresAt || expiresAt - now > TOKEN_REFRESH_SAFETY_MS) {
    return access;
  }
  if (!refresh) {
    throw new Error('Gmail: access token expired and no refresh token stored');
  }
  const refreshed = await refreshAccessToken(refresh);
  await saveTokens({
    integrationId: integration.id,
    accessToken: refreshed.access_token,
    refreshToken: refresh,  // Google sometimes omits refresh_token on refresh; keep the original
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}

export const gmailProvider: IntegrationProvider = {
  id: 'gmail',
  displayName: 'Gmail',
  scopes: GMAIL_SCOPES,

  async initiateAuth(userId, organizationId): Promise<InitiateAuthResult> {
    const state = signState({ userId, organizationId, provider: 'gmail' });
    const authUrl = buildAuthorizeUrl({
      redirectUri: redirectUri(),
      state,
      scopes: GMAIL_SCOPES,
    });
    return { mode: 'oauth', authUrl, state };
  },

  async handleCallback({ code, state }): Promise<Integration> {
    const claims = verifyState(state);
    if (claims.provider !== 'gmail') {
      throw new Error('Gmail callback: state provider mismatch');
    }
    const tokens = await exchangeCode(code, redirectUri());
    const userInfo = await getUserInfo(tokens.access_token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { data: existing } = await supabase
      .from('Integration')
      .select('id')
      .eq('userId', claims.userId)
      .eq('provider', 'gmail')
      .maybeSingle();

    const baseRow = {
      organizationId: claims.organizationId,
      userId: claims.userId,
      provider: 'gmail' as const,
      status: 'connected' as const,
      externalAccountId: userInfo.email,
      externalAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptForStorage(tokens.access_token),
      refreshTokenEncrypted: encryptForStorage(tokens.refresh_token ?? null),
      tokenExpiresAt: expiresAt,
      scopes: GMAIL_SCOPES,
      settings: { displayName: userInfo.name ?? null },
      lastSyncAt: null,
      lastSyncError: null,
      consecutiveFailures: 0,
      updatedAt: now,
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('Integration')
        .update(baseRow)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) throw new Error(`Gmail callback failed: ${error?.message ?? 'no row'}`);
      return data as Integration;
    }
    const { data, error } = await supabase
      .from('Integration')
      .insert({ ...baseRow, createdAt: now })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Gmail callback failed: ${error?.message ?? 'no row'}`);
    return data as Integration;
  },

  async sync(integration, options: SyncOptions): Promise<SyncResult> {
    const accessToken = await ensureFreshAccessToken(integration);

    const knownEmails = await getOrgContactEmails(integration.organizationId);
    if (knownEmails.length === 0) {
      return { itemsSynced: 0, itemsMatched: 0, errors: [] };
    }

    const since =
      options.since ??
      (integration.lastSyncAt ? new Date(integration.lastSyncAt) : new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000));

    const headers = await listMessagesSince(accessToken, since, knownEmails);
    let itemsMatched = 0;
    const errors: string[] = [];

    for (const m of headers) {
      try {
        const full = await getMessage(accessToken, m.id);
        const emails = extractAddressEmails(full);
        const match = await matchEmailAddressesToDeals({
          organizationId: integration.organizationId,
          emails,
        });
        if (match.matchedDealIds.length === 0 && match.matchedContactIds.length === 0) {
          continue;
        }
        const row = gmailMessageToIntegrationActivity({
          message: full,
          integrationId: integration.id,
          organizationId: integration.organizationId,
          userId: integration.userId,
          dealIds: match.matchedDealIds,
          contactIds: match.matchedContactIds,
        });
        const { error } = await supabase
          .from('IntegrationActivity')
          .upsert(row, { onConflict: 'integrationId,source,externalId' });
        if (error) {
          errors.push(`message ${m.id}: ${error.message}`);
        } else {
          itemsMatched++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        errors.push(`message ${m.id}: ${message}`);
        log.warn('gmail: per-message sync failed (continuing)', { messageId: m.id, message });
      }
    }

    return { itemsSynced: headers.length, itemsMatched, errors };
  },

  async handleWebhook(): Promise<void> {
    // Gmail Pub/Sub push is a future phase. No-op if anyone POSTs.
  },

  async disconnect(): Promise<void> {
    // Token revocation via https://oauth2.googleapis.com/revoke is best-effort
    // and not required for the user-facing disconnect flow. Route layer flips
    // status to 'revoked' regardless.
  },
};
