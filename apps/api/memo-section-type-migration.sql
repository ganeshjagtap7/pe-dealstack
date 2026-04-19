-- ============================================================
-- Migration: Expand MemoSection.type CHECK constraint
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the existing CHECK constraint on type
ALTER TABLE "MemoSection" DROP CONSTRAINT IF EXISTS "MemoSection_type_check";

-- Add updated CHECK constraint with all section types
ALTER TABLE "MemoSection" ADD CONSTRAINT "MemoSection_type_check"
  CHECK (type IN (
    'EXECUTIVE_SUMMARY',
    'COMPANY_OVERVIEW',
    'FINANCIAL_PERFORMANCE',
    'QUALITY_OF_EARNINGS',
    'MARKET_DYNAMICS',
    'COMPETITIVE_LANDSCAPE',
    'MANAGEMENT_ASSESSMENT',
    'OPERATIONAL_DEEP_DIVE',
    'RISK_ASSESSMENT',
    'DEAL_STRUCTURE',
    'VALUE_CREATION',
    'VALUE_CREATION_PLAN',
    'EXIT_STRATEGY',
    'EXIT_ANALYSIS',
    'RECOMMENDATION',
    'APPENDIX',
    'CUSTOM'
  ));
