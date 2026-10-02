-- Inactive command admission packet. The production authority binding below is deny-only.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'studio_admission_owner') THEN
    CREATE ROLE studio_admission_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS studio_core AUTHORIZATION studio_admission_owner;
REVOKE ALL ON SCHEMA studio_core FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA studio_core TO service_role;
REVOKE CREATE ON SCHEMA studio_core FROM service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_admission_owner REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_admission_owner REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_admission_owner IN SCHEMA studio_core REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_admission_owner IN SCHEMA studio_core REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA studio_core;
DO $pgcrypto$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='pgcrypto' AND e.extversion IS NOT NULL AND n.nspname='studio_core'
  ) THEN RAISE EXCEPTION 'pgcrypto SHA-256 implementation is unavailable in the private studio_core schema'; END IF;
END
$pgcrypto$;
GRANT EXECUTE ON FUNCTION studio_core.digest(bytea, text) TO studio_admission_owner;

CREATE TABLE studio_core.studio_runs (
  project_id uuid NOT NULL,
  run_id uuid NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'studio.run-envelope/1'),
  action_kind text NOT NULL CHECK (action_kind IN ('INGEST','PLAN','GSC_SYNC','GSC_SCORE','LLM_AUDIT','RESEARCH','BRIEF','GENERATE','REAUDIT','SITE_HEALTH_AUDIT','SITE_HEALTH_REPAIR','VERIFY_URL','INTERLINK_SWEEP','PUBLISH')),
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  authorization_evidence_id text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  authority_epoch bigint NOT NULL CHECK (authority_epoch BETWEEN 0 AND 9007199254740991),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','CANCEL_REQUESTED','CANCELLED','RETRY_WAIT','SUCCEEDED','FAILED','BLOCKED','SUPERSEDED')),
  content_job_id uuid,
  seo_engine_run_id uuid,
  cancel_requested_at timestamptz,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  last_event_sequence bigint NOT NULL CHECK (last_event_sequence BETWEEN 1 AND 9007199254740991),
  input_ref text NOT NULL,
  result_ref text,
  error_class text,
  PRIMARY KEY (project_id, run_id),
  UNIQUE (project_id, actor_issuer, actor_subject, idempotency_key)
);

CREATE TABLE studio_core.studio_run_stages (
  project_id uuid NOT NULL, run_id uuid NOT NULL, stage_id uuid NOT NULL, stage_name text NOT NULL,
  attempt_count bigint NOT NULL CHECK (attempt_count BETWEEN 0 AND 9007199254740991),
  current_fence bigint NOT NULL CHECK (current_fence BETWEEN 0 AND 9007199254740991),
  lease_owner text, lease_expires_at timestamptz, input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  checkpoint_ref text, output_artifact_ref text,
  state text NOT NULL CHECK (state IN ('pending','claimed','running','checkpointed','done','failed','cancelled')),
  row_version bigint NOT NULL CHECK (row_version BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (project_id, stage_id), UNIQUE (project_id, run_id, stage_id),
  UNIQUE (project_id, run_id, stage_name, input_hash),
  FOREIGN KEY (project_id, run_id) REFERENCES studio_core.studio_runs(project_id, run_id),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE studio_core.studio_outbox (
  project_id uuid NOT NULL, run_id uuid NOT NULL, event_id uuid NOT NULL, stage_id uuid,
  event_type text NOT NULL, sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  payload_ref text NOT NULL, idempotency_key text NOT NULL,
  delivery_state text NOT NULL CHECK (delivery_state IN ('pending','claimed','delivered','dead')),
  producer_version text NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, event_id), UNIQUE (project_id, run_id, sequence),
  FOREIGN KEY (project_id, run_id) REFERENCES studio_core.studio_runs(project_id, run_id),
  FOREIGN KEY (project_id, run_id, stage_id) REFERENCES studio_core.studio_run_stages(project_id, run_id, stage_id)
);

CREATE TABLE studio_core.studio_run_events (
  project_id uuid NOT NULL, run_id uuid NOT NULL, sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  schema_version text NOT NULL CHECK (schema_version = 'studio.run-event/1'), stage_id uuid,
  attempt_id uuid, fence bigint CHECK (fence BETWEEN 0 AND 9007199254740991), created_at timestamptz NOT NULL,
  phase text NOT NULL, message_code text NOT NULL, detail_ref text,
  progress_completed bigint CHECK (progress_completed BETWEEN 0 AND 9007199254740991),
  progress_total bigint CHECK (progress_total BETWEEN 0 AND 9007199254740991), progress_unit text,
  PRIMARY KEY (project_id, run_id, sequence),
  FOREIGN KEY (project_id, run_id) REFERENCES studio_core.studio_runs(project_id, run_id),
  FOREIGN KEY (project_id, run_id, stage_id) REFERENCES studio_core.studio_run_stages(project_id, run_id, stage_id),
  CHECK (stage_id IS NOT NULL OR (attempt_id IS NULL AND fence IS NULL)),
  CHECK ((progress_completed IS NULL AND progress_total IS NULL AND progress_unit IS NULL) OR
    (progress_completed IS NOT NULL AND progress_unit IS NOT NULL AND progress_unit <> '' AND
      (progress_total IS NULL OR progress_total >= progress_completed)))
);

CREATE TABLE studio_core.studio_run_admissions (
  project_id uuid NOT NULL, run_id uuid NOT NULL, subject_id text NOT NULL, decision_id text NOT NULL,
  authorization_evidence_id text NOT NULL, expected_owner_version text NOT NULL,
  expected_policy_version text NOT NULL, authority_epoch bigint NOT NULL CHECK (authority_epoch BETWEEN 0 AND 9007199254740991),
  snapshot_ref text NOT NULL, command_json jsonb NOT NULL, admitted_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, run_id),
  FOREIGN KEY (project_id, run_id) REFERENCES studio_core.studio_runs(project_id, run_id)
);

ALTER TABLE studio_core.studio_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_core.studio_run_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_core.studio_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_core.studio_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_core.studio_run_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA studio_core FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE studio_core.studio_runs OWNER TO studio_admission_owner;
ALTER TABLE studio_core.studio_run_stages OWNER TO studio_admission_owner;
ALTER TABLE studio_core.studio_outbox OWNER TO studio_admission_owner;
ALTER TABLE studio_core.studio_run_events OWNER TO studio_admission_owner;
ALTER TABLE studio_core.studio_run_admissions OWNER TO studio_admission_owner;

CREATE OR REPLACE FUNCTION studio_core.command_request_hash(p_command jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog
AS $function$
DECLARE
  v_action text; v_subject text; v_input text; v_owner text; v_policy text; v_epoch text;
  v_epoch_num numeric; v_bytes bytea := convert_to('studio.command-request/1:', 'UTF8');
  v_field text; v_fields text[]; v_ecmascript_trim text := chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
    chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
  IF jsonb_typeof(p_command) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_command)) <> 7 OR
     NOT (p_command ?& ARRAY['actionKind','subjectId','inputRef','idempotencyKey','expectedOwnerVersion','expectedPolicyVersion','expectedAuthorityEpoch']) THEN
    RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_command->'actionKind') <> 'string' OR jsonb_typeof(p_command->'subjectId') <> 'string' OR
     jsonb_typeof(p_command->'inputRef') <> 'string' OR jsonb_typeof(p_command->'idempotencyKey') <> 'string' OR
     jsonb_typeof(p_command->'expectedOwnerVersion') <> 'string' OR jsonb_typeof(p_command->'expectedPolicyVersion') <> 'string' THEN
    RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023';
  END IF;
  v_action := p_command->>'actionKind'; v_subject := p_command->>'subjectId'; v_input := p_command->>'inputRef';
  v_owner := p_command->>'expectedOwnerVersion'; v_policy := p_command->>'expectedPolicyVersion';
  IF jsonb_typeof(p_command->'expectedAuthorityEpoch') <> 'number' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023'; END IF;
  v_epoch_num := (p_command->>'expectedAuthorityEpoch')::numeric;
  IF v_epoch_num < 0 OR v_epoch_num > 9007199254740991 OR trunc(v_epoch_num) <> v_epoch_num THEN
    RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023';
  END IF;
  v_epoch := trunc(v_epoch_num)::text;
  IF v_action NOT IN ('INGEST','PLAN','GSC_SYNC','GSC_SCORE','LLM_AUDIT','RESEARCH','BRIEF','GENERATE','REAUDIT','SITE_HEALTH_AUDIT','SITE_HEALTH_REPAIR','VERIFY_URL','INTERLINK_SWEEP','PUBLISH') THEN
    RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023';
  END IF;
  v_fields := ARRAY[v_action,v_subject,v_input,v_owner,v_policy,v_epoch];
  IF array_length(v_fields,1) <> 6 OR EXISTS (SELECT 1 FROM unnest(v_fields) AS values_(f)
      WHERE f IS NULL OR translate(f,v_ecmascript_trim,'') = '' OR EXISTS
        (SELECT 1 FROM generate_series(1,char_length(f)) AS positions_(position)
         WHERE ascii(substr(f,position,1)) BETWEEN 0 AND 31 OR ascii(substr(f,position,1)) BETWEEN 127 AND 159)) OR
     octet_length(v_subject) > 256 OR octet_length(p_command->>'idempotencyKey') > 128 OR
     octet_length(v_input) > 512 OR octet_length(v_owner) > 128 OR octet_length(v_policy) > 128 OR
     translate(p_command->>'idempotencyKey',v_ecmascript_trim,'') = '' OR EXISTS
       (SELECT 1 FROM generate_series(1,char_length(p_command->>'idempotencyKey')) AS positions_(position)
        WHERE ascii(substr(p_command->>'idempotencyKey',position,1)) BETWEEN 0 AND 31 OR
          ascii(substr(p_command->>'idempotencyKey',position,1)) BETWEEN 127 AND 159) THEN
    RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE = '22023';
  END IF;
  FOREACH v_field IN ARRAY v_fields LOOP
    v_bytes := v_bytes || convert_to(octet_length(v_field)::text || ':', 'UTF8') || convert_to(v_field, 'UTF8');
  END LOOP;
  RETURN encode(studio_core.digest(v_bytes, 'sha256'), 'hex');
END
$function$;

-- Deliberately unavailable until the canonical A1 resolver and shared writer locks exist.
CREATE OR REPLACE FUNCTION studio_core.lock_current_command_authority(
  p_project_id uuid, p_actor_issuer text, p_actor_subject text, p_action_kind text, p_subject_id text,
  p_input_ref text, p_snapshot_ref text, p_authorization_evidence_id text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$ SELECT jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE') $function$;

CREATE OR REPLACE FUNCTION studio_core.admit_run(
  p_command jsonb, p_context jsonb, p_request_hash text, p_run_id uuid, p_stage_id uuid, p_event_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_hash text; v_authority jsonb; v_existing record; v_project uuid; v_issuer text; v_actor text;
  v_now timestamptz := clock_timestamp(); v_status text;
BEGIN
  IF p_command IS NULL THEN RETURN jsonb_build_object('kind','rejected','reason','INVALID_COMMAND'); END IF;
  BEGIN v_hash := studio_core.command_request_hash(p_command);
  EXCEPTION WHEN SQLSTATE '22023' OR numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN jsonb_build_object('kind','rejected','reason','INVALID_COMMAND');
  END;
  IF p_request_hash IS DISTINCT FROM v_hash THEN RETURN jsonb_build_object('kind','rejected','reason','REQUEST_HASH_MISMATCH'); END IF;
  IF p_context IS NULL OR jsonb_typeof(p_context) <> 'object' OR
     NOT (p_context ?& ARRAY['projectId','actor','decisionId','policyVersion','ownerVersion','authorityEpoch','snapshotRef']) OR
     jsonb_typeof(p_context->'projectId') <> 'string' OR jsonb_typeof(p_context->'actor') <> 'object' OR
     jsonb_typeof(p_context->'decisionId') <> 'string' OR COALESCE(p_context->>'decisionId','') = '' OR
     jsonb_typeof(p_context->'policyVersion') <> 'string' OR jsonb_typeof(p_context->'ownerVersion') <> 'string' OR
     jsonb_typeof(p_context->'authorityEpoch') <> 'number' OR jsonb_typeof(p_context->'snapshotRef') <> 'string' OR
     jsonb_typeof(p_context#>'{actor,issuer}') <> 'string' OR jsonb_typeof(p_context#>'{actor,subject}') <> 'string' OR
     jsonb_typeof(p_context#>'{actor,authorizationEvidenceId}') <> 'string' OR
     COALESCE(p_context#>>'{actor,issuer}','') = '' OR COALESCE(p_context#>>'{actor,subject}','') = '' OR
     COALESCE(p_context#>>'{actor,authorizationEvidenceId}','') = '' OR COALESCE(p_context->>'decisionId','') = '' OR
     COALESCE(p_context->>'policyVersion','') = '' OR COALESCE(p_context->>'ownerVersion','') = '' OR
     COALESCE(p_context->>'snapshotRef','') = '' THEN
    RETURN jsonb_build_object('kind','rejected','reason','AUTHORIZATION_REQUIRED');
  END IF;
  BEGIN v_project := (p_context->>'projectId')::uuid;
  EXCEPTION WHEN others THEN RETURN jsonb_build_object('kind','rejected','reason','AUTHORIZATION_REQUIRED'); END;
  v_issuer := p_context#>>'{actor,issuer}'; v_actor := p_context#>>'{actor,subject}';
  IF v_issuer IS NULL OR v_actor IS NULL OR v_issuer = '' OR v_actor = '' THEN
    RETURN jsonb_build_object('kind','rejected','reason','AUTHORIZATION_REQUIRED');
  END IF;
  v_authority := studio_core.lock_current_command_authority(v_project, v_issuer, v_actor,
    p_command->>'actionKind', p_command->>'subjectId', p_command->>'inputRef', p_context->>'snapshotRef',
    p_context#>>'{actor,authorizationEvidenceId}');
  IF v_authority IS NULL OR jsonb_typeof(v_authority) <> 'object' OR jsonb_typeof(v_authority->'available') <> 'boolean' THEN
    RETURN jsonb_build_object('kind','rejected','reason','COMMAND_FORBIDDEN');
  END IF;
  IF v_authority->>'available' = 'false' THEN
    RETURN jsonb_build_object('kind','rejected','reason','AUTHORITY_BINDING_UNAVAILABLE');
  END IF;
  IF jsonb_typeof(v_authority) <> 'object' OR
     (SELECT count(*) FROM jsonb_object_keys(v_authority)) <> 13 OR
     NOT (v_authority ?& ARRAY['available','allowed','projectId','actorIssuer','actorSubject','actionKind','subjectId','inputRef',
       'snapshotRef','authorizationEvidenceId','ownerVersion','policyVersion','authorityEpoch']) OR
     EXISTS (SELECT 1 FROM jsonb_object_keys(v_authority) AS authority_keys(key) WHERE key NOT IN ('available','allowed','projectId','actorIssuer','actorSubject',
       'actionKind','subjectId','inputRef','snapshotRef','authorizationEvidenceId','ownerVersion','policyVersion','authorityEpoch')) OR
     jsonb_typeof(v_authority->'available') <> 'boolean' OR jsonb_typeof(v_authority->'allowed') <> 'boolean' OR
     jsonb_typeof(v_authority->'authorityEpoch') <> 'number' OR
     EXISTS (SELECT 1 FROM unnest(ARRAY['projectId','actorIssuer','actorSubject','actionKind','subjectId','inputRef','snapshotRef',
       'authorizationEvidenceId','ownerVersion','policyVersion']) AS authority_fields(field_name)
       WHERE jsonb_typeof(v_authority->field_name) <> 'string' OR COALESCE(v_authority->>field_name,'') = '') THEN
    RETURN jsonb_build_object('kind','rejected','reason','COMMAND_FORBIDDEN');
  END IF;
  IF v_authority->>'inputRef' IS DISTINCT FROM p_command->>'inputRef' THEN
    RETURN jsonb_build_object('kind','rejected','reason','INPUT_SCOPE_MISMATCH');
  END IF;
  IF COALESCE((v_authority->>'allowed')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('kind','rejected','reason','COMMAND_FORBIDDEN');
  END IF;
  IF v_authority->>'projectId' IS DISTINCT FROM v_project::text OR v_authority->>'actorIssuer' IS DISTINCT FROM v_issuer OR
     v_authority->>'actorSubject' IS DISTINCT FROM v_actor OR v_authority->>'actionKind' IS DISTINCT FROM p_command->>'actionKind' OR
     v_authority->>'subjectId' IS DISTINCT FROM p_command->>'subjectId' OR
     v_authority->>'snapshotRef' IS DISTINCT FROM p_context->>'snapshotRef' OR
     v_authority->>'authorizationEvidenceId' IS DISTINCT FROM p_context#>>'{actor,authorizationEvidenceId}' THEN
    RETURN jsonb_build_object('kind','rejected','reason','COMMAND_FORBIDDEN');
  END IF;
  IF v_authority->>'ownerVersion' IS DISTINCT FROM p_command->>'expectedOwnerVersion' OR
     v_authority->>'ownerVersion' IS DISTINCT FROM p_context->>'ownerVersion' OR
     v_authority->>'policyVersion' IS DISTINCT FROM p_command->>'expectedPolicyVersion' OR
     v_authority->>'policyVersion' IS DISTINCT FROM p_context->>'policyVersion' OR
     v_authority->>'authorityEpoch' IS NULL OR (v_authority->>'authorityEpoch')::numeric IS DISTINCT FROM (p_command->>'expectedAuthorityEpoch')::numeric OR
     (v_authority->>'authorityEpoch')::numeric IS DISTINCT FROM (p_context->>'authorityEpoch')::numeric THEN
    RETURN jsonb_build_object('kind','rejected','reason','EXPECTED_VERSION_CONFLICT');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_project::text || ':' || v_issuer || ':' || v_actor || ':' || (p_command->>'idempotencyKey'), 0));
  SELECT * INTO v_existing FROM studio_core.studio_runs r WHERE r.project_id = v_project AND
    r.actor_issuer = v_issuer AND r.actor_subject = v_actor AND r.idempotency_key = p_command->>'idempotencyKey' FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash THEN RETURN jsonb_build_object('kind','rejected','reason','IDEMPOTENCY_CONFLICT'); END IF;
    RETURN jsonb_build_object('kind','replayed','runId',v_existing.run_id,'status',v_existing.status,'lastEventSequence',v_existing.last_event_sequence);
  END IF;
  INSERT INTO studio_core.studio_runs VALUES (v_project,p_run_id,'studio.run-envelope/1',p_command->>'actionKind',v_issuer,v_actor,
    p_context#>>'{actor,authorizationEvidenceId}',v_hash,p_command->>'idempotencyKey',(p_command->>'expectedAuthorityEpoch')::bigint,
    'QUEUED',NULL,NULL,NULL,v_now,NULL,NULL,1,p_command->>'inputRef',NULL,NULL);
  INSERT INTO studio_core.studio_run_stages VALUES (v_project,p_run_id,p_stage_id,'admission',0,0,NULL,NULL,v_hash,NULL,NULL,'pending',0);
  INSERT INTO studio_core.studio_outbox VALUES (v_project,p_run_id,p_event_id,p_stage_id,'RUN_ADMITTED',1,p_command->>'inputRef',p_command->>'idempotencyKey','pending','studio.command-admission/1',v_now);
  INSERT INTO studio_core.studio_run_events VALUES (v_project,p_run_id,1,'studio.run-event/1',p_stage_id,NULL,NULL,v_now,'admission','RUN_QUEUED',NULL,NULL,NULL,NULL);
  INSERT INTO studio_core.studio_run_admissions VALUES (v_project,p_run_id,p_command->>'subjectId',p_context->>'decisionId',
    p_context#>>'{actor,authorizationEvidenceId}',p_command->>'expectedOwnerVersion',p_command->>'expectedPolicyVersion',
    (p_command->>'expectedAuthorityEpoch')::bigint,p_context->>'snapshotRef',p_command,v_now);
  RETURN jsonb_build_object('kind','accepted','runId',p_run_id,'status','QUEUED','lastEventSequence',1);
END
$function$;

ALTER FUNCTION studio_core.command_request_hash(jsonb) OWNER TO studio_admission_owner;
ALTER FUNCTION studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text) OWNER TO studio_admission_owner;
ALTER FUNCTION studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid) OWNER TO studio_admission_owner;
REVOKE ALL ON FUNCTION studio_core.command_request_hash(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio_core FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION studio_core.digest(bytea, text) TO studio_admission_owner;
GRANT EXECUTE ON FUNCTION studio_core.admit_run(jsonb,jsonb,text,uuid,uuid,uuid) TO service_role;
