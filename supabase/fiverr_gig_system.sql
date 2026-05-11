-- Fiverr-style gigs, unified offers, order lifecycle, refunds, and marketplace metrics.
-- Safe to run repeatedly in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- E1/E2: explicit Stripe bypass columns + schema cache reload.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attorneys' and column_name = 'stripe_bypass'
  ) then
    alter table public.attorneys add column stripe_bypass boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consultants' and column_name = 'stripe_bypass'
  ) then
    alter table public.consultants add column stripe_bypass boolean not null default false;
  end if;
end $$;

create index if not exists attorneys_stripe_bypass_idx on public.attorneys (stripe_bypass);
create index if not exists consultants_stripe_bypass_idx on public.consultants (stripe_bypass);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where clerk_user_id = auth.uid()::text
  limit 1
$$;

create or replace function public.prevent_non_admin_stripe_bypass_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stripe_bypass is distinct from old.stripe_bypass
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(public.current_profile_role(), '') <> 'admin' then
    raise exception 'Only admins can update stripe_bypass';
  end if;
  return new;
end;
$$;

drop trigger if exists attorneys_admin_only_stripe_bypass on public.attorneys;
create trigger attorneys_admin_only_stripe_bypass
before update of stripe_bypass on public.attorneys
for each row execute function public.prevent_non_admin_stripe_bypass_update();

drop trigger if exists consultants_admin_only_stripe_bypass on public.consultants;
create trigger consultants_admin_only_stripe_bypass
before update of stripe_bypass on public.consultants
for each row execute function public.prevent_non_admin_stripe_bypass_update();

-- Payment settings needed by the offer and gig builders.
insert into public.platform_settings (key, value)
values (
  'default',
  jsonb_build_object(
    'platform_fee_percent', 20,
    'consultant_fee_percent', 80,
    'attorney_platform_fee_percent', 25,
    'minimum_offer_amount_cents', 100,
    'maximum_offer_amount_cents', 500000,
    'minimum_gig_price_cents', 100,
    'maximum_gig_price_cents', 500000,
    'allowed_currencies', jsonb_build_array('usd', 'cad'),
    'primary_currency', 'usd'
  )
)
on conflict (key) do update
set value = public.platform_settings.value
  || excluded.value
  || jsonb_build_object(
    'minimum_offer_amount_cents', coalesce(public.platform_settings.value->'minimum_offer_amount_cents', excluded.value->'minimum_offer_amount_cents'),
    'maximum_offer_amount_cents', coalesce(public.platform_settings.value->'maximum_offer_amount_cents', excluded.value->'maximum_offer_amount_cents'),
    'minimum_gig_price_cents', coalesce(public.platform_settings.value->'minimum_gig_price_cents', excluded.value->'minimum_gig_price_cents'),
    'maximum_gig_price_cents', coalesce(public.platform_settings.value->'maximum_gig_price_cents', excluded.value->'maximum_gig_price_cents'),
    'allowed_currencies', coalesce(public.platform_settings.value->'allowed_currencies', excluded.value->'allowed_currencies')
  );

-- E3: unified chat offers. Monetary values are cents.
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_type text not null check (sender_type in ('attorney','consultant')),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 10 and 120),
  description text not null check (char_length(description) between 30 and 1200),
  price integer not null check (price >= 100),
  discounted_price integer check (discounted_price is null or discounted_price >= 100),
  currency text not null default 'usd',
  delivery_days integer not null check (delivery_days >= 1),
  revisions integer not null default 1 check (revisions >= 0),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','paid','declined','expired','cancelled')),
  stripe_payment_intent_id text,
  gig_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_discount_check check (discounted_price is null or discounted_price < price)
);

create index if not exists offers_chat_idx on public.offers (chat_id, created_at desc);
create index if not exists offers_sender_idx on public.offers (sender_id, sender_type, status);
create index if not exists offers_recipient_idx on public.offers (recipient_id, status);
create index if not exists offers_status_idx on public.offers (status, expires_at);

create table if not exists public.offer_files (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size integer not null default 0,
  mime_type text,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','blocked')),
  created_at timestamptz not null default now()
);

create index if not exists offer_files_offer_idx on public.offer_files (offer_id);

-- E4: private chat attachment metadata + signed URL access.
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null,
  message_id uuid,
  storage_bucket text not null default 'chat-attachments',
  storage_path text not null,
  file_name text not null,
  file_size integer not null default 0,
  mime_type text,
  uploader_id uuid references public.profiles(id) on delete set null,
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','blocked')),
  created_at timestamptz not null default now()
);

create index if not exists chat_attachments_chat_idx on public.chat_attachments (chat_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false),
       ('offer-attachments', 'offer-attachments', false),
       ('gig-gallery', 'gig-gallery', false)
on conflict (id) do update set public = false;

-- E5/E6/E7: order lifecycle, admin audit, refunds, wallet fallback.
alter table public.orders
  add column if not exists offer_id uuid references public.offers(id) on delete set null,
  add column if not exists attorney_id uuid references public.attorneys(id) on delete set null,
  add column if not exists amount_paid integer,
  add column if not exists net_payout integer,
  add column if not exists delivery_deadline timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_method text check (refund_method is null or refund_method in ('original_payment','wallet')),
  add column if not exists revision_reason text,
  add column if not exists status_updated_at timestamptz not null default now();

alter table public.orders
  drop constraint if exists orders_status_fiverr_check;

alter table public.orders
  add constraint orders_status_fiverr_check
  check (status in ('pending','queued','created','in_progress','under_review','revision_requested','completed','released','cancelled','refunded'));

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  target_table text not null,
  target_id uuid not null,
  payload_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_table, target_id, created_at desc);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  currency text not null default 'usd',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.refund_ledger (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  initiated_by text not null check (initiated_by in ('admin','system','student')),
  amount integer not null check (amount > 0),
  method text not null check (method in ('original_payment','wallet')),
  stripe_refund_id text,
  status text not null default 'succeeded' check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now()
);

create index if not exists refund_ledger_order_idx on public.refund_ledger (order_id, created_at desc);

-- E8/E10/E11: gigs, tiers, reviews, metrics. Monetary values are cents.
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  provider_type text not null check (provider_type in ('attorney','consultant')),
  title text not null,
  category text,
  tags text[] not null default '{}'::text[],
  pitch text,
  description text,
  gallery_images jsonb not null default '[]'::jsonb,
  video_url text,
  faq jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  seo_title text,
  seo_description text,
  slug text unique,
  avg_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  order_count integer not null default 0,
  rank_score numeric(8,4) not null default 0,
  featured_until timestamptz,
  boost_until timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gigs_provider_idx on public.gigs (provider_type, provider_id, status);
create index if not exists gigs_marketplace_idx on public.gigs (status, rank_score desc, published_at desc);
create index if not exists gigs_category_idx on public.gigs (category);

create table if not exists public.gig_tiers (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  tier text not null check (tier in ('basic','standard','premium')),
  title text not null,
  description text,
  price integer not null check (price >= 100),
  delivery_days integer not null check (delivery_days >= 1),
  revisions integer not null default 1 check (revisions >= 0),
  features text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gig_id, tier)
);

create index if not exists gig_tiers_gig_idx on public.gig_tiers (gig_id, is_active, price);

create table if not exists public.gig_reviews (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  comm_rating integer check (comm_rating between 1 and 5),
  expertise_rating integer check (expertise_rating between 1 and 5),
  value_rating integer check (value_rating between 1 and 5),
  status text not null default 'published' check (status in ('published','flagged','removed')),
  created_at timestamptz not null default now(),
  unique (order_id, reviewer_id)
);

create table if not exists public.gig_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.gig_reviews(id) on delete cascade unique,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_table text not null,
  target_id uuid not null,
  reason text,
  status text not null default 'open' check (status in ('open','approved','removed','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.gig_metrics (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade unique,
  impressions integer not null default 0,
  clicks integer not null default 0,
  click_through_rate numeric(8,4) generated always as (
    case when impressions = 0 then 0 else clicks::numeric / impressions::numeric end
  ) stored,
  saves integer not null default 0,
  share_count integer not null default 0,
  avg_session_time_seconds integer not null default 0,
  search_appearances integer not null default 0,
  last_computed_at timestamptz
);

create table if not exists public.gig_metric_events (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('impression','click','save','share','purchase')),
  created_at timestamptz not null default now()
);

create or replace function public.enforce_gig_limits()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('draft','active','paused') and (
    select count(*)
    from public.gigs
    where provider_id = new.provider_id
      and provider_type = new.provider_type
      and status in ('draft','active','paused')
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 5 then
    raise exception 'Providers can create up to 5 non-archived gigs.';
  end if;
  return new;
end;
$$;

drop trigger if exists gigs_limit_trigger on public.gigs;
create trigger gigs_limit_trigger
before insert or update of provider_id, provider_type, status on public.gigs
for each row execute function public.enforce_gig_limits();

create or replace function public.recompute_gig_review_aggregates()
returns trigger
language plpgsql
as $$
declare
  target_gig uuid;
begin
  target_gig := coalesce(new.gig_id, old.gig_id);
  update public.gigs g
  set avg_rating = coalesce(stats.avg_rating, 0),
      review_count = coalesce(stats.review_count, 0),
      updated_at = now()
  from (
    select gig_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::integer as review_count
    from public.gig_reviews
    where gig_id = target_gig and status = 'published'
    group by gig_id
  ) stats
  where g.id = target_gig;

  update public.gigs
  set avg_rating = 0, review_count = 0, updated_at = now()
  where id = target_gig
    and not exists (
      select 1 from public.gig_reviews
      where gig_id = target_gig and status = 'published'
    );
  return coalesce(new, old);
end;
$$;

drop trigger if exists gig_reviews_aggregate_trigger on public.gig_reviews;
create trigger gig_reviews_aggregate_trigger
after insert or update or delete on public.gig_reviews
for each row execute function public.recompute_gig_review_aggregates();

create or replace function public.recompute_gig_rank(target_gig uuid)
returns numeric
language plpgsql
as $$
declare
  g record;
  m record;
  recency numeric := 0.5;
  new_boost numeric := 0;
  score numeric := 0;
begin
  select * into g from public.gigs where id = target_gig;
  if not found then return 0; end if;
  select * into m from public.gig_metrics where gig_id = target_gig;

  if g.published_at is not null then
    recency := greatest(0.5, 1 - (least(180, extract(day from now() - g.published_at)) / 360));
    if g.order_count < 5 and g.review_count < 3 and g.published_at > now() - interval '14 days' then
      new_boost := 0.15;
    end if;
  end if;

  score :=
    ((least(g.avg_rating, 5) / 5) * 0.30)
    + ((least(ln(greatest(g.order_count, 0) + 1), 5) / 5) * 0.25)
    + ((least(coalesce(m.click_through_rate, 0), 1)) * 0.15)
    + (recency * 0.15)
    + (0.80 * 0.10)
    + (0.80 * 0.05)
    + new_boost
    + case when g.boost_until > now() then 0.10 else 0 end;

  update public.gigs
  set rank_score = round(score, 4), updated_at = now()
  where id = target_gig;
  return round(score, 4);
end;
$$;

notify pgrst, 'reload schema';
