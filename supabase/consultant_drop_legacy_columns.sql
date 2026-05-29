-- Contract phase of the consultant role refactor (brief 39).
--
-- The expand migration (consultant_role_refactor.sql) added subjects/industries/
-- target_audience to `consultants`, backfilled them from the legacy
-- jurisdictions/practice_areas columns, and left the legacy columns in place
-- with read-with-fallback so no data was lost during the transition.
--
-- This contract migration drops the now-deprecated legacy columns. It is safe to
-- run only AFTER the application no longer reads consultants.jurisdictions /
-- consultants.practice_areas (verified: no consultant-context SELECT names them,
-- read-with-fallbacks simplified to subjects/industries only) AND after a
-- diagnostic confirmed zero consultant rows hold legacy-only data that wasn't
-- backfilled.
--
-- NOTE: this drop is scoped to `consultants` ONLY. The `attorneys` table keeps
-- its jurisdictions/practice_areas columns — that is correct legal vocabulary
-- for attorneys and is still actively read.
--
-- Idempotent / safe to re-run.

alter table public.consultants
  drop column if exists jurisdictions,
  drop column if exists practice_areas;
