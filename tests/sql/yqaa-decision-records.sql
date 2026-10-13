-- Run against a disposable local Supabase/PostgreSQL database after applying
-- 20261013190000_yqaa_decision_records.sql. Roll back the synthetic row.
begin;

do $$
declare
  v_rel oid := 'public.yqaa_decision_records'::regclass;
  v_row_security boolean;
  v_force_row_security boolean;
begin
  select relrowsecurity, relforcerowsecurity
    into v_row_security, v_force_row_security
    from pg_class where oid = v_rel;
  if not v_row_security or not v_force_row_security then
    raise exception 'YQAA decision records must enable and force RLS';
  end if;
  if has_table_privilege('anon', v_rel, 'SELECT') or has_table_privilege('anon', v_rel, 'INSERT')
     or has_table_privilege('authenticated', v_rel, 'SELECT')
     or has_table_privilege('authenticated', v_rel, 'INSERT') then
    raise exception 'YQAA decision records exposed to client roles';
  end if;
  if not has_table_privilege('service_role', v_rel, 'INSERT') then
    raise exception 'service_role must be able to insert YQAA decision records';
  end if;
end;
$$;

insert into public.yqaa_decision_records (
  record_version, policy_version, rubric_version, channel, interaction_hash,
  provider_hash, category_hash, posture, escalated, reason_codes, evidence_ids, shadow_rubric
) values (
  1, 'test-policy-v1', 'test-rubric-v1', 'public', repeat('a', 64), null, null,
  'ABSTAIN', false, array['insufficient_evidence'], array['kb:test:1'], 'test-shadow-v1'
);

do $$
begin
  if not exists (select 1 from public.yqaa_decision_records where interaction_hash = repeat('a', 64)) then
    raise exception 'YQAA decision record insert/read round trip failed';
  end if;
end;
$$;

rollback;
