-- Migration: Add confidence and review columns to Deal table
-- Run this in Supabase SQL Editor

-- Add extraction confidence columns to Deal table
ALTER TABLE "Deal"
ADD COLUMN IF NOT EXISTS "extractionConfidence" INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "reviewReasons" JSONB DEFAULT '[]'::jsonb;

-- Add index for pending review queries
CREATE INDEX IF NOT EXISTS idx_deal_needs_review ON "Deal" ("needsReview") WHERE "needsReview" = true;

-- Add PENDING_REVIEW status to allowed statuses (if using enum)
-- Note: If status is TEXT, this is not needed
-- ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
-- ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- Update existing deals to have needsReview = false
UPDATE "Deal" SET "needsReview" = false WHERE "needsReview" IS NULL;

-- Verification query
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Deal'
  AND column_name IN ('extractionConfidence', 'needsReview', 'reviewReasons');
