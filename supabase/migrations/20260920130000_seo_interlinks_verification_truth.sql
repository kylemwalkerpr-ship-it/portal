-- ============================================================================
-- 20260920130000_seo_interlinks_verification_truth.sql
--
-- P6 foundation repair — durable interlink verification truth.
--
-- Problem this closes: `seo_interlinks.status = 'applied'` used to be written
-- from an in-memory body substring immediately after a Git commit/merge, before
-- any production live verification. A row therefore claimed "applied" without
-- any durable source URL, verification state, or evidence, and the P6 gate
-- could not distinguish executed authority from a planner guess.
--
-- This migration is ADDITIVE and IDEMPOTENT (re-runnable):
--   · adds the six nullable verification-truth/job-identity/attempt columns,
--   · constrains `verification_state` to the closed vocabulary,
--   · constrains `status = 'applied'` to require the full proof contract,
--   · adds the two read indexes the verification/report queries need,
--   · hardens grants/RLS to least privilege (writes are server/admin only;
--     the anon/authenticated SELECT is preserved for the existing read-only
--     Realtime subscription contract) — see the audit note below.
--
-- It does NOT reconcile, rewrite, backfill or reject any existing row. The
-- production applied count is 0, so the validated constraint is satisfiable
-- by the current estate without touching a single existing row. Any later
-- backlog reconciliation/retarget is explicitly out of scope for P6
-- foundation and must not be smuggled into this file.
--
-- `source_job_id` (nullable uuid) exists so the scheduled contracted
-- reconciler can prove the OFFICIAL deployment lineage for the exact ship job
-- that staged an edge (verifyLiveUrl -> reconcilePublicationDeployment) before
-- any automatic finalization. Staged rows without it are never auto-finalized
-- and stay unresolved/manual. The applied proof constraint deliberately does
-- NOT require it: the minimum applied proof remains source_url + present +
-- verified_at + evidence + applied_at.
--
-- `verification_attempted_at` (nullable timestamptz) is the bounded-retry
-- marker for attempts that did NOT finalize (deployment not observable yet, or
-- an ok=true verdict without positive deployment-lineage proof). It carries no
-- verdict and is never part of the applied-proof constraint; failed attempts
-- must never write verified_at/verification_state/verification_evidence.
-- ============================================================================

alter table public.seo_interlinks
  add column if not exists source_url text null,
  add column if not exists source_job_id uuid null,
  add column if not exists verification_state text null,
  add column if not exists verified_at timestamptz null,
  add column if not exists verification_evidence jsonb null,
  add column if not exists verification_attempted_at timestamptz null;

comment on column public.seo_interlinks.source_url is
  'Durable live source identity (the shipped plan canonicalUrl) that staged this edge for verification. Planner slugs are locators, never source URL authority.';
comment on column public.seo_interlinks.source_job_id is
  'Exact content_jobs.id (ship job) that staged this edge. Scheduled automatic finalization requires this exact job id so verifyLiveUrl proves the official deployment lineage (reconcilePublicationDeployment) for that job; rows without it are never auto-finalized and remain unresolved/manual. Nullable on purpose — legacy/backlog and non-ship rows are not forced to invent a job identity.';
comment on column public.seo_interlinks.verification_state is
  'Closed verification vocabulary: present | absent | source_not_live | target_not_live | unverifiable. Null until a verifier has actually run.';
comment on column public.seo_interlinks.verified_at is
  'When the verification verdict was produced. Required (with source_url, verification_state=present and verification_evidence) before status may be applied.';
comment on column public.seo_interlinks.verification_evidence is
  'JSON proof for the verdict: source, target, proof kind (live_exact_href), observed href, source context and live HTTP observations.';
comment on column public.seo_interlinks.verification_attempted_at is
  'When the scheduled reconciler last ATTEMPTED verification for this exact (source_url, source_job_id) planned revision without finalizing. Bounded-retry/cooldown marker only: it is NOT a verification verdict or proof, is never part of the applied-proof constraint, is never backfilled, and a non-ok attempt writes only this column (never verified_at/verification_state/verification_evidence).';

-- Closed vocabulary. Null means "no verdict yet" — never a silent sixth state.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_interlinks_verification_state_check'
  ) then
    alter table public.seo_interlinks
      add constraint seo_interlinks_verification_state_check
      check (
        verification_state is null
        or verification_state in ('present', 'absent', 'source_not_live', 'target_not_live', 'unverifiable')
      );
  end if;
end $$;

-- Fail-closed applied contract: a row may only be `applied` when durable
-- verification truth is present. Added as a validated constraint immediately
-- (production applied count is 0), so a violating row would fail the
-- migration instead of silently escaping enforcement.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_interlinks_applied_requires_verification'
  ) then
    alter table public.seo_interlinks
      add constraint seo_interlinks_applied_requires_verification
      check (
        status <> 'applied'
        or (
          source_url is not null
          and btrim(source_url) <> ''
          and verification_state = 'present'
          and verified_at is not null
          and verification_evidence is not null
          and applied_at is not null
        )
      );
  end if;
end $$;

-- Verification/report read paths: staged rows are looked up by exact durable
-- source_url, and the P6 disposition report groups the closed vocabulary.
create index if not exists idx_seo_interlinks_source_url
  on public.seo_interlinks (source_url)
  where source_url is not null;
create index if not exists idx_seo_interlinks_verification_state
  on public.seo_interlinks (verification_state)
  where verification_state is not null;

-- ---------------------------------------------------------------------------
-- Least privilege (P6 audit of repository callers, 2026-09-20)
--
-- Every write to seo_interlinks in this repository is server/admin:
--   · lib/seoEngine/interlink.ts           (createSupabaseAdminClient)
--   · lib/seoFactory/interlinkVerification.ts (createSupabaseAdminClient)
--   · lib/seoEngine/backlinkEngine.ts      (createSupabaseAdminClient)
--   · scripts/*                            (service key)
-- The Content Studio browser client only subscribes to this table read-only
-- (components/design/admin-content-studio.tsx -> subscribeToTables; pinned by
-- tests/p1-base-table-least-privilege.test.ts), so SELECT must stay available
-- to anon/authenticated for Realtime; write verbs must not.
-- ---------------------------------------------------------------------------
drop policy if exists "Engine v2 full access" on public.seo_interlinks;
drop policy if exists "seo_interlinks service role full access" on public.seo_interlinks;
create policy "seo_interlinks service role full access"
  on public.seo_interlinks
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "seo_interlinks read for realtime" on public.seo_interlinks;
create policy "seo_interlinks read for realtime"
  on public.seo_interlinks
  for select
  to anon, authenticated
  using (true);

revoke all privileges on table public.seo_interlinks from public, anon, authenticated;
grant select on table public.seo_interlinks to anon, authenticated;
grant all privileges on table public.seo_interlinks to service_role;

notify pgrst, 'reload schema';
