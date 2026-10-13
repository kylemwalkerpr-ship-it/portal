\set ON_ERROR_STOP on

begin;
\ir ../../supabase/migrations/20261013180000_yqaa_gig_scope_editor.sql
\ir ../../supabase/migrations/20261013180000_yqaa_gig_scope_editor.sql

do $test$
declare
  missing integer;
  gig_trigger boolean;
  tier_trigger boolean;
begin
  select count(*) into missing
    from (values
      ('gigs','unit_pricing'),
      ('gigs','hourly_rate_cents'),
      ('gig_tiers','scope_depth'),
      ('gig_tiers','scope_units')
    ) expected(table_name,column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=expected.table_name
        and c.column_name=expected.column_name
   );
  if missing <> 0 then raise exception 'gig scope migration is missing % columns', missing; end if;

  select exists (select 1 from pg_constraint where conrelid='public.gigs'::regclass and conname='gigs_unit_pricing_check')
    and exists (select 1 from pg_constraint where conrelid='public.gigs'::regclass and conname='gigs_hourly_rate_cents_check')
    and exists (select 1 from pg_constraint where conrelid='public.gig_tiers'::regclass and conname='gig_tiers_scope_depth_check')
    and exists (select 1 from pg_constraint where conrelid='public.gig_tiers'::regclass and conname='gig_tiers_scope_units_check')
    into gig_trigger;
  if gig_trigger is distinct from true then raise exception 'gig scope constraints are missing'; end if;

  select exists (select 1 from pg_trigger where tgrelid='public.gigs'::regclass and tgname='gigs_invalidate_yqaa_approvals_on_scope_change' and not tgisinternal)
    into gig_trigger;
  select exists (select 1 from pg_trigger where tgrelid='public.gig_tiers'::regclass and tgname='gig_tiers_invalidate_yqaa_approvals_on_scope_change' and not tgisinternal)
    into tier_trigger;
  if not gig_trigger or not tier_trigger then raise exception 'scope pricing approval invalidation triggers are missing'; end if;
  if has_function_privilege('authenticated','public.invalidate_yqaa_pricing_approvals_on_gig_scope_change()','EXECUTE')
     or has_function_privilege('authenticated','public.invalidate_yqaa_pricing_approvals_on_tier_scope_change()','EXECUTE') then
    raise exception 'approval invalidation trigger functions must not be directly executable by authenticated';
  end if;
end
$test$;

rollback;
