-- Fix: Mark existing users as onboarded
-- The original migration set welcomeShown=false for ALL users, causing
-- existing users to see the onboarding flow meant only for new signups.
-- This marks users who already have deals in their org as fully onboarded.

UPDATE public."User" u
SET "onboardingStatus" = jsonb_build_object(
  'welcomeShown', true,
  'checklistDismissed', true,
  'completedAt', now()::text,
  'steps', jsonb_build_object(
    'createDeal', true,
    'uploadDocument', true,
    'reviewExtraction', true,
    'tryDealChat', true,
    'inviteTeamMember', true
  )
)
WHERE EXISTS (
  SELECT 1 FROM public."Deal" d
  WHERE d."organizationId" = u."organizationId"
)
AND (u."onboardingStatus"->>'welcomeShown')::boolean = false;
