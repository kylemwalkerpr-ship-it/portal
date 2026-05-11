-- Pre-order pipeline: caseworks intake form -> portal inquiries -> attorney
-- claims -> messaging -> custom offer -> Stripe checkout -> order.
--
-- Run after allow_attorney_role.sql + attorney_ratings.sql.

-- 1. Inquiries (intake submissions). Anonymous OK; profile_id is set later if
--    the submitter signs up with the same email.
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid references public.profiles(id) on delete set null,
  email text not null,
  full_name text not null,
  phone text,
  country text,
  case_type text,
  case_type_label text,
  urgency text,
  recommended_tier text,
  answers jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  source text not null default 'caseworks',
  access_token text not null default replace(gen_random_uuid()::text, '-', ''),
  claimed_by_attorney_id uuid references public.attorneys(id) on delete set null,
  claimed_at timestamptz,
  status text not null default 'open' check (status in ('open','claimed','converted','closed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inquiries_status_idx     on public.inquiries(status, created_at desc);
create index if not exists inquiries_email_idx      on public.inquiries(email);
create index if not exists inquiries_claimed_idx    on public.inquiries(claimed_by_attorney_id);
create index if not exists inquiries_access_token   on public.inquiries(access_token);

-- 2. Messages exchanged BEFORE an order exists. Once an order is created we
--    keep using the existing order_messages table.
create table if not exists public.inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  sender_role text not null check (sender_role in ('client','attorney','admin','system')),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists inquiry_messages_inquiry_idx on public.inquiry_messages(inquiry_id, created_at);

-- Message attachment uploads use public URLs embedded in chat bodies.
-- Writes happen through service-role API routes.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do update set public = true;

-- 3. Custom offers (Fiverr-style). Attorney composes title/description/price/
--    delivery. Client accepts via Stripe checkout; on payment success the
--    webhook creates an order linked back via source_offer_id.
create table if not exists public.attorney_offers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  attorney_id uuid not null references public.attorneys(id) on delete cascade,
  attorney_profile_id uuid not null references public.profiles(id) on delete cascade,
  client_email text not null,
  client_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  price numeric(12,2) not null check (price > 0),
  currency text not null default 'usd',
  delivery_days integer not null check (delivery_days > 0),
  status text not null default 'sent' check (status in ('sent','accepted','declined','withdrawn','expired')),
  expires_at timestamptz,
  decided_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists attorney_offers_inquiry_idx  on public.attorney_offers(inquiry_id);
create index if not exists attorney_offers_status_idx   on public.attorney_offers(status);
create index if not exists attorney_offers_attorney_idx on public.attorney_offers(attorney_id);
create index if not exists attorney_offers_session_idx  on public.attorney_offers(stripe_session_id);

-- 4. Trace: an order can point back to the inquiry/offer that produced it.
alter table public.orders add column if not exists source_inquiry_id uuid references public.inquiries(id) on delete set null;
alter table public.orders add column if not exists source_offer_id uuid references public.attorney_offers(id) on delete set null;
