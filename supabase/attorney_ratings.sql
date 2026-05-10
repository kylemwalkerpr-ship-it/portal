-- Ratings students leave for attorneys. One rating per (rater, attorney);
-- rerating updates the existing row.
--
-- Run after allow_attorney_role.sql.

create table if not exists public.attorney_ratings (
  id uuid primary key default gen_random_uuid(),
  attorney_id uuid not null references public.attorneys(id) on delete cascade,
  rater_profile_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attorney_id, rater_profile_id)
);

create index if not exists attorney_ratings_attorney_idx on public.attorney_ratings(attorney_id);
create index if not exists attorney_ratings_rater_idx on public.attorney_ratings(rater_profile_id);
