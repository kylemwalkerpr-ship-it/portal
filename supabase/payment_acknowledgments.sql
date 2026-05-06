-- Records customer acknowledgment of Terms of Service and Refund Policy at the time of payment
alter table orders add column if not exists terms_accepted_at timestamptz;
alter table orders add column if not exists refund_policy_accepted_at timestamptz;
alter table orders add column if not exists stripe_payment_intent_id text;

create unique index if not exists orders_stripe_payment_intent_id_idx
  on orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
