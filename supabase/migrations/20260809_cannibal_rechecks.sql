-- 20260809_cannibal_rechecks.sql — follow-up verification for resolved clusters
-- Resolutions are not considered complete until fresh GSC data verifies them.
-- Idempotent and safe to apply after 20260808_cannibal_merges.sql.

alter table if exists cannibal_merges
  add column if not exists resolution_type text not null default 'consolidate',
  add column if not exists follow_up_at timestamptz,
  add column if not exists differentiation_plan jsonb;

alter table if exists cannibal_merges
  drop constraint if exists cannibal_merges_status_check;

alter table if exists cannibal_merges
  add constraint cannibal_merges_status_check
  check (status in ('merged', 'skipped', 'differentiating', 'deferred'));

create index if not exists idx_cannibal_merges_follow_up
  on cannibal_merges (follow_up_at)
  where follow_up_at is not null;

comment on column cannibal_merges.follow_up_at is
  'When fresh GSC data should verify this resolution; past due rows resurface in the War Room.';
