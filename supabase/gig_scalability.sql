-- =============================================================================
-- gig_scalability.sql
-- Future-proofing gig limits and query performance for 100k+ providers.
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add gig_limit per seller level (multiples of 5, Fiverr-standard)
--    New Seller = 5, Level 1 = 10, Level 2 = 15, Top Rated = 20
-- ---------------------------------------------------------------------------
alter table public.seller_level_thresholds
  add column if not exists gig_limit integer not null default 5
    check (gig_limit > 0 and gig_limit % 5 = 0);

-- Seed / update the limits for each level
update public.seller_level_thresholds set gig_limit = 5  where level = 'new_seller';
update public.seller_level_thresholds set gig_limit = 10 where level = 'level_1';
update public.seller_level_thresholds set gig_limit = 15 where level = 'level_2';
update public.seller_level_thresholds set gig_limit = 20 where level = 'top_rated';
-- top_attorney / top_consultant share the top_rated bucket
update public.seller_level_thresholds set gig_limit = 20 where level in ('top_attorney','top_consultant');

-- ---------------------------------------------------------------------------
-- 2. Custom per-provider gig limit (admin override, must be multiple of 5)
--    Stored directly on the provider profile row.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists custom_gig_limit integer default null
    check (custom_gig_limit is null or (custom_gig_limit > 0 and custom_gig_limit % 5 = 0));

-- ---------------------------------------------------------------------------
-- 3. Replace enforce_gig_limits() with a level-aware version.
--    Priority order for the cap:
--      1. profiles.custom_gig_limit  (admin override, highest priority)
--      2. seller_level_thresholds.gig_limit  (current level cap)
--      3. Hardcoded fallback of 5   (no level data yet)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_gig_limits()
returns trigger
language plpgsql
as $$
declare
  resolved_limit integer := 5;        -- fallback
  snapshot_level text;
  level_limit    integer;
  custom_limit   integer;
begin
  -- Only enforce on non-deleted inserts/updates
  if new.status = 'deleted' then
    return new;
  end if;

  -- Resolve the effective cap for this provider
  -- Step 1: check custom_gig_limit on the profile
  select custom_gig_limit
    into custom_limit
    from public.profiles
   where id = new.provider_id;

  if custom_limit is not null then
    resolved_limit := custom_limit;
  else
    -- Step 2: current seller level from snapshots
    select level into snapshot_level
      from public.seller_level_snapshots
     where provider_profile_id = new.provider_id
       and provider_type       = new.provider_type
     order by computed_at desc
     limit 1;

    if snapshot_level is not null then
      -- Map top_attorney / top_consultant to top_rated bucket
      if snapshot_level in ('top_attorney','top_consultant') then
        snapshot_level := 'top_rated';
      end if;

      select gig_limit into level_limit
        from public.seller_level_thresholds
       where level = snapshot_level;

      if level_limit is not null then
        resolved_limit := level_limit;
      end if;
    end if;
  end if;

  -- Count existing non-deleted gigs for this provider
  if (
    select count(*)
      from public.gigs
     where provider_id   = new.provider_id
       and provider_type = new.provider_type
       and status        <> 'deleted'
       and id            <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= resolved_limit then
    raise exception
      'Gig limit reached (%). Delete or archive existing services to create more. Your current level allows up to % services.',
      resolved_limit, resolved_limit;
  end if;

  return new;
end;
$$;

-- Recreate the trigger (DROP IF EXISTS + CREATE is idempotent)
drop trigger if exists gigs_limit_trigger on public.gigs;
create trigger gigs_limit_trigger
before insert or update of provider_id, provider_type, status on public.gigs
for each row execute function public.enforce_gig_limits();

-- ---------------------------------------------------------------------------
-- 4. Helper function: resolve effective gig limit for a given provider
--    Used by API routes to return the correct limit per seller.
-- ---------------------------------------------------------------------------
create or replace function public.get_provider_gig_limit(
  p_provider_id   uuid,
  p_provider_type text
) returns integer
language plpgsql
stable
as $$
declare
  custom_limit   integer;
  snapshot_level text;
  level_limit    integer;
begin
  -- Custom override takes priority
  select custom_gig_limit into custom_limit
    from public.profiles where id = p_provider_id;
  if custom_limit is not null then return custom_limit; end if;

  -- Seller level
  select level into snapshot_level
    from public.seller_level_snapshots
   where provider_profile_id = p_provider_id
     and provider_type       = p_provider_type
   order by computed_at desc
   limit 1;

  if snapshot_level is not null then
    if snapshot_level in ('top_attorney','top_consultant') then
      snapshot_level := 'top_rated';
    end if;
    select gig_limit into level_limit
      from public.seller_level_thresholds
     where level = snapshot_level;
    if level_limit is not null then return level_limit; end if;
  end if;

  return 5;  -- safe default
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Performance indexes for 100k+ gig scale
--    All created with IF NOT EXISTS / CONCURRENTLY where safe.
-- ---------------------------------------------------------------------------

-- Full-text search on title + category (used for admin search)
create index if not exists gigs_fts_idx
  on public.gigs
  using gin(
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(category,'') || ' ' ||
      coalesce(subcategory,'')
    )
  );

-- Provider lookup (seller dashboard — most common query)
create index if not exists gigs_provider_status_idx
  on public.gigs (provider_id, provider_type, status)
  where deleted_at is null;

-- Admin queue: pending_review, denied, appeal_pending
create index if not exists gigs_modqueue_idx
  on public.gigs (status, created_at)
  where status in ('pending_review','denied','appeal_pending');

-- Auto-flag score for flagged gigs
create index if not exists gigs_autoflag_idx
  on public.gigs (auto_flag_score desc)
  where auto_flag_score > 0 and status = 'active';

-- Rank score for marketplace sorting
create index if not exists gigs_rank_idx
  on public.gigs (rank_score desc, status)
  where status = 'active' and deleted_at is null;

-- Category + status for marketplace browsing
create index if not exists gigs_category_status_idx
  on public.gigs (category, status, rank_score desc)
  where status = 'active' and deleted_at is null;

-- Created_at for admin pagination (common sort)
create index if not exists gigs_created_at_idx
  on public.gigs (created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Schema cache reload
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
