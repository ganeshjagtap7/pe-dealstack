-- ============================================================
-- UUID column types + foreign-key constraints for
-- LegalDocument, LegalDocTemplate, CustomGraph
--
-- Two-part migration:
--
-- 1) Convert TEXT id / foreign-key columns to native UUID
--    Phase 1/2 migrations defined these as `TEXT ... DEFAULT
--    gen_random_uuid()::text`, but Deal / Organization / User use
--    native UUID. Postgres rejects FKs across incompatible types:
--      ERROR 42804: foreign key constraint cannot be implemented
--      DETAIL: columns are of incompatible types: text and uuid
--    Casting to UUID via `USING col::uuid` succeeds because every
--    row we've inserted so far already holds a valid UUID string.
--
-- 2) Add FOREIGN KEY constraints so PostgREST can resolve the
--    embedded-join syntax we use throughout the routes:
--      .select('*, deal:Deal(id, projectName:name, target:companyName)')
--    Without these, PostgREST returns PGRST200 the moment a row
--    exists to join.
--
-- All steps are wrapped in column/constraint existence guards so
-- the migration is idempotent — safe to re-run.
--
-- Final NOTIFY tells PostgREST to drop its schema cache and rebuild,
-- so the new FKs are visible to the API within seconds (no restart).
--
-- Run in Supabase SQL Editor.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) TEXT → UUID column type conversions
-- ───────────────────────────────────────────────────────────

DO $$
BEGIN
  -- LegalDocument
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocument' AND column_name = 'id') = 'text' THEN
    ALTER TABLE "LegalDocument" ALTER COLUMN "id" DROP DEFAULT;
    ALTER TABLE "LegalDocument" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
    ALTER TABLE "LegalDocument" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocument' AND column_name = 'organizationId') = 'text' THEN
    ALTER TABLE "LegalDocument" ALTER COLUMN "organizationId" TYPE UUID USING "organizationId"::uuid;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocument' AND column_name = 'dealId') = 'text' THEN
    ALTER TABLE "LegalDocument" ALTER COLUMN "dealId" TYPE UUID USING "dealId"::uuid;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocument' AND column_name = 'createdById') = 'text' THEN
    ALTER TABLE "LegalDocument" ALTER COLUMN "createdById" TYPE UUID USING "createdById"::uuid;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocument' AND column_name = 'templateId') = 'text' THEN
    ALTER TABLE "LegalDocument" ALTER COLUMN "templateId" TYPE UUID USING "templateId"::uuid;
  END IF;

  -- LegalDocTemplate
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocTemplate' AND column_name = 'id') = 'text' THEN
    ALTER TABLE "LegalDocTemplate" ALTER COLUMN "id" DROP DEFAULT;
    ALTER TABLE "LegalDocTemplate" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
    ALTER TABLE "LegalDocTemplate" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'LegalDocTemplate' AND column_name = 'organizationId') = 'text' THEN
    ALTER TABLE "LegalDocTemplate" ALTER COLUMN "organizationId" TYPE UUID USING "organizationId"::uuid;
  END IF;

  -- CustomGraph
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'CustomGraph' AND column_name = 'id') = 'text' THEN
    ALTER TABLE "CustomGraph" ALTER COLUMN "id" DROP DEFAULT;
    ALTER TABLE "CustomGraph" ALTER COLUMN "id" TYPE UUID USING "id"::uuid;
    ALTER TABLE "CustomGraph" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'CustomGraph' AND column_name = 'organizationId') = 'text' THEN
    ALTER TABLE "CustomGraph" ALTER COLUMN "organizationId" TYPE UUID USING "organizationId"::uuid;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'CustomGraph' AND column_name = 'dealId') = 'text' THEN
    ALTER TABLE "CustomGraph" ALTER COLUMN "dealId" TYPE UUID USING "dealId"::uuid;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'CustomGraph' AND column_name = 'createdById') = 'text' THEN
    ALTER TABLE "CustomGraph" ALTER COLUMN "createdById" TYPE UUID USING "createdById"::uuid;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────
-- 2) Foreign-key constraints (NOT VALID so older rows with
--    dangling refs don't block; PostgREST still treats them
--    as real FKs for relationship inference)
-- ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LegalDocument_dealId_fkey') THEN
    ALTER TABLE "LegalDocument"
      ADD CONSTRAINT "LegalDocument_dealId_fkey"
        FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LegalDocument_organizationId_fkey') THEN
    ALTER TABLE "LegalDocument"
      ADD CONSTRAINT "LegalDocument_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LegalDocument_templateId_fkey') THEN
    ALTER TABLE "LegalDocument"
      ADD CONSTRAINT "LegalDocument_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "LegalDocTemplate"("id") ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LegalDocTemplate_organizationId_fkey') THEN
    ALTER TABLE "LegalDocTemplate"
      ADD CONSTRAINT "LegalDocTemplate_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomGraph_dealId_fkey') THEN
    ALTER TABLE "CustomGraph"
      ADD CONSTRAINT "CustomGraph_dealId_fkey"
        FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomGraph_organizationId_fkey') THEN
    ALTER TABLE "CustomGraph"
      ADD CONSTRAINT "CustomGraph_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────
-- 3) Force PostgREST to rebuild its relationship cache
-- ───────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
