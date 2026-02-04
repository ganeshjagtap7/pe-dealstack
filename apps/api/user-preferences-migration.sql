-- Migration: Add preferences column to User table
-- Run this in the Supabase SQL Editor

-- Add preferences JSONB column to User table for storing AI and interface preferences
ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN public."User".preferences IS 'JSON object storing user preferences: { investmentFocus: string[], sourcingSensitivity: number, typography: "modern"|"serif", density: "compact"|"default"|"relaxed" }';

-- Create index for potential JSON queries (optional but good for performance)
CREATE INDEX IF NOT EXISTS idx_user_preferences ON public."User" USING gin (preferences);

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'User'
  AND column_name = 'preferences';
