-- Content Studio execution ownership and fencing (additive).
-- Review-only in PR #200. THIS MIGRATION IS INTENTIONALLY UNAPPLIED.
-- Do not edit or replay supabase/migrations/20260914_content_studio_evidence_contract.sql.
--
-- Contract:
--   * claim is atomic and increments execution_attempt on every acquisition/takeover;
--   * an expired lease can be taken over only through claim, producing a newer attempt;
--   * renew/check/release require the exact owner + attempt fencing token;
--   * renew/check refuse expired leases, so an expired worker cannot revive itself;
--   * only service_role can execute the RPCs.

alter table if exists public.content_jobs
  add column if not exists execution_owner text,
  add column if not exists execution_attempt integer not null default 0 check (execution_attempt >= 0),
  add column if not exists execution_lease_expires_at timestamptz;

create or replace function public.claim_content_studio_execution(
  p_job_id uuid,
  p_contract_id text,
  p_contract_hash text,
  p_execution_owner text,
  p_lease_seconds integer default 900
)
returns table(
  execution_owner text,
  execution_attempt integer,
  execution_lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_execution_owner), '') is null then
    raise exception 'execution owner is required';
  end if;
  if nullif(trim(p_contract_id), '') is null or nullif(trim(p_contract_hash), '') is null then
    raise exception 'contract identity is required';
  end if;

  return query
  update public.content_jobs j
     set execution_owner = p_execution_owner,
         execution_attempt = coalesce(j.execution_attempt, 0) + 1,
         execution_lease_expires_at = clock_timestamp()
           + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600)))
   where j.id = p_job_id
     and j.contract_id = p_contract_id
     and j.contract_hash = p_contract_hash
     and j.status in ('pending','drafting','processing','publishing','pr_created')
     and (
       j.execution_owner is null
       or j.execution_lease_expires_at is null
       or j.execution_lease_expires_at <= clock_timestamp()
     )
  returning j.execution_owner, j.execution_attempt, j.execution_lease_expires_at;
end;
$$;

create or replace function public.renew_content_studio_execution(
  p_job_id uuid,
  p_contract_id text,
  p_contract_hash text,
  p_execution_owner text,
  p_execution_attempt integer,
  p_lease_seconds integer default 900
)
returns table(execution_lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.content_jobs j
     set execution_lease_expires_at = clock_timestamp()
       + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600)))
   where j.id = p_job_id
     and j.contract_id = p_contract_id
     and j.contract_hash = p_contract_hash
     and j.execution_owner = p_execution_owner
     and j.execution_attempt = p_execution_attempt
     and j.execution_lease_expires_at > clock_timestamp()
     and j.status in ('pending','drafting','processing','publishing','pr_created')
  returning j.execution_lease_expires_at;
end;
$$;

create or replace function public.check_content_studio_execution(
  p_job_id uuid,
  p_contract_id text,
  p_contract_hash text,
  p_execution_owner text,
  p_execution_attempt integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.content_jobs j
     where j.id = p_job_id
       and j.contract_id = p_contract_id
       and j.contract_hash = p_contract_hash
       and j.execution_owner = p_execution_owner
       and j.execution_attempt = p_execution_attempt
       and j.execution_lease_expires_at > clock_timestamp()
       and j.status in ('pending','drafting','processing','publishing','pr_created')
  );
$$;

create or replace function public.release_content_studio_execution(
  p_job_id uuid,
  p_execution_owner text,
  p_execution_attempt integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare released boolean := false;
begin
  update public.content_jobs j
     set execution_owner = null,
         execution_lease_expires_at = null
   where j.id = p_job_id
     and j.execution_owner = p_execution_owner
     and j.execution_attempt = p_execution_attempt;
  released := found;
  return released;
end;
$$;

revoke all on function public.claim_content_studio_execution(uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.renew_content_studio_execution(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.check_content_studio_execution(uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.release_content_studio_execution(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.claim_content_studio_execution(uuid,text,text,text,integer) to service_role;
grant execute on function public.renew_content_studio_execution(uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.check_content_studio_execution(uuid,text,text,text,integer) to service_role;
grant execute on function public.release_content_studio_execution(uuid,text,integer) to service_role;
