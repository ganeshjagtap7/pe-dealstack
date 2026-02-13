-- ============================================================
-- Fix AuditLog table: Add missing columns used by auditLog.ts service
-- Run in Supabase SQL Editor BEFORE the performance indexes script
-- ============================================================

-- The service logs richer data than the original schema supports.
-- Add columns to capture: user context, resource details, severity, metadata.

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userEmail" text;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userRole" text;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityName" text;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "requestId" text;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "severity" text DEFAULT 'INFO';
