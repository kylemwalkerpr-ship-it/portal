-- Root-cause fix for "saved/AI profile content doesn't stick".
--
-- The attorney/consultant write paths resolve the seller row with
-- `order created_at desc limit 1`, but several read paths used a bare
-- maybeSingle(). When a profile had >1 row in attorneys/consultants (legacy
-- state, partial migrations, racing self-heal inserts), reads resolved a
-- different/older row than writes targeted, so saved fields appeared to reset
-- or never showed in the public profile.
--
-- The read paths are now ordered to match the write path. This migration kills
-- the root cause: it de-dupes any existing duplicate seller rows (keeping the
-- newest per profile_id) and adds a UNIQUE(profile_id) constraint so duplicates
-- can never recur. The self-heal inserts in lib/attorneyAuth.ts /
-- lib/consultant.ts become conflict-safe against this constraint.
--
-- Idempotent / safe to re-run.

-- attorneys: keep newest row per profile_id, drop older duplicates
delete from public.attorneys a
 using public.attorneys b
 where a.profile_id = b.profile_id
   and (a.created_at, a.id) < (b.created_at, b.id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attorneys_profile_id_unique') then
    alter table public.attorneys add constraint attorneys_profile_id_unique unique (profile_id);
  end if;
end $$;

-- consultants: same
delete from public.consultants a
 using public.consultants b
 where a.profile_id = b.profile_id
   and (a.created_at, a.id) < (b.created_at, b.id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consultants_profile_id_unique') then
    alter table public.consultants add constraint consultants_profile_id_unique unique (profile_id);
  end if;
end $$;
