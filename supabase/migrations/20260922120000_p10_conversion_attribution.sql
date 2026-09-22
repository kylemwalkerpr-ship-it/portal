-- ============================================================================
-- 20260922120000_p10_conversion_attribution.sql
--
-- P10 conversion-attribution foundation (ADDITIVE, IDEMPOTENT, RE-RUNNABLE).
--
-- Problem this closes: the estate can measure searches (marketplace_search_events)
-- and can record money (orders / order_events / webhook_events), but nothing
-- connects an organic landing + CTA to a trustworthy business event, and there
-- is no place to say "the acquisition source is UNKNOWN" without inventing one.
--
-- What this migration adds (three tables and one read-only view):
--   1. public.conversion_attribution_sessions — a SHORT-LIVED, opaque,
--      first-party attribution identity. Only the SHA-256 of the browser token
--      is stored; there is no IP address, user agent, email, profile id, Clerk
--      id, or any other fingerprint/reconstruction input in this table. The
--      CHECK constraint `consent_state = 'granted'` makes analytics consent a
--      precondition of existence: a denied visitor has no row here, so their
--      acquisition source stays unknown rather than being smuggled in.
--   2. public.conversion_attribution_links — the cross-domain handoff edge. A
--      handoff token is HMAC-signed, short-lived and single-use (unique nonce),
--      and it LINKS a child session to a parent session instead of merging or
--      re-pointing identities.
--   3. public.conversion_events — an APPEND-ONLY event ledger. UPDATE and
--      DELETE are refused by trigger, so refunds/cancellations are new
--      lifecycle rows and a prior paid event can never be erased or rewritten.
--      A deterministic `event_key` (single unique index) is the idempotency
--      boundary: a duplicate webhook/order callback/retry re-reads the existing
--      row and never double-credits one order. Business events are
--      `observation = 'server_observed'` and must carry a subject; browser
--      client events are `observation = 'client_declared'` and may never carry
--      a business subject or an amount, so client code cannot declare payment
--      or conversion success at the storage layer either. `attribution_state`
--      separates `attributed` (a KNOWN acquisition source) from `session_only`
--      (consented continuity proven, acquisition still unknown) and
--      `unknown_source` (no traceable session at all): unknown stays unknown.
--   4. public.p10_conversion_chain_coverage — a service-role-only
--      security_invoker view that reports chain coverage per cluster and says
--      `no_observed_business_events` when nothing real has happened yet.
--
-- Deliberately NOT in scope: retroactive attribution of historical orders. There
-- is no backfill, no "infer the source from the referrer of an old order", and
-- no column that lets an existing order be relabelled from unknown to
-- attributed. Unknown stays unknown.
--
-- This migration MUST NOT touch a single existing row. It creates new tables
-- only; nothing is added to orders / order_events / inquiries / webhook_events
-- / marketplace_search_events and the P1 `seo_reward_events` ledger is not
-- repurposed.
--
-- Least privilege matches P1/P4/P9: service_role-only FOR ALL policy, no
-- public/anon/authenticated privilege anywhere, and the coverage view is
-- re-asserted security_invoker with service-role-only SELECT.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Anonymous first-party attribution identity (consent is a precondition)
-- ---------------------------------------------------------------------------
create table if not exists public.conversion_attribution_sessions (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 hex of the opaque first-party browser token. The raw token is
  -- never persisted, so a database read cannot replay a visitor's identity.
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  -- Consent is not recorded as a value here: a row may only exist at all for a
  -- granted visitor. A denied visitor is represented by the ABSENCE of a row.
  consent_state text not null default 'granted' check (consent_state = 'granted'),
  -- First-touch classification. `unknown` is a first-class answer.
  first_source_class text not null default 'unknown' check (
    first_source_class in ('organic_search', 'referral', 'direct', 'campaign', 'internal', 'unknown')
  ),
  -- Capped, non-identifying source detail: campaign parameters, search-engine
  -- label, referring HOST only (never the full referring URL).
  first_source_detail jsonb not null default '{}'::jsonb,
  first_landing_host text,
  first_landing_path text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Short-lived by contract. An expired token must not attribute a later order.
  expires_at timestamptz not null,
  -- Consent withdrawal: the identity stops being usable; no new event may be
  -- linked to it. Existing append-only events are NOT deleted (they were
  -- collected while consent was granted).
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversion_attribution_sessions_expiry_check check (expires_at > first_seen_at),
  constraint conversion_attribution_sessions_revocation_shape check (
    (revoked_at is null and revocation_reason is null)
    or (revoked_at is not null and nullif(btrim(revocation_reason), '') is not null)
  )
);

create unique index if not exists conversion_attribution_sessions_identity_key
  on public.conversion_attribution_sessions (identity_hash);
create index if not exists conversion_attribution_sessions_expiry_idx
  on public.conversion_attribution_sessions (expires_at);
create index if not exists conversion_attribution_sessions_source_idx
  on public.conversion_attribution_sessions (first_source_class, first_seen_at desc);

-- ---------------------------------------------------------------------------
-- 2. Cross-domain handoff edges (signed, single-use, explicit parent/child)
-- ---------------------------------------------------------------------------
create table if not exists public.conversion_attribution_links (
  id uuid primary key default gen_random_uuid(),
  child_session_id uuid not null references public.conversion_attribution_sessions(id) on delete cascade,
  parent_session_id uuid not null references public.conversion_attribution_sessions(id) on delete cascade,
  -- The signed token's nonce. UNIQUE = single use, so a replayed handoff URL
  -- cannot create a second edge.
  handoff_nonce text not null check (nullif(btrim(handoff_nonce), '') is not null),
  handoff_host text,
  linked_at timestamptz not null default now(),
  constraint conversion_attribution_links_not_self check (child_session_id <> parent_session_id)
);

create unique index if not exists conversion_attribution_links_nonce_key
  on public.conversion_attribution_links (handoff_nonce);
create index if not exists conversion_attribution_links_child_idx
  on public.conversion_attribution_links (child_session_id);
create index if not exists conversion_attribution_links_parent_idx
  on public.conversion_attribution_links (parent_session_id);

-- ---------------------------------------------------------------------------
-- 3. Append-only conversion event ledger
-- ---------------------------------------------------------------------------
create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  -- Deterministic idempotency boundary. The UNIQUE index below is the claim.
  event_key text not null check (nullif(btrim(event_key), '') is not null),
  event_type text not null check (
    event_type in ('landing', 'cta_click', 'lead_created', 'order_paid', 'order_refunded', 'order_cancelled')
  ),
  event_version smallint not null default 1 check (event_version >= 1),
  -- Who observed it. Browser-declared events can never be business events and
  -- server-observed business events can never be declared by a browser.
  observation text not null check (observation in ('client_declared', 'server_observed')),
  -- Consent ACTUALLY evidenced for this event. 'unknown' is the default: a
  -- server-observed business event with no consented session and no explicit
  -- call-site consent evidence must never be stored (or reported) as granted.
  -- 'granted' is required for a client-declared event (which cannot exist
  -- without a consented session) and for an attributed business event; an
  -- unknown_source business event may only carry granted/denied when the call
  -- site recorded HOW it observed that consent (see the consent-shape check).
  consent_state text not null default 'unknown' check (consent_state in ('granted', 'denied', 'unknown')),
  -- Attribution state is derived by ONE shared rule (lib/attribution/contract.ts
  -- `deriveAttributionState`), for browser events and business events alike:
  --   attributed    -> a KNOWN acquisition source (session_id NOT NULL and
  --                    source_class NOT NULL and source_class <> 'unknown');
  --   session_only  -> continuity/consent proven (session_id NOT NULL) but the
  --                    acquisition source remains unknown (source_class = 'unknown');
  --   unknown_source-> NULL session_id + NULL source: an untraceable conversion.
  -- A session identity is proof of continuity and consent, NEVER of acquisition.
  session_id uuid references public.conversion_attribution_sessions(id) on delete set null,
  attribution_state text not null check (attribution_state in ('attributed', 'session_only', 'unknown_source')),
  source_class text check (
    source_class is null
    or source_class in ('organic_search', 'referral', 'direct', 'campaign', 'internal', 'unknown')
  ),
  source_detail jsonb not null default '{}'::jsonb,
  -- Strategic cluster + the concrete commercial object the event belongs to.
  -- NULL means "not established by evidence" and is never guessed.
  cluster text,
  product_ref text,
  subject_type text check (subject_type is null or subject_type in ('order', 'template_order', 'inquiry')),
  subject_id text,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency text,
  -- Trusted-server evidence blob (gateway label, verification method, lifecycle
  -- reference). Must not contain personal identifiers.
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint conversion_events_business_shape check (
    (
      event_type in ('landing', 'cta_click')
      and observation = 'client_declared'
      and subject_type is null
      and subject_id is null
      and amount_cents is null
      and currency is null
    )
    or (
      event_type in ('lead_created', 'order_paid', 'order_refunded', 'order_cancelled')
      and observation = 'server_observed'
      and subject_type is not null
      and subject_id is not null
    )
  ),
  constraint conversion_events_attribution_shape check (
    (
      attribution_state = 'attributed'
      and session_id is not null
      and source_class is not null
      and source_class <> 'unknown'
    )
    or (
      attribution_state = 'session_only'
      and session_id is not null
      and source_class = 'unknown'
    )
    or (attribution_state = 'unknown_source' and session_id is null and source_class is null)
  ),
  -- Consent truth model (see lib/attribution/engine.ts `resolveStoredConsent`):
  --   client_declared  -> granted, and the session it is bound to is the evidence;
  --   server_observed attributed | session_only -> granted (the session is the
  --     evidence: consent and acquisition knowledge are independent facts);
  --   server_observed unknown_source -> unknown by default; granted/denied only
  --     with explicit named evidence, never inferred from a missing identity.
  constraint conversion_events_consent_shape check (
    (observation = 'client_declared' and consent_state = 'granted')
    or (
      observation = 'server_observed'
      and attribution_state in ('attributed', 'session_only')
      and consent_state = 'granted'
    )
    or (observation = 'server_observed' and attribution_state = 'unknown_source' and consent_state = 'unknown')
    or (
      observation = 'server_observed'
      and attribution_state = 'unknown_source'
      and consent_state in ('granted', 'denied')
      and nullif(btrim(evidence ->> 'consent_evidence'), '') is not null
    )
  ),
  constraint conversion_events_amount_shape check (amount_cents is null or currency is not null)
);

create unique index if not exists conversion_events_event_key_key
  on public.conversion_events (event_key);
create index if not exists conversion_events_type_recorded_idx
  on public.conversion_events (event_type, recorded_at desc);
create index if not exists conversion_events_subject_idx
  on public.conversion_events (subject_type, subject_id);
create index if not exists conversion_events_session_idx
  on public.conversion_events (session_id, occurred_at desc)
  where session_id is not null;
create index if not exists conversion_events_cluster_idx
  on public.conversion_events (cluster, event_type, occurred_at desc);

-- Append-only enforcement: a paid event is history, not a row to be re-pointed
-- or erased. Refunds/cancellations insert a NEW lifecycle row.
create or replace function public.conversion_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'conversion_events is append-only; record a new lifecycle event instead of %', tg_op;
end;
$$;

drop trigger if exists conversion_events_no_update on public.conversion_events;
create trigger conversion_events_no_update
  before update or delete on public.conversion_events
  for each row execute function public.conversion_events_append_only();

-- ---------------------------------------------------------------------------
-- 4. Least privilege (service-role only)
-- ---------------------------------------------------------------------------
alter table public.conversion_attribution_sessions enable row level security;
alter table public.conversion_attribution_links enable row level security;
alter table public.conversion_events enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access" on public.conversion_attribution_sessions';
  execute 'create policy "Service role full access" on public.conversion_attribution_sessions for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "Service role full access" on public.conversion_attribution_links';
  execute 'create policy "Service role full access" on public.conversion_attribution_links for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "Service role full access" on public.conversion_events';
  execute 'create policy "Service role full access" on public.conversion_events for all to service_role using (true) with check (true)';
end
$$;

revoke all privileges on table public.conversion_attribution_sessions from public, anon, authenticated;
revoke all privileges on table public.conversion_attribution_links from public, anon, authenticated;
revoke all privileges on table public.conversion_events from public, anon, authenticated;

-- The event ledger accepts INSERT and SELECT only: update/delete are refused by
-- the trigger above AND by privilege.
grant select, insert, update on table public.conversion_attribution_sessions to service_role;
grant select, insert on table public.conversion_attribution_links to service_role;
grant select, insert on table public.conversion_events to service_role;

-- ---------------------------------------------------------------------------
-- 5. Read-only chain-coverage proof surface
-- ---------------------------------------------------------------------------
create or replace view public.p10_conversion_chain_coverage
with (security_invoker = true)
as
with ledger as (
  select
    coalesce(nullif(btrim(cluster), ''), 'unclassified') as cluster,
    event_type,
    attribution_state,
    observation,
    consent_state,
    amount_cents
  from public.conversion_events
)
select
  cluster,
  count(*) filter (where event_type = 'landing')::bigint as landing_events,
  count(*) filter (where event_type = 'cta_click')::bigint as cta_click_events,
  count(*) filter (where event_type = 'lead_created')::bigint as lead_events,
  count(*) filter (where event_type = 'order_paid')::bigint as paid_events,
  count(*) filter (where event_type = 'order_refunded')::bigint as refund_events,
  count(*) filter (where event_type = 'order_cancelled')::bigint as cancelled_events,
  -- attributed_paid_events counts ONLY known-source paid events. A session-bound
  -- paid event whose source class is 'unknown' is session_only and can never
  -- inflate this number ("unknown conversion data remains unknown").
  count(*) filter (
    where event_type = 'order_paid'
      and attribution_state = 'attributed'
      and source_class is not null
      and source_class <> 'unknown'
  )::bigint as attributed_paid_events,
  count(*) filter (where event_type = 'order_paid' and attribution_state = 'session_only')::bigint as session_only_paid_events,
  count(*) filter (where event_type = 'order_paid' and attribution_state = 'unknown_source')::bigint as unknown_source_paid_events,
  coalesce(sum(amount_cents) filter (where event_type = 'order_paid'), 0)::bigint as paid_amount_cents,
  coalesce(sum(amount_cents) filter (where event_type = 'order_refunded'), 0)::bigint as refunded_amount_cents,
  count(*) filter (where observation = 'client_declared')::bigint as client_declared_events,
  count(*) filter (where observation = 'server_observed')::bigint as server_observed_events,
  count(*) filter (where consent_state = 'granted')::bigint as consent_granted_events,
  count(*) filter (where consent_state = 'unknown')::bigint as consent_unknown_events,
  case
    when count(*) filter (
      where event_type in ('lead_created', 'order_paid', 'order_refunded', 'order_cancelled')
    ) = 0 then 'no_observed_business_events'
    else 'observed_business_events_present'
  end as measurement_state
from ledger
group by cluster;

revoke all on table public.p10_conversion_chain_coverage from public, anon, authenticated;
grant select on table public.p10_conversion_chain_coverage to service_role;

-- ---------------------------------------------------------------------------
-- 6. Documentation at the boundary
-- ---------------------------------------------------------------------------
comment on table public.conversion_attribution_sessions is
  'P10 anonymous first-party attribution identity. Stores only a SHA-256 identity hash and capped source detail: no IP, user agent, email, profile id or Clerk id. A row may only exist for a visitor who granted analytics consent; a denied visitor has no row and therefore no smuggled analytics identifier.';
comment on column public.conversion_attribution_sessions.identity_hash is
  'SHA-256 of the opaque first-party token. The token itself is only ever in the visitor''s browser cookie; the table cannot replay an identity.';
comment on column public.conversion_attribution_sessions.revoked_at is
  'Consent withdrawal. The identity becomes unusable for new events (append-only history collected while consent was granted is retained, never deleted).';
comment on table public.conversion_attribution_links is
  'P10 cross-domain handoff edges. Signed, short-lived, single-use tokens LINK a child session to a parent session; identities are never merged or re-pointed and no raw handoff token is stored.';
comment on table public.conversion_events is
  'P10 append-only conversion event ledger. event_key is the deterministic idempotency boundary (duplicate webhook/order callback must not double-credit one order). Business events are server_observed and require a subject; browser events are client_declared and can never carry a business subject or an amount. consent_state records only consent that was actually evidenced: an unattributed business event is never stored as granted.';
comment on column public.conversion_events.consent_state is
  'Consent evidenced at event time. granted = bound to a consented session (attributed or session_only), or client_declared under one; unknown = no consent evidence observed and the truthful default for an unknown_source business event; denied = only with explicit named call-site evidence. granted/denied on an unknown_source business event require evidence.consent_evidence to name how consent was observed. Consent truth and source knowledge are independent.';
comment on column public.conversion_events.attribution_state is
  'attributed = a KNOWN acquisition source observed on a consented session (session_id not null and source_class not null/known); session_only = an active consented session exists, so continuity and consent are proven, but the acquisition source remains unknown; unknown_source = real business event with no traceable session at all (stored as unknown, never inferred). A session identity is never evidence of acquisition.';
comment on column public.conversion_events.source_class is
  'Source snapshot at event time; NULL exactly when attribution_state = ''unknown_source''; ''unknown'' exactly when attribution_state = ''session_only'' (consented session, unknown acquisition source).';
comment on column public.conversion_events.evidence is
  'Trusted-server evidence (gateway label, verification method, lifecycle reference). Must never contain personal identifiers or raw payment credentials.';
comment on view public.p10_conversion_chain_coverage is
  'P10 read-only chain coverage per strategic cluster. attributed_paid_events counts ONLY known-source paid events; session_only_paid_events counts consented-session paid events whose acquisition source is still unknown, and unknown_source_paid_events counts paid events with no traceable session. measurement_state = no_observed_business_events means nothing real has happened in that cluster yet; synthetic wiring tests never write here.';
