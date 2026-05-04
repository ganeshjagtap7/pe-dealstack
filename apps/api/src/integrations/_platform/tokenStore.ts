import { encrypt, decrypt } from '../../services/encryption.js';
import { supabase } from '../../supabase.js';
import type { Integration, IntegrationStatus } from './types.js';

export function encryptForStorage(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return encrypt(value);
}

export function decryptFromStorage(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  return decrypt(value);
}

export async function saveTokens(params: {
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
}): Promise<void> {
  const { integrationId, accessToken, refreshToken, tokenExpiresAt } = params;
  const { error } = await supabase
    .from('Integration')
    .update({
      accessTokenEncrypted: encryptForStorage(accessToken),
      refreshTokenEncrypted: encryptForStorage(refreshToken),
      tokenExpiresAt: tokenExpiresAt,
      status: 'connected' as IntegrationStatus,
      consecutiveFailures: 0,
      lastSyncError: null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', integrationId);
  if (error) throw new Error(`tokenStore.saveTokens failed: ${error.message}`);
}

export async function getDecryptedTokens(
  integration: Integration
): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  return {
    accessToken: decryptFromStorage(integration.accessTokenEncrypted),
    refreshToken: decryptFromStorage(integration.refreshTokenEncrypted),
  };
}

export async function markStatus(
  integrationId: string,
  status: IntegrationStatus,
  error?: string
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (error !== undefined) update.lastSyncError = error;
  const { error: dbError } = await supabase
    .from('Integration')
    .update(update)
    .eq('id', integrationId);
  if (dbError) throw new Error(`tokenStore.markStatus failed: ${dbError.message}`);
}
