-- DISPOSABLE TEST FIXTURE ONLY. Never copy this file into supabase/migrations.
-- This file intentionally fails if either fixture schema already exists.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA studio_authority_fixture;
CREATE SCHEMA studio_core;

CREATE TABLE studio_authority_fixture.project_authority (
  project_id uuid PRIMARY KEY,
  authority_epoch bigint NOT NULL CHECK (authority_epoch > 0)
);
CREATE TABLE studio_authority_fixture.project_policy (
  project_id uuid PRIMARY KEY REFERENCES studio_authority_fixture.project_authority(project_id),
  policy_version bigint NOT NULL CHECK (policy_version > 0),
  active boolean NOT NULL
);
CREATE TABLE studio_authority_fixture.owner_subject (
  project_id uuid NOT NULL REFERENCES studio_authority_fixture.project_authority(project_id),
  action_kind text NOT NULL,
  subject_id text NOT NULL,
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  input_ref text NOT NULL,
  snapshot_ref text NOT NULL,
  authorization_evidence_id text NOT NULL,
  owner_version bigint NOT NULL CHECK (owner_version > 0),
  active boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, action_kind, subject_id)
);
CREATE TABLE studio_authority_fixture.scoped_admission_key (
  project_id uuid NOT NULL REFERENCES studio_authority_fixture.project_authority(project_id),
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action_kind text NOT NULL,
  subject_id text NOT NULL,
  input_ref text NOT NULL,
  snapshot_ref text NOT NULL,
  authorization_evidence_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, actor_issuer, actor_subject, action_kind, subject_id, input_ref, snapshot_ref, authorization_evidence_id)
);
CREATE TABLE studio_authority_fixture.run_stage (
  project_id uuid NOT NULL REFERENCES studio_authority_fixture.project_authority(project_id),
  action_kind text NOT NULL,
  subject_id text NOT NULL,
  input_ref text NOT NULL,
  snapshot_ref text NOT NULL,
  stage_key text NOT NULL,
  PRIMARY KEY (project_id, action_kind, subject_id, input_ref, snapshot_ref, stage_key)
);
CREATE TABLE studio_authority_fixture.authority_event (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES studio_authority_fixture.project_authority(project_id),
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action_kind text NOT NULL,
  subject_id text NOT NULL,
  input_ref text NOT NULL,
  snapshot_ref text NOT NULL,
  authorization_evidence_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (project_id, actor_issuer, actor_subject, action_kind, subject_id, input_ref, snapshot_ref, authorization_evidence_id)
);

CREATE FUNCTION studio_core.lock_current_command_authority(
  p_project_id uuid,
  p_actor_issuer text,
  p_actor_subject text,
  p_action_kind text,
  p_subject_id text,
  p_input_ref text,
  p_snapshot_ref text,
  p_authorization_evidence_id text
) RETURNS jsonb
LANGUAGE plpgsql
AS $fixture$
DECLARE
  v_epoch bigint;
  v_policy_version bigint;
  v_policy_active boolean;
  v_owner_version bigint;
  v_owner_active boolean;
  v_expires_at timestamptz;
  v_stage_found boolean;
  v_allowed boolean := false;
  v_event_count integer;
BEGIN
  IF p_project_id IS NULL OR p_actor_issuer IS NULL OR p_actor_subject IS NULL
     OR p_action_kind IS NULL OR p_subject_id IS NULL OR p_input_ref IS NULL
     OR p_snapshot_ref IS NULL OR p_authorization_evidence_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE');
  END IF;

  -- Exact shared order: project/epoch -> policy -> owner/subject -> scoped key -> run/stage.
  SELECT authority_epoch INTO v_epoch
  FROM studio_authority_fixture.project_authority
  WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE');
  END IF;

  SELECT policy_version, active INTO v_policy_version, v_policy_active
  FROM studio_authority_fixture.project_policy
  WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE');
  END IF;

  SELECT owner_version, active, expires_at
  INTO v_owner_version, v_owner_active, v_expires_at
  FROM studio_authority_fixture.owner_subject
  WHERE project_id = p_project_id AND action_kind = p_action_kind AND subject_id = p_subject_id
    AND actor_issuer = p_actor_issuer AND actor_subject = p_actor_subject
    AND input_ref = p_input_ref AND snapshot_ref = p_snapshot_ref
    AND authorization_evidence_id = p_authorization_evidence_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE');
  END IF;

  INSERT INTO studio_authority_fixture.scoped_admission_key (
    project_id, actor_issuer, actor_subject, action_kind, subject_id,
    input_ref, snapshot_ref, authorization_evidence_id
  ) VALUES (
    p_project_id, p_actor_issuer, p_actor_subject, p_action_kind, p_subject_id,
    p_input_ref, p_snapshot_ref, p_authorization_evidence_id
  ) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM studio_authority_fixture.scoped_admission_key
  WHERE project_id = p_project_id AND actor_issuer = p_actor_issuer
    AND actor_subject = p_actor_subject AND action_kind = p_action_kind
    AND subject_id = p_subject_id AND input_ref = p_input_ref
    AND snapshot_ref = p_snapshot_ref AND authorization_evidence_id = p_authorization_evidence_id
  FOR UPDATE;

  PERFORM 1 FROM studio_authority_fixture.run_stage
  WHERE project_id = p_project_id AND action_kind = p_action_kind
    AND subject_id = p_subject_id AND input_ref = p_input_ref
    AND snapshot_ref = p_snapshot_ref AND stage_key = 'fixture_admission'
  FOR UPDATE;
  v_stage_found := FOUND;
  IF NOT v_stage_found THEN
    RETURN jsonb_build_object('available', false, 'reason', 'AUTHORITY_BINDING_UNAVAILABLE');
  END IF;

  -- Evaluate expiry only after all authority rows have been locked.
  v_allowed := v_policy_active AND v_owner_active AND v_expires_at > clock_timestamp();
  SELECT count(*) INTO v_event_count
  FROM studio_authority_fixture.authority_event
  WHERE project_id = p_project_id AND actor_issuer = p_actor_issuer
    AND actor_subject = p_actor_subject AND action_kind = p_action_kind
    AND subject_id = p_subject_id AND input_ref = p_input_ref
    AND snapshot_ref = p_snapshot_ref AND authorization_evidence_id = p_authorization_evidence_id;
  IF v_event_count > 0 THEN
    v_allowed := false;
  END IF;

  IF v_allowed THEN
    INSERT INTO studio_authority_fixture.authority_event (
      project_id, actor_issuer, actor_subject, action_kind, subject_id,
      input_ref, snapshot_ref, authorization_evidence_id
    ) VALUES (
      p_project_id, p_actor_issuer, p_actor_subject, p_action_kind, p_subject_id,
      p_input_ref, p_snapshot_ref, p_authorization_evidence_id
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'available', true, 'allowed', v_allowed, 'projectId', p_project_id,
    'actorIssuer', p_actor_issuer, 'actorSubject', p_actor_subject,
    'actionKind', p_action_kind, 'subjectId', p_subject_id, 'inputRef', p_input_ref,
    'snapshotRef', p_snapshot_ref, 'authorizationEvidenceId', p_authorization_evidence_id,
    'ownerVersion', v_owner_version, 'policyVersion', v_policy_version, 'authorityEpoch', v_epoch
  );
END
$fixture$;

-- These fixture mutation helpers acquire and reread the same root first.
CREATE FUNCTION studio_authority_fixture.bump_epoch(p_project_id uuid) RETURNS void
LANGUAGE plpgsql AS $fixture$
BEGIN
  PERFORM 1 FROM studio_authority_fixture.project_authority WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture project missing'; END IF;
  UPDATE studio_authority_fixture.project_authority SET authority_epoch = authority_epoch + 1 WHERE project_id = p_project_id;
END
$fixture$;
CREATE FUNCTION studio_authority_fixture.bump_policy(p_project_id uuid) RETURNS void
LANGUAGE plpgsql AS $fixture$
BEGIN
  PERFORM 1 FROM studio_authority_fixture.project_authority WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture project missing'; END IF;
  UPDATE studio_authority_fixture.project_policy SET policy_version = policy_version + 1 WHERE project_id = p_project_id;
END
$fixture$;
CREATE FUNCTION studio_authority_fixture.revoke_owner(p_project_id uuid, p_action_kind text, p_subject_id text) RETURNS void
LANGUAGE plpgsql AS $fixture$
BEGIN
  PERFORM 1 FROM studio_authority_fixture.project_authority WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture project missing'; END IF;
  UPDATE studio_authority_fixture.owner_subject
  SET active = false, owner_version = owner_version + 1
  WHERE project_id = p_project_id AND action_kind = p_action_kind AND subject_id = p_subject_id;
END
$fixture$;

REVOKE ALL ON SCHEMA studio_authority_fixture, studio_core FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA studio_authority_fixture FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio_authority_fixture FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION studio_core.lock_current_command_authority(uuid,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
