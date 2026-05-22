-- wallet_nmi.sql
-- Wallet, vaulted cards, and transaction ledger for NMI student accounts.
-- Idempotent. Run this before stripe_excision.sql.

-- 1. Student wallets (single source of truth for balance)
create table if not exists public.student_wallets (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  balance_cents     integer not null default 0 check (balance_cents >= 0),
  currency          text not null default 'usd',
  updated_at        timestamptz not null default now()
);

-- 2. Saved payment methods (NMI Customer Vault)
create table if not exists public.student_payment_methods (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  vault_id          text not null,
  brand             text,
  last4             text not null,
  exp_month         integer,
  exp_year          integer,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists student_payment_methods_profile_idx
  on public.student_payment_methods(profile_id);

create unique index if not exists student_payment_methods_default_idx
  on public.student_payment_methods(profile_id) where is_default = true;

-- 3. Wallet transaction ledger
create table if not exists public.wallet_transactions (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  type              text not null
                    check (type in ('topup','debit','refund','adjustment','purchase')),
  amount_cents      integer not null check (amount_cents >= 0),
  signed_cents      integer not null,
  balance_after_cents integer not null check (balance_after_cents >= 0),
  description       text not null,
  reference         text,
  metadata          jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists wallet_transactions_profile_idx
  on public.wallet_transactions(profile_id, created_at desc);

create index if not exists wallet_transactions_type_idx
  on public.wallet_transactions(type, created_at desc);

-- 4. Helper: ensure a wallet row exists
create or replace function public.ensure_wallet(p_profile_id uuid, p_currency text default 'usd')
returns public.student_wallets as $$
declare
  v_row public.student_wallets;
begin
  insert into public.student_wallets (profile_id, currency)
  values (p_profile_id, p_currency)
  on conflict (profile_id) do update set updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$ language plpgsql;

-- 5. Helper: atomically credit wallet + write ledger row
create or replace function public.wallet_credit(
  p_profile_id uuid,
  p_amount_cents integer,
  p_description text,
  p_reference text default null,
  p_metadata jsonb default null
)
returns public.wallet_transactions as $$
declare
  v_new_balance integer;
  v_tx public.wallet_transactions;
begin
  if p_amount_cents <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  insert into public.student_wallets (profile_id, balance_cents, currency)
  values (p_profile_id, p_amount_cents, 'usd')
  on conflict (profile_id) do update
    set balance_cents = public.student_wallets.balance_cents + p_amount_cents,
        updated_at = now()
  returning balance_cents into v_new_balance;

  insert into public.wallet_transactions (
    profile_id, type, amount_cents, signed_cents, balance_after_cents,
    description, reference, metadata
  ) values (
    p_profile_id, 'topup', p_amount_cents, +p_amount_cents, v_new_balance,
    p_description, p_reference, p_metadata
  ) returning * into v_tx;

  return v_tx;
end;
$$ language plpgsql;

-- 6. Helper: atomically debit wallet + write ledger row
create or replace function public.wallet_debit(
  p_profile_id uuid,
  p_amount_cents integer,
  p_description text,
  p_reference text default null,
  p_metadata jsonb default null
)
returns public.wallet_transactions as $$
declare
  v_current integer;
  v_new_balance integer;
  v_tx public.wallet_transactions;
begin
  if p_amount_cents <= 0 then
    raise exception 'Debit amount must be positive';
  end if;

  select balance_cents into v_current
    from public.student_wallets
   where profile_id = p_profile_id
   for update;

  if v_current is null or v_current < p_amount_cents then
    raise exception 'Insufficient wallet balance: % < %', v_current, p_amount_cents;
  end if;

  v_new_balance := v_current - p_amount_cents;

  update public.student_wallets
     set balance_cents = v_new_balance,
         updated_at = now()
   where profile_id = p_profile_id;

  insert into public.wallet_transactions (
    profile_id, type, amount_cents, signed_cents, balance_after_cents,
    description, reference, metadata
  ) values (
    p_profile_id, 'debit', p_amount_cents, -p_amount_cents, v_new_balance,
    p_description, p_reference, p_metadata
  ) returning * into v_tx;

  return v_tx;
end;
$$ language plpgsql;
