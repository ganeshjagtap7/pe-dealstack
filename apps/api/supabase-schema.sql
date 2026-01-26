-- AI CRM Database Schema for Supabase
-- Run this SQL in Supabase SQL Editor to create tables

-- Create Company table
CREATE TABLE IF NOT EXISTS "Company" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  website TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Deal table
CREATE TABLE IF NOT EXISTS "Deal" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "companyId" UUID NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'INITIAL_REVIEW',
  status TEXT NOT NULL DEFAULT 'ACTIVE',

  -- Financial metrics
  "irrProjected" DOUBLE PRECISION,
  mom DOUBLE PRECISION,
  ebitda DOUBLE PRECISION,
  revenue DOUBLE PRECISION,

  -- Deal details
  industry TEXT,
  "dealSize" DOUBLE PRECISION,
  description TEXT,
  "aiThesis" TEXT,

  -- Metadata
  icon TEXT DEFAULT 'business_center',
  "lastDocument" TEXT,
  "lastDocumentUpdated" TIMESTAMP WITH TIME ZONE,

  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Document table
CREATE TABLE IF NOT EXISTS "Document" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'OTHER',
  "fileUrl" TEXT,
  "fileSize" INTEGER,
  "mimeType" TEXT,

  -- AI extracted data
  "extractedData" JSONB,
  confidence DOUBLE PRECISION,

  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Activity table
CREATE TABLE IF NOT EXISTS "Activity" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,

  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_deal_companyId" ON "Deal"("companyId");
CREATE INDEX IF NOT EXISTS "idx_deal_stage" ON "Deal"(stage);
CREATE INDEX IF NOT EXISTS "idx_deal_status" ON "Deal"(status);
CREATE INDEX IF NOT EXISTS "idx_deal_updatedAt" ON "Deal"("updatedAt");
CREATE INDEX IF NOT EXISTS "idx_document_dealId" ON "Document"("dealId");
CREATE INDEX IF NOT EXISTS "idx_document_type" ON "Document"(type);
CREATE INDEX IF NOT EXISTS "idx_activity_dealId" ON "Activity"("dealId");
CREATE INDEX IF NOT EXISTS "idx_activity_createdAt" ON "Activity"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_company_name" ON "Company"(name);

-- Insert seed data

-- Insert companies
INSERT INTO "Company" (id, name, industry, description, website)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Apex Logistics', 'Supply Chain SaaS', 'Leading supply chain management platform', 'https://apexlogistics.example.com'),
  ('550e8400-e29b-41d4-a716-446655440002', 'MediCare Plus', 'Healthcare Services', 'Healthcare services provider', 'https://medicareplus.example.com'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Nebula Systems', 'Cloud Infrastructure', 'Cloud infrastructure solutions', 'https://nebulasystems.example.com'),
  ('550e8400-e29b-41d4-a716-446655440004', 'Titan Freight', 'Transportation', 'Freight and transportation services', 'https://titanfreight.example.com')
ON CONFLICT (id) DO NOTHING;

-- Insert deals
INSERT INTO "Deal" (id, name, "companyId", stage, status, "irrProjected", mom, ebitda, revenue, industry, "dealSize", icon, "aiThesis", "lastDocument", "lastDocumentUpdated")
VALUES
  (
    '650e8400-e29b-41d4-a716-446655440001',
    'Apex Logistics',
    '550e8400-e29b-41d4-a716-446655440001',
    'DUE_DILIGENCE',
    'ACTIVE',
    24.5,
    3.5,
    12.4,
    48,
    'Supply Chain SaaS',
    48,
    'webhook',
    'Strong recurring revenue model with high retention. Note: Q3 churn spike detected in document "CIM_v3.pdf" requires deeper dive.',
    'CIM_2023.pdf',
    NOW() - INTERVAL '2 hours'
  ),
  (
    '650e8400-e29b-41d4-a716-446655440002',
    'MediCare Plus',
    '550e8400-e29b-41d4-a716-446655440002',
    'INITIAL_REVIEW',
    'ACTIVE',
    18.2,
    2.1,
    45.0,
    180,
    'Healthcare Services',
    180,
    'monitor_heart',
    'Regulatory tailwinds present in regional market. Extraction confidence high (98%). Stable cash flow profile identified.',
    'Teaser_deck.pdf',
    NOW() - INTERVAL '5 hours'
  ),
  (
    '650e8400-e29b-41d4-a716-446655440003',
    'Nebula Systems',
    '550e8400-e29b-41d4-a716-446655440003',
    'IOI_SUBMITTED',
    'ACTIVE',
    29.1,
    4.2,
    -2.5,
    15,
    'Cloud Infrastructure',
    15,
    'cloud_queue',
    'High growth potential but currently burning cash. Requires operational restructuring post-acquisition to reach profitability.',
    'Email_thread.msg',
    NOW() - INTERVAL '1 day'
  ),
  (
    '650e8400-e29b-41d4-a716-446655440004',
    'Titan Freight',
    '550e8400-e29b-41d4-a716-446655440004',
    'PASSED',
    'PASSED',
    12,
    1.5,
    8.0,
    62,
    'Transportation',
    62,
    'local_shipping',
    'Margins compressing due to rising fuel costs. Owner seeking unrealistic multiple based on 2021 peak.',
    'Financials.xlsx',
    NOW() - INTERVAL '3 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert documents
INSERT INTO "Document" (id, "dealId", name, type, "fileSize", "mimeType", confidence)
VALUES
  ('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'CIM_2023.pdf', 'CIM', 5242880, 'application/pdf', 0.95),
  ('750e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440002', 'Teaser_deck.pdf', 'TEASER', 2097152, 'application/pdf', 0.98),
  ('750e8400-e29b-41d4-a716-446655440003', '650e8400-e29b-41d4-a716-446655440003', 'Email_thread.msg', 'EMAIL', 102400, 'application/vnd.ms-outlook', 0.92),
  ('750e8400-e29b-41d4-a716-446655440004', '650e8400-e29b-41d4-a716-446655440004', 'Financials.xlsx', 'FINANCIALS', 1048576, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 0.88)
ON CONFLICT (id) DO NOTHING;

-- Insert activities
INSERT INTO "Activity" (id, "dealId", type, title, description)
VALUES
  ('850e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', 'DOCUMENT_UPLOADED', 'CIM Document Uploaded', 'Confidential Information Memorandum uploaded and processed'),
  ('850e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440001', 'STAGE_CHANGED', 'Moved to Due Diligence', 'Deal progressed from Initial Review to Due Diligence stage')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (optional - for future auth)
-- ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;

-- Create policies (optional - for future auth)
-- CREATE POLICY "Enable read access for all users" ON "Company" FOR SELECT USING (true);
-- CREATE POLICY "Enable read access for all users" ON "Deal" FOR SELECT USING (true);
-- CREATE POLICY "Enable read access for all users" ON "Document" FOR SELECT USING (true);
-- CREATE POLICY "Enable read access for all users" ON "Activity" FOR SELECT USING (true);
