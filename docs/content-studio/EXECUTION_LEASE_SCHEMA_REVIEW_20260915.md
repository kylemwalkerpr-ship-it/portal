# Content Studio Execution Lease — Schema Review Package

**PR:** #200  
**Status:** **UNAPPLIED — REVIEW REQUIRED**  
**Migration:** `supabase/migrations/20260915_content_studio_execution_lease.sql`  
**Runtime dependency:** Contract-bound Content Studio generation/revision now requires this migration before production runtime use.  

Do **not** execute this migration until Codex has reviewed and approved this package. Do not modify or replay the previously applied `supabase/migrations/20260914_content_studio_evidence_contract.sql` migration (Supabase history version `20260914181604`).

## Why this additive migration exists

The already-applied evidence-contract migration atomically reserves an *opportunity*. It does not establish execution ownership for two workers attempting to run the **same persisted job**. PR review `5205607087` reproduced that gap.

This migration adds a short-lived execution lease plus a monotonically increasing fencing token. The lease protects terminal database writes **and the Git mutation boundary**. A worker that loses or outlives its lease is not allowed to complete, fail, release, create/update files, create a branch/PR, update a PR branch, or merge on behalf of a newer attempt.

## Invariants for Codex review

### 1. Atomic acquisition and expired-lease takeover

`claim_content_studio_execution` performs one conditional `UPDATE ... RETURNING` against the exact `job_id + contract_id + contract_hash` and active status. Acquisition succeeds only when the owner is null, the lease is null, or the lease has expired. A current lease therefore admits one owner only.

An expired lease may be taken over only by a new claim. The old worker cannot renew after expiry.

### 2. Monotonically increasing attempt / fencing token

Every successful claim executes:

`execution_attempt = coalesce(j.execution_attempt, 0) + 1`

The attempt is never reset on release. Existing rows start at `0`; their first claim becomes attempt `1`. Expired takeover becomes a strictly newer attempt. Owner strings are request-unique, but correctness does not depend on owner uniqueness alone: runtime checks require **owner + attempt**.

### 3. Owner-and-attempt checks on renewal, completion, failure, and release

The SQL RPCs `renew_content_studio_execution`, `check_content_studio_execution`, and `release_content_studio_execution` all require the exact owner and attempt. Renew/check additionally require an unexpired lease.

Application terminal success/failure writes in `lib/seoFactory/contentStudioPipeline.ts` are further conditioned on:

- exact job id;
- exact opportunity id;
- exact contract id/hash;
- `execution_owner`;
- `execution_attempt`;
- `execution_lease_expires_at > now`.

Bounded Author Revise uses the same claim/assert/fenced-update/release contract.

### 4. An expired worker cannot continue to publish

Strict execution state carries the job, contract, owner, attempt and expiry. Provider/authoring/ship checks fail when the local lease is lost or expired.

More importantly, `lib/githubContents.ts` is now a thin fencing facade over the byte-preserved `lib/githubContentsCore.ts`. Before a strict Content Studio Git mutation, the facade calls `renew_content_studio_execution` with the exact job/contract/owner/attempt. A stale or expired worker cannot renew and therefore never reaches the core Git mutation.

The facade fences:

- branch creation;
- file create/update (`putRepoFile`);
- file deletion;
- pull-request creation;
- pull-request branch update;
- pull-request merge;
- any raw non-GET/HEAD `githubFetch` that enters through the public helper.

This is intentionally stronger than checking ownership only when execution starts.

### 5. Lease duration and long Grok/provider calls

Default lease duration: **900 seconds (15 minutes)**.  
Heartbeat renewal interval: **4 minutes**.

`contentStudioPipeline.ts` starts the heartbeat around the entire raw JSON/SSE producer, including time spent awaiting a long model call. Renewal failure marks the execution lease lost and aborts the linked generation signal. Terminal persistence then refuses stale ownership.

Every Git mutation performs an additional immediate renewal, giving the bounded Git operation a fresh lease while simultaneously proving its fencing token is still current.

The SQL clamps caller-supplied lease duration to 60–3600 seconds.

### 6. Service-role-only RPC access

All four functions are `SECURITY DEFINER` with fixed `search_path = public` and explicitly:

- revoke function execution from `public`, `anon`, and `authenticated`;
- grant function execution only to `service_role`.

The browser never receives lease-RPC capability. Runtime calls originate from server-side Supabase admin clients.

### 7. Existing-job compatibility

The migration is additive:

- `execution_owner` is nullable;
- `execution_lease_expires_at` is nullable;
- `execution_attempt` is non-null with default `0` and a non-negative check.

Existing legacy/uncontracted jobs are not forced through the strict lease runner. Existing contracted active jobs with no lease can be claimed normally and receive attempt `1`. The migration does not change the existing `content_jobs.status` vocabulary.

## Concurrency / fencing tests submitted with this SQL

- `tests/content-studio-execution-lease.test.ts`
  - SQL contract for atomic claim and expired takeover;
  - monotonic attempt increment;
  - owner+attempt renewal/check/release;
  - service-role-only grants;
  - existing-row default compatibility;
  - stale-owner assertion failure.
- `tests/content-studio-stream-producer.test.ts`
  - actual strict producer across multiple SSE progress events;
  - lease renewal during an awaited long model turn;
  - two executions of the same persisted job;
  - stale-owner completion after simulated takeover is rejected.
- `tests/content-studio-git-lease.test.ts`
  - exact owner+attempt renewal immediately before Git mutation;
  - stale/expired owner is blocked before the core Git write;
  - delayed inherited callback after execution completion cannot write Git.
- `tests/content-studio-failure-recovery.test.ts`
  - accepted draft recovery and pre-draft failure under a real execution fencing identity.
- `tests/content-studio-author-revise-route.test.ts`
  - bounded revision claims/fences/releases the same job and rejects model drift.

## Exact SQL submitted for schema review

```sql
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
volatile
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
```

## Approval gate

This package is review material only. The migration remains unapplied. A passing TypeScript/Jest/build run does **not** authorize schema execution. Codex must review the exact SQL and concurrency/fencing tests before any production migration action is considered.
