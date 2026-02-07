-- Migration: Add Memo Builder Tables
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Create enums if they don't exist
DO $$ BEGIN
    CREATE TYPE memo_type AS ENUM ('IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE memo_status AS ENUM ('DRAFT', 'REVIEW', 'FINAL', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE memo_section_type AS ENUM (
        'EXECUTIVE_SUMMARY', 'COMPANY_OVERVIEW', 'FINANCIAL_PERFORMANCE',
        'MARKET_DYNAMICS', 'COMPETITIVE_LANDSCAPE', 'RISK_ASSESSMENT',
        'DEAL_STRUCTURE', 'VALUE_CREATION', 'EXIT_STRATEGY',
        'RECOMMENDATION', 'APPENDIX', 'CUSTOM'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Memo table
CREATE TABLE IF NOT EXISTS "Memo" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    "projectName" TEXT,
    "dealId" TEXT REFERENCES "Deal"(id) ON DELETE SET NULL,
    type memo_type DEFAULT 'IC_MEMO',
    status memo_status DEFAULT 'DRAFT',
    sponsor TEXT,
    "memoDate" TIMESTAMP WITH TIME ZONE,
    "createdBy" TEXT,
    "lastEditedBy" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for Memo
CREATE INDEX IF NOT EXISTS idx_memo_deal_id ON "Memo"("dealId");
CREATE INDEX IF NOT EXISTS idx_memo_status ON "Memo"(status);
CREATE INDEX IF NOT EXISTS idx_memo_updated_at ON "Memo"("updatedAt");

-- MemoSection table
CREATE TABLE IF NOT EXISTS "MemoSection" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "memoId" UUID NOT NULL REFERENCES "Memo"(id) ON DELETE CASCADE,
    type memo_section_type NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    "sortOrder" INTEGER DEFAULT 0,
    "aiGenerated" BOOLEAN DEFAULT FALSE,
    "aiModel" TEXT,
    "aiPrompt" TEXT,
    "tableData" JSONB,
    "chartConfig" JSONB,
    citations JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for MemoSection
CREATE INDEX IF NOT EXISTS idx_memo_section_memo_id ON "MemoSection"("memoId");
CREATE INDEX IF NOT EXISTS idx_memo_section_sort_order ON "MemoSection"("sortOrder");

-- MemoConversation table
CREATE TABLE IF NOT EXISTS "MemoConversation" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "memoId" UUID NOT NULL REFERENCES "Memo"(id) ON DELETE CASCADE,
    "userId" TEXT,
    title TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for MemoConversation
CREATE INDEX IF NOT EXISTS idx_memo_conversation_memo_id ON "MemoConversation"("memoId");
CREATE INDEX IF NOT EXISTS idx_memo_conversation_user_id ON "MemoConversation"("userId");

-- MemoChatMessage table
CREATE TABLE IF NOT EXISTS "MemoChatMessage" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL REFERENCES "MemoConversation"(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for MemoChatMessage
CREATE INDEX IF NOT EXISTS idx_memo_chat_message_conversation_id ON "MemoChatMessage"("conversationId");
CREATE INDEX IF NOT EXISTS idx_memo_chat_message_created_at ON "MemoChatMessage"("createdAt");

-- ChatMessage table (for deal-level chat)
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "dealId" TEXT REFERENCES "Deal"(id) ON DELETE CASCADE,
    "userId" TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for ChatMessage
CREATE INDEX IF NOT EXISTS idx_chat_message_deal_id ON "ChatMessage"("dealId");
CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON "ChatMessage"("createdAt");

-- Update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updatedAt
DROP TRIGGER IF EXISTS update_memo_updated_at ON "Memo";
CREATE TRIGGER update_memo_updated_at BEFORE UPDATE ON "Memo"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memo_section_updated_at ON "MemoSection";
CREATE TRIGGER update_memo_section_updated_at BEFORE UPDATE ON "MemoSection"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_memo_conversation_updated_at ON "MemoConversation";
CREATE TRIGGER update_memo_conversation_updated_at BEFORE UPDATE ON "MemoConversation"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE "Memo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemoChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for authenticated users - adjust as needed)
CREATE POLICY "Allow all for Memo" ON "Memo" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MemoSection" ON "MemoSection" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MemoConversation" ON "MemoConversation" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MemoChatMessage" ON "MemoChatMessage" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for ChatMessage" ON "ChatMessage" FOR ALL USING (true) WITH CHECK (true);

-- Success message
SELECT 'Memo tables created successfully!' as message;
