-- ============================================================
-- Foreign-key constraints for LegalDocument, LegalDocTemplate, CustomGraph
--
-- Phase 1/2 migrations created these tables with raw TEXT columns for
-- organizationId / dealId / createdById, no explicit FOREIGN KEY
-- constraints. PostgREST needs FKs to infer relationships for the
-- embedded-join syntax we use throughout the routes, e.g.:
--
--   supabase.from('LegalDocument')
--     .select('*, deal:Deal(id, projectName:name, target:companyName)')
--
-- Without the FK, PostgREST returns:
--   PGRST200: Could not find a relationship between 'LegalDocument' and 'Deal'
--
-- Same risk lurks on CustomGraph (same join shape, same missing FK).
-- This migration adds NOT VALID FKs so it succeeds even if existing
-- rows have dangling dealIds from before deals had soft-delete cascade
-- (NOT VALID skips the initial scan — PostgREST treats them as real
-- FKs for relationship inference either way).
--
-- After ALTER, NOTIFY PostgREST to drop its schema cache and rebuild.
--
-- Run in Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================

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

-- Force PostgREST to rebuild its relationship cache so the new FKs are
-- visible without restarting the API. Without this NOTIFY, joins keep
-- failing for up to ~10 min until PostgREST's next cache refresh.
NOTIFY pgrst, 'reload schema';
