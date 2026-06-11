-- Bucket for profile photos on the profiles row (students, admins, support —
-- any role; attorneys/consultants keep their dedicated headshot buckets).
-- Run once in the Supabase SQL editor. Idempotent.
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

-- Ensure the column exists everywhere (also added by profile_preferences.sql).
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists avatar_path text;
