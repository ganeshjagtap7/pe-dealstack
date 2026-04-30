// Phase 0 — shared integration platform types.
// Every provider (granola, gmail, etc.) implements IntegrationProvider.

export type ProviderId =
  | 'granola'
  | 'gmail'
  | 'google_calendar'
  | 'fireflies'
  | 'otter'
  | '_mock';

export type IntegrationStatus =
  | 'connected'
  | 'token_expired'
  | 'revoked'
  | 'error';

export interface Integration {
  id: string;
  organizationId: string;
  userId: string;
  provider: ProviderId;
  status: IntegrationStatus;
  externalAccountId: string | null;
  externalAccountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  settings: Record<string, unknown>;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncOptions {
  since?: Date;
  backfill?: boolean;
}

export interface SyncResult {
  itemsSynced: number;
  itemsMatched: number;
  errors: string[];
  newCursor?: string;
}

export interface InitiateAuthResult {
  authUrl: string;
  state: string;
}

export interface IntegrationProvider {
  id: ProviderId;
  displayName: string;
  scopes: string[];
  initiateAuth(userId: string, organizationId: string): Promise<InitiateAuthResult>;
  handleCallback(params: { code: string; state: string }): Promise<Integration>;
  sync(integration: Integration, options: SyncOptions): Promise<SyncResult>;
  handleWebhook(headers: Record<string, string>, body: unknown): Promise<void>;
  disconnect(integration: Integration): Promise<void>;
}
