-- =============================================================================
-- attorney_credential_columns.sql
-- Give the seller-editable credential_type + bar_number a home on the
-- attorneys row (unique per profile_id) instead of attorney_applications
-- (which can have multiple rows per profile). This kills the "saved value
-- reverts / checklist never clears" bug: every read path now resolves a
-- single, unambiguous row for these two fields.
--
-- attorney_applications stays the immutable vetting record (admin queue,
-- compliance). The attorneys columns are the editable display copy.
--
-- Run in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

alter table public.attorneys add column if not exists credential_type text;
alter table public.attorneys add column if not exists bar_number      text;

-- Backfill from the most recent APPROVED application so existing verified
-- attorneys keep their credential on the new columns. Only fills where the
-- attorneys value is still null, so re-runs never clobber edited values.
update public.attorneys a
set
  credential_type = coalesce(a.credential_type, sub.credential_type),
  bar_number      = coalesce(a.bar_number,      sub.bar_number)
from (
  select distinct on (profile_id)
    profile_id, credential_type, bar_number
  from public.attorney_applications
  where status = 'approved'
  order by profile_id, decided_at desc nulls last, created_at desc
) sub
where a.profile_id = sub.profile_id;

notify pgrst, 'reload schema';
