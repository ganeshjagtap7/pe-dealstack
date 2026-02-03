-- Migration: Add AI cache columns to Deal table
-- Run this in Supabase SQL Editor

-- Add AI cache columns
ALTER TABLE "Deal"
ADD COLUMN IF NOT EXISTS "aiRisks" JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "aiCacheUpdatedAt" TIMESTAMPTZ DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "Deal"."aiRisks" IS 'Cached AI risk analysis results (JSONB array)';
COMMENT ON COLUMN "Deal"."aiCacheUpdatedAt" IS 'Timestamp when AI cache was last updated (for TTL)';

-- Verification query
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Deal'
  AND column_name IN ('aiThesis', 'aiRisks', 'aiCacheUpdatedAt');
