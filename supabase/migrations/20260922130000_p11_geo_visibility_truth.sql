-- P11 GEO / AI visibility truth plane.
-- Additive, nullable, historical-compatible: the 267 legacy observations are
-- preserved byte-for-byte and remain outside the versioned P11 evidence plane.

alter table public.seo_llm_visibility
  add column if not exists audit_contract_version text,
  add column if not exists run_id uuid,
  add column if not exists ownership_row_id bigint,
  add column if not exists query_family text,
  add column if not exists strategic_intent text,
  add column if not exists reader_intent text,
  add column if not exists jurisdiction text,
  add column if not exists authoritative_owner_url text,
  add column if not exists owner_host text,
  add column if not exists prompt_id text,
  add column if not exists prompt_version text,
  add column if not exists audit_status text,
  add column if not exists failure_reason text,
  add column if not exists citation_extraction_status text,
  add column if not exists raw_cited_urls text[],
  add column if not exists normalized_cited_urls text[],
  add column if not exists citation_classifications jsonb,
  add column if not exists competitor_cited_urls text[],
  add column if not exists coverage jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.seo_llm_visibility
  drop constraint if exists seo_llm_visibility_p11_audit_status_check;
alter table public.seo_llm_visibility
  add constraint seo_llm_visibility_p11_audit_status_check check (
    audit_status is null or audit_status in (
      'success',
      'provider_unavailable',
      'provider_failure',
      'parse_failure',
      'blocked',
      'unknown'
    )
  );

create index if not exists idx_seo_llm_visibility_contract_created
  on public.seo_llm_visibility (audit_contract_version, created_at desc);
create index if not exists idx_seo_llm_visibility_run
  on public.seo_llm_visibility (run_id, created_at asc)
  where run_id is not null;
create index if not exists idx_seo_llm_visibility_owner
  on public.seo_llm_visibility (ownership_row_id, created_at desc)
  where ownership_row_id is not null;

comment on column public.seo_llm_visibility.audit_contract_version is
  'NULL = historical/legacy observation. p11-geo-v1 = ownership-aware P11 evidence.';
comment on column public.seo_llm_visibility.audit_status is
  'Closed P11 attempt state; only success enters citation-share denominators.';
comment on column public.seo_llm_visibility.coverage is
  'Visible provider-attempt denominator and failure/citation-class counts for this query audit.';

-- Evidence integrity: this is a server/admin table. RLS was already enabled,
-- but the historical public FOR ALL policy plus client grants made it mutable.
alter table public.seo_llm_visibility enable row level security;
drop policy if exists "Engine v2 full access" on public.seo_llm_visibility;

do $$
declare
  entry record;
begin
  for entry in
    select policyname, schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = 'seo_llm_visibility'
      and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      entry.policyname,
      entry.schemaname,
      entry.tablename
    );
  end loop;
end
$$;

drop policy if exists "Service role full access" on public.seo_llm_visibility;
create policy "Service role full access" on public.seo_llm_visibility
  for all to service_role using (true) with check (true);

revoke all privileges on table public.seo_llm_visibility from public, anon, authenticated;
grant all privileges on table public.seo_llm_visibility to service_role;
