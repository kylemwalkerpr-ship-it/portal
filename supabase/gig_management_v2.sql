-- =============================================================================
-- gig_management_v2.sql
-- Fiverr-grade Gig Management — Schema V2
--
-- Idempotent: safe to run multiple times. Does NOT drop columns or tables.
-- Depends on: fiverr_gig_system.sql, marketplace_fiverr_upgrade.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. Extend gig status state machine
-- ---------------------------------------------------------------------------

-- Drop the old constraint only if it does not already include 'pending_review'
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
    check (status in (
      'draft','active','paused','suspended','archived','deleted',
      'pending_review','denied','appeal_pending'
    ));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. Add missing columns to gigs table
-- ---------------------------------------------------------------------------

alter table public.gigs
  -- Denial / appeal
  add column if not exists denial_reason          text,
  add column if not exists denial_category        text
    check (denial_category in ('spam','misleading','quality','ip_violation','harmful','pricing_abuse','duplicate')),
  add column if not exists appeal_reason          text,
  add column if not exists appeal_submitted_at    timestamptz,
  add column if not exists appeal_resolved_at     timestamptz,
  -- Auto-flagging
  add column if not exists auto_flag_score        numeric(5,2) not null default 0,
  add column if not exists auto_flag_reasons      jsonb not null default '[]'::jsonb,
  add column if not exists auto_flagged_at        timestamptz,
  -- Version tracking
  add column if not exists version_number         integer not null default 0,
  -- Content score computed timestamp
  add column if not exists content_score_computed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1c. Enhance moderation_queue table
-- ---------------------------------------------------------------------------

alter table public.moderation_queue
  add column if not exists flag_type   text,
  add column if not exists priority    text not null default 'normal',
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists notes       text;

-- Add check constraint on priority idempotently
do $$
begin
  alter table public.moderation_queue
    add constraint moderation_queue_priority_check
    check (priority in ('urgent','high','normal','low'));
exception
  when duplicate_object then null;
end $$;

-- Add check constraint on flag_type idempotently
do $$
begin
  alter table public.moderation_queue
    add constraint moderation_queue_flag_type_check
    check (flag_type in ('auto_flag','user_report','admin_flag'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 1d. Create gig_version_history table
-- ---------------------------------------------------------------------------

create table if not exists public.gig_version_history (
  id              uuid        primary key default gen_random_uuid(),
  gig_id          uuid        not null references public.gigs(id) on delete cascade,
  version_num     integer     not null,
  changed_by      uuid        references public.profiles(id) on delete set null,
  changed_by_role text,
  snapshot        jsonb       not null,
  change_summary  text,
  created_at      timestamptz not null default now()
);

create index if not exists gig_version_history_gig_idx
  on public.gig_version_history (gig_id, version_num desc);

-- ---------------------------------------------------------------------------
-- 1e. Create seller_level_thresholds table
-- ---------------------------------------------------------------------------

create table if not exists public.seller_level_thresholds (
  id                    uuid        primary key default gen_random_uuid(),
  level                 text        not null unique
    check (level in ('new_seller','level_1','level_2','top_rated')),
  min_orders            integer     not null default 0,
  min_avg_rating        numeric(3,2) not null default 0,
  min_completion_pct    numeric(5,2) not null default 0,
  min_tenure_days       integer     not null default 0,
  rank_multiplier       numeric(4,2) not null default 1.0,
  created_at            timestamptz not null default now()
);

insert into public.seller_level_thresholds
  (level, min_orders, min_avg_rating, min_completion_pct, min_tenure_days, rank_multiplier)
values
  ('new_seller',  0,   0,    0,    0,   0.80),
  ('level_1',    10,   4.6,  90,   60,  1.00),
  ('level_2',    50,   4.7,  95,   365, 1.10),
  ('top_rated', 100,   4.8,  98,   730, 1.25)
on conflict (level) do nothing;

-- ---------------------------------------------------------------------------
-- 1f. Update recompute_gig_rank to use seller level multiplier
-- ---------------------------------------------------------------------------

create or replace function public.recompute_gig_rank(target_gig uuid)
returns numeric
language plpgsql
as $$
declare
  g                record;
  m                record;
  sls              record;
  slt              record;
  recency          numeric := 0.5;
  new_boost        numeric := 0;
  promo_boost      numeric := 0;
  seller_mult      numeric := 0.80;
  log_orders       numeric := 0;
  ctr              numeric := 0;
  content_sc       numeric := 0;
  score            numeric := 0;
begin
  select * into g from public.gigs where id = target_gig;
  if not found then return 0; end if;

  select * into m from public.gig_metrics where gig_id = target_gig;

  -- Resolve seller level multiplier from latest snapshot
  select sls.* into sls
  from public.seller_level_snapshots sls
  where sls.provider_profile_id = g.provider_id
    and sls.provider_type = g.provider_type
  limit 1;

  if found then
    -- Map snapshot level → threshold multiplier
    select slt.rank_multiplier into seller_mult
    from public.seller_level_thresholds slt
    where slt.level = case sls.level
      when 'top_attorney'    then 'top_rated'
      when 'top_consultant'  then 'top_rated'
      else sls.level
    end
    limit 1;
    if seller_mult is null then
      seller_mult := 0.80;
    end if;
  else
    -- Fall back to new_seller multiplier
    select slt.rank_multiplier into seller_mult
    from public.seller_level_thresholds slt
    where slt.level = 'new_seller';
    if seller_mult is null then seller_mult := 0.80; end if;
  end if;

  if g.published_at is not null then
    recency := greatest(
      0.5,
      1 - (least(180, extract(day from now() - g.published_at)) / 360)
    );
    if g.order_count < 5
       and g.review_count < 3
       and g.published_at > now() - interval '14 days'
    then
      new_boost := 0.15;
    end if;
  end if;

  if g.boost_until > now() then
    promo_boost := 0.10;
  end if;

  log_orders  := least(ln(greatest(g.order_count, 0) + 1), 5) / 5;
  ctr         := least(coalesce(m.click_through_rate, 0), 1);
  content_sc  := least(coalesce(g.content_score, 0), 100) / 100;

  score :=
    ((least(g.avg_rating, 5) / 5) * 0.30)
    + (log_orders                  * 0.25)
    + (ctr                         * 0.15)
    + (recency                     * 0.15)
    + (seller_mult                 * 0.10)
    + (content_sc                  * 0.05)
    + new_boost
    + promo_boost;

  update public.gigs
  set rank_score = round(score, 4), updated_at = now()
  where id = target_gig;

  return round(score, 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1g. Auto-compute content_score via function
-- ---------------------------------------------------------------------------

create or replace function public.compute_gig_content_score(target_gig uuid)
returns numeric
language plpgsql
as $$
declare
  g           record;
  sc          numeric := 0;
  title_len   integer;
  pitch_len   integer;
  desc_len    integer;
  img_count   integer;
  tag_count   integer;
  active_tiers integer;
  faq_count   integer;
begin
  select * into g from public.gigs where id = target_gig;
  if not found then return 0; end if;

  -- Title length 20-80: +5
  title_len := coalesce(char_length(trim(coalesce(g.title, ''))), 0);
  if title_len between 20 and 80 then sc := sc + 5; end if;

  -- Pitch/tagline 40-160: +10
  -- Use tagline if present, else pitch
  pitch_len := coalesce(
    char_length(trim(coalesce(
      nullif(trim(coalesce(g.tagline, '')), ''),
      coalesce(g.pitch, '')
    ))), 0);
  if pitch_len between 40 and 160 then sc := sc + 10; end if;

  -- Description 300+: +20
  desc_len := coalesce(char_length(trim(coalesce(g.description, ''))), 0);
  if desc_len >= 300 then sc := sc + 20; end if;

  -- Gallery images >= 1: +15, >= 3: +25 (not additive)
  img_count := coalesce(jsonb_array_length(g.gallery_images), 0);
  if img_count >= 3 then sc := sc + 25;
  elsif img_count >= 1 then sc := sc + 15;
  end if;

  -- Tags 3-5: +10
  tag_count := coalesce(array_length(g.tags, 1), 0);
  if tag_count between 3 and 5 then sc := sc + 10; end if;

  -- Tiers: all 3 active: +15, at least 1: +5 (not additive)
  select count(*) into active_tiers
  from public.gig_tiers
  where gig_id = target_gig and is_active = true;

  if active_tiers >= 3 then sc := sc + 15;
  elsif active_tiers >= 1 then sc := sc + 5;
  end if;

  -- Requirements set: +10
  if g.requirements is not null and trim(coalesce(g.requirements, '')) <> '' then
    sc := sc + 10;
  end if;

  -- FAQ: >= 1: +5, >= 3: +10 (not additive)
  faq_count := coalesce(jsonb_array_length(g.faq), 0);
  if faq_count >= 3 then sc := sc + 10;
  elsif faq_count >= 1 then sc := sc + 5;
  end if;

  -- SEO title set: +5
  if g.seo_title is not null and trim(coalesce(g.seo_title, '')) <> '' then
    sc := sc + 5;
  end if;

  -- Clamp to 100 (max theoretical = 5+10+20+25+10+15+10+10+5 = 110 → clamp)
  sc := least(sc, 100);

  update public.gigs
  set content_score             = sc,
      content_score_computed_at = now(),
      updated_at                = now()
  where id = target_gig;

  return sc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists gigs_auto_flag_idx
  on public.gigs (auto_flag_score desc, status)
  where auto_flag_score > 0;

create index if not exists gigs_status_review_idx
  on public.gigs (status, created_at asc)
  where status in ('pending_review','appeal_pending','denied');

create index if not exists moderation_queue_open_idx
  on public.moderation_queue (status, priority, created_at asc)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Schema cache reload
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
