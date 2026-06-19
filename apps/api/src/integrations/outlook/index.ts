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
  buildMicrosoftAuthUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftToken,
  getMicrosoftUserInfo,
} from '../microsoft/client.js';
import { OUTLOOK_SCOPES, listMessagesSince, getMessageWithBody } from './client.js';
import {
  outlookMessageToIntegrationActivity,
  extractAddressEmails,
  extractBodyText,
} from './mapper.js';
import { runDealEmailClassifier } from '../../services/agents/dealEmailClassifier/index.js';

const DEFAULT_BACKFILL_DAYS = 90;
const TOKEN_REFRESH_SAFETY_MS = 60 * 1000;

// Cap classifier (LLM) calls per sync so a freshly-connected busy mailbox
// can't run up a large bill on the first backfill.
const DEFAULT_CLASSIFIER_CAP_PER_RUN = Number(
  process.env.OUTLOOK_CLASSIFIER_CAP_PER_RUN ?? '200'
);

function redirectUri(): string {
  const base = process.env.APP_URL ?? 'http://localhost:3001';
  // The callback route resolves the provider from the URL segment, so each
  // provider uses its own path (mirrors gmail's /oauth/gmail/callback). Both
  // this and microsoft365's path must be registered as redirect URIs on the
  // single shared Azure app.
  return `${base}/api/integrations/oauth/outlook/callback`;
}

async function getOrgContactEmails(organizationId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('Contact')
    .select('email')
    .eq('organizationId', organizationId);
  return new Set(
    (data ?? [])
      .map((r: { email: string | null }) => r.email?.trim().toLowerCase())
      .filter((e): e is string => !!e)
  );
}

async function ensureFreshAccessToken(integration: Integration): Promise<string> {
  const access = decryptFromStorage(integration.accessTokenEncrypted);
  const refresh = decryptFromStorage(integration.refreshTokenEncrypted);
  if (!access) throw new Error('Outlook: no access token stored');

  const expiresAt = integration.tokenExpiresAt
    ? Date.parse(integration.tokenExpiresAt)
    : 0;
  if (!expiresAt || expiresAt - Date.now() > TOKEN_REFRESH_SAFETY_MS) return access;
  if (!refresh) throw new Error('Outlook: access token expired and no refresh token stored');

  const refreshed = await refreshMicrosoftToken(refresh, OUTLOOK_SCOPES);
  await saveTokens({
    integrationId: integration.id,
    accessToken: refreshed.access_token,
    // Microsoft may rotate the refresh token; keep the new one if present.
    refreshToken: refreshed.refresh_token ?? refresh,
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}

export const outlookProvider: IntegrationProvider = {
  id: 'outlook',
  displayName: 'Outlook',
  scopes: OUTLOOK_SCOPES,

  async initiateAuth(userId, organizationId): Promise<InitiateAuthResult> {
    const state = signState({ userId, organizationId, provider: 'outlook' });
    const authUrl = buildMicrosoftAuthUrl({
      redirectUri: redirectUri(),
      state,
      scopes: OUTLOOK_SCOPES,
    });
    return { mode: 'oauth', authUrl, state };
  },

  async handleCallback({ code, state }): Promise<Integration> {
    const claims = verifyState(state);
    if (claims.provider !== 'outlook') {
      throw new Error('Outlook callback: state provider mismatch');
    }
    const tokens = await exchangeMicrosoftCode({
      code,
      redirectUri: redirectUri(),
      scopes: OUTLOOK_SCOPES,
    });
    const userInfo = await getMicrosoftUserInfo(tokens.access_token);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { data: existing } = await supabase
      .from('Integration')
      .select('id')
      .eq('userId', claims.userId)
      .eq('provider', 'outlook')
      .maybeSingle();

    const baseRow = {
      organizationId: claims.organizationId,
      userId: claims.userId,
      provider: 'outlook' as const,
      status: 'connected' as const,
      externalAccountId: userInfo.id,
      externalAccountEmail: userInfo.email,
      accessTokenEncrypted: encryptForStorage(tokens.access_token),
      refreshTokenEncrypted: encryptForStorage(tokens.refresh_token ?? null),
      tokenExpiresAt: expiresAt,
      scopes: OUTLOOK_SCOPES,
      settings: { displayName: userInfo.displayName ?? null },
      lastSyncAt: null,
      lastSyncError: null,
      consecutiveFailures: 0,
      updatedAt: now,
    };

    if (existing?.id) {
      const { data, error } = await supabase
        .from('Integration').update(baseRow).eq('id', existing.id).select('*').single();
      if (error || !data) throw new Error(`Outlook callback failed: ${error?.message ?? 'no row'}`);
      return data as Integration;
    }
    const { data, error } = await supabase
      .from('Integration').insert({ ...baseRow, createdAt: now }).select('*').single();
    if (error || !data) throw new Error(`Outlook callback failed: ${error?.message ?? 'no row'}`);
    return data as Integration;
  },

  async sync(integration, options: SyncOptions): Promise<SyncResult> {
    const accessToken = await ensureFreshAccessToken(integration);

    const knownEmails = await getOrgContactEmails(integration.organizationId);
    if (knownEmails.size === 0) {
      return { itemsSynced: 0, itemsMatched: 0, errors: [] };
    }

    const since =
      options.since ??
      (integration.lastSyncAt
        ? new Date(integration.lastSyncAt)
        : new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000));

    const messages = await listMessagesSince(accessToken, since);
    let itemsMatched = 0;
    let classifierBudget = DEFAULT_CLASSIFIER_CAP_PER_RUN;
    const errors: string[] = [];

    for (const message of messages) {
      try {
        const emails = extractAddressEmails(message);
        // Cheap local filter before any DB / LLM work: only messages that
        // touch a known contact are stored (keeps the activity feed relevant).
        if (!emails.some((e) => knownEmails.has(e))) continue;

        const match = await matchEmailAddressesToDeals({
          organizationId: integration.organizationId,
          emails,
        });
        const hasMatch =
          match.matchedDealIds.length > 0 || match.matchedContactIds.length > 0;
        if (!hasMatch) continue;

        const row = outlookMessageToIntegrationActivity({
          message,
          integrationId: integration.id,
          organizationId: integration.organizationId,
          userId: integration.userId,
          dealIds: match.matchedDealIds,
          contactIds: match.matchedContactIds,
        });
        const { data: inserted, error: activityErr } = await supabase
          .from('IntegrationActivity')
          .upsert(row, { onConflict: 'integrationId,source,externalId' })
          .select('id')
          .single();
        if (activityErr) {
          errors.push(`message ${message.id}: ${activityErr.message}`);
          continue;
        }
        itemsMatched++;

        // Store classifier output (deal relevance) for a capped subset.
        // Auto-create/update of deals is intentionally deferred — that path
        // is currently Gmail-coupled; Outlook stores relevance for the future
        // review queue, matching Gmail's default (auto-deal OFF) behaviour.
        if (classifierBudget <= 0) continue;
        classifierBudget--;

        const full = await getMessageWithBody(accessToken, message.id);
        const fromEmail =
          full.from?.emailAddress?.address?.toLowerCase() ??
          full.sender?.emailAddress?.address?.toLowerCase() ?? '';
        const fromName = full.from?.emailAddress?.name ?? null;
        const toEmails = (full.toRecipients ?? [])
          .map((r) => r.emailAddress?.address ?? '')
          .filter(Boolean);

        const classification = await runDealEmailClassifier({
          subject: full.subject || '(no subject)',
          fromName,
          fromEmail,
          toEmails,
          date: full.receivedDateTime ?? null,
          bodyText: extractBodyText(full),
        });
        if (classification && inserted?.id) {
          await supabase
            .from('IntegrationActivity')
            .update({ dealRelevance: classification })
            .eq('id', inserted.id);
        }
      } catch (err) {
        const message2 = err instanceof Error ? err.message : 'unknown error';
        errors.push(`message ${message.id}: ${message2}`);
        log.warn('outlook: per-message sync failed (continuing)', {
          messageId: message.id, message: message2,
        });
      }
    }

    return { itemsSynced: messages.length, itemsMatched, errors };
  },

  async handleWebhook(): Promise<void> {
    // Graph change-notification subscriptions are a future phase.
  },

  async disconnect(): Promise<void> {
    // Token revocation is best-effort; the route layer flips status to 'revoked'.
  },
};
