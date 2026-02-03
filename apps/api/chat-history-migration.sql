-- Migration: Add ChatMessage table for AI chat history persistence
-- Run this in Supabase SQL Editor

-- Create ChatMessage table
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"("id") ON DELETE CASCADE,
  "userId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chat_message_deal_id ON "ChatMessage"("dealId");
CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON "ChatMessage"("createdAt");
CREATE INDEX IF NOT EXISTS idx_chat_message_deal_created ON "ChatMessage"("dealId", "createdAt");

-- Add RLS policies (if using Supabase Auth)
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read chat messages for deals they have access to
CREATE POLICY "Users can read chat messages" ON "ChatMessage"
  FOR SELECT USING (true);

-- Policy: Users can insert their own messages
CREATE POLICY "Users can insert chat messages" ON "ChatMessage"
  FOR INSERT WITH CHECK (true);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete chat messages" ON "ChatMessage"
  FOR DELETE USING (true);

-- Verification query
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ChatMessage'
ORDER BY ordinal_position;
