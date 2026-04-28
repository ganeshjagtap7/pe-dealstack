-- Financial Statement Extraction — Add missing columns to existing FinancialStatement table
-- Run this in Supabase SQL Editor if the table already exists

-- Add missing columns if they don't exist
ALTER TABLE "FinancialStatement" 
ADD COLUMN IF NOT EXISTS "extractedAt" TIMESTAMPTZ;

ALTER TABLE "FinancialStatement" 
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;

ALTER TABLE "FinancialStatement" 
ADD COLUMN IF NOT EXISTS "mergeStatus" TEXT DEFAULT 'auto'
CHECK ("mergeStatus" IN ('auto', 'manual', 'conflict', 'resolved'));

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS "idx_financial_statement_deal" ON "FinancialStatement"("dealId");
CREATE INDEX IF NOT EXISTS "idx_financial_statement_document" ON "FinancialStatement"("documentId");
CREATE INDEX IF NOT EXISTS "idx_financial_statement_type" ON "FinancialStatement"("statementType");
CREATE INDEX IF NOT EXISTS "idx_financial_statement_period" ON "FinancialStatement"("period");

-- Add unique constraint if it doesn't exist
-- Note: This may fail if duplicate data exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'financial_statement_unique_period'
    ) THEN
        ALTER TABLE "FinancialStatement" 
        ADD CONSTRAINT "financial_statement_unique_period" 
        UNIQUE ("dealId", "statementType", "period", "documentId");
    END IF;
END $$;
