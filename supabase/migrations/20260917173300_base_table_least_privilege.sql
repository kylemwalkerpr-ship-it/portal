-- P1 base-table least-privilege follow-up.
--
-- Supervisor-verified production baseline (2026-09-15): RLS was enabled on
-- content_jobs, seo_backlink_targets, seo_backlink_outreach and
-- support_audit_log, but each table carried a FOR ALL policy granted to the
-- public role with USING (true) / WITH CHECK (true), while anon and
-- authenticated held full table privileges. Effective anon reads returned
-- real rows (content_jobs 240; seo_backlink_targets 14/14; outreach 14/14;
-- support_audit_log 0 rows).
--
-- These four tables are server/admin-only:
--   * application reads/writes use server-held service-role credentials through
--     authenticated API/engine paths; production deploys sync the legacy
--     SUPABASE_SERVICE_ROLE_JWT used by the admin client;
--   * browser postgres_changes subscriptions on content_jobs are removed from
--     both the live Content Studio and the deprecated Command Center. Their
--     authenticated API polling remains the job-refresh fallback.
--
-- This migration is additive and idempotent: it keeps RLS enabled, removes
-- every public/anon/authenticated policy on exactly these four tables, revokes
-- their table privileges, and leaves access only to service_role through an
-- explicit service-role-only policy. It does not modify any other table.
--
-- support_audit_log is provisioned outside this repository's migration set, so
-- each statement that touches it is guarded by to_regclass for fresh replays.

-- 1. Keep RLS enabled on the repository-owned tables.
alter table public.content_jobs enable row level security;
alter table public.seo_backlink_targets enable row level security;
alter table public.seo_backlink_outreach enable row level security;

do $$
begin
  if to_regclass('public.support_audit_log') is not null then
    execute 'alter table public.support_audit_log enable row level security';
  end if;
end
$$;

-- 2. Drop the permissive named policies that exposed every row to every role.
drop policy if exists "Admin full access" on public.content_jobs;
drop policy if exists "Engine backlink targets full access" on public.seo_backlink_targets;
drop policy if exists "Engine backlink outreach full access" on public.seo_backlink_outreach;

-- support_audit_log is live-only in this repository, so guard its known
-- production-drift policy name for fresh replays where the table is absent.
do $$
begin
  if to_regclass('public.support_audit_log') is not null then
    execute 'drop policy if exists "allow_service_role" on public.support_audit_log';
  end if;
end
$$;

-- The catalog sweep below removes any other policy that still grants a client role,
-- so the boundary does not depend on guessing that name. It also catches any
-- future permissive policy drift on the three repository-owned tables.
do $$
declare
  entry record;
begin
  for entry in
    select policyname, schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('content_jobs', 'seo_backlink_targets', 'seo_backlink_outreach', 'support_audit_log')
      and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format('drop policy if exists %I on %I.%I', entry.policyname, entry.schemaname, entry.tablename);
  end loop;
end
$$;

-- 3. Recreate an explicit service-role-only FOR ALL boundary per table.
drop policy if exists "Service role full access" on public.content_jobs;
create policy "Service role full access" on public.content_jobs
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access" on public.seo_backlink_targets;
create policy "Service role full access" on public.seo_backlink_targets
  for all to service_role using (true) with check (true);

drop policy if exists "Service role full access" on public.seo_backlink_outreach;
create policy "Service role full access" on public.seo_backlink_outreach
  for all to service_role using (true) with check (true);

do $$
begin
  if to_regclass('public.support_audit_log') is not null then
    execute 'drop policy if exists "Service role full access" on public.support_audit_log';
    execute 'create policy "Service role full access" on public.support_audit_log for all to service_role using (true) with check (true)';
  end if;
end
$$;

-- 4. Table privileges: revoke every public client role, keep service_role whole.
revoke all privileges on table public.content_jobs from public, anon, authenticated;
grant all privileges on table public.content_jobs to service_role;

revoke all privileges on table public.seo_backlink_targets from public, anon, authenticated;
grant all privileges on table public.seo_backlink_targets to service_role;

revoke all privileges on table public.seo_backlink_outreach from public, anon, authenticated;
grant all privileges on table public.seo_backlink_outreach to service_role;

do $$
begin
  if to_regclass('public.support_audit_log') is not null then
    execute 'revoke all privileges on table public.support_audit_log from public, anon, authenticated';
    execute 'grant all privileges on table public.support_audit_log to service_role';
  end if;
end
$$;
