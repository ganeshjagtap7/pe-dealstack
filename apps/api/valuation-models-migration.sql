-- ============================================================
-- ValuationModel Table — standalone LBO/DCF valuation models
-- Users build named valuation scenarios (LBO, DCF, etc.) with
-- their own assumptions (WACC, DSCR, growth, exit multiple, ...)
-- and converse with the AI to modify them.
--
-- Computed outputs are NOT stored — recomputed deterministically
-- from `assumptions` on every read via lib/lbo-model.ts.
--
-- Run once in Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."ValuationModel" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES public."Organization"(id) ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled LBO',
  type TEXT NOT NULL DEFAULT 'lbo',
  assumptions JSONB NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_model_org
  ON public."ValuationModel"("organizationId");

CREATE INDEX IF NOT EXISTS idx_valuation_model_user
  ON public."ValuationModel"("userId");

-- ============================================================
-- ValuationModelMessage Table — chat history per model
-- Mirrors the MemoChatMessage pattern: append-only role/content rows
-- scoped to a parent model. Kept lightweight (no separate
-- conversation row) since each model has exactly one chat thread.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."ValuationModelMessage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "modelId" UUID NOT NULL REFERENCES public."ValuationModel"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_model_message_model
  ON public."ValuationModelMessage"("modelId", "createdAt");

-- ============================================================
-- Row Level Security
-- Same pattern as Watchlist: service role for the API, authenticated
-- read access scoped to org membership for defense in depth.
-- ============================================================

ALTER TABLE public."ValuationModel" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ValuationModel"
  ON public."ValuationModel"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Org members can read their org valuation models"
  ON public."ValuationModel"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public."User"
      WHERE "User"."authId" = auth.uid()
        AND "User"."organizationId" = "ValuationModel"."organizationId"
    )
  );

ALTER TABLE public."ValuationModelMessage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on ValuationModelMessage"
  ON public."ValuationModelMessage"
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Org members can read their org valuation messages"
  ON public."ValuationModelMessage"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public."ValuationModel" vm
      JOIN public."User" u ON u."organizationId" = vm."organizationId"
      WHERE vm.id = "ValuationModelMessage"."modelId"
        AND u."authId" = auth.uid()
    )
  );
