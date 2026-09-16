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
--
-- Reverse block (documented here as the rollback; intentionally NOT executed):
--   alter table public.content_jobs drop column if exists provider_error_class;
--   alter table public.content_jobs drop column if exists actual_provider;
-- Both columns are nullable additions, so a code revert needs no schema rollback.

alter table if exists public.content_jobs
  add column if not exists actual_provider text,
  add column if not exists provider_error_class text;

comment on column public.content_jobs.ai_provider is
  'Requested/owner provider pin. Commissioned values: grok | deepseek-v41-flash. Legacy values are historical and non-executable.';
comment on column public.content_jobs.actual_provider is
  'Commissioned pin that produced the accepted artifact; null until first successful provider completion.';
comment on column public.content_jobs.provider_error_class is
  'Granular provider failure class: auth|quota|rate_limit|timeout|malformed|empty|unavailable|destination_violation|unusable_generation|selection_required.';
