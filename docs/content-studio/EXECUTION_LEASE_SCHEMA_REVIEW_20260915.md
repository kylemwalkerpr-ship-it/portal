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

### 1. Atomic acquisition, failed-job recovery, and expired-lease takeover

`claim_content_studio_execution` performs one conditional `UPDATE ... RETURNING` against the exact `job_id + contract_id + contract_hash`. Normal acquisition is limited to the active Content Studio statuses. An exact failed contracted job can be reacquired only when the caller explicitly sets `p_allow_failed_retry=true`; that same atomic update transitions it back to `drafting`, clears the old error, and increments the fencing token.

Acquisition succeeds only when the owner is null, the lease is null, or the lease has expired. A current lease therefore admits one owner only. An expired lease may be taken over only by a new claim; the old worker cannot renew after expiry.

Merged and closed rows are never generally claimable. Terminal status support in renew/check exists only so the **current unexpired owner+attempt** can finish success/failure persistence and release its lease after the job status has transitioned.

### 2. Monotonically increasing attempt / fencing token

Every successful claim executes:

`execution_attempt = coalesce(j.execution_attempt, 0) + 1`

The attempt is never reset on release. Existing rows start at `0`; their first claim becomes attempt `1`. Failed-job recovery or expired takeover becomes a strictly newer attempt. Owner strings are request-unique, but correctness does not depend on owner uniqueness alone: runtime checks require **owner + attempt**.

### 3. Owner-and-attempt checks on renewal, completion, failure, and release

The SQL RPCs `renew_content_studio_execution`, `check_content_studio_execution`, and `release_content_studio_execution` all require the exact owner and attempt. Renew/check additionally require an unexpired lease.

Application terminal success/failure writes in `lib/seoFactory/contentStudioPipelineCore.ts` are further conditioned on:

- exact job id;
- exact opportunity id;
- exact contract id/hash;
- `execution_owner`;
- `execution_attempt`;
- `execution_lease_expires_at > now`.

`lib/seoFactory/persistContentJob.ts` applies the same fence to strict guard reads, primary updates, and compatibility retries. The strict path deliberately skips the legacy broad sibling-closing update because that mutation is not execution-owned. Strict SSE retains its full-lifetime producer and heartbeat while its direct job client is fenced at the database mutation boundary.

Bounded Author Revise uses the same claim/assert/fenced-update/release contract and explicitly enters the failed-job recovery claim mode when appropriate.

### 4. An expired worker cannot continue to publish

Strict execution state carries the job, contract, owner, attempt and expiry. Provider/authoring/ship checks fail when the local lease is lost or expired.

More importantly, `lib/githubContents.ts` is the public fencing facade over the GitHub implementation. Before a strict Content Studio Git mutation, the facade calls `renew_content_studio_execution` with the exact job/contract/owner/attempt. A stale or expired worker cannot renew and therefore never reaches the Git mutation.

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

`contentStudioPipelineCore.ts` starts the heartbeat around the entire raw JSON/SSE producer, including time spent awaiting a long model call. Renewal failure marks the execution lease lost and aborts the linked generation signal. Terminal persistence then refuses stale ownership.

Every strict Git mutation performs an additional immediate renewal, giving the bounded Git operation a fresh lease while simultaneously proving its fencing token is still current.

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

Existing legacy/uncontracted jobs are not forced through the strict lease runner. Existing contracted active jobs with no lease can be claimed normally and receive attempt `1`. Existing failed contracted jobs can be retried only through the explicit recovery flag. The migration does not change the existing `content_jobs.status` vocabulary.

## Concurrency / fencing tests submitted with this SQL

- `tests/sql/content-studio-execution-lease.sql`
  - runs the candidate schema in a disposable PostgreSQL 16 transaction;
  - proves normal atomic claim and active-opportunity uniqueness;
  - proves failed→explicit-retry acquisition;
  - proves current-owner merged finalization/release and failed-owner release/retry;
  - proves expired takeover increments the attempt token;
  - proves stale owner/attempt tokens cannot check/renew/release the replacement worker.
- `tests/content-studio-execution-lease.test.ts`
  - SQL/API contract for atomic claim and expired takeover;
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
- `tests/content-studio-persist-fencing.test.ts`
  - stale attempt cannot overwrite the replacement worker through the real public persistence boundary;
  - strict execution does not perform the legacy broad sibling-closing mutation.
- `tests/content-studio-stream-fenced-persistence.test.ts`
  - direct strict SSE job writes and compatibility retries are fenced by the current owner/attempt/lease.
- `tests/content-studio-git-lease.test.ts`
  - exact owner+attempt renewal immediately before Git mutation;
  - stale/expired owner is blocked before the Git write;
  - delayed inherited callback after execution completion cannot write Git.
- `tests/content-studio-failure-recovery.test.ts`
  - accepted draft recovery and pre-draft failure under a real execution fencing identity.
- `tests/content-studio-author-revise-route.test.ts`
  - bounded revision claims/fences/releases the same job and rejects model drift.

## Reproducible disposable-PostgreSQL command

The focused workflow runs PostgreSQL 16 and executes:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
  psql -v ON_ERROR_STOP=1 -f tests/sql/content-studio-execution-lease.sql
```

The SQL test wraps the candidate schema/lifecycle assertions in a transaction and rolls it back. It does **not** contact or mutate the live Supabase project.

## Exact SQL submitted for schema review

The block below is intentionally identical to `supabase/migrations/20260915_content_studio_execution_lease.sql` in this review candidate.

```sql
-- Content Studio execution ownership and fencing (additive).
-- Review-only in PR #200. THIS MIGRATION IS INTENTIONALLY UNAPPLIED.
-- Do not edit or replay supabase/migrations/20260914_content_studio_evidence_contract.sql.
--
-- Acquisition and finalization are deliberately separate:
--   * normal acquisition is limited to active statuses;
--   * an exact failed contracted job may be reacquired only with p_allow_failed_retry=true,
--     which atomically transitions it back to drafting and increments the fencing token;
--   * merged/failed rows are never generally claimable, but the CURRENT unexpired
--     owner+attempt may renew/check them long enough to finalize and release;
--   * stale/expired owners cannot renew or release a newer attempt;
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
  p_lease_seconds integer default 900,
  p_allow_failed_retry boolean default false
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
           + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600))),
         status = case when p_allow_failed_retry and j.status = 'failed' then 'drafting' else j.status end,
         execution_stage = case when p_allow_failed_retry and j.status = 'failed' then 'drafting' else j.execution_stage end,
         error_message = case when p_allow_failed_retry and j.status = 'failed' then null else j.error_message end
   where j.id = p_job_id
     and j.contract_id = p_contract_id
     and j.contract_hash = p_contract_hash
     and (
       j.status in ('pending','drafting','processing','publishing','pr_created')
       or (p_allow_failed_retry and j.status = 'failed')
     )
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
     and j.status in ('pending','drafting','processing','publishing','pr_created','merged','failed')
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
       and j.status in ('pending','drafting','processing','publishing','pr_created','merged','failed')
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

revoke all on function public.claim_content_studio_execution(uuid,text,text,text,integer,boolean) from public, anon, authenticated;
revoke all on function public.renew_content_studio_execution(uuid,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.check_content_studio_execution(uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.release_content_studio_execution(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.claim_content_studio_execution(uuid,text,text,text,integer,boolean) to service_role;
grant execute on function public.renew_content_studio_execution(uuid,text,text,text,integer,integer) to service_role;
grant execute on function public.check_content_studio_execution(uuid,text,text,text,integer) to service_role;
grant execute on function public.release_content_studio_execution(uuid,text,integer) to service_role;
```

## Approval gate

This package is review material only. The migration remains **UNAPPLIED**. A passing TypeScript/Jest/build/PostgreSQL lifecycle run does **not** authorize schema execution. Codex must independently review the exact SQL and concurrency/fencing tests before any production migration action is considered.
