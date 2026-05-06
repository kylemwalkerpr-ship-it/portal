-- Consultant dashboard schema additions

alter table orders add column if not exists progress integer default 0;
alter table orders add column if not exists deadline timestamptz;

alter table consultants add column if not exists bio text;
alter table consultants add column if not exists available boolean default true;
alter table consultants add column if not exists notif_prefs jsonb default '{"orders":true,"messages":true,"payments":true}'::jsonb;
alter table consultants add column if not exists auto_withdraw boolean default false;

create table if not exists order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('client','consultant','admin','support')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_messages_order_id_idx on order_messages(order_id, created_at);
