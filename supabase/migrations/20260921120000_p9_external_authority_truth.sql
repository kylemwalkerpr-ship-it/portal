-- ============================================================================
-- 20260921120000_p9_external_authority_truth.sql
--
-- P9 external-authority truth (ADDITIVE, IDEMPOTENT, RE-RUNNABLE).
--
-- Problem this closes: the backlink engine could claim a WIN without any
-- evidence. `seo_backlink_targets.status = 'won'` was a free-text label (set
-- by hand or by a generic outreach record), the outreach table's own `won`
-- status was counted by the dashboard as a "win", and no durable artifact
-- proved that a third-party page actually links to a YouSafe URL. A label is
-- not authority.
--
-- What this migration adds:
--   1. public.seo_backlink_verifications — an APPEND-ONLY evidence table. One
--      immutable row per live verification attempt: the claimed third-party
--      page URL, the exact YouSafe target URL, the observed HTTP result, the
--      observed anchor href/anchor/context, rel attributes, page
--      canonical/indexability (each only when it was safely observable), the
--      verdict, the method, the verifier and a JSON evidence blob. UPDATE and
--      DELETE are refused by a trigger, so evidence can never be rewritten
--      after the fact.
--   2. Durable won proof pointers on public.seo_backlink_targets
--      (won_verified_at + won_verification_id) plus a VALIDATED DB truth
--      constraint: status='won' cannot exist without won_at, an absolute
--      won_backlink_url and both pointers. A BEFORE INSERT/UPDATE guard
--      trigger additionally proves the pointer is a POSITIVE verdict for THIS
--      target whose backlink URL equals the recorded won_backlink_url.
--   3. Future-write truth on public.seo_backlink_outreach: a sent-like status
--      must carry sent_at, and an outreach row may not claim `won` (wins are
--      produced only by live backlink verification on the target). Both
--      constraints are deliberately NOT VALID: existing production rows are
--      historical record and must never be rewritten, backfilled or
--      reinterpreted by this migration.
--   4. `authority_score_basis` — provenance for the legacy curated ordering
--      weight. Existing seed values are labeled 'legacy_internal' so a value
--      seeded by hand is never retroactively attributed to Ahrefs/Moz and
--      never presented as DR/DA or any third-party metric.
--   5. The dashboard view exposes the verification fields and counts a win
--      ONLY when the durable live-proof pointers exist.
--
-- This migration MUST NOT touch a single existing row. Production currently
-- has zero `won` targets, so the validated won constraint is satisfiable
-- without a data change. The legacy blog.google sent-with-null-sent_at
-- outreach row (and every other historical row) is preserved verbatim; the
-- sent_at/won outreach constraints are NOT VALID for exactly that reason.
--
-- Least privilege matches P1/P6: service_role-only FOR ALL policy, no
-- public/anon/authenticated policy or table privilege, and the dashboard view
-- is re-asserted security_invoker with service-role-only SELECT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Append-only verification evidence
-- ---------------------------------------------------------------------------
create table if not exists public.seo_backlink_verifications (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.seo_backlink_targets(id) on delete cascade,
  outreach_id uuid references public.seo_backlink_outreach(id) on delete set null,
  -- The claimed third-party page that is supposed to carry the link.
  backlink_url text not null check (nullif(btrim(backlink_url), '') is not null),
  -- The exact YouSafe URL the claim says is linked.
  target_url text not null check (nullif(btrim(target_url), '') is not null),
  -- Validated prospect host the claim belongs to (not the observed final host).
  source_domain text not null check (nullif(btrim(source_domain), '') is not null),
  -- Live HTTP observation of the claimed page. NULL means "not observed"
  -- (network error/timeout) — never a fabricated 200.
  source_http_status integer,
  source_final_url text,
  link_present boolean not null,
  observed_href text,
  anchor_text text,
  anchor_context text,
  rel_attributes text[],
  page_canonical_url text,
  page_indexable boolean,
  verdict text not null check (verdict in ('verified', 'absent', 'unavailable')),
  verified_at timestamptz not null,
  method text not null check (method in ('live_http_fetch')),
  verifier text not null check (nullif(btrim(verifier), '') is not null),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- A positive verdict is the ONLY way link_present may be true, and a
  -- verified row must carry the observed live HTTP result and the exact
  -- anchor href that made it positive. Unavailable observations stay
  -- unavailable instead of being upgraded.
  constraint seo_backlink_verifications_positive_proof_check check (
    ((verdict = 'verified') = link_present)
    and (
      verdict <> 'verified'
      or (
        observed_href is not null
        and nullif(btrim(observed_href), '') is not null
        and source_http_status is not null
        and source_http_status between 200 and 399
      )
    )
  )
);

comment on table public.seo_backlink_verifications is
  'P9 append-only evidence for live external backlink verification. One immutable row per attempt (positive, absent or unavailable). Never updated, never deleted; the only authority that may transition a seo_backlink_targets row to status=won.';
comment on column public.seo_backlink_verifications.backlink_url is
  'The claimed third-party backlink page URL that was fetched live. Validated as absolute http(s) on the prospect domain (or a subdomain) and never a YouSafe-owned host.';
comment on column public.seo_backlink_verifications.target_url is
  'The exact YouSafe estate URL the claim says is linked. Validated against HOST_PUBLIC estate hosts before any fetch.';
comment on column public.seo_backlink_verifications.link_present is
  'True only when a real anchor href in the live fetched page matched the exact target URL (structural exactAnchorHrefMatch proof). Never inferred from prose, comments, scripts or JSON payloads.';
comment on column public.seo_backlink_verifications.observed_href is
  'The exact anchor href attribute that proved the link. NULL for absent/unavailable attempts — never synthesized.';
comment on column public.seo_backlink_verifications.anchor_text is
  'Visible anchor text of the proving anchor when it was safely observable. NULL when it could not be read — never guessed.';
comment on column public.seo_backlink_verifications.anchor_context is
  'Rendered context window around the proving anchor when it was safely observable. NULL otherwise.';
comment on column public.seo_backlink_verifications.rel_attributes is
  'rel attribute tokens of the proving anchor when the tag was safely parsed. Empty array means the anchor carried no rel attribute; NULL means it was not observable.';
comment on column public.seo_backlink_verifications.page_canonical_url is
  'Declared canonical of the fetched page when safely observable, else NULL. Observation only — it never changes the anchor verdict.';
comment on column public.seo_backlink_verifications.page_indexable is
  'False when a robots meta tag or X-Robots-Tag response header declared noindex; true when such a directive was observed without noindex; NULL when indexability was not observable. Never inferred.';
comment on column public.seo_backlink_verifications.verdict is
  'Closed verdict vocabulary: verified (live page + exact anchor href), absent (live page, no such anchor), unavailable (no usable live page/observation). Only verified may produce a won target.';
comment on column public.seo_backlink_verifications.method is
  'Closed method vocabulary: live_http_fetch — the claimed page was fetched live over HTTP during this attempt.';
comment on column public.seo_backlink_verifications.verifier is
  'Who/what produced the observation (operator identity or the deterministic verifier user agent). Provenance for the evidence row.';

-- Append-only enforcement (idempotent): evidence is history, never a row to be
-- re-pointed. Service-role code inserts; nothing updates or deletes.
create or replace function public.seo_backlink_verifications_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'seo_backlink_verifications is append-only; insert a new evidence row instead of %', tg_op;
end;
$$;

-- The trigger body references no relation/function, so an empty search_path is
-- safe here and removes the mutable-search_path advisor finding up front.
alter function public.seo_backlink_verifications_append_only() set search_path = '';

drop trigger if exists seo_backlink_verifications_no_update on public.seo_backlink_verifications;
create trigger seo_backlink_verifications_no_update
  before update or delete on public.seo_backlink_verifications
  for each row execute function public.seo_backlink_verifications_append_only();

-- ---------------------------------------------------------------------------
-- 2. Durable won proof pointers + DB truth constraint on the target
-- ---------------------------------------------------------------------------
alter table public.seo_backlink_targets
  add column if not exists won_verified_at timestamptz null,
  add column if not exists won_verification_id uuid null
    references public.seo_backlink_verifications(id),
  add column if not exists authority_score_basis text not null default 'legacy_internal';

comment on column public.seo_backlink_targets.won_verification_id is
  'The exact seo_backlink_verifications row whose positive live proof produced this win. Required (with won_verified_at) whenever status=won; NULL means the row was never verified live.';
comment on column public.seo_backlink_targets.won_verified_at is
  'When the live proof that produced this win was observed. Required whenever status=won.';
comment on column public.seo_backlink_targets.authority_score_basis is
  'Provenance for authority_score. legacy_internal = the curated seed/operator value, an internal 0-100 priority ordering only. It is NOT DR, DA, Ahrefs, Moz or any third-party metric and must never be presented as one.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_backlink_targets_authority_score_basis_check'
  ) then
    alter table public.seo_backlink_targets
      add constraint seo_backlink_targets_authority_score_basis_check
      check (authority_score_basis in ('legacy_internal', 'internal_priority'));
  end if;
end $$;

-- Fail-closed win contract. Added as a VALIDATED constraint: production holds
-- zero won targets, so a violating row would fail the migration instead of
-- silently escaping enforcement. Existing history is never reconciled here.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_backlink_targets_won_requires_verification'
  ) then
    alter table public.seo_backlink_targets
      add constraint seo_backlink_targets_won_requires_verification
      check (
        status <> 'won'
        or (
          won_at is not null
          and won_backlink_url is not null
          and btrim(won_backlink_url) <> ''
          and won_backlink_url ~* '^https?://'
          and won_verified_at is not null
          and won_verification_id is not null
        )
      );
  end if;
end $$;

-- The constraint above proves the pointers EXIST. This guard proves they are
-- real: the referenced evidence must belong to this exact target, must carry a
-- positive verdict with link_present, and its backlink URL must be the URL
-- recorded as the win. A hand-written won row therefore cannot survive even
-- with a pointer to an unrelated (or negative) evidence row.
create or replace function public.seo_backlink_targets_won_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  verified record;
begin
  if new.status is distinct from 'won' then
    return new;
  end if;
  if new.won_verification_id is null then
    raise exception 'seo_backlink_targets.status=won requires won_verification_id from live backlink verification';
  end if;
  select v.id, v.target_id, v.link_present, v.verdict, v.backlink_url
    into verified
    from public.seo_backlink_verifications v
   where v.id = new.won_verification_id;
  if not found then
    raise exception 'seo_backlink_targets.won_verification_id % does not exist in public.seo_backlink_verifications', new.won_verification_id;
  end if;
  if verified.target_id is distinct from new.id then
    raise exception 'seo_backlink_targets.won_verification_id % belongs to a different target', new.won_verification_id;
  end if;
  if verified.verdict is distinct from 'verified' or verified.link_present is not true then
    raise exception 'seo_backlink_targets.status=won requires a positive live verification verdict';
  end if;
  if new.won_backlink_url is distinct from verified.backlink_url then
    raise exception 'seo_backlink_targets.won_backlink_url must equal the verified backlink page URL';
  end if;
  return new;
end;
$$;

drop trigger if exists seo_backlink_targets_won_guard on public.seo_backlink_targets;
create trigger seo_backlink_targets_won_guard
  before insert or update on public.seo_backlink_targets
  for each row execute function public.seo_backlink_targets_won_guard();

-- ---------------------------------------------------------------------------
-- 3. Future outreach truth (NOT VALID: history is preserved verbatim)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_backlink_outreach_sent_requires_sent_at'
  ) then
    alter table public.seo_backlink_outreach
      add constraint seo_backlink_outreach_sent_requires_sent_at
      check (status not in ('sent', 'follow_up_sent') or sent_at is not null)
      not valid;
  end if;
end $$;

-- Deliberately NOT VALID: existing rows (including the legacy blog.google
-- sent row whose sent_at was never recorded) are historical record. They are
-- never rewritten or backfilled by this migration. The constraint still
-- applies to every future insert/update, so a new sent-like record can no
-- longer be written without the actual send time.
comment on constraint seo_backlink_outreach_sent_requires_sent_at on public.seo_backlink_outreach is
  'P9: a future sent-like outreach status (sent / follow_up_sent) must carry sent_at at the actual record time. NOT VALID on purpose — legacy rows with null sent_at are preserved exactly as they are and are never silently rewritten.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seo_backlink_outreach_won_requires_verified_backlink'
  ) then
    alter table public.seo_backlink_outreach
      add constraint seo_backlink_outreach_won_requires_verified_backlink
      check (status <> 'won')
      not valid;
  end if;
end $$;

-- Deliberately NOT VALID for the same reason: any historical outreach row that
-- claimed a win stays visible as history. The constraint still applies to
-- future writes, and the generic outreach-record route rejects `won` outright,
-- so a win can only ever be produced by live backlink verification on the
-- target row.
comment on constraint seo_backlink_outreach_won_requires_verified_backlink on public.seo_backlink_outreach is
  'P9: an outreach touch may not claim status=won. A win is a durable live-proof pointer on seo_backlink_targets (won_verified_at + won_verification_id). NOT VALID on purpose — legacy rows are preserved and never rewritten.';

-- ---------------------------------------------------------------------------
-- 4. Read indexes + verified-win dashboard
-- ---------------------------------------------------------------------------
create index if not exists idx_seo_backlink_verifications_target
  on public.seo_backlink_verifications (target_id, verified_at desc);
create index if not exists idx_seo_backlink_verifications_verdict
  on public.seo_backlink_verifications (verdict, verified_at desc);
create index if not exists idx_seo_backlink_targets_won_proof
  on public.seo_backlink_targets (won_verified_at desc)
  where won_verification_id is not null;

-- The existing view is REPLACED, never dropped: the leading column list keeps
-- its exact names/order/type, so this stays additive for every existing reader.
-- Change: `wins` now counts a durable live proof instead of an outreach status
-- label, and the verification fields the UI needs are appended.
create or replace view public.seo_backlink_dashboard AS
SELECT
  t.id,
  t.domain,
  t.target_url,
  t.title,
  t.kind,
  t.lane,
  t.authority_score,
  t.contact_name,
  t.contact_email,
  t.countries,
  t.stages,
  t.topics,
  t.rationale,
  t.status AS target_status,
  t.first_seen_at,
  t.last_touched_at,
  t.won_at,
  t.lost_at,
  t.won_backlink_url,
  COALESCE((
    SELECT jsonb_build_object(
      'id', o.id,
      'channel', o.channel,
      'status', o.status,
      'subject', o.subject,
      'sent_at', o.sent_at,
      'first_reply_at', o.first_reply_at,
      'follow_up_due_at', o.follow_up_due_at,
      'follow_up_count', o.follow_up_count,
      'replied_summary', o.replied_summary
    )
    FROM public.seo_backlink_outreach o
    WHERE o.target_id = t.id
    ORDER BY o.drafted_at DESC LIMIT 1
  ), '{}'::jsonb) AS latest_outreach,
  (
    SELECT count(*)::int FROM public.seo_backlink_outreach o WHERE o.target_id = t.id
  ) AS outreach_count,
  -- P9: a "win" is the durable live-proof pointer pair — never a status label
  -- and never an outreach row's status.
  (
    CASE
      WHEN t.won_verified_at IS NOT NULL AND t.won_verification_id IS NOT NULL THEN 1
      ELSE 0
    END
  ) AS wins,
  t.authority_score_basis,
  t.won_verified_at,
  t.won_verification_id,
  (
    SELECT count(*)::int FROM public.seo_backlink_verifications v WHERE v.target_id = t.id
  ) AS verification_count,
  (
    SELECT v.verified_at FROM public.seo_backlink_verifications v
    WHERE v.target_id = t.id ORDER BY v.verified_at DESC LIMIT 1
  ) AS last_verified_at,
  (
    SELECT v.verdict FROM public.seo_backlink_verifications v
    WHERE v.target_id = t.id ORDER BY v.verified_at DESC LIMIT 1
  ) AS last_verdict,
  (
    SELECT v.link_present FROM public.seo_backlink_verifications v
    WHERE v.target_id = t.id ORDER BY v.verified_at DESC LIMIT 1
  ) AS last_link_present
FROM public.seo_backlink_targets t;

comment on view public.seo_backlink_dashboard is
  'P9 backlink dashboard. `wins` is 1 only when the target carries durable live-proof pointers (won_verified_at + won_verification_id); a status label alone is not a win. Appended columns expose the verification evidence summary for the UI.';

-- ---------------------------------------------------------------------------
-- 5. Least privilege (service-role-only, consistent with P1 and P6)
-- ---------------------------------------------------------------------------
alter table public.seo_backlink_verifications enable row level security;

do $$
declare
  entry record;
begin
  for entry in
    select policyname, schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('seo_backlink_verifications', 'seo_backlink_dashboard')
      and roles && array['public', 'anon', 'authenticated']::name[]
  loop
    execute format('drop policy if exists %I on %I.%I', entry.policyname, entry.schemaname, entry.tablename);
  end loop;
end
$$;

drop policy if exists "Service role full access" on public.seo_backlink_verifications;
create policy "Service role full access" on public.seo_backlink_verifications
  for all to service_role using (true) with check (true);

revoke all privileges on table public.seo_backlink_verifications from public, anon, authenticated;
grant all privileges on table public.seo_backlink_verifications to service_role;

-- CREATE OR REPLACE VIEW preserves reloptions and grants; re-assert both so a
-- replayed or partially-applied estate can never leave the view client-readable.
alter view public.seo_backlink_dashboard set (security_invoker = true);
revoke all privileges on table public.seo_backlink_dashboard from public, anon, authenticated;
grant select on table public.seo_backlink_dashboard to service_role;

notify pgrst, 'reload schema';
