\set ON_ERROR_STOP on

-- Run only against the disposable local yqaa_test database. The transaction is
-- rolled back so this proves migration shape/idempotency without retaining DDL.
begin;
\ir ../../supabase/migrations/20261013150000_yqaa_provider_controls.sql
\ir ../../supabase/migrations/20261013150000_yqaa_provider_controls.sql

do $test$
declare
  missing integer;
  rls_enabled boolean;
  service_execute boolean;
  authenticated_execute boolean;
  invalidation_authenticated_execute boolean;
  consumption_trigger_before_insert boolean;
  consumption_function text;
begin
  select count(*) into missing
    from (values
      ('provider_pricing_preferences','negotiation_enabled'),
      ('provider_pricing_preferences','auto_accept_pct'),
      ('provider_pricing_preferences','flex_pct'),
      ('provider_pricing_preferences','approval_band_pct'),
      ('provider_pricing_preferences','max_auto_concessions'),
      ('provider_pricing_preferences','prefer_accept'),
      ('yqaa_pricing_approvals','conversation_id'),
      ('yqaa_pricing_approvals','request_id'),
      ('yqaa_pricing_approvals','version'),
      ('yqaa_pricing_approvals','provider_id'),
      ('yqaa_pricing_approvals','price_cents'),
      ('yqaa_pricing_approvals','scope_hash'),
      ('yqaa_pricing_approvals','status'),
      ('yqaa_pricing_approvals','consumed_at')
    ) expected(table_name, column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = expected.table_name
        and c.column_name = expected.column_name
   );
  if missing <> 0 then raise exception 'YQAA provider controls migration missing % required columns', missing; end if;

  select c.relrowsecurity into rls_enabled from pg_class c
   where c.oid = 'public.yqaa_pricing_approvals'::regclass;
  if rls_enabled is distinct from true then raise exception 'approval records must have RLS enabled'; end if;

  select has_function_privilege('service_role', 'public.resolve_yqaa_pricing_approval(uuid,uuid,integer,uuid,text)', 'EXECUTE')
    into service_execute;
  select has_function_privilege('authenticated', 'public.resolve_yqaa_pricing_approval(uuid,uuid,integer,uuid,text)', 'EXECUTE')
    into authenticated_execute;
  select has_function_privilege('authenticated', 'public.invalidate_yqaa_pricing_approval(uuid,uuid,integer)', 'EXECUTE')
    into invalidation_authenticated_execute;
  if service_execute is distinct from true or authenticated_execute is distinct from false
     or invalidation_authenticated_execute is distinct from false then
    raise exception 'approval mutation RPCs must be executable by service_role only';
  end if;

  select (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4
    into consumption_trigger_before_insert
    from pg_trigger t
   where t.tgrelid = 'public.offers'::regclass
     and t.tgname = 'offers_consume_yqaa_pricing_approval'
     and not t.tgisinternal;
  select pg_get_functiondef('public.consume_yqaa_pricing_approval_for_offer()'::regprocedure)
    into consumption_function;
  if consumption_trigger_before_insert is distinct from true
     or position('does not match the approved quote' in consumption_function) = 0
     or position('consumed_at is not null then return new' in consumption_function) = 0 then
    raise exception 'offer insert must atomically consume only a matching, unused approval';
  end if;
end
$test$;

rollback;
