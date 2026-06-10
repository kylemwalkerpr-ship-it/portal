-- Checkout idempotency + payment incident tracking (production-readiness P0).
-- Run after wallet_nmi.sql.

-- 1. Idempotency keys for POST /api/checkout/order (and future money POSTs).
--    Client generates a UUID per checkout attempt; server inserts 'pending'
--    BEFORE charging. Unique constraint makes the duplicate request lose the
--    race and replay the stored response instead of re-charging.
create table if not exists public.checkout_idempotency_keys (
  key         text not null,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  order_id    uuid,
  response    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, key)
);

-- Stale 'pending' rows (crashed worker mid-checkout) are reclaimable after
-- 10 minutes — see claim logic in lib/idempotency.ts.
create index if not exists checkout_idem_created_idx
  on public.checkout_idempotency_keys (created_at);

-- 2. Payment incidents — anywhere money moved but the follow-up write failed
--    (e.g. card charged but order insert threw). A cron/admin view reconciles.
create table if not exists public.payment_incidents (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in (
                'charge_without_order', 'debit_without_order',
                'refund_failed', 'earning_credit_failed'
              )),
  gateway     text,
  transaction_id text,
  amount_cents integer,
  context     jsonb,
  resolved    boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists payment_incidents_open_idx
  on public.payment_incidents (created_at) where resolved = false;

-- 3. Prevent double-credit from replayed gateway callbacks: a given external
--    transaction id may credit/debit a wallet only once per type.
create unique index if not exists wallet_tx_type_reference_uniq
  on public.wallet_transactions (type, reference)
  where reference is not null;
