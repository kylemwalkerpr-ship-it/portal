-- Allow support SaaS staff accounts in the shared profiles table.
-- Run this in Supabase SQL Editor before relying on support sign-ups.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('client', 'consultant', 'support', 'admin'));
