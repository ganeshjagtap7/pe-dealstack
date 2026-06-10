-- ============================================================
-- Contact email de-duplication + unique constraint Migration
-- Run this in Supabase SQL Editor (manual — see CLAUDE.md "Manual SQL
-- migration drift": features silently no-op if this isn't applied).
-- ============================================================
--
-- Two surfaces create contacts with no duplicate checking:
--   * POST /api/contacts (apps/api/src/routes/contacts.ts)
--   * the Gmail-suggestions "Add" flow (web-next GmailSuggestions.tsx),
--     where double-clicking a suggestion creates two identical contacts.
--   * the CSV import handler (POST /api/contacts/import).
--
-- The application layer now rejects duplicate emails (case-insensitive,
-- org-scoped) at create time, but that only protects NEW rows and still
-- has a race window. This migration:
--   (A) cleans up EXISTING duplicates already in the DB, repointing every
--       child reference to the kept (oldest) row, then deleting the dupes;
--   (B) installs a partial unique index so the DB enforces the invariant
--       and the API's 23505 race-fallback has something to catch.
--
-- Idempotent: safe to run more than once. Step (A) is a no-op once dupes
-- are gone; step (B) uses IF NOT EXISTS.
--
-- Dedup key: (lower(email), "organizationId"), ignoring NULL/empty emails.
-- "Kept" row per group = the one with the oldest "createdAt" (ties broken
-- by id for determinism).
--
-- Child tables referencing "Contact"(id) that must be repointed:
--   * "ContactInteraction"."contactId"            (no unique constraint — plain UPDATE)
--   * "ContactDeal"."contactId"                   (UNIQUE(contactId, dealId))
--   * "ContactRelationship"."contactId"           (UNIQUE(contactId, relatedContactId),
--   * "ContactRelationship"."relatedContactId"     CHECK contactId <> relatedContactId)
--   * "IntegrationActivity"."contactIds" (UUID[])  (array membership, no FK)
-- ============================================================

BEGIN;

-- ─── (A) Clean up existing duplicates ────────────────────────
--
-- Build a mapping from each duplicate contact id -> the kept id for its
-- (lower(email), organizationId) group. Only groups with >1 row appear here,
-- and the kept row maps to itself only implicitly (it is excluded as a "dup").
WITH ranked AS (
  SELECT
    id,
    "organizationId",
    "createdAt",
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(email), "organizationId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS keep_id
  FROM "Contact"
  WHERE email IS NOT NULL AND email <> ''
),
dup_map AS (
  -- Materialize the dup -> keep mapping into a temp table so every step below
  -- (which mutates "Contact") sees a stable snapshot.
  SELECT id AS dup_id, keep_id
  FROM ranked
  WHERE id <> keep_id
)
SELECT dup_id, keep_id
INTO TEMP TABLE _contact_dedup_map
FROM dup_map;

-- ── ContactInteraction: no unique constraint, repoint unconditionally. ──
UPDATE "ContactInteraction" ci
SET "contactId" = m.keep_id
FROM _contact_dedup_map m
WHERE ci."contactId" = m.dup_id;

-- ── ContactDeal: UNIQUE(contactId, dealId). Repoint only where the kept
--    contact isn't already linked to that deal; delete the would-be dupes. ──
DELETE FROM "ContactDeal" cd
USING _contact_dedup_map m
WHERE cd."contactId" = m.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactDeal" keep
    WHERE keep."contactId" = m.keep_id
      AND keep."dealId" = cd."dealId"
  );

UPDATE "ContactDeal" cd
SET "contactId" = m.keep_id
FROM _contact_dedup_map m
WHERE cd."contactId" = m.dup_id;

-- ── ContactRelationship: repoint BOTH endpoints. Constraints to respect:
--    UNIQUE(contactId, relatedContactId) and CHECK(contactId <> relatedContactId).
--    Order matters: first remove edges that would self-loop or collide after
--    repointing, then repoint each side. ──

-- 1) Drop edges that would become self-loops once both endpoints map to keep
--    (e.g. an edge between two contacts that both collapse into the same kept
--    contact, or an edge from a dup to its own kept row).
DELETE FROM "ContactRelationship" cr
USING _contact_dedup_map ms, _contact_dedup_map mt
WHERE cr."contactId" = ms.dup_id
  AND cr."relatedContactId" = mt.dup_id
  AND ms.keep_id = mt.keep_id;

DELETE FROM "ContactRelationship" cr
USING _contact_dedup_map m
WHERE cr."contactId" = m.dup_id
  AND cr."relatedContactId" = m.keep_id;

DELETE FROM "ContactRelationship" cr
USING _contact_dedup_map m
WHERE cr."relatedContactId" = m.dup_id
  AND cr."contactId" = m.keep_id;

-- 2) Repoint the "contactId" (source) side, deleting any edge that would
--    duplicate an already-existing (keep_id, relatedContactId) edge.
DELETE FROM "ContactRelationship" cr
USING _contact_dedup_map m
WHERE cr."contactId" = m.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactRelationship" keep
    WHERE keep."contactId" = m.keep_id
      AND keep."relatedContactId" = cr."relatedContactId"
  );

UPDATE "ContactRelationship" cr
SET "contactId" = m.keep_id
FROM _contact_dedup_map m
WHERE cr."contactId" = m.dup_id;

-- 3) Repoint the "relatedContactId" (target) side, same dedupe guard.
DELETE FROM "ContactRelationship" cr
USING _contact_dedup_map m
WHERE cr."relatedContactId" = m.dup_id
  AND EXISTS (
    SELECT 1 FROM "ContactRelationship" keep
    WHERE keep."relatedContactId" = m.keep_id
      AND keep."contactId" = cr."contactId"
  );

UPDATE "ContactRelationship" cr
SET "relatedContactId" = m.keep_id
FROM _contact_dedup_map m
WHERE cr."relatedContactId" = m.dup_id;

-- ── IntegrationActivity."contactIds" (UUID[]): no FK, repoint by array
--    rewrite. Replace each dup id with its keep id, then de-dupe the array so
--    a contact never appears twice. Only touch rows that actually contain a
--    dup id. ──
UPDATE "IntegrationActivity" ia
SET "contactIds" = sub.deduped
FROM (
  SELECT
    ia2.id,
    ARRAY(
      SELECT DISTINCT COALESCE(m.keep_id, cid)
      FROM unnest(ia2."contactIds") AS cid
      LEFT JOIN _contact_dedup_map m ON m.dup_id = cid
    ) AS deduped
  FROM "IntegrationActivity" ia2
  WHERE ia2."contactIds" && (SELECT ARRAY(SELECT dup_id FROM _contact_dedup_map))
) sub
WHERE ia.id = sub.id;

-- ── Finally, delete the now-orphaned duplicate Contact rows. ──
DELETE FROM "Contact" c
USING _contact_dedup_map m
WHERE c.id = m.dup_id;

DROP TABLE IF EXISTS _contact_dedup_map;

-- ─── (B) Enforce uniqueness going forward ────────────────────
--
-- Partial, case-insensitive unique index. NULL and empty emails are excluded
-- so contacts without an email are never blocked. The API maps a 23505 from
-- this index to HTTP 409 (race fallback).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_email_org_unique
  ON "Contact" (lower(email), "organizationId")
  WHERE email IS NOT NULL AND email <> '';

COMMIT;
