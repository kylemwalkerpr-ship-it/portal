-- =============================================================================
-- marketplace_fiverr_upgrade.sql
-- Phase 1: Fiverr-level Marketplace — Schema & Data Model Hardening
--
-- Safe to run repeatedly (idempotent). Does NOT drop columns, tables, or RLS
-- policies. Existing data remains valid throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. GIG STATUS LIFECYCLE
-- ---------------------------------------------------------------------------

-- 1a. Drop the old CHECK constraint (which only knew 'draft','active','paused',
--     'archived') and recreate it with the full set that includes 'suspended'
--     and 'deleted'.  We check first whether the new values are already present
--     to avoid a no-op drop/recreate on repeat runs.
do $$
begin
  -- Drop the old constraint only if it does NOT already include 'suspended'.
  -- The constraint is named inline (no explicit name) so Postgres auto-names it
  -- gigs_status_check.  We look it up by table + column to be safe.
  if exists (
    select 1
    from information_schema.check_constraints cc
    join information_schema.constraint_column_usage ccu
      on cc.constraint_name = ccu.constraint_name
      and cc.constraint_schema = ccu.constraint_schema
    where ccu.table_schema = 'public'
      and ccu.table_name   = 'gigs'
      and ccu.column_name  = 'status'
      and cc.check_clause not like '%suspended%'
  ) then
    alter table public.gigs drop constraint if exists gigs_status_check;
  end if;
end $$;

-- Re-add the constraint with the full lifecycle set (idempotent via IF NOT EXISTS
-- pattern; Postgres 15+ supports ADD CONSTRAINT IF NOT EXISTS but for broader
-- compat we use the DO-block exception approach).
do $$
begin
  alter table public.gigs
    add constraint gigs_status_check
    check (status in ('draft','active','paused','suspended','archived','deleted'));
exception
  when duplicate_object then null;
end $$;

-- 1b. Migrate paused → suspended (idempotent: rows already suspended are skipped).
update public.gigs
set status = 'suspended'
where status = 'paused';

-- 1c. Add new status-lifecycle columns (all idempotent via IF NOT EXISTS).
alter table public.gigs
  add column if not exists gig_status_reason       text,
  add column if not exists suspended_at            timestamptz,
  add column if not exists suspended_by            uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at             timestamptz,
  add column if not exists deleted_at              timestamptz,
  add column if not exists deleted_by              uuid references public.profiles(id) on delete set null,
  add column if not exists last_status_changed_at  timestamptz;

-- ---------------------------------------------------------------------------
-- 2. GIG CONTENT COMPLETENESS
-- ---------------------------------------------------------------------------

-- tagline is the short pitch visible on marketplace cards (distinct from the
-- existing 'pitch' column which holds the longer seller pitch).
alter table public.gigs
  add column if not exists tagline              text,
  add column if not exists portfolio_items      jsonb    not null default '[]'::jsonb,
  add column if not exists content_score        numeric(5,2) not null default 0,
  add column if not exists last_content_score_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. SELLER LEVEL SNAPSHOTS
-- ---------------------------------------------------------------------------

-- Stores a point-in-time snapshot of the computed seller level for each
-- provider, used for badge display and level-gate enforcement.
create table if not exists public.seller_level_snapshots (
  id                      uuid        primary key default gen_random_uuid(),
  provider_profile_id     uuid        not null references public.profiles(id) on delete cascade,
  provider_type           text        not null check (provider_type in ('attorney','consultant')),
  level                   text        not null check (level in ('new_seller','level_1','level_2','top_attorney','top_consultant')),
  rating                  numeric(3,2) not null default 0,
  completed_orders        integer     not null default 0,
  on_time_delivery_rate   numeric(5,2) not null default 0,
  response_rate           numeric(5,2) not null default 0,
  cancellation_rate       numeric(5,2) not null default 0,
  earnings_cents          integer     not null default 0,
  computed_at             timestamptz not null default now(),
  unique (provider_profile_id, provider_type)
);

-- ---------------------------------------------------------------------------
-- 4. SAVED GIG COLLECTIONS
-- ---------------------------------------------------------------------------

-- Lets clients organise saved gigs into named collections (like Fiverr lists).
create table if not exists public.saved_gig_collections (
  id                uuid        primary key default gen_random_uuid(),
  client_profile_id uuid        not null references public.profiles(id) on delete cascade,
  name              text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. SAVED GIGS
-- ---------------------------------------------------------------------------

-- Bookmarked gigs per client, optionally grouped in a collection.
create table if not exists public.saved_gigs (
  id                uuid        primary key default gen_random_uuid(),
  client_profile_id uuid        not null references public.profiles(id) on delete cascade,
  gig_id            uuid        not null references public.gigs(id) on delete cascade,
  collection_id     uuid        references public.saved_gig_collections(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (client_profile_id, gig_id)
);

-- ---------------------------------------------------------------------------
-- 6. GIG PROMOTION CAMPAIGNS
-- ---------------------------------------------------------------------------

-- Tracks boost / featured campaigns with budget, timeline, and performance.
create table if not exists public.gig_promotion_campaigns (
  id                       uuid        primary key default gen_random_uuid(),
  gig_id                   uuid        not null references public.gigs(id) on delete cascade,
  provider_profile_id      uuid        not null references public.profiles(id) on delete cascade,
  provider_type            text        not null check (provider_type in ('attorney','consultant')),
  campaign_type            text        not null check (campaign_type in ('boost','featured')),
  status                   text        not null default 'draft'
                                       check (status in ('draft','active','completed','cancelled','failed')),
  budget_cents             integer     not null check (budget_cents >= 100),
  currency                 text        not null default 'usd',
  starts_at                timestamptz,
  ends_at                  timestamptz,
  stripe_payment_intent_id text,
  impressions              integer     not null default 0,
  clicks                   integer     not null default 0,
  orders                   integer     not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. UPDATE enforce_gig_limits()
-- ---------------------------------------------------------------------------

-- The original function (fiverr_gig_system.sql) counted gigs with status IN
-- ('draft','active','paused').  The new rule: count all gigs EXCEPT those with
-- status = 'deleted'.  This allows up to 5 non-deleted gigs per provider and
-- correctly handles the new 'suspended' and 'archived' statuses.
--
-- CREATE OR REPLACE is idempotent.
create or replace function public.enforce_gig_limits()
returns trigger
language plpgsql
as $$
begin
  -- Only enforce on non-deleted gigs being created or moved to a non-deleted status.
  if new.status <> 'deleted' and (
    select count(*)
    from public.gigs
    where provider_id   = new.provider_id
      and provider_type = new.provider_type
      and status        <> 'deleted'
      and id            <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 5 then
    raise exception 'Providers can have up to 5 non-deleted gigs.';
  end if;
  return new;
end;
$$;

-- Trigger recreation is idempotent (DROP IF EXISTS + CREATE).
drop trigger if exists gigs_limit_trigger on public.gigs;
create trigger gigs_limit_trigger
before insert or update of provider_id, provider_type, status on public.gigs
for each row execute function public.enforce_gig_limits();

-- ---------------------------------------------------------------------------
-- 8. INDEXES
-- ---------------------------------------------------------------------------

create index if not exists saved_gigs_client_idx
  on public.saved_gigs (client_profile_id);

create index if not exists saved_gigs_gig_idx
  on public.saved_gigs (gig_id);

create index if not exists gig_promotion_campaigns_gig_idx
  on public.gig_promotion_campaigns (gig_id);

create index if not exists seller_level_snapshots_provider_idx
  on public.seller_level_snapshots (provider_profile_id);

-- ---------------------------------------------------------------------------
-- 9. SCHEMA CACHE RELOAD
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
