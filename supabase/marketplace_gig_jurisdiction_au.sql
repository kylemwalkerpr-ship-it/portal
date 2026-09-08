-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace · gigs.jurisdiction — add 'au' (Australia)
--
-- The original constraint (supabase/marketplace_gig_jurisdiction.sql) predates
-- AU support: it allows only us|uk|ca|NULL, while the marketplace landing has
-- US/UK/CA/AU country tabs and lib/gigTaxonomy.ts maps AU/AUS/Australia → 'au'.
-- Until this runs, any UPDATE touching a gig whose jurisdiction is or would
-- become 'au' is rejected (hits: scripts/backfill-gig-taxonomy.mts deferred 9
-- Australian gigs whose jurisdiction falls back to provider country 'au').
--
-- Idempotent: drop-and-readd guarded by if exists.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.gigs
  drop constraint if exists gigs_jurisdiction_check;

alter table if exists public.gigs
  add constraint gigs_jurisdiction_check
  check (jurisdiction is null or jurisdiction in ('us', 'uk', 'ca', 'au'));
