-- Add gateway routing fields to support a second payment provider
-- (Authorize.net via Kurv Pay) alongside the existing NMI integration.
--
-- Card vault tokens are NOT portable between gateways — a card vaulted with
-- NMI cannot be charged through Authorize.net (and vice versa). We therefore
-- pin each stored card to the gateway it was vaulted in, and every order
-- records the gateway it ran through so refunds / reconciliation route back
-- correctly.
--
-- Backfill: existing rows default to 'nmi' because that was the only gateway
-- in use up to this migration.

alter table student_payment_methods
  add column if not exists gateway text not null default 'nmi';

create index if not exists idx_student_payment_methods_gateway
  on student_payment_methods(gateway);

alter table orders
  add column if not exists gateway text;

-- template_orders is conditional — the table only exists in environments that
-- adopted the legacy template-pack checkout. New projects skip it.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'template_orders'
  ) then
    alter table template_orders add column if not exists gateway text;
  end if;
end$$;

-- Authorize.net identifiers. We keep them in dedicated columns rather than
-- repurposing the existing transaction_id / stripe_payment_intent_id (which
-- have NMI-shaped values today) so refunds can disambiguate without parsing.
alter table orders
  add column if not exists authnet_transaction_id text,
  add column if not exists authnet_customer_profile_id text,
  add column if not exists authnet_payment_profile_id text;

create index if not exists idx_orders_gateway on orders(gateway);
create index if not exists idx_orders_authnet_tx on orders(authnet_transaction_id);

-- Admin-controlled platform default gateway. Stored as a row in
-- platform_settings if the table exists; otherwise the deploy can ignore
-- this block and the runtime falls back to the PAYMENT_PROVIDER env var.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'platform_settings'
  ) then
    insert into platform_settings (key, value)
    values ('default_payment_gateway', to_jsonb('authorizenet'::text))
    on conflict (key) do nothing;
  end if;
end$$;

notify pgrst, 'reload schema';
