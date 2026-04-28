-- ============================================================
-- MISSING: User Table + DealTeamMember Table
-- Run this FIRST in Supabase SQL Editor (before any other migration)
-- ============================================================

-- User table (maps Supabase auth users to app users)
CREATE TABLE IF NOT EXISTS public."User" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "authId"    uuid UNIQUE,
  email       text UNIQUE NOT NULL,
  name        text,
  avatar      text,
  title       text,
  department  text,
  "firmName"  text,
  role        text NOT NULL DEFAULT 'MEMBER'
                CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER')),
  "isActive"  boolean NOT NULL DEFAULT true,
  preferences jsonb DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_authid    ON public."User" ("authId");
CREATE INDEX IF NOT EXISTS idx_user_email     ON public."User" (email);
CREATE INDEX IF NOT EXISTS idx_user_role      ON public."User" (role);
CREATE INDEX IF NOT EXISTS idx_user_firm_name ON public."User" ("firmName");

-- DealTeamMember table (which users are on which deals)
CREATE TABLE IF NOT EXISTS public."DealTeamMember" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId"    uuid NOT NULL REFERENCES public."Deal"(id) ON DELETE CASCADE,
  "userId"    uuid NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'MEMBER'
                CHECK (role IN ('LEAD', 'MEMBER', 'VIEWER')),
  "addedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_team_member_deal ON public."DealTeamMember" ("dealId");
CREATE INDEX IF NOT EXISTS idx_deal_team_member_user ON public."DealTeamMember" ("userId");

-- Enable RLS
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DealTeamMember" ENABLE ROW LEVEL SECURITY;

-- Open policies for local dev (no auth restrictions)
CREATE POLICY IF NOT EXISTS "users_all" ON public."User" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "team_all" ON public."DealTeamMember" FOR ALL USING (true) WITH CHECK (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
