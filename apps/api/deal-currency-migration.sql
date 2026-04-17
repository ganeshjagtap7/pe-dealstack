-- Add currency column to Deal table
-- Stores ISO 4217 currency code (e.g., USD, INR, EUR, GBP)
-- Default: USD for backward compatibility with existing deals

ALTER TABLE "Deal"
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

-- Add a comment for documentation
COMMENT ON COLUMN "Deal".currency IS 'ISO 4217 currency code for financial values (revenue, ebitda, dealSize)';
