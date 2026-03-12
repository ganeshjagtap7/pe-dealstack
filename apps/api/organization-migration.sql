-- ============================================================
-- Multi-Tenancy Migration: Organization Table + organizationId
-- Run this migration in order (1A → 1B → 1C → 1D)
-- ============================================================

-- ============================================================
-- Phase 1A: Create Organization table
-- ============================================================
CREATE TABLE IF NOT EXISTS public."Organization" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  logo text,
  industry text,
  website text,
  settings jsonb DEFAULT '{}',
  plan text DEFAULT 'FREE',
  "maxUsers" integer DEFAULT 10,
  "isActive" boolean DEFAULT true,
  "createdBy" uuid,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_name ON public."Organization" (name);
CREATE INDEX IF NOT EXISTS idx_organization_slug ON public."Organization" (slug);
CREATE INDEX IF NOT EXISTS idx_organization_active ON public."Organization" ("isActive");

-- ============================================================
-- Phase 1B: Add organizationId FK to resource tables
-- ============================================================

-- User (nullable initially for migration)
ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_user_org ON public."User" ("organizationId");

-- Deal
ALTER TABLE public."Deal"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_deal_org ON public."Deal" ("organizationId");

-- Company
ALTER TABLE public."Company"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_company_org ON public."Company" ("organizationId");

-- Contact
ALTER TABLE public."Contact"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_contact_org ON public."Contact" ("organizationId");

-- Task (already has firmName, adding organizationId alongside)
ALTER TABLE public."Task"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_task_org ON public."Task" ("organizationId");

-- Invitation (already has firmName, adding organizationId alongside)
ALTER TABLE public."Invitation"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_invitation_org ON public."Invitation" ("organizationId");

-- AuditLog (stays nullable — some system events have no org)
ALTER TABLE public."AuditLog"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_auditlog_org ON public."AuditLog" ("organizationId");

-- Memo (top-level, not all memos are deal-bound)
ALTER TABLE public."Memo"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_memo_org ON public."Memo" ("organizationId");

-- MemoTemplate (shared within org, stays nullable)
ALTER TABLE public."MemoTemplate"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_memotemplate_org ON public."MemoTemplate" ("organizationId");

-- Notification (defense-in-depth, stays nullable)
ALTER TABLE public."Notification"
  ADD COLUMN IF NOT EXISTS "organizationId" uuid REFERENCES public."Organization"(id);
CREATE INDEX IF NOT EXISTS idx_notification_org ON public."Notification" ("organizationId");

-- ============================================================
-- Phase 1C: Data Migration — assign existing data to orgs
-- ============================================================

-- Step 1: Create Organization records from unique firmName values
INSERT INTO public."Organization" (name, slug, "createdAt")
SELECT DISTINCT
  "firmName",
  LOWER(REGEXP_REPLACE(REGEXP_REPLACE("firmName", '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')),
  NOW()
FROM public."User"
WHERE "firmName" IS NOT NULL AND "firmName" != ''
ON CONFLICT (slug) DO NOTHING;

-- Step 2: Create a "Default Organization" for orphaned records
INSERT INTO public."Organization" (name, slug, "createdAt")
VALUES ('Default Organization', 'default-org', NOW())
ON CONFLICT (slug) DO NOTHING;

-- Step 3: Set User.organizationId from firmName match
UPDATE public."User" u
SET "organizationId" = o.id
FROM public."Organization" o
WHERE u."firmName" = o.name
  AND u."firmName" IS NOT NULL
  AND u."organizationId" IS NULL;

-- Step 4: Assign users with no firmName to Default org
UPDATE public."User"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 5: Set createdBy on Organization from first ADMIN user
UPDATE public."Organization" o
SET "createdBy" = (
  SELECT u.id FROM public."User" u
  WHERE u."organizationId" = o.id
    AND u.role IN ('ADMIN', 'admin')
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE o."createdBy" IS NULL;

-- Step 6: Assign Deals via assignedTo user
UPDATE public."Deal" d
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE d."assignedTo" = u.id
  AND u."organizationId" IS NOT NULL
  AND d."organizationId" IS NULL;

-- Step 7: Deals without assignedTo — use first DealTeamMember
UPDATE public."Deal" d
SET "organizationId" = u."organizationId"
FROM public."DealTeamMember" dtm
JOIN public."User" u ON dtm."userId" = u.id
WHERE dtm."dealId" = d.id
  AND u."organizationId" IS NOT NULL
  AND d."organizationId" IS NULL;

-- Step 8: Remaining deals → default org
UPDATE public."Deal"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 9: Company gets org from its most-frequent deal
UPDATE public."Company" c
SET "organizationId" = sub.org_id
FROM (
  SELECT d."companyId", d."organizationId" as org_id,
    ROW_NUMBER() OVER (PARTITION BY d."companyId" ORDER BY COUNT(*) DESC) as rn
  FROM public."Deal" d
  WHERE d."organizationId" IS NOT NULL
  GROUP BY d."companyId", d."organizationId"
) sub
WHERE c.id = sub."companyId" AND sub.rn = 1 AND c."organizationId" IS NULL;

-- Step 10: Orphaned companies → default org
UPDATE public."Company"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 11: Contact gets org from createdBy user
UPDATE public."Contact" ct
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE ct."createdBy" = u.id
  AND u."organizationId" IS NOT NULL
  AND ct."organizationId" IS NULL;

-- Step 12: Orphaned contacts → default org
UPDATE public."Contact"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 13: Task gets org from firmName match
UPDATE public."Task" t
SET "organizationId" = o.id
FROM public."Organization" o
WHERE t."firmName" = o.name
  AND t."organizationId" IS NULL;

-- Step 14: Orphaned tasks → default org
UPDATE public."Task"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 15: Invitation gets org from firmName match
UPDATE public."Invitation" i
SET "organizationId" = o.id
FROM public."Organization" o
WHERE i."firmName" = o.name
  AND i."organizationId" IS NULL;

-- Step 16: Memo gets org from deal
UPDATE public."Memo" m
SET "organizationId" = d."organizationId"
FROM public."Deal" d
WHERE m."dealId" = d.id
  AND d."organizationId" IS NOT NULL
  AND m."organizationId" IS NULL;

-- Step 17: Memo without deal gets org from createdBy user
UPDATE public."Memo" m
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE m."createdBy" = u.id
  AND m."organizationId" IS NULL
  AND u."organizationId" IS NOT NULL;

-- Step 18: Orphaned memos → default org
UPDATE public."Memo"
SET "organizationId" = (SELECT id FROM public."Organization" WHERE slug = 'default-org')
WHERE "organizationId" IS NULL;

-- Step 19: MemoTemplate gets org from createdBy
UPDATE public."MemoTemplate" mt
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE mt."createdBy" = u.id
  AND u."organizationId" IS NOT NULL
  AND mt."organizationId" IS NULL;

-- Step 20: AuditLog gets org from userId
UPDATE public."AuditLog" a
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE a."userId" = u.id
  AND u."organizationId" IS NOT NULL
  AND a."organizationId" IS NULL;

-- Step 21: Notification gets org from userId
UPDATE public."Notification" n
SET "organizationId" = u."organizationId"
FROM public."User" u
WHERE n."userId" = u.id
  AND u."organizationId" IS NOT NULL
  AND n."organizationId" IS NULL;

-- ============================================================
-- Phase 1D: Add NOT NULL constraints on core tables
-- ============================================================
ALTER TABLE public."User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."Deal" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."Company" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."Contact" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."Task" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE public."Memo" ALTER COLUMN "organizationId" SET NOT NULL;

-- AuditLog, Notification, Invitation, MemoTemplate stay nullable (not all records have orgs)
