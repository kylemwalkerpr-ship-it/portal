-- Webhook replay protection: each gateway notification id is processed once.
create table if not exists public.webhook_events (
  event_id    text primary key,
  source      text not null default 'authorizenet',
  event_type  text,
  payload     jsonb,
  received_at timestamptz not null default now()
);

create index if not exists webhook_events_received_idx
  on public.webhook_events (received_at);
