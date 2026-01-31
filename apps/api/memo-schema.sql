-- ============================================================
-- Investment Memo Builder Database Schema
-- Run this in your Supabase SQL Editor to create the tables
-- ============================================================

-- Memo table - stores investment committee memos
CREATE TABLE IF NOT EXISTS "Memo" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID REFERENCES "Deal"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  "projectName" TEXT,
  type TEXT DEFAULT 'IC_MEMO' CHECK (type IN ('IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM')),
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED')),
  sponsor TEXT,
  "memoDate" DATE,
  version INTEGER DEFAULT 1,
  "createdBy" UUID REFERENCES "User"(id),
  "lastEditedBy" UUID REFERENCES "User"(id),
  collaborators UUID[] DEFAULT '{}',
  "complianceChecked" BOOLEAN DEFAULT false,
  "complianceNotes" TEXT,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MemoSection table - stores individual sections within a memo
CREATE TABLE IF NOT EXISTS "MemoSection" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memoId" UUID NOT NULL REFERENCES "Memo"(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'EXECUTIVE_SUMMARY',
    'COMPANY_OVERVIEW',
    'FINANCIAL_PERFORMANCE',
    'MARKET_DYNAMICS',
    'COMPETITIVE_LANDSCAPE',
    'RISK_ASSESSMENT',
    'DEAL_STRUCTURE',
    'VALUE_CREATION',
    'EXIT_STRATEGY',
    'RECOMMENDATION',
    'APPENDIX',
    'CUSTOM'
  )),
  title TEXT NOT NULL,
  content TEXT,
  "aiGenerated" BOOLEAN DEFAULT false,
  "aiModel" TEXT,
  "aiPrompt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  citations JSONB DEFAULT '[]',
  "tableData" JSONB,
  "chartConfig" JSONB,
  status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'NEEDS_REVIEW')),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MemoConversation table - AI chat conversations for a memo
CREATE TABLE IF NOT EXISTS "MemoConversation" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "memoId" UUID NOT NULL REFERENCES "Memo"(id) ON DELETE CASCADE,
  "userId" UUID REFERENCES "User"(id),
  title TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MemoChatMessage table - individual chat messages
CREATE TABLE IF NOT EXISTS "MemoChatMessage" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL REFERENCES "MemoConversation"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_memo_dealId ON "Memo"("dealId");
CREATE INDEX IF NOT EXISTS idx_memo_status ON "Memo"(status);
CREATE INDEX IF NOT EXISTS idx_memo_createdBy ON "Memo"("createdBy");
CREATE INDEX IF NOT EXISTS idx_memo_updatedAt ON "Memo"("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_memosection_memoId ON "MemoSection"("memoId");
CREATE INDEX IF NOT EXISTS idx_memosection_sortOrder ON "MemoSection"("sortOrder");
CREATE INDEX IF NOT EXISTS idx_memosection_type ON "MemoSection"(type);

CREATE INDEX IF NOT EXISTS idx_memoconversation_memoId ON "MemoConversation"("memoId");
CREATE INDEX IF NOT EXISTS idx_memoconversation_userId ON "MemoConversation"("userId");

CREATE INDEX IF NOT EXISTS idx_memochatmessage_conversationId ON "MemoChatMessage"("conversationId");
CREATE INDEX IF NOT EXISTS idx_memochatmessage_createdAt ON "MemoChatMessage"("createdAt");

-- ============================================================
-- Updated_at trigger function (if not exists)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers for updated_at
DROP TRIGGER IF EXISTS update_memo_updated_at ON "Memo";
CREATE TRIGGER update_memo_updated_at
    BEFORE UPDATE ON "Memo"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memosection_updated_at ON "MemoSection";
CREATE TRIGGER update_memosection_updated_at
    BEFORE UPDATE ON "MemoSection"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memoconversation_updated_at ON "MemoConversation";
CREATE TRIGGER update_memoconversation_updated_at
    BEFORE UPDATE ON "MemoConversation"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE "Memo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoChatMessage" ENABLE ROW LEVEL SECURITY;

-- Memo policies (users can access memos they created or are collaborators on)
CREATE POLICY "Users can view own memos" ON "Memo"
    FOR SELECT
    USING (auth.uid() = "createdBy" OR auth.uid() = ANY(collaborators));

CREATE POLICY "Users can insert own memos" ON "Memo"
    FOR INSERT
    WITH CHECK (auth.uid() = "createdBy");

CREATE POLICY "Users can update own memos" ON "Memo"
    FOR UPDATE
    USING (auth.uid() = "createdBy" OR auth.uid() = ANY(collaborators));

CREATE POLICY "Users can delete own memos" ON "Memo"
    FOR DELETE
    USING (auth.uid() = "createdBy");

-- MemoSection policies (follow parent memo access)
CREATE POLICY "Users can access memo sections" ON "MemoSection"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "Memo"
            WHERE "Memo".id = "MemoSection"."memoId"
            AND (auth.uid() = "Memo"."createdBy" OR auth.uid() = ANY("Memo".collaborators))
        )
    );

-- MemoConversation policies
CREATE POLICY "Users can access memo conversations" ON "MemoConversation"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "Memo"
            WHERE "Memo".id = "MemoConversation"."memoId"
            AND (auth.uid() = "Memo"."createdBy" OR auth.uid() = ANY("Memo".collaborators))
        )
    );

-- MemoChatMessage policies
CREATE POLICY "Users can access memo chat messages" ON "MemoChatMessage"
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "MemoConversation"
            JOIN "Memo" ON "Memo".id = "MemoConversation"."memoId"
            WHERE "MemoConversation".id = "MemoChatMessage"."conversationId"
            AND (auth.uid() = "Memo"."createdBy" OR auth.uid() = ANY("Memo".collaborators))
        )
    );

-- ============================================================
-- Sample Data (Optional - for testing)
-- ============================================================

-- Insert a sample memo (uncomment to use)
*
INSERT INTO "Memo" (title, "projectName", type, status, sponsor, "memoDate")
VALUES (
    'Investment Committee Memo',
    'Project Apollo',
    'IC_MEMO',
    'DRAFT',
    'J. Smith (MD)',
    '2023-10-24'
);

-- Get the memo ID for inserting sections
-- Replace 'MEMO_ID_HERE' with the actual ID from the insert above

INSERT INTO "MemoSection" ("memoId", type, title, content, "aiGenerated", "sortOrder")
VALUES
    ('MEMO_ID_HERE', 'EXECUTIVE_SUMMARY', 'Executive Summary', 'Project Apollo represents...', true, 0),
    ('MEMO_ID_HERE', 'FINANCIAL_PERFORMANCE', 'Financial Performance', 'The Company has consistently...', false, 1),
    ('MEMO_ID_HERE', 'MARKET_DYNAMICS', 'Market Dynamics', 'The global supply chain...', false, 2),
    ('MEMO_ID_HERE', 'RISK_ASSESSMENT', 'Risk Assessment', 'Key risks include...', false, 3),
    ('MEMO_ID_HERE', 'DEAL_STRUCTURE', 'Deal Structure', 'Proposed structure includes...', false, 4);
*
