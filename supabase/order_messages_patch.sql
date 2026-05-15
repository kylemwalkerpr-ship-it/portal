-- =============================================================================
-- order_messages_patch.sql
-- Creates the order_messages audit table if it's missing. Safe to re-run.
-- =============================================================================

create table if not exists public.order_messages (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  sender_id    uuid references public.profiles(id) on delete set null,
  sender_role  text not null default 'client',
  body         text,
  created_at   timestamptz not null default now(),
  constraint order_messages_sender_role_check check (sender_role in ('client', 'consultant', 'attorney', 'system'))
);

create index if not exists order_messages_order_idx  on public.order_messages (order_id, created_at desc);
create index if not exists order_messages_sender_idx on public.order_messages (sender_id, created_at desc);

notify pgrst, 'reload schema';
