-- Memo Builder: Add organizationId for org-scoping
-- Run this in Supabase SQL Editor

-- Add organizationId column to Memo table
ALTER TABLE "Memo" ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES "Organization"(id);

-- Create index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_memo_org ON "Memo"("organizationId");

-- Backfill existing memos from their deal's organization
UPDATE "Memo" m
SET "organizationId" = d."organizationId"
FROM "Deal" d
WHERE m."dealId" = d.id
  AND m."organizationId" IS NULL;
