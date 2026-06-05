-- supabase/document_security_jun2026.sql
--
-- Document-vault hardening migration. Idempotent -- safe to re-run.
--
-- Apply with:
--   curl -X POST \
--     "https://api.supabase.com/v1/projects/krggzrxxnqfsbbklatxl/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--     -H "Content-Type: application/json" \
--     -d @<(jq -Rs '{query: .}' supabase/document_security_jun2026.sql)
--
-- (see [[supabase-admin-access]] memory for the Management API path.)
--
-- What this does:
--   1. Adds document_access_log + document_shares tables for the audit
--      trail + per-document share grants.
--   2. Adds is_sensitive + is_deleted columns to order_files so the
--      runtime can pin a tighter signed-URL TTL on flagged blobs and
--      soft-delete them without losing audit history.
--   3. Indexes for the new tables.
--   4. RLS policies for the new tables -- service-role (server routes)
--      keeps full access; anon clients get nothing.
--
-- What this does NOT do:
--   * Flip storage buckets to public/private -- that's done via the
--     Storage API by the operator. order-files and offer-attachments
--     are already private. message-attachments stays public for
--     backwards compat with stored message rows; new sensitive flows
--     route through order-files.

-- ============================================================
-- 1. document_access_log
-- ============================================================
create table if not exists public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_bucket text not null,
  document_path text not null,
  document_id uuid,
  accessor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'view', 'download', 'download_sensitive',
    'upload', 'delete', 'share', 'revoke'
  )),
  ip text,
  user_agent text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_access_log_path_idx
  on public.document_access_log(document_path, created_at desc);
create index if not exists document_access_log_accessor_idx
  on public.document_access_log(accessor_profile_id, created_at desc);
create index if not exists document_access_log_action_idx
  on public.document_access_log(action, created_at desc);

alter table public.document_access_log enable row level security;

-- Service-role bypasses RLS by design. The default policy below denies
-- everything to the anon role so nothing leaks via the public API.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'document_access_log'
      and policyname = 'document_access_log_deny_anon'
  ) then
    create policy "document_access_log_deny_anon"
      on public.document_access_log
      for all
      to anon
      using (false)
      with check (false);
  end if;
end$$;

-- ============================================================
-- 2. document_shares
-- ============================================================
create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_bucket text,
  document_path text,
  document_id uuid,
  shared_with_profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by_profile_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_shares_doc_idx
  on public.document_shares(document_id);
create index if not exists document_shares_shared_with_idx
  on public.document_shares(shared_with_profile_id);
create unique index if not exists document_shares_unique
  on public.document_shares(document_id, shared_with_profile_id)
  where document_id is not null;

alter table public.document_shares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'document_shares'
      and policyname = 'document_shares_deny_anon'
  ) then
    create policy "document_shares_deny_anon"
      on public.document_shares
      for all
      to anon
      using (false)
      with check (false);
  end if;
end$$;

-- ============================================================
-- 3. order_files hardening
-- ============================================================
alter table public.order_files
  add column if not exists is_sensitive boolean not null default false;
alter table public.order_files
  add column if not exists is_deleted boolean not null default false;
alter table public.order_files
  add column if not exists deleted_at timestamptz;
alter table public.order_files
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists order_files_active_idx
  on public.order_files(order_id, created_at desc)
  where is_deleted = false;

-- ============================================================
-- 4. order_files RLS
--
-- Service-role (server routes) bypasses RLS. The policy below denies
-- the anon role outright. We do NOT add a permissive "authenticated"
-- policy because the portal never reads order_files with the anon key
-- -- everything goes through the service-role admin client.
-- ============================================================
alter table public.order_files enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'order_files'
      and policyname = 'order_files_deny_anon'
  ) then
    create policy "order_files_deny_anon"
      on public.order_files
      for all
      to anon
      using (false)
      with check (false);
  end if;
end$$;

-- ============================================================
-- 5. Sanity check on storage buckets
--
-- We DON'T flip message-attachments here -- the existing message rows
-- store public URLs and flipping would break old conversations. The
-- canonical document buckets (order-files, offer-attachments,
-- chat-attachments, templates) should already be private; the check
-- below logs a warning if they aren't.
-- ============================================================
do $$
declare
  bad_bucket text;
begin
  for bad_bucket in
    select id
    from storage.buckets
    where id in ('order-files', 'offer-attachments', 'chat-attachments', 'templates')
      and public = true
  loop
    raise warning 'Bucket "%" is public but should be private. Flip via the Supabase dashboard.', bad_bucket;
  end loop;
end$$;
