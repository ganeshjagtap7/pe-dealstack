-- ============================================================
-- C4: Performance Indexes for Concurrent User Support
-- Run in Supabase SQL Editor
-- ============================================================

-- Deal indexes (queried by org, status, stage constantly)
CREATE INDEX IF NOT EXISTS idx_deal_status ON "Deal" ("status");
CREATE INDEX IF NOT EXISTS idx_deal_stage ON "Deal" ("stage");
CREATE INDEX IF NOT EXISTS idx_deal_created ON "Deal" ("createdAt" DESC);

-- Company indexes (searched by name frequently)
CREATE INDEX IF NOT EXISTS idx_company_name ON "Company" ("name");

-- Document indexes (queried by deal)
CREATE INDEX IF NOT EXISTS idx_doc_deal ON "Document" ("dealId");
CREATE INDEX IF NOT EXISTS idx_doc_status ON "Document" ("status");

-- Activity indexes (queried by deal + time)
CREATE INDEX IF NOT EXISTS idx_activity_deal ON "Activity" ("dealId", "createdAt" DESC);

-- Audit log indexes (queried by entity, user, time)
CREATE INDEX IF NOT EXISTS idx_audit_action ON "AuditLog" ("action");
CREATE INDEX IF NOT EXISTS idx_audit_entity ON "AuditLog" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_audit_user ON "AuditLog" ("userId");
CREATE INDEX IF NOT EXISTS idx_audit_time ON "AuditLog" ("createdAt" DESC);

-- Memo indexes
CREATE INDEX IF NOT EXISTS idx_memo_deal ON "Memo" ("dealId");

-- DocumentChunk indexes (RAG — queried by dealId for context)
CREATE INDEX IF NOT EXISTS idx_chunk_deal ON "DocumentChunk" ("dealId");
CREATE INDEX IF NOT EXISTS idx_chunk_doc ON "DocumentChunk" ("documentId");

-- Enable trigram extension for fuzzy company name search (if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_company_name_trgm ON "Company" USING gin (name gin_trgm_ops);
-- Note: Uncomment the above if pg_trgm is available on your Supabase plan.
