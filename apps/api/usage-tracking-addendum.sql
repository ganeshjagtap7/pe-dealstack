-- ============================================================
-- AI Usage Tracking — Operation Credits Addendum
-- Run AFTER usage-tracking-migration.sql, anytime before/after deploy.
-- Idempotent (ON CONFLICT DO UPDATE).
--
-- Adds three operation labels that were introduced when wrapping
-- LangChain agents and the LinkedIn scraper. The wrapper falls back to
-- 1-credit-per-call + warn log for unseeded operations, so this addendum
-- is informational/cosmetic — it primarily tunes the credit values that
-- show up in the user-facing "AI Usage" panel.
-- ============================================================

INSERT INTO public."OperationCredits" (operation, credits, description) VALUES
  ('email_drafting',     5, 'Generate or refine an outbound email draft'),
  ('contact_enrichment', 8, 'Enrich a contact record with public data'),
  ('linkedin_scrape',    5, 'Scrape one LinkedIn profile via Apify')
ON CONFLICT (operation) DO UPDATE SET
  credits     = EXCLUDED.credits,
  description = EXCLUDED.description;

-- Verify:
-- SELECT operation, credits FROM public."OperationCredits" ORDER BY credits DESC;
