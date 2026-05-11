-- Production hardening for provider offers, Stripe bypass, refunds, and gigs.
-- Safe to run repeatedly in Supabase SQL Editor.

alter table public.inquiries
  drop constraint if exists inquiries_status_check;

alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('open','engaged','claimed','converted','closed','cancelled'));

alter table public.consultants
  add column if not exists stripe_bypass boolean not null default false;

alter table public.attorneys
  add column if not exists stripe_bypass boolean not null default false;

create index if not exists consultants_stripe_bypass_idx on public.consultants (stripe_bypass);
create index if not exists attorneys_stripe_bypass_idx on public.attorneys (stripe_bypass);

alter table public.attorney_offers
  add column if not exists original_price numeric(12,2),
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists provider_payout numeric(12,2),
  add column if not exists provider_payout_percent_snapshot numeric(5,2) not null default 100,
  add column if not exists revision_count integer not null default 1;

update public.attorney_offers
set original_price = coalesce(original_price, price),
    provider_payout = coalesce(provider_payout, price)
where original_price is null or provider_payout is null;

create table if not exists public.consultant_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  consultant_profile_id uuid not null references public.profiles(id) on delete cascade,
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  original_price numeric(12,2) not null check (original_price > 0),
  price numeric(12,2) not null check (price > 0),
  discount_percent numeric(5,2) not null default 0,
  platform_fee numeric(12,2) not null default 0,
  platform_fee_percent_snapshot numeric(5,2) not null default 20,
  consultant_payout numeric(12,2) not null default 0,
  consultant_fee_percent_snapshot numeric(5,2) not null default 80,
  currency text not null default 'usd',
  delivery_days integer not null check (delivery_days > 0),
  revision_count integer not null default 1,
  status text not null default 'sent' check (status in ('sent','accepted','declined','withdrawn','expired')),
  expires_at timestamptz,
  decided_at timestamptz,
  accepted_order_id uuid references public.orders(id) on delete set null,
  stripe_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index if not exists consultant_offers_order_idx on public.consultant_offers(order_id, created_at desc);
create index if not exists consultant_offers_consultant_idx on public.consultant_offers(consultant_id);
create index if not exists consultant_offers_client_idx on public.consultant_offers(client_profile_id);
create index if not exists consultant_offers_status_idx on public.consultant_offers(status);
create index if not exists consultant_offers_session_idx on public.consultant_offers(stripe_session_id);

alter table public.orders
  add column if not exists order_sequence integer,
  add column if not exists order_number text,
  add column if not exists source_consultant_offer_id uuid references public.consultant_offers(id) on delete set null,
  add column if not exists refund_status text,
  add column if not exists refunded_amount numeric(12,2),
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_id text,
  add column if not exists wallet_credit_amount numeric(12,2),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

create unique index if not exists orders_order_sequence_idx on public.orders (order_sequence) where order_sequence is not null;
create unique index if not exists orders_order_number_idx on public.orders (order_number) where order_number is not null;

create table if not exists public.provider_gigs (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('attorney','consultant')),
  provider_profile_id uuid not null references public.profiles(id) on delete cascade,
  attorney_id uuid references public.attorneys(id) on delete cascade,
  consultant_id uuid references public.consultants(id) on delete cascade,
  title text not null,
  slug text,
  summary text not null,
  category text,
  tags text[] not null default '{}'::text[],
  image_url text,
  status text not null default 'active' check (status in ('draft','active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_gigs_provider_check check (
    (provider_role = 'attorney' and attorney_id is not null and consultant_id is null)
    or (provider_role = 'consultant' and consultant_id is not null and attorney_id is null)
  )
);

create unique index if not exists provider_gigs_slug_idx on public.provider_gigs(slug) where slug is not null;
create index if not exists provider_gigs_provider_idx on public.provider_gigs(provider_role, provider_profile_id, status);

create table if not exists public.provider_gig_tiers (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.provider_gigs(id) on delete cascade,
  tier_name text not null check (tier_name in ('basic','standard','premium')),
  title text not null,
  description text not null,
  price numeric(12,2) not null check (price > 0),
  delivery_days integer not null check (delivery_days > 0),
  revision_count integer not null default 1,
  included_features text[] not null default '{}'::text[],
  constraints jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (gig_id, tier_name)
);

create index if not exists provider_gig_tiers_gig_idx on public.provider_gig_tiers(gig_id, sort_order);

create or replace function public.enforce_provider_gig_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.provider_gigs
    where provider_role = new.provider_role
      and provider_profile_id = new.provider_profile_id
      and status <> 'archived'
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) >= 5 then
    raise exception 'Providers can publish up to 5 gigs.';
  end if;
  return new;
end;
$$;

drop trigger if exists provider_gig_limit_trigger on public.provider_gigs;
create trigger provider_gig_limit_trigger
before insert or update of provider_role, provider_profile_id, status on public.provider_gigs
for each row execute function public.enforce_provider_gig_limit();
