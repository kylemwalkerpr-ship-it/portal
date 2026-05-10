-- Add the attorney role and the tables backing the attorney panel.
-- Run this in Supabase SQL Editor before attorney sign-ups go live.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'consultant', 'support', 'admin', 'attorney'));

create table if not exists public.attorney_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  credential_type text not null,
  jurisdictions text not null,
  bar_number text not null,
  practice_areas text not null,
  malpractice_insurance text not null,
  profile_url text not null,
  capacity text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_notes text,
  created_at timestamptz not null default now()
);

create index if not exists attorney_applications_email_idx on public.attorney_applications(email);
create index if not exists attorney_applications_status_idx on public.attorney_applications(status);
create index if not exists attorney_applications_profile_idx on public.attorney_applications(profile_id);

create table if not exists public.attorneys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade unique,
  application_id uuid references public.attorney_applications(id) on delete set null,
  jurisdictions text,
  practice_areas text,
  bio text,
  available boolean default true,
  notif_prefs jsonb default '{"orders":true,"messages":true,"payments":true}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attorneys_application_idx on public.attorneys(application_id);
