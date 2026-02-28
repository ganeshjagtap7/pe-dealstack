-- Multi-Document Financial Merge — Schema Migration
-- Run this in Supabase SQL Editor AFTER the original financial-statement-migration.sql
-- Enables storing multiple document extractions for the same period with conflict resolution

-- ─── Step 1: Drop old UNIQUE constraint ─────────────────────────
-- Old constraint: one row per (dealId, statementType, period)
-- This prevented storing data from multiple documents for the same period
ALTER TABLE "FinancialStatement"
  DROP CONSTRAINT IF EXISTS "FinancialStatement_dealId_statementType_period_key";

-- ─── Step 2: Add new columns ────────────────────────────────────
-- isActive: only one row per (deal, type, period) should be active at a time
-- mergeStatus: tracks whether this row has been auto-resolved or needs user review
ALTER TABLE "FinancialStatement"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FinancialStatement"
  ADD COLUMN IF NOT EXISTS "mergeStatus" TEXT NOT NULL DEFAULT 'auto'
    CHECK ("mergeStatus" IN ('auto', 'needs_review', 'user_resolved'));

-- ─── Step 3: New UNIQUE constraint ──────────────────────────────
-- Allows multiple rows per period from different documents
ALTER TABLE "FinancialStatement"
  ADD CONSTRAINT "FinancialStatement_deal_type_period_doc_key"
    UNIQUE ("dealId", "statementType", period, "documentId");

-- ─── Step 4: Partial unique index ───────────────────────────────
-- Enforces at most ONE active row per (deal, type, period)
-- PostgreSQL partial unique indexes are the correct tool for this pattern
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_statement_active_unique
  ON "FinancialStatement" ("dealId", "statementType", period)
  WHERE "isActive" = true;

-- ─── Step 5: Index for conflict queries ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_financial_statement_versions
  ON "FinancialStatement" ("dealId", "statementType", period, "isActive");

CREATE INDEX IF NOT EXISTS idx_financial_statement_merge_status
  ON "FinancialStatement" ("dealId", "mergeStatus")
  WHERE "mergeStatus" = 'needs_review';
