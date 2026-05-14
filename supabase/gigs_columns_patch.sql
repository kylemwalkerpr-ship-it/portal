-- =============================================================================
-- gigs_columns_patch.sql
-- Ensures every column the admin gigs API expects exists on public.gigs.
-- Safe to run multiple times — all ADD COLUMN IF NOT EXISTS.
-- Run this if you see "column gigs.X does not exist" errors anywhere.
-- =============================================================================

alter table public.gigs
  -- Status lifecycle columns (from marketplace_fiverr_upgrade.sql)
  add column if not exists gig_status_reason       text,
  add column if not exists suspended_at            timestamptz,
  add column if not exists suspended_by            uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at             timestamptz,
  add column if not exists deleted_at              timestamptz,
  add column if not exists deleted_by              uuid references public.profiles(id) on delete set null,
  add column if not exists last_status_changed_at  timestamptz,
  -- Content + presentation
  add column if not exists tagline                 text,
  add column if not exists portfolio_items         jsonb        not null default '[]'::jsonb,
  add column if not exists content_score           numeric(5,2) not null default 0,
  add column if not exists last_content_score_at   timestamptz,
  -- Moderation v2 (from gig_management_v2.sql)
  add column if not exists denial_reason           text,
  add column if not exists denial_category         text,
  add column if not exists appeal_reason           text,
  add column if not exists appeal_submitted_at     timestamptz,
  add column if not exists appeal_resolved_at      timestamptz,
  add column if not exists auto_flag_score         numeric(5,2) default 0,
  add column if not exists auto_flag_reasons       jsonb default '[]'::jsonb,
  add column if not exists auto_flagged_at         timestamptz,
  add column if not exists version_number          integer default 0,
  add column if not exists content_score_computed_at timestamptz;

-- ─── Extend gig status to include new states (idempotent) ─────────────────
do $$
begin
  if exists (
    select 1
    from information_schema.check_constraints cc
    join information_schema.constraint_column_usage ccu
      on cc.constraint_name = ccu.constraint_name
      and cc.constraint_schema = ccu.constraint_schema
    where ccu.table_schema = 'public'
      and ccu.table_name   = 'gigs'
      and ccu.column_name  = 'status'
      and cc.check_clause not like '%pending_review%'
  ) then
    alter table public.gigs drop constraint if exists gigs_status_check;
  end if;
end $$;

do $$
begin
  alter table public.gigs
    add constraint gigs_status_check
    check (status in ('draft','active','paused','suspended','archived','deleted','pending_review','denied','appeal_pending'));
exception when duplicate_object then null;
end $$;

-- ─── Indexes the admin gigs APIs rely on ──────────────────────────────────
create index if not exists gigs_autoflag_idx
  on public.gigs (auto_flag_score desc)
  where auto_flag_score > 0 and status = 'active';

create index if not exists gigs_modqueue_idx
  on public.gigs (status, created_at)
  where status in ('pending_review','denied','appeal_pending');

create index if not exists gigs_provider_status_idx
  on public.gigs (provider_id, provider_type, status)
  where deleted_at is null;

-- Force PostgREST to refresh its schema cache
notify pgrst, 'reload schema';
