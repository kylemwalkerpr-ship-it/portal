-- YQAA offer retry/race guard. Apply through the repository's normal migration
-- process before enabling this code; this migration is not applied here.
-- Existing offers retain NULL and are unaffected. One generated offer can be
-- associated with only one client trigger message, even across worker instances.
alter table public.offers
  add column if not exists yqaa_idempotency_key text;

create unique index if not exists offers_yqaa_idempotency_key_uidx
  on public.offers (yqaa_idempotency_key)
  where yqaa_idempotency_key is not null;

comment on column public.offers.yqaa_idempotency_key is
  'Atomic idempotency key for an AI-generated YQAA offer, derived from the conversation and triggering client message. NULL for human and legacy offers.';
