-- ============================================================
-- Deal.createdBy — creator attribution
-- Adds a createdBy column so "who added this deal" is a direct
-- query instead of an AuditLog join, and backfills historical
-- deals from DEAL_CREATED audit events (only manual UI creations
-- were ever audited; imported/ingested deals stay NULL).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID REFERENCES "User"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_deal_created_by" ON "Deal"("createdBy");

-- Backfill from audit log. AuditLog stores resourceId under the
-- "entityId" column (see services/auditLog.ts mapping).
UPDATE "Deal" d
SET "createdBy" = a."userId"
FROM "AuditLog" a
WHERE d."createdBy" IS NULL
  AND a.action = 'DEAL_CREATED'
  AND a."entityId" = d.id
  AND a."userId" IS NOT NULL;
