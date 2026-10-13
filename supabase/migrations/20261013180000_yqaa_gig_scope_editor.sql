-- Provider-authored unit pricing and per-tier scope for YQAA. Additive only.

alter table public.gigs
  add column if not exists unit_pricing jsonb,
  add column if not exists hourly_rate_cents integer;

alter table public.gig_tiers
  add column if not exists scope_depth text,
  add column if not exists scope_units integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gigs'::regclass and conname = 'gigs_unit_pricing_check'
  ) then
    alter table public.gigs add constraint gigs_unit_pricing_check check (
      unit_pricing is null or (
        jsonb_typeof(unit_pricing) = 'object'
        and unit_pricing ? 'unit'
        and unit_pricing ? 'unit_price_cents'
        and unit_pricing->>'unit' in ('page','word','document','form','hour','session')
        and coalesce(unit_pricing->>'unit_price_cents', '') ~ '^[0-9]+$'
        and (unit_pricing->>'unit_price_cents')::numeric > 0
        and (unit_pricing - array['unit','unit_price_cents','included_units','min_units','base_cents']::text[]) = '{}'::jsonb
        and (not (unit_pricing ? 'included_units') or unit_pricing->'included_units' = 'null'::jsonb
          or (unit_pricing->>'included_units' ~ '^[0-9]+$'))
        and (not (unit_pricing ? 'min_units') or unit_pricing->'min_units' = 'null'::jsonb
          or (unit_pricing->>'min_units' ~ '^[0-9]+$'))
        and (not (unit_pricing ? 'base_cents') or unit_pricing->'base_cents' = 'null'::jsonb
          or (unit_pricing->>'base_cents' ~ '^[0-9]+$'))
      )
    );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gigs'::regclass and conname = 'gigs_hourly_rate_cents_check'
  ) then
    alter table public.gigs add constraint gigs_hourly_rate_cents_check
      check (hourly_rate_cents is null or hourly_rate_cents > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gig_tiers'::regclass and conname = 'gig_tiers_scope_depth_check'
  ) then
    alter table public.gig_tiers add constraint gig_tiers_scope_depth_check
      check (scope_depth is null or scope_depth in ('consult','review','partial','full'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gig_tiers'::regclass and conname = 'gig_tiers_scope_units_check'
  ) then
    alter table public.gig_tiers add constraint gig_tiers_scope_units_check
      check (scope_units is null or scope_units > 0);
  end if;
end;
$$;

comment on column public.gigs.unit_pricing is
  'Provider-authored optional unit pricing; null inherits adaptive pricing defaults.';
comment on column public.gigs.hourly_rate_cents is
  'Provider-only internal workload rate in cents; never expose to clients.';
comment on column public.gig_tiers.scope_depth is
  'Optional provider-authored scope depth; null infers from the existing tier.';
comment on column public.gig_tiers.scope_units is
  'Optional positive whole unit count; null infers from existing tier copy.';

create or replace function public.invalidate_yqaa_pricing_approvals_on_gig_scope_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_pricing is distinct from old.unit_pricing
     or new.hourly_rate_cents is distinct from old.hourly_rate_cents
     or new.category is distinct from old.category
     or new.subcategory is distinct from old.subcategory then
    update public.yqaa_pricing_approvals
       set status = 'invalidated', resolved_at = clock_timestamp()
     where gig_id = new.id and status in ('pending','approved');
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_yqaa_pricing_approvals_on_gig_scope_change() from public, anon, authenticated;
drop trigger if exists gigs_invalidate_yqaa_approvals_on_scope_change on public.gigs;
create trigger gigs_invalidate_yqaa_approvals_on_scope_change
  after update of unit_pricing, hourly_rate_cents, category, subcategory on public.gigs
  for each row execute function public.invalidate_yqaa_pricing_approvals_on_gig_scope_change();

create or replace function public.invalidate_yqaa_pricing_approvals_on_tier_scope_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gig_id uuid;
  v_changed boolean;
begin
  if tg_op = 'DELETE' then
    v_gig_id := old.gig_id;
    v_changed := true;
  else
    v_gig_id := new.gig_id;
    v_changed := new.price is distinct from old.price
      or new.is_active is distinct from old.is_active
      or new.scope_depth is distinct from old.scope_depth
      or new.scope_units is distinct from old.scope_units
      or new.tier is distinct from old.tier
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.features is distinct from old.features;
  end if;
  if v_changed then
    update public.yqaa_pricing_approvals
       set status = 'invalidated', resolved_at = clock_timestamp()
     where gig_id = v_gig_id and status in ('pending','approved');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.invalidate_yqaa_pricing_approvals_on_tier_scope_change() from public, anon, authenticated;
drop trigger if exists gig_tiers_invalidate_yqaa_approvals_on_scope_change on public.gig_tiers;
create trigger gig_tiers_invalidate_yqaa_approvals_on_scope_change
  after update of tier, price, is_active, scope_depth, scope_units, title, description, features or delete on public.gig_tiers
  for each row execute function public.invalidate_yqaa_pricing_approvals_on_tier_scope_change();
