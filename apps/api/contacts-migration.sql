-- CRM Contacts & Relationship Management
-- Run this in Supabase SQL Editor

-- ─── Drop old tables (old Contact schema was unused) ────────
DROP TABLE IF EXISTS "ContactDeal" CASCADE;
DROP TABLE IF EXISTS "ContactInteraction" CASCADE;
DROP TABLE IF EXISTS "Contact" CASCADE;

-- ─── Contact Table ───────────────────────────────────────────
CREATE TABLE "Contact" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  company TEXT,
  type TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (type IN ('BANKER', 'ADVISOR', 'EXECUTIVE', 'LP', 'LEGAL', 'OTHER')),
  "linkedinUrl" TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  "lastContactedAt" TIMESTAMPTZ,
  "createdBy" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Contact Interaction Table ───────────────────────────────
CREATE TABLE "ContactInteraction" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contactId" UUID NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'NOTE'
    CHECK (type IN ('NOTE', 'MEETING', 'CALL', 'EMAIL', 'OTHER')),
  title TEXT,
  description TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  "createdBy" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── Contact-Deal Link Table (many-to-many) ─────────────────
CREATE TABLE "ContactDeal" (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "contactId" UUID NOT NULL REFERENCES "Contact"(id) ON DELETE CASCADE,
  "dealId" UUID NOT NULL REFERENCES "Deal"(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'OTHER'
    CHECK (role IN ('BANKER', 'ADVISOR', 'BOARD_MEMBER', 'MANAGEMENT', 'OTHER')),
  "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE ("contactId", "dealId")
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contact_type ON "Contact" (type);
CREATE INDEX IF NOT EXISTS idx_contact_company ON "Contact" (company);
CREATE INDEX IF NOT EXISTS idx_contact_created_by ON "Contact" ("createdBy");
CREATE INDEX IF NOT EXISTS idx_contact_name ON "Contact" ("lastName", "firstName");

CREATE INDEX IF NOT EXISTS idx_contact_interaction_contact ON "ContactInteraction" ("contactId");
CREATE INDEX IF NOT EXISTS idx_contact_interaction_date ON "ContactInteraction" (date DESC);

CREATE INDEX IF NOT EXISTS idx_contact_deal_contact ON "ContactDeal" ("contactId");
CREATE INDEX IF NOT EXISTS idx_contact_deal_deal ON "ContactDeal" ("dealId");

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactInteraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactDeal" ENABLE ROW LEVEL SECURITY;

-- Contacts: org-level access
CREATE POLICY "contacts_select" ON "Contact" FOR SELECT USING (true);
CREATE POLICY "contacts_insert" ON "Contact" FOR INSERT WITH CHECK (true);
CREATE POLICY "contacts_update" ON "Contact" FOR UPDATE USING (true);
CREATE POLICY "contacts_delete" ON "Contact" FOR DELETE USING (true);

-- Interactions: access through contact
CREATE POLICY "interactions_select" ON "ContactInteraction" FOR SELECT USING (true);
CREATE POLICY "interactions_insert" ON "ContactInteraction" FOR INSERT WITH CHECK (true);
CREATE POLICY "interactions_delete" ON "ContactInteraction" FOR DELETE USING (true);

-- Contact-Deal links
CREATE POLICY "contact_deal_select" ON "ContactDeal" FOR SELECT USING (true);
CREATE POLICY "contact_deal_insert" ON "ContactDeal" FOR INSERT WITH CHECK (true);
CREATE POLICY "contact_deal_delete" ON "ContactDeal" FOR DELETE USING (true);
