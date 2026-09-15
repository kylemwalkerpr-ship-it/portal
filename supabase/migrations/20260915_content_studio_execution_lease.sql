-- Content Studio execution ownership (additive; DO NOT replay prior evidence-contract migration)
-- Review-only in PR #200. This migration is intentionally NOT executed by the implementation session.

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
returns table(execution_owner text, execution_attempt integer, execution_lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_execution_owner), '') is null then
    raise exception 'execution owner is required';
  end if;

  return query
  update public.content_jobs j
     set execution_owner = p_execution_owner,
         execution_attempt = coalesce(j.execution_attempt, 0) + 1,
         execution_lease_expires_at = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600)))
   where j.id = p_job_id
     and j.contract_id = p_contract_id
     and j.contract_hash = p_contract_hash
     and j.status in ('pending','drafting','processing','publishing','pr_created')
     and (
       j.execution_owner is null
       or j.execution_lease_expires_at is null
       or j.execution_lease_expires_at <= now()
     )
  returning j.execution_owner, j.execution_attempt, j.execution_lease_expires_at;
end;
$$;

revoke all on function public.claim_content_studio_execution(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_content_studio_execution(uuid,text,text,text,integer) to service_role;

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

revoke all on function public.release_content_studio_execution(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.release_content_studio_execution(uuid,text,integer) to service_role;
