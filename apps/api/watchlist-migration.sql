-- ============================================================
-- Watchlist Table — for the Dashboard "Watchlist" widget
-- Tracks companies the team is monitoring but hasn't formally
-- entered into the deal pipeline.
-- Run once in Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."Watchlist" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES public."Organization"(id) ON DELETE CASCADE,
  "companyName" TEXT NOT NULL,
  industry TEXT,
  notes TEXT,
  "addedBy" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_org
  ON public."Watchlist"("organizationId");

-- ============================================================
-- Row Level Security
-- Match the pattern used by Contact / Deal: only the service role
-- inserts (server-side via supabase service key) and reads are
-- gated by the API layer's orgMiddleware. Enable RLS so direct
-- client access is blocked by default.
-- ============================================================

ALTER TABLE public."Watchlist" ENABLE ROW LEVEL SECURITY;

-- Allow service-role full access (server uses service key)
CREATE POLICY "Service role full access" ON public."Watchlist"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users can read rows for their own org (defense in depth)
CREATE POLICY "Org members can read watchlist" ON public."Watchlist"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public."User"
      WHERE "User"."authId" = auth.uid()
        AND "User"."organizationId" = "Watchlist"."organizationId"
    )
  );
