-- Agent Memory & Narrative Insights Tables
-- Run on Supabase after Organization table exists

-- 1. Industry pattern memory (running averages per industry)
CREATE TABLE IF NOT EXISTS "AgentMemoryIndustry" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  industry TEXT NOT NULL,
  metric TEXT NOT NULL,
  "typicalLow" NUMERIC,
  "typicalMid" NUMERIC,
  "typicalHigh" NUMERIC,
  "sampleSize" INTEGER DEFAULT 1,
  source TEXT DEFAULT 'observed' CHECK (source IN ('observed', 'seeded')),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("organizationId", industry, metric)
);

CREATE INDEX idx_agent_memory_industry_org ON "AgentMemoryIndustry"("organizationId", industry);

-- 2. Extraction learnings (what works for which doc types)
CREATE TABLE IF NOT EXISTS "AgentMemoryExtraction" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  "documentPattern" TEXT NOT NULL,
  "fileType" TEXT NOT NULL CHECK ("fileType" IN ('pdf', 'excel', 'image')),
  "bestExtractionSource" TEXT CHECK ("bestExtractionSource" IN ('gpt4o', 'azure', 'vision')),
  "avgConfidence" NUMERIC,
  "commonCorrections" JSONB DEFAULT '[]',
  "totalExtractions" INTEGER DEFAULT 1,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("organizationId", "documentPattern", "fileType")
);

-- 3. Deal metrics history (portfolio benchmarking)
CREATE TABLE IF NOT EXISTS "AgentMemoryDealHistory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  industry TEXT,
  "latestRevenue" NUMERIC,
  "latestEbitda" NUMERIC,
  "ebitdaMargin" NUMERIC,
  "revenueCAGR" NUMERIC,
  "qoeScore" INTEGER,
  "fcfConversion" NUMERIC,
  leverage NUMERIC,
  "lboPasses" BOOLEAN,
  "snapshotAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("organizationId", "dealId")
);

CREATE INDEX idx_agent_memory_deal_org ON "AgentMemoryDealHistory"("organizationId");

-- 4. Narrative insight cache (avoid repeat GPT-4o calls)
CREATE TABLE IF NOT EXISTS "NarrativeInsightCache" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  "organizationId" UUID NOT NULL REFERENCES "Organization"(id) ON DELETE CASCADE,
  "analysisHash" TEXT NOT NULL,
  insights JSONB NOT NULL,
  "generatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("dealId", "analysisHash")
);

CREATE INDEX idx_narrative_cache_deal ON "NarrativeInsightCache"("dealId");
