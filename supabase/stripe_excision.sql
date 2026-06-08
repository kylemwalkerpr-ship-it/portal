-- ══════════════════════════════════════════════════════════════════════════════
-- DEPRECATED — Stripe excision was part of the Stripe deprecation.
-- The provider_earnings and provider_payouts tables were created by this
-- migration. They are kept in the database for backward compatibility.
-- This file is kept for reference only. Do NOT run it on a fresh database.
-- ══════════════════════════════════════════════════════════════════════════════
/*
-- stripe_excision.sql
-- Provider earnings and manual payout ledger. Adds tables only.
-- Run this after wallet_nmi.sql.

-- 1. Provider earnings: one row per credited order line
create table if not exists public.provider_earnings (
  id              text primary key,
  provider_id     uuid not null references public.profiles(id),
  order_id        text not null,
  source          text not null check (source in ('gig','offer','service')),
  amount_cents    bigint not null check (amount_cents > 0),
  fee_cents       bigint not null default 0 check (fee_cents >= 0),
  currency        text not null default 'USD',
  status          text not null
                    check (status in (
                      'owed','releasable','paid',
                      'refunded','cancelled'
                    )),
  released_at     timestamptz,
  payout_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists provider_earnings_provider_idx
  on public.provider_earnings(provider_id, status, created_at desc);

create index if not exists provider_earnings_order_idx
  on public.provider_earnings(order_id);

-- 2. Manual payout batches
create table if not exists public.provider_payouts (
  id              text primary key,
  provider_id     uuid not null references public.profiles(id),
  amount_cents    bigint not null check (amount_cents > 0),
  currency        text not null default 'USD',
  method          text not null,
  reference       text,
  notes           text,
  marked_paid_at  timestamptz not null default now(),
  marked_by       uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index if not exists provider_payouts_provider_idx
  on public.provider_payouts(provider_id, marked_paid_at desc);

-- 3. RPC: credit an earning when a buyer pays
create or replace function public.credit_earning(
  p_provider_id uuid,
  p_order_id text,
  p_source text,
  p_amount_cents bigint,
  p_fee_cents bigint default 0
) returns public.provider_earnings
language plpgsql as $$
declare
  e public.provider_earnings;
begin
  insert into public.provider_earnings (
    id, provider_id, order_id, source,
    amount_cents, fee_cents, status
  ) values (
    'earn_' || replace(gen_random_uuid()::text, '-', ''),
    p_provider_id, p_order_id, p_source,
    p_amount_cents, p_fee_cents, 'owed'
  )
  returning * into e;
  return e;
end$$;

-- 4. RPC: release earnings for an order
create or replace function public.release_earnings_for_order(
  p_order_id text
)
returns setof public.provider_earnings
language plpgsql as $$
begin
  return query
    update public.provider_earnings
       set status = 'releasable',
           released_at = now(),
           updated_at = now()
     where order_id = p_order_id
       and status = 'owed'
     returning *;
end$$;

-- 5. RPC: record a manual payout and mark earnings paid
create or replace function public.record_payout(
  p_provider_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_reference text,
  p_notes text,
  p_marked_by uuid,
  p_earning_ids text[]
) returns public.provider_payouts
language plpgsql as $$
declare
  p public.provider_payouts;
begin
  insert into public.provider_payouts (
    id, provider_id, amount_cents,
    method, reference, notes, marked_by
  ) values (
    'po_' || replace(gen_random_uuid()::text, '-', ''),
    p_provider_id, p_amount_cents,
    p_method, p_reference, p_notes, p_marked_by
  )
  returning * into p;

  update public.provider_earnings
     set status = 'paid',
         payout_id = p.id,
         updated_at = now()
   where id = any(p_earning_ids)
     and provider_id = p_provider_id
     and status = 'releasable';

  return p;
end$$;

-- 6. RPC: admin view of releasable earnings by provider
create or replace function public.list_releasable_earnings_by_provider()
returns table (
  provider_id      uuid,
  provider_name    text,
  provider_email   text,
  total_cents      bigint,
  count            bigint,
  oldest           timestamptz
)
language sql stable as $$
  select
    e.provider_id,
    p.full_name as provider_name,
    p.email as provider_email,
    sum(e.amount_cents) as total_cents,
    count(*) as count,
    min(e.created_at) as oldest
  from public.provider_earnings e
  join public.profiles p on p.id = e.provider_id
  where e.status = 'releasable'
  group by e.provider_id, p.full_name, p.email
  order by total_cents desc;
$$;
*/
