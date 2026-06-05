-- Tracks every generated, prefilled template PDF.
-- Applied via the Supabase Management API:
--   curl -X POST \
--     "https://api.supabase.com/v1/projects/krggzrxxnqfsbbklatxl/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d "{\"query\":\"$(cat supabase/template_pdf_renders_jun2026.sql | tr -d '\n' | sed 's/"/\\"/g')\"}"
create table if not exists public.template_pdf_renders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null,
  order_id uuid,
  transaction_id uuid,
  storage_bucket text not null default 'templates',
  storage_path text not null,
  size_bytes integer,
  page_count integer,
  created_at timestamptz not null default now()
);
create index if not exists template_pdf_renders_profile_slug_idx
  on public.template_pdf_renders(profile_id, slug, created_at desc);
create index if not exists template_pdf_renders_storage_path_idx
  on public.template_pdf_renders(storage_path);
alter table public.template_pdf_renders enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'template_pdf_renders'
      and policyname = 'template_pdf_renders_deny_anon'
  ) then
    create policy "template_pdf_renders_deny_anon"
      on public.template_pdf_renders
      for all
      to anon
      using (false)
      with check (false);
  end if;
end$$;
