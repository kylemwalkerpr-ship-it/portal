-- =============================================================================
-- attorney_application_malpractice_optional.sql
-- Fix: attorney sign-up failed with "Could not save your application." for any
-- applicant who left Malpractice insurance blank.
--
-- The apply form + /api/attorney/apply treat malpractice_insurance as OPTIONAL
-- (many solicitors carry firm-wide PI cover with no individual policy number),
-- and the route inserts NULL when it's blank. But the column was created
-- NOT NULL in allow_attorney_role.sql, so the insert hit a 23502 not-null
-- violation and returned a 500.
--
-- Align the DB with the application's intent: make the column nullable.
-- Idempotent / safe to re-run.
-- Applied to production via the Supabase Management API on 2026-05-29.
-- =============================================================================

alter table public.attorney_applications
  alter column malpractice_insurance drop not null;

notify pgrst, 'reload schema';
