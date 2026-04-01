-- Onboarding Status Migration
-- Adds onboardingStatus JSONB column to User table for tracking beta onboarding progress

ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS "onboardingStatus" JSONB DEFAULT '{
  "welcomeShown": false,
  "checklistDismissed": false,
  "steps": {
    "createDeal": false,
    "uploadDocument": false,
    "reviewExtraction": false,
    "tryDealChat": false,
    "inviteTeamMember": false
  }
}'::jsonb;

-- Index for quick lookup of users who haven't completed onboarding
CREATE INDEX IF NOT EXISTS idx_user_onboarding_incomplete
ON public."User" (("onboardingStatus"->>'checklistDismissed'))
WHERE "onboardingStatus"->>'checklistDismissed' = 'false';
