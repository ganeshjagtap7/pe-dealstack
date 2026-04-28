-- ========================================================
-- PE OS - BACKWARD COMPATIBILITY SCRIPT
-- Adds aliases so BOTH createdAt and created_at work
-- ========================================================

-- 1. FIX Deal Table Aliases
ALTER TABLE "Deal" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Deal" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "Deal" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;
ALTER TABLE "Deal" ADD COLUMN "updatedAt" timestamptz GENERATED ALWAYS AS (updated_at) STORED;

-- 2. FIX Document Table Aliases
ALTER TABLE "Document" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Document" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "Document" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;
ALTER TABLE "Document" ADD COLUMN "updatedAt" timestamptz GENERATED ALWAYS AS (updated_at) STORED;

-- 3. FIX Company Table Aliases
ALTER TABLE "Company" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "updatedAt";
ALTER TABLE "Company" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;
ALTER TABLE "Company" ADD COLUMN "updatedAt" timestamptz GENERATED ALWAYS AS (updated_at) STORED;

-- 4. FIX Other Feature Tables
ALTER TABLE "FinancialStatement" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "FinancialStatement" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;

ALTER TABLE "Notification" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Notification" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;

ALTER TABLE "Activity" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Activity" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;

ALTER TABLE "Folder" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Folder" ADD COLUMN "createdAt" timestamptz GENERATED ALWAYS AS (created_at) STORED;

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
