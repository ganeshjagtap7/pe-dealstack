-- ============================================================
-- Organization Migration (FRESH DATABASE VERSION)
-- Safe to run on a brand new Supabase project with no data.
-- Run AFTER user-table-migration.sql
-- ============================================================

-- 1. Create Organization table
CREATE TABLE IF NOT EXISTS public."Organization" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  logo        text,
  industry    text,
  website     text,
  settings    jsonb DEFAULT '{}',
  plan        text DEFAULT 'FREE',
  "maxUsers"  integer DEFAULT 10,
  "isActive"  boolean DEFAULT true,
  "createdBy" uuid,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_name   ON public."Organization" (name);
CREATE INDEX IF NOT EXISTS idx_organization_slug   ON public."Organization" (slug);
CREATE INDEX IF NOT EXISTS idx_organization_active ON public."Organization" ("isActive");

-- 2. Add organizationId to User
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_user_org ON public."User" ("organizationId");

-- 3. Add organizationId to Deal
ALTER TABLE public."Deal"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_deal_org ON public."Deal" ("organizationId");

-- 4. Add organizationId to Company
ALTER TABLE public."Company"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_company_org ON public."Company" ("organizationId");

-- 5. Add assignedTo to Deal (used by routes)
ALTER TABLE public."Deal"
  ADD COLUMN IF NOT EXISTS "assignedTo" uuid REFERENCES public."User"(id);

-- 6. Add extra Deal columns used by the app
ALTER TABLE public."Deal"
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "targetCloseDate" timestamptz,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS "extractionConfidence" double precision,
  ADD COLUMN IF NOT EXISTS "needsReview" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewReasons" text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "ioi" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ioiDate" timestamptz,
  ADD COLUMN IF NOT EXISTS "closedAt" timestamptz;

-- 7. Add extra Document columns used by the app
ALTER TABLE public."Document"
  ADD COLUMN IF NOT EXISTS "folderId" uuid,
  ADD COLUMN IF NOT EXISTS "extractedText" text,
  ADD COLUMN IF NOT EXISTS "aiAnalysis" jsonb,
  ADD COLUMN IF NOT EXISTS "aiSummary" text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "extractionStatus" text DEFAULT 'PENDING';

-- 8. Add extra Activity columns
ALTER TABLE public."Activity"
  ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES public."User"(id);

-- 9. Enable RLS on Organization
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'Organization' AND policyname = 'org_all'
  ) THEN
    CREATE POLICY "org_all" ON public."Organization" FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 10. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
