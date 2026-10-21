\set ON_ERROR_STOP on
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
\ir ../../supabase/migrations/20261001000000_studio_command_admission.sql

-- Production resolver is checked before any fixture resolver is installed.
DO $deny_first$
DECLARE v jsonb;
BEGIN
  v := studio_core.lock_current_command_authority(gen_random_uuid(),'iss','sub','PLAN','s','sealed:one','snap','ev');
  IF v <> '{"available": false, "reason": "AUTHORITY_BINDING_UNAVAILABLE"}'::jsonb THEN
    RAISE EXCEPTION 'production binding was not deny-only';
  END IF;
END $deny_first$;

CREATE SCHEMA studio_test;
GRANT USAGE ON SCHEMA studio_test TO studio_admission_owner;
CREATE TABLE studio_test.authority_fixture (
  project_id uuid NOT NULL, actor_issuer text NOT NULL, actor_subject text NOT NULL,
  action_kind text NOT NULL, subject_id text NOT NULL, input_ref text NOT NULL,
  snapshot_ref text NOT NULL, authorization_evidence_id text NOT NULL, decision_id text NOT NULL,
  owner_version text NOT NULL, policy_version text NOT NULL, authority_epoch bigint NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY(project_id,actor_issuer,actor_subject,action_kind,subject_id)
);
GRANT SELECT, UPDATE ON studio_test.authority_fixture TO studio_admission_owner;
CREATE OR REPLACE FUNCTION studio_core.lock_current_command_authority(
  p_project_id uuid,p_actor_issuer text,p_actor_subject text,p_action_kind text,p_subject_id text,
  p_input_ref text,p_snapshot_ref text,p_authorization_evidence_id text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,studio_test AS $fixture$
DECLARE a studio_test.authority_fixture%ROWTYPE; result jsonb; binding_allowed boolean;
BEGIN
  SELECT * INTO a FROM studio_test.authority_fixture WHERE project_id=p_project_id AND actor_issuer=p_actor_issuer
    AND actor_subject=p_actor_subject AND action_kind=p_action_kind AND subject_id=p_subject_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('available',false,'reason','AUTHORITY_BINDING_UNAVAILABLE'); END IF;
  binding_allowed := a.allowed AND a.input_ref=p_input_ref AND a.snapshot_ref=p_snapshot_ref AND a.authorization_evidence_id=p_authorization_evidence_id;
  result := jsonb_build_object('available',true,'allowed',binding_allowed,'projectId',a.project_id,'actorIssuer',a.actor_issuer,
    'actorSubject',a.actor_subject,'actionKind',a.action_kind,'subjectId',a.subject_id,'inputRef',a.input_ref,
    'snapshotRef',a.snapshot_ref,'authorizationEvidenceId',a.authorization_evidence_id,'ownerVersion',a.owner_version,
    'policyVersion',a.policy_version,'authorityEpoch',a.authority_epoch);
  IF p_snapshot_ref='fixture-extra-authority-field' THEN RETURN result || '{"decisionId":"untrusted-resolver-extension"}'::jsonb; END IF;
  IF p_snapshot_ref='fixture-missing-authority-field' THEN RETURN result - 'inputRef'; END IF;
  RETURN result;
END $fixture$;
ALTER FUNCTION studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text) OWNER TO studio_admission_owner;

INSERT INTO studio_test.authority_fixture VALUES
 ('00000000-0000-4000-8000-000000000001','issuer','actor','PLAN','subject','sealed:input','snapshot','evidence','decision','owner-1','policy-1',3,true);

DO $exact_authority_shape$
DECLARE result jsonb; expected text[] := ARRAY['available','allowed','projectId','actorIssuer','actorSubject','actionKind','subjectId','inputRef',
  'snapshotRef','authorizationEvidenceId','ownerVersion','policyVersion','authorityEpoch'];
BEGIN
  result := studio_core.lock_current_command_authority('00000000-0000-4000-8000-000000000001','issuer','actor','PLAN','subject','sealed:input','snapshot','evidence');
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(result) AS resolver_keys(key)) <>
       (SELECT array_agg(key ORDER BY key) FROM unnest(expected) AS expected_keys(key)) OR
     result ? 'decisionId' THEN RAISE EXCEPTION 'fixture resolver does not implement the exact frozen thirteen-field result'; END IF;
END $exact_authority_shape$;

-- Hash oracle fixtures include UTF-8 and multi-digit epochs. The Node harness compares these values.
SELECT studio_core.command_request_hash('{"actionKind":"PLAN","subjectId":"café","inputRef":"sealed:α","idempotencyKey":"golden","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":12}'::jsonb) AS unicode_hash;
SELECT studio_core.command_request_hash('{"expectedAuthorityEpoch":3,"expectedPolicyVersion":"p","expectedOwnerVersion":"o","idempotencyKey":"k","inputRef":"i","subjectId":"s","actionKind":"INGEST"}'::jsonb) AS reordered_hash;

-- A tampered digest must be rejected before a durable authority decision or any insert.
CREATE TEMP TABLE tampered_result AS SELECT studio_core.admit_run(
 '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"tampered","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb,
 '{"projectId":"00000000-0000-4000-8000-000000000001","actor":{"issuer":"issuer","subject":"actor","authorizationEvidenceId":"evidence"},"decisionId":"decision","policyVersion":"policy-1","ownerVersion":"owner-1","authorityEpoch":3,"snapshotRef":"snapshot"}'::jsonb,
 repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) AS result;
DO $tampered$
BEGIN
  IF (SELECT result->>'reason' FROM tampered_result) <> 'REQUEST_HASH_MISMATCH' THEN RAISE EXCEPTION 'digest tamper accepted'; END IF;
  IF EXISTS (SELECT 1 FROM studio_core.studio_runs) OR EXISTS (SELECT 1 FROM studio_core.studio_run_stages) OR
     EXISTS (SELECT 1 FROM studio_core.studio_outbox) OR EXISTS (SELECT 1 FROM studio_core.studio_run_events) OR
     EXISTS (SELECT 1 FROM studio_core.studio_run_admissions) THEN RAISE EXCEPTION 'tampered hash inserted rows'; END IF;
END $tampered$;
CREATE TEMP TABLE changed_with_stale_hash AS SELECT studio_core.admit_run(
 '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:other-input","idempotencyKey":"stale-hash","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb,
 '{"projectId":"00000000-0000-4000-8000-000000000001","actor":{"issuer":"issuer","subject":"actor","authorizationEvidenceId":"evidence"},"decisionId":"decision","policyVersion":"policy-1","ownerVersion":"owner-1","authorityEpoch":3,"snapshotRef":"snapshot"}'::jsonb,
 studio_core.command_request_hash('{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"stale-hash","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb),
 gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) AS result;
DO $stale_hash$
BEGIN
  IF (SELECT result->>'reason' FROM changed_with_stale_hash) <> 'REQUEST_HASH_MISMATCH' THEN RAISE EXCEPTION 'changed command reused a stale digest'; END IF;
  IF EXISTS (SELECT 1 FROM studio_core.studio_runs) OR EXISTS (SELECT 1 FROM studio_core.studio_run_stages) OR
     EXISTS (SELECT 1 FROM studio_core.studio_outbox) OR EXISTS (SELECT 1 FROM studio_core.studio_run_events) OR
     EXISTS (SELECT 1 FROM studio_core.studio_run_admissions) THEN RAISE EXCEPTION 'stale digest inserted rows'; END IF;
END $stale_hash$;
CREATE TEMP TABLE malformed_command AS SELECT studio_core.admit_run(
 '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"bad","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3,"actor":{"subject":"forged"}}'::jsonb,
 '{}'::jsonb,repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) AS result;
DO $invalid_command$
BEGIN
  IF (SELECT result->>'reason' FROM malformed_command) <> 'INVALID_COMMAND' THEN RAISE EXCEPTION 'unknown command fields were accepted'; END IF;
  IF EXISTS (SELECT 1 FROM studio_core.studio_runs) OR EXISTS (SELECT 1 FROM studio_core.studio_run_stages) OR
     EXISTS (SELECT 1 FROM studio_core.studio_outbox) OR EXISTS (SELECT 1 FROM studio_core.studio_run_events) OR
     EXISTS (SELECT 1 FROM studio_core.studio_run_admissions) THEN RAISE EXCEPTION 'invalid command inserted rows'; END IF;
END $invalid_command$;

-- The SQL decoder rejects malformed numeric types/ranges and ECMAScript-invalid strings before hashing.
DO $malformed_command_values$
DECLARE base jsonb := '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"invalid-probe","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb;
  bad_epoch jsonb; bad_subject text; result jsonb;
BEGIN
  FOREACH bad_epoch IN ARRAY ARRAY['"3"'::jsonb,'null'::jsonb,'true'::jsonb,'3.5'::jsonb,'-1'::jsonb,'9007199254740992'::jsonb] LOOP
    BEGIN PERFORM studio_core.command_request_hash(base || jsonb_build_object('expectedAuthorityEpoch',bad_epoch));
      RAISE EXCEPTION 'malformed epoch was accepted: %',bad_epoch;
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
    result := studio_core.admit_run(base || jsonb_build_object('expectedAuthorityEpoch',bad_epoch),'{}'::jsonb,repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
    IF result->>'reason' <> 'INVALID_COMMAND' THEN RAISE EXCEPTION 'malformed epoch did not return INVALID_COMMAND: %',bad_epoch; END IF;
  END LOOP;
  FOREACH bad_subject IN ARRAY ARRAY[chr(160),chr(8195),chr(11)||'subject',chr(127)||'subject',chr(133)||'subject'] LOOP
    BEGIN PERFORM studio_core.command_request_hash(base || jsonb_build_object('subjectId',bad_subject));
      RAISE EXCEPTION 'invalid whitespace/control subject was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
    result := studio_core.admit_run(base || jsonb_build_object('subjectId',bad_subject),'{}'::jsonb,repeat('0',64),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
    IF result->>'reason' <> 'INVALID_COMMAND' THEN RAISE EXCEPTION 'invalid Unicode whitespace/control did not return INVALID_COMMAND'; END IF;
  END LOOP;
  BEGIN PERFORM studio_core.command_request_hash(base || jsonb_build_object('idempotencyKey',chr(8239)));
    RAISE EXCEPTION 'Unicode-whitespace-only idempotency key was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN PERFORM studio_core.command_request_hash(base - 'expectedPolicyVersion');
    RAISE EXCEPTION 'missing command field was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $malformed_command_values$;
DO $invalid_commands_no_writes$
BEGIN
  IF EXISTS (SELECT 1 FROM studio_core.studio_runs) OR EXISTS (SELECT 1 FROM studio_core.studio_run_stages) OR
     EXISTS (SELECT 1 FROM studio_core.studio_outbox) OR EXISTS (SELECT 1 FROM studio_core.studio_run_events) OR
     EXISTS (SELECT 1 FROM studio_core.studio_run_admissions) THEN RAISE EXCEPTION 'invalid-command probes wrote admission relations'; END IF;
END $invalid_commands_no_writes$;

-- Privilege matrix: every application role is denied direct table DML; only service_role has RPC EXECUTE.
DO $privileges$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY['studio_runs','studio_run_stages','studio_outbox','studio_run_events','studio_run_admissions'] LOOP
    FOREACH p IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(p,'studio_core.'||t,'SELECT') OR has_table_privilege(p,'studio_core.'||t,'INSERT') OR
         has_table_privilege(p,'studio_core.'||t,'UPDATE') OR has_table_privilege(p,'studio_core.'||t,'DELETE') THEN
        RAISE EXCEPTION 'table grant found for %.%',p,t;
      END IF;
    END LOOP;
    IF has_table_privilege('service_role','studio_core.'||t,'SELECT') OR has_table_privilege('service_role','studio_core.'||t,'INSERT') OR
       has_table_privilege('service_role','studio_core.'||t,'UPDATE') OR has_table_privilege('service_role','studio_core.'||t,'DELETE') THEN
      RAISE EXCEPTION 'raw service DML grant found for %',t;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid)','EXECUTE') OR
     has_function_privilege('authenticated','studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid)','EXECUTE') OR
     has_function_privilege('anon','studio_core.command_request_hash(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','studio_core.command_request_hash(jsonb)','EXECUTE') OR
     has_function_privilege('anon','studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text)','EXECUTE') OR
     has_function_privilege('authenticated','studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text)','EXECUTE') OR
     NOT has_function_privilege('service_role','studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid)','EXECUTE') OR
     has_function_privilege('service_role','studio_core.command_request_hash(jsonb)','EXECUTE') OR
     has_function_privilege('service_role','studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC execute grants are incorrect';
  END IF;
  IF has_schema_privilege('anon','studio_core','USAGE') OR has_schema_privilege('authenticated','studio_core','USAGE') OR
     has_schema_privilege('service_role','studio_core','CREATE') THEN RAISE EXCEPTION 'schema usage/create grants are incorrect'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='studio_core' AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'RLS is not enabled on every private table'; END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='studio_admission_owner') AND
      (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role'))) THEN
    RAISE EXCEPTION 'unsafe default PUBLIC/service_role privileges remain';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace,
    LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a
    WHERE n.nspname='studio_core' AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC retains EXECUTE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='studio_core' AND
    (has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') OR
      (has_function_privilege('service_role',f.oid,'EXECUTE') AND f.proname <> 'admit_run'))) THEN
    RAISE EXCEPTION 'function execution grant exceeds the exact service RPC';
  END IF;
END $privileges$;

-- Fixture-only RPC success proves typed call path and all-five atomic row shape.
SELECT studio_core.admit_run(
 '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"accepted","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb,
 '{"projectId":"00000000-0000-4000-8000-000000000001","actor":{"issuer":"issuer","subject":"actor","authorizationEvidenceId":"evidence"},"decisionId":"decision","policyVersion":"policy-1","ownerVersion":"owner-1","authorityEpoch":3,"snapshotRef":"snapshot"}'::jsonb,
 studio_core.command_request_hash('{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"accepted","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb),
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
DO $rowcounts$
BEGIN
  IF (SELECT count(*) FROM studio_core.studio_runs) <> 1 OR (SELECT count(*) FROM studio_core.studio_run_stages) <> 1 OR
     (SELECT count(*) FROM studio_core.studio_outbox) <> 1 OR (SELECT count(*) FROM studio_core.studio_run_events) <> 1 OR
     (SELECT count(*) FROM studio_core.studio_run_admissions) <> 1 THEN RAISE EXCEPTION 'admission was not all-five atomic'; END IF;
END $rowcounts$;
SET ROLE service_role;
\echo SERVICE_RPC_RECEIPT_BEGIN
SELECT studio_core.admit_run(
 '{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"service-rpc","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb,
 '{"projectId":"00000000-0000-4000-8000-000000000001","actor":{"issuer":"issuer","subject":"actor","authorizationEvidenceId":"evidence"},"decisionId":"decision","policyVersion":"policy-1","ownerVersion":"owner-1","authorityEpoch":3,"snapshotRef":"snapshot"}'::jsonb,
 'c05d74b4e97d3cd1e80e7fc857f15dca55b53567a200382e1d4109976dbd515e',
 '10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
\echo SERVICE_RPC_RECEIPT_END
RESET ROLE;
SELECT set_config('search_path','pg_temp,public',false);
SELECT studio_core.command_request_hash('{"actionKind":"PLAN","subjectId":"subject","inputRef":"sealed:input","idempotencyKey":"accepted","expectedOwnerVersion":"owner-1","expectedPolicyVersion":"policy-1","expectedAuthorityEpoch":3}'::jsonb);
