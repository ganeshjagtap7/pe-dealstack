-- VDR (Virtual Data Room) Schema for Supabase
-- Run this SQL in Supabase SQL Editor to create VDR tables

-- ============================================================
-- Folder Table
-- Stores folder structure for each deal's data room
-- ============================================================
CREATE TABLE IF NOT EXISTS "Folder" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "parentId" UUID REFERENCES "Folder"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  "isRestricted" BOOLEAN DEFAULT false,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- FolderInsight Table
-- Stores AI-generated insights for each folder
-- ============================================================
CREATE TABLE IF NOT EXISTS "FolderInsight" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "folderId" UUID NOT NULL REFERENCES "Folder"(id) ON DELETE CASCADE,
  summary TEXT,
  "completionPercent" INTEGER DEFAULT 0,
  "redFlags" JSONB DEFAULT '[]',
  "missingDocuments" JSONB DEFAULT '[]',
  "generatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Enhance Document table for VDR functionality
-- ============================================================
-- Add folderId reference to documents
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "folderId" UUID REFERENCES "Folder"(id) ON DELETE SET NULL;

-- Add AI analysis fields
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiAnalysis" JSONB;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiAnalyzedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isHighlighted" BOOLEAN DEFAULT false;
-- Note: If User table exists, uncomment the line below
-- ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "uploadedBy" UUID REFERENCES "User"(id) ON DELETE SET NULL;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "uploadedBy" UUID;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "extractedText" TEXT;

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_folder_dealId" ON "Folder"("dealId");
CREATE INDEX IF NOT EXISTS "idx_folder_parentId" ON "Folder"("parentId");
CREATE INDEX IF NOT EXISTS "idx_folder_sortOrder" ON "Folder"("sortOrder");
CREATE INDEX IF NOT EXISTS "idx_folderInsight_folderId" ON "FolderInsight"("folderId");
CREATE INDEX IF NOT EXISTS "idx_document_folderId" ON "Document"("folderId");

-- ============================================================
-- Trigger to update folder updatedAt timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_folder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS folder_updated_at ON "Folder";
CREATE TRIGGER folder_updated_at
  BEFORE UPDATE ON "Folder"
  FOR EACH ROW
  EXECUTE FUNCTION update_folder_timestamp();

-- ============================================================
-- Function to create default VDR folders for a deal
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_vdr_folders(deal_uuid UUID)
RETURNS VOID AS $$
DECLARE
  folder_names TEXT[] := ARRAY[
    '100 Financials',
    '200 Legal',
    '300 Commercial',
    '400 HR & Data',
    '500 Intellectual Property'
  ];
  folder_name TEXT;
  sort_idx INTEGER := 0;
BEGIN
  FOREACH folder_name IN ARRAY folder_names
  LOOP
    INSERT INTO "Folder" ("dealId", name, "sortOrder")
    VALUES (deal_uuid, folder_name, sort_idx)
    ON CONFLICT DO NOTHING;
    sort_idx := sort_idx + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Seed default folders for existing deals
-- ============================================================
DO $$
DECLARE
  deal_record RECORD;
BEGIN
  FOR deal_record IN SELECT id FROM "Deal"
  LOOP
    PERFORM create_default_vdr_folders(deal_record.id);
  END LOOP;
END $$;

-- ============================================================
-- Trigger to auto-create VDR folders when a new deal is created
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_vdr_folders()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_vdr_folders(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deal_auto_create_vdr_folders ON "Deal";
CREATE TRIGGER deal_auto_create_vdr_folders
  AFTER INSERT ON "Deal"
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_vdr_folders();

-- ============================================================
-- Sample insights for existing folders (run after seeding)
-- ============================================================
INSERT INTO "FolderInsight" ("folderId", summary, "completionPercent", "redFlags", "missingDocuments")
SELECT
  f.id,
  CASE
    WHEN f.name LIKE '%Financials%' THEN 'Financial documents are 92% complete. Key documents for FY21-23 are present.'
    WHEN f.name LIKE '%Legal%' THEN 'Legal folder requires attention. Several key contracts are pending final signatures.'
    WHEN f.name LIKE '%Commercial%' THEN 'Commercial documents are 88% complete. Customer contracts well-documented.'
    WHEN f.name LIKE '%HR%' THEN 'HR & Data folder under review. Awaiting privacy compliance check.'
    ELSE 'Folder awaiting document uploads and AI analysis.'
  END,
  CASE
    WHEN f.name LIKE '%Financials%' THEN 92
    WHEN f.name LIKE '%Legal%' THEN 75
    WHEN f.name LIKE '%Commercial%' THEN 88
    WHEN f.name LIKE '%HR%' THEN 60
    ELSE 0
  END,
  CASE
    WHEN f.name LIKE '%Legal%' THEN '[{"id":"rf1","severity":"high","title":"Missing IP Assignment","description":"Founder IP assignment agreement not found."}]'::JSONB
    WHEN f.name LIKE '%Financials%' THEN '[{"id":"rf2","severity":"medium","title":"Revenue Anomaly","description":"Oct 2023 revenue is 40% higher than trailing average."}]'::JSONB
    ELSE '[]'::JSONB
  END,
  CASE
    WHEN f.name LIKE '%Financials%' THEN '[{"id":"md1","name":"Q4 2022 Board Minutes"},{"id":"md2","name":"Insurance Policies 2024"}]'::JSONB
    WHEN f.name LIKE '%Legal%' THEN '[{"id":"md3","name":"Founder IP Assignment"},{"id":"md4","name":"Employment Contracts (3 missing)"}]'::JSONB
    ELSE '[]'::JSONB
  END
FROM "Folder" f
WHERE NOT EXISTS (
  SELECT 1 FROM "FolderInsight" fi WHERE fi."folderId" = f.id
);
