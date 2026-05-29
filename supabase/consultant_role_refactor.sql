-- =============================================================================
-- consultant_role_refactor.sql
-- Replace legal-coded column names on consultants with non-legal equivalents.
-- Consultants are not attorneys; they do not have jurisdictions or practice
-- areas. The new columns (industries, subjects, target_audience) align the
-- schema with the actual consultant domain.
--
-- 1) Adds the three new columns (nullable, safe to re-run).
-- 2) Backfills industries from practice_areas and subjects from jurisdictions
--    only where the new column is still null, so re-runs never clobber edits.
-- 3) practice_areas and jurisdictions are left in place — they are deprecated
--    and will be dropped in a future migration after Phase 5 read-with-fallback
--    is verified across all consumer code paths.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

alter table if exists public.consultants
  add column if not exists industries      text,
  add column if not exists subjects        text,
  add column if not exists target_audience text;

-- Backfill: where the new columns are still null but legacy legal-coded
-- columns have content, copy them across so the new columns are populated
-- and the legacy ones become read-only.
update public.consultants
   set industries = coalesce(industries, practice_areas)
 where industries is null and practice_areas is not null;

update public.consultants
   set subjects = coalesce(subjects, jurisdictions)
 where subjects is null and jurisdictions is not null;

-- Schema-level deprecation markers so the intent is visible in introspection.
comment on column public.consultants.practice_areas is
  'Deprecated: replaced by industries. Will be dropped after Phase 5 read-with-fallback is verified.';
comment on column public.consultants.jurisdictions is
  'Deprecated: replaced by subjects. Will be dropped after Phase 5 read-with-fallback is verified.';

notify pgrst, 'reload schema';
