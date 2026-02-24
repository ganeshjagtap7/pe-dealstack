-- Migration: Add ChatMessage table for AI chat history persistence
-- Run this in Supabase SQL Editor

-- Drop existing table if it has wrong column types
DROP TABLE IF EXISTS "ChatMessage" CASCADE;

-- Create ChatMessage table
-- IMPORTANT: Deal.id is UUID in Supabase, so dealId must be UUID to match FK
CREATE TABLE "ChatMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID REFERENCES "Deal"("id") ON DELETE CASCADE,
  "userId" TEXT,
  "role" TEXT NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX idx_chat_message_deal_id ON "ChatMessage"("dealId");
CREATE INDEX idx_chat_message_created_at ON "ChatMessage"("createdAt");
CREATE INDEX idx_chat_message_deal_created ON "ChatMessage"("dealId", "createdAt");

-- Enable RLS + allow all operations (backend uses anon key)
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for ChatMessage" ON "ChatMessage"
  FOR ALL USING (true) WITH CHECK (true);

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ChatMessage'
ORDER BY ordinal_position;
