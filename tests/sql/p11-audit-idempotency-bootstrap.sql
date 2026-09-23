-- DISPOSABLE VALIDATION ONLY. Requires a fresh PostgreSQL 16 service database.
-- Minimal pre-P11 fixture follows the seo_llm_visibility base definition in
-- 20260810_seo_engine_v2.sql and profiles.id use in the P11 migration.
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

drop table if exists public.seo_llm_visibility cascade;
drop table if exists public.seo_llm_audit_provider_claims cascade;
drop table if exists public.seo_llm_audit_commands cascade;
drop table if exists public.profiles cascade;

create table public.profiles (id uuid primary key);
insert into public.profiles (id) values ('11111111-1111-4111-8111-111111111111');

create table public.seo_llm_visibility (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  engine text not null,
  model text,
  cited boolean not null default false,
  cited_urls text[] not null default '{}',
  brand_mentions text[] not null default '{}',
  snippet text,
  response text,
  stage text,
  country text,
  raw_score numeric(4, 3),
  created_at timestamptz not null default now()
);
alter table public.seo_llm_visibility enable row level security;
create policy "Engine v2 full access" on public.seo_llm_visibility for all using (true) with check (true);
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on public.seo_llm_visibility to anon, authenticated;
