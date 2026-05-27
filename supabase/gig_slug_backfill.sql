-- =============================================================================
-- gig_slug_backfill.sql
-- Creates infrastructure for tracking gig slug changes and 301 redirects.
--
-- Part of the gig slug cleanup: existing slugs with random hash suffixes are
-- replaced with clean SEO slugs via the companion Node.js script
-- (scripts/backfill-gig-slugs.mjs).
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).
-- =============================================================================

-- ─── Redirect tracking table ───────────────────────────────────────────────
-- Records every slug change so the API can serve HTTP 301 redirects when
-- a marketplace visitor hits an old slug URL (bookmark, backlink, etc.).
create table if not exists public.gig_slug_redirects (
  id            uuid        primary key default gen_random_uuid(),
  gig_id        uuid        not null references public.gigs(id) on delete cascade,
  old_slug      text        not null,
  new_slug      text        not null,
  created_at    timestamptz not null default now(),

  -- Prevent duplicate redirect entries for the same old_slug → gig_id pair.
  unique (gig_id, old_slug)
);

create index if not exists gig_slug_redirects_old_slug_idx
  on public.gig_slug_redirects (old_slug);

create index if not exists gig_slug_redirects_new_slug_idx
  on public.gig_slug_redirects (new_slug);

-- ─── Schema cache reload ──────────────────────────────────────────────────
notify pgrst, 'reload schema';
