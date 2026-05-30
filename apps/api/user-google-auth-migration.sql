-- ============================================================
-- UserGoogleAuth — per-user Google OAuth token store
--
-- Phase 3 of the NDA work pivots auth to Supabase's Google
-- OAuth provider. Supabase returns the Google access + refresh
-- tokens on the session (`provider_token` / `provider_refresh_token`)
-- but does NOT auto-refresh `provider_token` once it expires.
--
-- This table holds the per-user Google refresh token server-side
-- so `googleAuthService.getUserGoogleAccessToken(userId)` can mint
-- a fresh access token on demand (used by the NDA send flow to
-- create Google Docs + grant Drive ACLs).
--
-- One row per Supabase user. `userId` is the Supabase auth user id
-- (same value as `req.user.id` after `authMiddleware`).
--
-- Run in your Supabase SQL Editor. Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS "UserGoogleAuth" (
  "userId" TEXT PRIMARY KEY,
  "googleEmail" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMPTZ NOT NULL,
  "scopes" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "UserGoogleAuth_googleEmail_idx"
  ON "UserGoogleAuth"("googleEmail");

-- Reuse the shared updatedAt trigger function defined in
-- legal-document-migration.sql / supabase-schema.sql.
DROP TRIGGER IF EXISTS update_usergoogleauth_updated_at ON "UserGoogleAuth";
CREATE TRIGGER update_usergoogleauth_updated_at
  BEFORE UPDATE ON "UserGoogleAuth"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
