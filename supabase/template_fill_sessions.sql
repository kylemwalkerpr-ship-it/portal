-- supabase/template_fill_sessions.sql
--
-- Tracks template form-fill sessions: students fill in template fields
-- BEFORE paying, so that upon successful payment the filled PDF can be
-- generated immediately.
--
-- Status lifecycle:
--   drafting    → student is actively filling the form (auto-saved)
--   completed  → student has finished filling; ready to proceed to checkout
--   paid       → payment succeeded; filled PDF was generated & stored
--   abandoned  → student left without completing or paying
--
-- Apply with:
--   curl -X POST \
--     "https://api.supabase.com/v1/projects/krggzrxxnqfsbbklatxl/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d @<(jq -Rs '{query: .}' supabase/template_fill_sessions.sql)

create table if not exists public.template_fill_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null,
  status text not null default 'drafting',
  fill_data jsonb not null default '{}'::jsonb,
  rendered_storage_path text,
  rendered_size_bytes integer,
  order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  paid_at timestamptz,
  constraint template_fill_sessions_status_check
    check (status in ('drafting', 'completed', 'paid', 'abandoned'))
);

create index if not exists template_fill_sessions_profile_idx
  on public.template_fill_sessions(profile_id, status, updated_at desc);

create index if not exists template_fill_sessions_slug_idx
  on public.template_fill_sessions(slug, status);

-- Only one active drafting session per profile+slug at a time
create unique index if not exists template_fill_sessions_active_uidx
  on public.template_fill_sessions(profile_id, slug)
  where status = 'drafting';

alter table public.template_fill_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'template_fill_sessions'
      and policyname = 'template_fill_sessions_deny_anon'
  ) then
    create policy "template_fill_sessions_deny_anon"
      on public.template_fill_sessions
      for all
      to anon
      using (false)
      with check (false);
  end if;
end$$;
