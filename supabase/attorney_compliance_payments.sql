-- ABA-compliant payment model for attorney offers + multi-attorney engagement.
--
-- ABA Model Rule 5.4: a non-lawyer cannot share legal fees with a lawyer.
-- So we DON'T split the attorney's fee. Instead the platform fee is added
-- on top of the attorney fee and disclosed separately to the client.
-- Stripe destination charge with application_fee_amount handles the split:
--   client pays    = attorney_fee + platform_fee
--   attorney gets  = attorney_fee (in full, to their Connect account)
--   platform gets  = platform_fee (as Stripe application fee)

-- 1. Attorneys need Stripe Connect to receive payments.
alter table public.attorneys add column if not exists stripe_account_id text;
alter table public.attorneys add column if not exists stripe_onboarding_complete boolean default false;

create index if not exists attorneys_stripe_account_idx on public.attorneys(stripe_account_id);

-- 2. Snapshot the fee breakdown on each offer so disclosures are stable
--    even if the platform percent changes later.
alter table public.attorney_offers add column if not exists platform_fee numeric(12,2) default 0;
alter table public.attorney_offers add column if not exists platform_fee_percent_snapshot numeric(5,2) default 0;
alter table public.attorney_offers add column if not exists attorney_stripe_account_id text;

-- 3. Track the split on the resulting order.
alter table public.orders add column if not exists attorney_fee numeric(12,2);
alter table public.orders add column if not exists platform_fee numeric(12,2);

-- 4. Multi-attorney engagement: the existing claim concept becomes informational
--    only. Any approved attorney can engage with any open inquiry; the client
--    sees a separate thread per engaging attorney. We allow status='engaged' as
--    a new transitional state, and keep 'claimed' as a legacy synonym.
alter table public.inquiries drop constraint if exists inquiries_status_check;
alter table public.inquiries add constraint inquiries_status_check
  check (status in ('open','engaged','claimed','converted','closed','cancelled'));

-- A non-blocking marker so the student dashboard can show "N attorneys responding".
create or replace view public.inquiry_engagement as
  select i.id as inquiry_id,
         count(distinct m.sender_profile_id) filter (where m.sender_role = 'attorney') as attorney_count
  from public.inquiries i
  left join public.inquiry_messages m on m.inquiry_id = i.id
  group by i.id;
