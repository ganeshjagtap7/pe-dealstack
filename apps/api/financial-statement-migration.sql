-- Financial Statement Extraction — FinancialStatement Table
-- Run this in Supabase SQL Editor
-- Part of the structured financial table extraction feature

-- ─── FinancialStatement Table ────────────────────────────────
CREATE TABLE IF NOT EXISTS "FinancialStatement" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Foreign keys
  "dealId"     UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "documentId" UUID REFERENCES "Document"(id) ON DELETE SET NULL,

  -- Statement classification
  "statementType" TEXT NOT NULL
    CHECK ("statementType" IN ('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW')),

  -- Period (e.g. "2021", "2022", "LTM", "2025E")
  period     TEXT NOT NULL,
  "periodType" TEXT NOT NULL DEFAULT 'HISTORICAL'
    CHECK ("periodType" IN ('HISTORICAL', 'PROJECTED', 'LTM')),

  -- Extracted data (JSONB — all line items stored here)
  -- Structure: { "revenue": 12.5, "ebitda": 3.2, "gross_profit": 6.1, ... }
  "lineItems" JSONB NOT NULL DEFAULT '{}',

  -- Units & currency
  currency  TEXT NOT NULL DEFAULT 'USD',
  "unitScale" TEXT NOT NULL DEFAULT 'MILLIONS'
    CHECK ("unitScale" IN ('MILLIONS', 'THOUSANDS', 'ACTUALS')),

  -- Extraction metadata
  "extractionConfidence" INTEGER NOT NULL DEFAULT 0
    CHECK ("extractionConfidence" >= 0 AND "extractionConfidence" <= 100),
  "extractionSource" TEXT DEFAULT 'gpt4o'
    CHECK ("extractionSource" IN ('gpt4o', 'azure', 'vision', 'manual')),
  "extractedAt" TIMESTAMPTZ,

  -- Human review
  "reviewedAt" TIMESTAMPTZ,
  "reviewedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL,

  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- One statement per type per period per deal (upsertable)
  UNIQUE ("dealId", "statementType", period)
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_financial_statement_deal_id
  ON "FinancialStatement"("dealId");

CREATE INDEX IF NOT EXISTS idx_financial_statement_deal_type
  ON "FinancialStatement"("dealId", "statementType");

CREATE INDEX IF NOT EXISTS idx_financial_statement_deal_period
  ON "FinancialStatement"("dealId", period);

-- ─── Auto-update updatedAt ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_financial_statement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_financial_statement_updated_at ON "FinancialStatement";
CREATE TRIGGER trg_financial_statement_updated_at
  BEFORE UPDATE ON "FinancialStatement"
  FOR EACH ROW EXECUTE FUNCTION update_financial_statement_updated_at();
