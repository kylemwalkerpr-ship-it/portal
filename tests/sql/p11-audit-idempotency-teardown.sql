-- DISPOSABLE VALIDATION ONLY. Remove only objects created/altered by this harness.
-- The explicit command linkage rollback documents the #289 delta. The fixture
-- tables are then discarded because this database is disposable.
\set ON_ERROR_STOP on
drop table if exists public.seo_llm_audit_provider_claims cascade;
drop table if exists public.seo_llm_audit_commands cascade;
drop function if exists public.p11_test_delay_command_insert();
drop index if exists public.uq_seo_llm_visibility_command_ordinal;
alter table if exists public.seo_llm_visibility
  drop constraint if exists seo_llm_visibility_command_ordinal_pair_check;
alter table if exists public.seo_llm_visibility
  drop column if exists command_id,
  drop column if exists query_ordinal;
drop table if exists public.seo_llm_visibility cascade;
drop table if exists public.profiles cascade;
drop function if exists public.p11_test_block_completion();

-- The fixture grants USAGE on public; remove those ACL dependencies before
-- dropping the three disposable roles so the workflow's next SQL step can
-- create them cleanly. This remains safe when bootstrap stopped partway through.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all privileges on schema public from %I', role_name);
    end if;
  end loop;
end
$$;

drop role if exists anon;
drop role if exists authenticated;
drop role if exists service_role;
