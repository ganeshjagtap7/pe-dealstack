-- Team Sharing Migration
-- Adds firmName to User table and enhances DealTeamMember for sharing

-- 1. Add firmName column to User table for firm-based filtering
ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS "firmName" text;

-- 2. Create index for efficient firm-based queries
CREATE INDEX IF NOT EXISTS idx_user_firm_name ON public."User"("firmName");

-- 3. Add unique constraint on DealTeamMember to prevent duplicate entries
-- (Only adds if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_deal_user'
  ) THEN
    ALTER TABLE public."DealTeamMember"
    ADD CONSTRAINT unique_deal_user UNIQUE ("dealId", "userId");
  END IF;
END $$;

-- 4. Add additional columns to DealTeamMember for better access control
DO $$
BEGIN
  -- Add accessLevel column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DealTeamMember' AND column_name = 'accessLevel'
  ) THEN
    ALTER TABLE public."DealTeamMember" ADD COLUMN "accessLevel" text DEFAULT 'view';
    ALTER TABLE public."DealTeamMember" ADD CONSTRAINT check_access_level CHECK ("accessLevel" IN ('view', 'edit', 'admin'));
  END IF;

  -- Add addedBy column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DealTeamMember' AND column_name = 'addedBy'
  ) THEN
    ALTER TABLE public."DealTeamMember" ADD COLUMN "addedBy" uuid REFERENCES public."User"(id);
  END IF;

  -- Add updatedAt column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'DealTeamMember' AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE public."DealTeamMember" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now();
  END IF;
END $$;

-- 5. Create index for efficient deal team queries
CREATE INDEX IF NOT EXISTS idx_deal_team_member_deal ON public."DealTeamMember"("dealId");
CREATE INDEX IF NOT EXISTS idx_deal_team_member_user ON public."DealTeamMember"("userId");

-- 6. Function to sync firmName from auth.users metadata (run after migration)
-- This updates existing users with their firmName from Supabase auth metadata
-- Run this manually or via a trigger:
/*
UPDATE public."User" u
SET "firmName" = (
  SELECT raw_user_meta_data->>'firm_name'
  FROM auth.users au
  WHERE au.id = u."authId"
)
WHERE u."firmName" IS NULL;
*/

-- 7. Optional: Create a trigger to auto-sync firmName on user creation
-- (Requires Supabase function permissions)
/*
CREATE OR REPLACE FUNCTION sync_user_firm_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."firmName" IS NULL AND NEW."authId" IS NOT NULL THEN
    SELECT raw_user_meta_data->>'firm_name' INTO NEW."firmName"
    FROM auth.users
    WHERE id = NEW."authId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_sync_user_firm_name
BEFORE INSERT OR UPDATE ON public."User"
FOR EACH ROW
EXECUTE FUNCTION sync_user_firm_name();
*/

-- Verification queries:
-- SELECT id, email, name, "firmName" FROM public."User" LIMIT 10;
-- SELECT * FROM public."DealTeamMember" LIMIT 10;
