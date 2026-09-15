\set ON_ERROR_STOP on

begin;

create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit;

create table public.content_jobs (
  id uuid primary key,
  opportunity_id text,
  contract_id text,
  contract_hash text,
  status text not null,
  execution_stage text,
  error_message text
);

create unique index content_jobs_opportunity_reservation_idx
  on public.content_jobs (opportunity_id)
  where opportunity_id is not null
    and status in ('pending','drafting','processing','publishing','pr_created');

\ir ../../supabase/migrations/20260915_content_studio_execution_lease.sql

do $test$
declare
  first_claim record;
  retry_claim record;
  takeover_claim record;
  expires timestamptz;
  ok boolean;
  released boolean;
  n integer;
begin
  -- Failed recovery is explicit: an exact failed contract may be reacquired only
  -- when the caller opts into retry, and the claim atomically re-enters drafting.
  insert into public.content_jobs(id, opportunity_id, contract_id, contract_hash, status, execution_stage)
  values ('00000000-0000-0000-0000-000000000001', 'opp-retry', 'contract-retry', 'hash-retry', 'failed', 'revision_required');

  select * into first_claim
    from public.claim_content_studio_execution(
      '00000000-0000-0000-0000-000000000001', 'contract-retry', 'hash-retry', 'owner-a', 900, true
    );
  if first_claim.execution_owner <> 'owner-a' or first_claim.execution_attempt <> 1 then
    raise exception 'failed job retry claim did not create attempt 1';
  end if;
  if (select status from public.content_jobs where id='00000000-0000-0000-0000-000000000001') <> 'drafting' then
    raise exception 'failed retry claim did not atomically transition to drafting';
  end if;

  -- A second failed row for the same opportunity may exist, but reacquiring it
  -- while the first reservation is active must be rejected by the partial unique index.
  insert into public.content_jobs(id, opportunity_id, contract_id, contract_hash, status, execution_stage)
  values ('00000000-0000-0000-0000-000000000002', 'opp-retry', 'contract-retry-2', 'hash-retry-2', 'failed', 'revision_required');
  begin
    perform * from public.claim_content_studio_execution(
      '00000000-0000-0000-0000-000000000002', 'contract-retry-2', 'hash-retry-2', 'owner-b', 900, true
    );
    raise exception 'expected active opportunity uniqueness to block failed-job reacquisition';
  exception when unique_violation then
    null;
  end;

  -- The current owner must remain valid after the raw publication path moves the
  -- row to merged so manifest finalization and release can complete.
  update public.content_jobs set status='merged', execution_stage='merged'
   where id='00000000-0000-0000-0000-000000000001';
  select public.check_content_studio_execution(
    '00000000-0000-0000-0000-000000000001', 'contract-retry', 'hash-retry', 'owner-a', 1
  ) into ok;
  if not ok then raise exception 'merged owner could not finalize its execution'; end if;

  select execution_lease_expires_at into expires
    from public.renew_content_studio_execution(
      '00000000-0000-0000-0000-000000000001', 'contract-retry', 'hash-retry', 'owner-a', 1, 900
    );
  if expires is null then raise exception 'merged owner could not renew during finalization'; end if;

  select public.release_content_studio_execution(
    '00000000-0000-0000-0000-000000000001', 'owner-a', 1
  ) into released;
  if not released then raise exception 'merged owner could not release'; end if;

  -- Once the first opportunity is no longer active, the failed sibling can retry.
  select * into retry_claim
    from public.claim_content_studio_execution(
      '00000000-0000-0000-0000-000000000002', 'contract-retry-2', 'hash-retry-2', 'owner-b', 900, true
    );
  if retry_claim.execution_attempt <> 1 then raise exception 'retry sibling did not acquire'; end if;

  -- A failed terminal write made by the current owner remains finalizable/releasable,
  -- then an explicit retry creates a newer fencing attempt.
  update public.content_jobs set status='failed', execution_stage='revision_required'
   where id='00000000-0000-0000-0000-000000000002';
  select public.check_content_studio_execution(
    '00000000-0000-0000-0000-000000000002', 'contract-retry-2', 'hash-retry-2', 'owner-b', 1
  ) into ok;
  if not ok then raise exception 'failed owner could not finalize/release'; end if;
  perform public.release_content_studio_execution('00000000-0000-0000-0000-000000000002', 'owner-b', 1);
  select * into retry_claim
    from public.claim_content_studio_execution(
      '00000000-0000-0000-0000-000000000002', 'contract-retry-2', 'hash-retry-2', 'owner-c', 900, true
    );
  if retry_claim.execution_attempt <> 2 then raise exception 'failed retry did not advance fencing attempt'; end if;
  perform public.release_content_studio_execution('00000000-0000-0000-0000-000000000002', 'owner-c', 2);

  -- Expired takeover creates a newer token; stale renew/release cannot revive or clear it.
  insert into public.content_jobs(id, opportunity_id, contract_id, contract_hash, status, execution_stage)
  values ('00000000-0000-0000-0000-000000000003', 'opp-takeover', 'contract-takeover', 'hash-takeover', 'drafting', 'drafting');
  perform * from public.claim_content_studio_execution(
    '00000000-0000-0000-0000-000000000003', 'contract-takeover', 'hash-takeover', 'old-owner', 900, false
  );
  update public.content_jobs set execution_lease_expires_at=clock_timestamp()-interval '1 second'
   where id='00000000-0000-0000-0000-000000000003';
  select * into takeover_claim
    from public.claim_content_studio_execution(
      '00000000-0000-0000-0000-000000000003', 'contract-takeover', 'hash-takeover', 'new-owner', 900, false
    );
  if takeover_claim.execution_attempt <> 2 or takeover_claim.execution_owner <> 'new-owner' then
    raise exception 'expired takeover did not advance ownership token';
  end if;
  select count(*) into n from public.renew_content_studio_execution(
    '00000000-0000-0000-0000-000000000003', 'contract-takeover', 'hash-takeover', 'old-owner', 1, 900
  );
  if n <> 0 then raise exception 'stale owner renewed after takeover'; end if;
  select public.release_content_studio_execution(
    '00000000-0000-0000-0000-000000000003', 'old-owner', 1
  ) into released;
  if released then raise exception 'stale owner released newer lease'; end if;
end;
$test$;

rollback;
