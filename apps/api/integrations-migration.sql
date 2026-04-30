-- Phase 0: Integrations platform
-- Two tables: Integration (one row per user/provider connection) and
-- IntegrationEvent (webhook event log, used for dedupe + audit).

CREATE TABLE IF NOT EXISTS "Integration" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId  UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  userId          UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL CHECK (provider IN ('granola','gmail','google_calendar','fireflies','otter','_mock')),
  status          TEXT NOT NULL CHECK (status IN ('connected','token_expired','revoked','error')),
  externalAccountId    TEXT,
  externalAccountEmail TEXT,
  accessTokenEncrypted  TEXT,
  refreshTokenEncrypted TEXT,
  tokenExpiresAt  TIMESTAMPTZ,
  scopes          TEXT[] DEFAULT '{}',
  settings        JSONB  DEFAULT '{}',
  lastSyncAt      TIMESTAMPTZ,
  lastSyncError   TEXT,
  consecutiveFailures INT DEFAULT 0,
  createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_user_provider
  ON "Integration"(userId, provider);
CREATE INDEX IF NOT EXISTS idx_integration_org
  ON "Integration"(organizationId);
CREATE INDEX IF NOT EXISTS idx_integration_provider_status
  ON "Integration"(provider, status);

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrationId   UUID NOT NULL REFERENCES "Integration"(id) ON DELETE CASCADE,
  externalId      TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload         JSONB,
  receivedAt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processedAt     TIMESTAMPTZ,
  error           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_event_dedupe
  ON "IntegrationEvent"(integrationId, externalId);
CREATE INDEX IF NOT EXISTS idx_integration_event_unprocessed
  ON "IntegrationEvent"(integrationId, processedAt)
  WHERE processedAt IS NULL;

-- Extend Notification type enum to include integration-related types.
-- (Notification.type is currently a TEXT column with a CHECK constraint —
-- update if such a constraint exists.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE 'Notification_type_check%'
  ) THEN
    ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_type_check";
  END IF;
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check"
    CHECK (type IN (
      'DEAL_UPDATE','DOCUMENT_UPLOADED','MENTION','AI_INSIGHT','TASK_ASSIGNED','COMMENT','SYSTEM',
      'INTEGRATION_SYNC_FAILED','INTEGRATION_RECONNECT_NEEDED','NEW_TRANSCRIPT','STALE_THREAD','MEETING_BRIEF_READY'
    ));
END $$;
