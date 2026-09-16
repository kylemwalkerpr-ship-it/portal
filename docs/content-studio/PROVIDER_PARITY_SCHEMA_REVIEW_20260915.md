# Content Studio Provider Parity — Schema Review Package

**PR:** Content Studio DeepSeek provider parity (P2-C persistence)
**Status:** **UNAPPLIED — REVIEW REQUIRED**
**Migration:** `supabase/migrations/20260915_content_studio_provider_parity.sql`
**Review copy:** `tests/sql/content-studio-provider-parity.sql`
**Runtime dependency:** none. The application works identically with or without this migration (absent-column compatibility retry); it is required before `actual_provider` / `provider_error_class` lineage can be persisted in production.

Do **not** execute this migration until the supervisor reviews and approves this package. Do not modify or replay the previously applied `supabase/migrations/20260914_content_studio_evidence_contract.sql` migration, and do not modify or replay the intentionally unapplied `supabase/migrations/20260915_content_studio_execution_lease.sql` migration.

**Application status: this migration has NOT been applied to Supabase, a local database, or any remote database.** It was created and tested as text only.

## Why this additive migration exists

The provider-parity commission requires durable requested/actual provider lineage: `ai_provider` is the requested/owner pin, and the exact commissioned provider that produced the accepted artifact was previously only represented as a model (`actual_model`). Failure classes were also too coarse (`last_failure_kind` stays the retry taxonomy). This migration adds the two missing nullable columns and documents the pin semantics on `ai_provider`; no existing column, row, grant, policy, or PR #200 object changes.

## Invariants for review

### 1. Additive, nullable, least privilege

- `actual_provider text` (nullable) and `provider_error_class text` (nullable) are added with `if not exists`.
- No grants, no RLS policy, no index, no function, no trigger, and no other object is created or altered.
- `content_jobs` table grants and policies are inherited unchanged (the review SQL test asserts zero table grants added in its disposable schema).
- `ai_provider` data is never rewritten; only its column comment is documented.
- No secret, prompt, token, or request body can be stored in these columns; they hold a commissioned pin and a closed-set failure class.

### 2. Reversible

The migration file carries the documented reverse block (comment only, never executed on apply):

```sql
alter table public.content_jobs drop column if exists provider_error_class;
alter table public.content_jobs drop column if exists actual_provider;
```

Both columns are nullable additions, so reverting the code requires no schema rollback.

### 3. Absent-column compatibility (works before the migration is applied)

Every writer that names the new columns retries once without them when the target schema has not applied this migration, matching the PR #200 pattern:

- `lib/seoFactory/persistContentJobCore.ts` — `UNAPPLIED_COLUMN_ERROR_RE` / `stripUnappliedColumns`; both the update and insert compatibility retries strip `actual_provider` and `provider_error_class` alongside the legacy PR #200 columns.
- `lib/seoFactory/persistContentJob.ts` — strict fenced update uses the same shared strip helper.
- `lib/seoFactory/contentStudioPipelineCore.ts` — the strict success (`persistExecutionStage`) and failure (`persistExecutionFailure`) updates retry without the new columns.

Evidence: `tests/content-studio-provider-persistence.test.ts` (absent-column retry proves the second write omits `actual_provider` / `provider_error_class` while keeping `ai_provider`), `tests/persist-content-job.test.ts`, `tests/jobs-ship-gate-server.test.ts`, `tests/content-studio-persist-fencing.test.ts`, `tests/content-studio-manual-publication-fencing.test.ts`.

### 4. Persisted lineage contract (design §4.3)

- `content_jobs.ai_provider` — requested/owner pin (`grok` | `deepseek-v41-flash`); legacy values remain historical and non-executable.
- `content_jobs.actual_provider` — commissioned pin that produced the accepted artifact; null until a provider completion is accepted.
- `content_jobs.provider_error_class` — one of `auth|quota|rate_limit|timeout|malformed|empty|unavailable|destination_violation|unusable_generation|selection_required`; null for non-provider failures.
- `audit_json.provider` — requested/actual pin and model, `pinSource`, and a bounded (`PROVIDER_ATTEMPT_LIMIT = 20`) allowlisted `attempts[]` of `{stage, attempt, outcome, failureClass, at}`. Prompts, keys, tokens, and request bodies are structurally excluded; metadata strings are truncated.

### 5. Closed failure-class set

The `provider_error_class` comment enumerates the only values the application writes. `providerErrorClassFor` (exported from `contentStudioPipelineCore`) classifies provider failures with typed errors first (`selection_required`, `destination_violation`) and message patterns second; non-provider failures return `null` and are never mislabeled.

## SQL review test submitted with this SQL

- `tests/sql/content-studio-provider-parity.sql`
  - runs the review candidate in a disposable PostgreSQL 16 transaction;
  - creates a PR #200-shaped `content_jobs` fixture and a historical `entrim-deepseek` `ai_provider` row;
  - applies the migration twice (idempotent `if not exists` behavior);
  - asserts both columns exist as nullable `text` with no default;
  - asserts all three column comments exactly match the reviewed migration text;
  - asserts no relation, grant, or other object was created;
  - asserts the historical `ai_provider` value was not rewritten;
  - rolls back — it does **not** contact or mutate the live Supabase project.

## Reproducible disposable-PostgreSQL command

The focused workflow runs PostgreSQL 16 and executes:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres \
  psql -v ON_ERROR_STOP=1 -f tests/sql/content-studio-provider-parity.sql
```

The SQL test wraps the candidate schema/lifecycle assertions in a transaction and rolls it back. It does **not** contact or mutate the live Supabase project.

## Exact SQL submitted for schema review

The block below is intentionally identical to `supabase/migrations/20260915_content_studio_provider_parity.sql` in this review candidate.

```sql
-- Content Studio provider parity persistence (additive).
-- Review copy: tests/sql/content-studio-provider-parity.sql.
-- Review package: docs/content-studio/PROVIDER_PARITY_SCHEMA_REVIEW_20260915.md.
-- THIS MIGRATION IS INTENTIONALLY UNAPPLIED.
-- Do not edit or replay supabase/migrations/20260914_content_studio_evidence_contract.sql
-- or supabase/migrations/20260915_content_studio_execution_lease.sql.
--
-- Provider identity discipline (design §3.1, §13 decision 1):
--   * ai_provider            → requested/owner pin (grok | deepseek-v41-flash);
--                              legacy values stay historical and non-executable.
--   * actual_provider        → commissioned pin that produced the accepted
--                              artifact; null until a provider completion is
--                              accepted.
--   * provider_error_class   → granular provider failure class for the last
--                              failed provider execution.
--
-- Before this migration is applied, every writer that names actual_provider or
-- provider_error_class retries once without them
-- (persistContentJobCore.stripUnappliedColumns), so the application behaves
-- identically with and without this migration.
--
-- Additive and least-privilege: no grants, no RLS changes, no new objects, and
-- no change to any PR #200 object. ai_provider data is never rewritten; only
-- its comment is documented below.

alter table if exists public.content_jobs
  add column if not exists actual_provider text,
  add column if not exists provider_error_class text;

comment on column public.content_jobs.ai_provider is
  'Requested/owner provider pin. Commissioned values: grok | deepseek-v41-flash. Legacy values are historical and non-executable.';
comment on column public.content_jobs.actual_provider is
  'Commissioned pin that produced the accepted artifact; null until first successful provider completion.';
comment on column public.content_jobs.provider_error_class is
  'Granular provider failure class: auth|quota|rate_limit|timeout|malformed|empty|unavailable|destination_violation|unusable_generation|selection_required.';

-- Reverse block (documented here as the rollback; intentionally NOT executed):
--   alter table public.content_jobs drop column if exists provider_error_class;
--   alter table public.content_jobs drop column if exists actual_provider;
-- Both columns are nullable additions, so a code revert needs no schema rollback.
```

## Approval gate

This package is review material only. The migration remains **UNAPPLIED** and may merge unapplied. A passing TypeScript/Jest/PostgreSQL lifecycle run does **not** authorize schema execution. The supervisor must independently review the exact SQL and the persistence tests before any production migration action is considered; application requires separate explicit approval (design §13.7).
