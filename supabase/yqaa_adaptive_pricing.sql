-- ============================================================================
-- YQAA Adaptive Pricing / Negotiation (Phase 1) — ADDITIVE + IDEMPOTENT
--
-- NOT a migration. This file lives at supabase/ (top level) on purpose and is
-- NEVER applied automatically. Do not run it anywhere until Sharon signs off.
--
-- The application code works when this file has NOT been applied:
--   * every column below is nullable / has a safe default ("null = inherit"),
--   * `lib/yqaaAdaptivePricing.ts` falls back from the full projection to a base
--     projection when a column or table is missing,
--   * `provider_pricing_preferences` and the `negotiation_default_*` platform
--     settings keys are optional; code constants cover their absence.
--
-- Scope: system-wide (every provider, gig, category). No backfill is required
-- and no existing row changes meaning.
-- ============================================================================

-- ─── 1. Per gig (PRICING-ADAPTIVE §4 + §7.10) ───────────────────────────────

alter table public.gigs add column if not exists negotiation_enabled boolean;
comment on column public.gigs.negotiation_enabled is
  'null = inherit from provider/platform. false = no automatic price moves (hold/downscope/escalate only).';

alter table public.gigs add column if not exists negotiation_flex_pct numeric(5,2);
comment on column public.gigs.negotiation_flex_pct is
  'null = inherit. Fraction or whole percent (10 or 0.10 both mean 10%). Widest automatic concession.';

alter table public.gigs add column if not exists min_floor_cents integer;
comment on column public.gigs.min_floor_cents is
  'null = derived as max(platform minimum, ceil(cheapest active tier x (1 - flex))). Absolute floor for this gig.';

alter table public.gigs add column if not exists unit_pricing jsonb;
comment on column public.gigs.unit_pricing is
  'null = not unit priced. Shape: {unit, unit_price_cents, included_units, min_units, base_cents}.';

alter table public.gigs add column if not exists hourly_rate_cents integer;
comment on column public.gigs.hourly_rate_cents is
  'null = inherit provider preference, then implied rate from this gig''s packages, then platform default. Internal only, never rendered to clients.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gigs_min_floor_cents_check'
  ) then
    alter table public.gigs
      add constraint gigs_min_floor_cents_check
      check (min_floor_cents is null or min_floor_cents >= 100);
  end if;
end $$;

-- ─── 2. Per tier: declared scope so a tier can be matched without guessing ───

alter table public.gig_tiers add column if not exists scope_depth text;
comment on column public.gig_tiers.scope_depth is
  'null = inferred from tier/title/description/features. One of consult|review|partial|full.';

alter table public.gig_tiers add column if not exists scope_units integer;
comment on column public.gig_tiers.scope_units is
  'null = inferred. Units included in the tier (pages/words/forms/documents) for pro-rata scoping.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gig_tiers_scope_depth_check') then
    alter table public.gig_tiers
      add constraint gig_tiers_scope_depth_check
      check (scope_depth is null or scope_depth in ('consult','review','partial','full'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gig_tiers_scope_units_check') then
    alter table public.gig_tiers
      add constraint gig_tiers_scope_units_check
      check (scope_units is null or scope_units > 0);
  end if;
end $$;

-- ─── 3. Per provider preferences (§4). RLS: the provider owns its own row. ───

create table if not exists public.provider_pricing_preferences (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  negotiation_enabled boolean not null default true,
  auto_accept_pct numeric(5,2),
  flex_pct numeric(5,2),
  approval_band_pct numeric(5,2),
  max_auto_concessions integer,
  prefer_accept boolean not null default false,
  hourly_rate_cents integer,
  min_effective_rate_cents integer,
  min_floor_cents integer,
  updated_at timestamptz not null default now()
);

comment on table public.provider_pricing_preferences is
  'Optional provider-level overrides. null column = platform default from code constants / negotiation_default_* settings.';

alter table public.provider_pricing_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'provider_pricing_preferences'
      and policyname = 'provider_pricing_preferences_own_row'
  ) then
    create policy provider_pricing_preferences_own_row
      on public.provider_pricing_preferences
      for all
      using (auth.uid() = provider_id)
      with check (auth.uid() = provider_id);
  end if;
end $$;

-- Service role (server-side pricing) reads every row; it bypasses RLS by design.

-- ─── 4. Optional guards on provider overrides (idempotent) ──────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'provider_pricing_preferences_ranges_check') then
    alter table public.provider_pricing_preferences
      add constraint provider_pricing_preferences_ranges_check
      check (
        (auto_accept_pct is null or (auto_accept_pct >= 0 and auto_accept_pct <= 100)) and
        (flex_pct is null or (flex_pct >= 0 and flex_pct <= 100)) and
        (approval_band_pct is null or (approval_band_pct >= 0 and approval_band_pct <= 100)) and
        (max_auto_concessions is null or max_auto_concessions >= 0) and
        (hourly_rate_cents is null or hourly_rate_cents > 0) and
        (min_effective_rate_cents is null or min_effective_rate_cents > 0) and
        (min_floor_cents is null or min_floor_cents >= 100)
      );
  end if;
end $$;

-- ─── 5. Platform-wide negotiation defaults (optional; code constants exist) ─
-- getPaymentSettingsForApi() merges these into the existing platform settings
-- row, so admins can tune bands without a deploy. Absent keys -> code constants.
--
--   negotiation_default_enabled               boolean  (true)
--   negotiation_default_auto_accept_pct       numeric  (10)
--   negotiation_default_flex_pct              numeric  (15)
--   negotiation_default_approval_band_pct     numeric  (35)
--   negotiation_default_max_auto_concessions  integer  (2)
--   negotiation_default_haggle_escalate_after integer  (3)
--   negotiation_default_round_to_cents        integer  (500)
--   negotiation_consult_min_cents             integer  (null = unset)
--
-- Example (commented out on purpose — do not apply):
-- update platform_settings
--    set value = value || jsonb_build_object(
--          'negotiation_default_flex_pct', 15,
--          'negotiation_default_approval_band_pct', 35
--        )
--  where key = 'default';

-- ─── 6. Approval state lives in conversations.metadata (Phase 1) ────────────
-- Written by the application, not by this file:
--   conversations.metadata.ai_pricing_approval_pending       boolean
--   conversations.metadata.ai_pricing_approval_requested_at  timestamptz (ISO string)
--   conversations.metadata.ai_last_approved_price_cents      integer
-- A dedicated approvals table is Phase 2.

-- ─── 7. Read-only verification helpers (no data change) ─────────────────────
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('gigs','gig_tiers','provider_pricing_preferences')
--    and column_name in ('negotiation_enabled','negotiation_flex_pct','min_floor_cents',
--                        'unit_pricing','hourly_rate_cents','scope_depth','scope_units')
--  order by table_name, column_name;
