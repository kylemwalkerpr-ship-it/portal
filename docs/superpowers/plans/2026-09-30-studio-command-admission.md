# Inactive Studio Command Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an inactive, transaction-backed v3 run-admission boundary that acknowledges work only after durable persistence and proves isolation in a disposable PostgreSQL database.

**Architecture:** Postgres remains the sole execution authority. A server-authenticated request rechecks authorization, hashes its canonical command, and invokes one service-only transaction API that inserts a run envelope, initial stage, decision/gate reference, pending outbox event and initial progress event. The edge returns immediately after commit; dispatcher, workers and production activation are later packets.

**Tech Stack:** Existing TypeScript/Next.js, Jest, Supabase service-client transport, PostgreSQL 17 and psql; no dependency upgrades or new provider accounts.

**Spec:** `docs/superpowers/specs/2026-09-22-content-studio-revamp-architecture.md`, CS-2026.09.23.8, especially §§7.1–7.4, 9.7–9.9; implementation dependency map in `docs/superpowers/plans/2026-09-22-content-studio-revamp-blueprint.md`. Released authority remains `docs/superpowers/specs/2026-09-22-content-studio-revamp-manifest.json`; this document is implementation decomposition, not a replacement specification or manifest.

## Global Constraints

- “Postgres is the sole durable run/gate authority.”
- “Unique command admission key is project+verified issuer/subject+idempotency key; same key/different request hash returns 409.”
- “The request hash binds action, subject/input and expected versions; authorization is rechecked on retries.”
- “Actor email is optional display metadata only and is omitted from dispatch.”
- “A database outage cannot acknowledge an unpersisted job (503 with a stable reason code).”
- “Missing or ambiguous strict identity fails closed.”
- “A completed execution run does not itself mean content was published or live-verified.”
- Use `studio_core`, the canonical private-schema template. Revoke schema/table/function access from PUBLIC, anon and authenticated; expose validated service-only transition APIs.
- Do not rewrite released documents, migration baseline, existing migrations, historical phase evidence, existing two planning documents or the root-owned board.
- No production migration application, provider/Modal calls, deployment, merge/push, new credentials or broad CREATE/publication unlock.
- Engineering code remains inactive until independent review and live prerequisites; no environment flag alone authorizes activation.

## Review Focus

- A lost response after commit must resolve through the same scoped key, without duplicating work; test in Task 2.
- A different authenticated issuer or project using the same key must neither collide nor read another actor's run; test in Tasks 2–3.
- Authorization revoked between retries must deny even a previously committed replay; test in Task 3.
- JSON key ordering, malformed input and numeric overflow must not yield an ambiguous hash or identity; test in Task 1.
- A function's default PUBLIC EXECUTE, search_path or direct table grants must not expose authority; per-table and per-function negatives in Task 2.

---

## Reconciled source and boundaries

Planning worktree: `/Users/phantomdarne/Documents/GitHub/portal-worktrees/studio-release-integration-20260930`, branch `feat/studio-release-integration-20260930`, HEAD `5fe89458b5e27d23e74d57b2dc0f0fd0e9eb1b9b`. Read-only origin snapshot: `ab311e37a19c10e25e5b95b0432baadb7b4e0cd6`. Reconcile fresh main at implementation admission; use a separate clean implementation worktree, preserving these planning files.

Eight released normative file bytes/hashes match on both snapshots. Origin has 82 migration files but no v3 runs API or private command/outbox authority. Legacy `content_jobs` and `seo_engine_runs` retain their content lifecycle and analytical-result responsibilities; neither becomes a second execution scheduler.

Saved live catalog receipt: root board worktree `docs/content-studio/evidence/2026-09-30/supabase-live-catalog-inventory.json`, observed 2026-09-30T08:20:16.535Z, project `krggzrxxnqfsbbklatxl`, SHA256 `5f6efa76ff5fd363b82ad3e6a370b58e266d273698a22c8749f3eb65612ed000`. Catalog reports PostgreSQL 17.6, 289934483 database bytes, 15 migration names, no proposed private execution schema, and broad legacy grants/policies. The standard migration-name table is not the repository custom ledger. Root subsequently saved supabase-live-custom-migration-ledger.json and supabase-migration-ledger-source-reconciliation.json in the same evidence directory: 81 custom ledger rows against 82 origin migration files, 80 exact hash matches and one unrelated YQAA mismatch (20260930074207). Studio evidence, execution-lease and provider-parity hashes MATCH and were applied September 16; do not blindly apply them again. Preserve the unrelated YQAA work; its exact changed hash must be reconciled by its owner before any broad production migration batch. Quota, backup/restore and exhaustive role probes remain unverified.

Reusable helper: `lib/studioRunAuthority/index.ts` at `67807a1ba7f4e1ac9835a4a06b5465d6327e86db` includes earlier `995e2336` plus overflow guards. Its `planRunSubmission` is a pure proposal and uses unscoped duplicate-key arrays; do not use those as persistence authority. Its reduced Run shape is not the canonical `StudioRunEnvelope`. Reuse compatible validators/fencing functions through explicit mapping only after the supervisor integrates the reviewed helper normally. Do not silently cherry-pick in this packet.

## Frozen implementation mapping

These physical mappings implement existing logical contracts; they do not declare a new policy or lifecycle authority.

| Canonical logical contract | New private relation | Key and responsibility |
|---|---|---|
| StudioRunEnvelope | studio_core.studio_runs | PK(project_id,run_id), one execution projection; exact canonical fields, schemaVersion studio.run-envelope/1 |
| Stage | studio_core.studio_run_stages | PK(project_id,stage_id), FK(project_id,run_id); initial pending, fence=0, attemptCount=0, no lease/artifact |
| OutboxEvent | studio_core.studio_outbox | PK(project_id,event_id), FK project/run/stage; initial pending; unique(project_id,run_id,sequence) |
| StudioRunEvent | studio_core.studio_run_events | PK(project_id,run_id,sequence); append-only user progress, separate from delivery receipts |
| Decision/gate binding | studio_core.studio_run_admissions | PK(project_id,run_id), immutable decisionId, authorizationEvidenceId, expected owner/policy version, authorityEpoch and sealed snapshot reference |

Initial envelope status is QUEUED; contentJobId, seoEngineRunId, startedAt, finishedAt, cancelRequestedAt, resultRef and errorClass are null. Initial event sequence is 1 and lastEventSequence is 1. No fabricated content job is allocated for a generic action. Action kinds exactly match §7.2.1; decoding an action never grants eligibility. Initial stage name `admission`, producerVersion `studio.command-admission/1`, eventType `RUN_ADMITTED`, phase `admission`, messageCode `RUN_QUEUED` are packet-local dispatch/progress values, not business approval or publication labels.

Command request:
`RunCommandInput = { actionKind: StudioActionKind; subjectId: string; inputRef: string; idempotencyKey: string; expectedOwnerVersion: string; expectedPolicyVersion: string; expectedAuthorityEpoch: number }`.
Reject unknown fields and any caller actor/project/run/decision/hash values. Packet request limits: body at most 16384 UTF-8 bytes; subjectId at most 256 UTF-8 bytes; idempotencyKey at most 128; inputRef at most 512; expectedOwnerVersion and expectedPolicyVersion at most 128 each. Strings must be nonempty and contain no NUL/control characters. These conservative inactive API bounds are local implementation choices, not measured provider/CPU allowances; reject oversized data before hashing/RPC and require performance review before activation. Epoch is a nonnegative safe integer. Input references must resolve through the trusted project-scoped binding to an immutable sealed input (or content-addressed input) before admission and again inside current-authority validation; mutable/unsealed references fail INPUT_SCOPE_MISMATCH. The reference binds that exact input; no arbitrary URL fetching.

Trusted context:
`VerifiedCommandContext = { projectId: string; actor: StudioRunEnvelope['actor']; decisionId: string; policyVersion: string; ownerVersion: string; authorityEpoch: number; snapshotRef: string }`.
Only `authorizeCommand(input, verifiedIdentity)` produces it after current project/role/object/action/owner/policy/epoch checks. Fixtures provide this context in isolated tests; production has no permissive default. The effective integration binding supplies project identity server-side, never from arbitrary body/header values. The immutable snapshot reference must name the existing reviewed policy authority, not a new evaluator in this module.

Canonical request hash includes actionKind, subjectId, inputRef and all expected versions/epoch using the length-prefixed UTF-8 byte contract below and SHA256. The SQL uniqueness tuple is (project_id,actor_issuer,actor_subject,idempotency_key). Hash excludes generated IDs and timestamps. Equal tuple+hash returns the committed run only after current reauthorization and the transaction-time durable authority check; different hash returns IDEMPOTENCY_CONFLICT. Actor email is absent from outbox payloads.

`AdmissionResult = { kind: 'accepted'; runId: string; status: 'QUEUED'; lastEventSequence: number } | { kind: 'replayed'; runId: string; status: StudioRunEnvelope['status']; lastEventSequence: number } | { kind: 'rejected'; reason: AdmissionReason }`. A replay returns current truthful execution status; never relabel a later run QUEUED.
Reasons owned by this packet: INVALID_COMMAND, AUTHORIZATION_REQUIRED, COMMAND_FORBIDDEN, EXPECTED_VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, INPUT_SCOPE_MISMATCH, ADMISSION_UNAVAILABLE, RUNTIME_NOT_ACTIVE, AUTHORITY_BINDING_UNAVAILABLE, REQUEST_HASH_MISMATCH. Existing canonical identity/fencing reasons retain their exact spelling if reused. Map invalid/hash mismatch to 400, unauthenticated 401, forbidden/input-scope denial to 403, version/key conflict to 409, unavailable/inactive/missing authority binding to 503. No positive admission from a mock store in runtime code.

SQL transition API:
`studio_core.admit_run(p_command jsonb,p_context jsonb,p_request_hash text,p_run_id uuid,p_stage_id uuid,p_event_id uuid) returns jsonb`.
Service-role-only EXECUTE; SECURITY DEFINER with fixed safe search_path and fully qualified references, no dynamic SQL. Function strictly recomputes and verifies the canonical command hash, obtains the transaction-time canonical authority lock/read described below, checks durable current authorization/owner/policy/epoch, then locks/resolves the scoped uniqueness tuple and inserts all five relations atomically. Equal caller context and command alone never authorize an insertion. Grant service_role schema USAGE and exact function EXECUTE only; no CREATE. Tables have RLS enabled and no raw runtime service_role table DML grants; function owner is a non-login migration-managed authority. Set default table/function privileges explicitly so subsequent objects do not inherit PUBLIC access. No worker access is introduced. Separate least-privilege project/actor read API for operator status is a later packet.

## Transaction-time authority dependency

A server authorization result is a prior observation, not current authority at SQL commit. Comparing p_command to p_context alone is insufficient and prohibited.

Required named integration interface:
`studio_core.lock_current_command_authority(p_project_id uuid,p_actor_issuer text,p_actor_subject text,p_action_kind text,p_subject_id text,p_input_ref text,p_snapshot_ref text,p_authorization_evidence_id text) returns jsonb`.
It returns either `{ available:false, reason:'AUTHORITY_BINDING_UNAVAILABLE' }` or a server-owned durable result `{ available:true, allowed:boolean, projectId, actorIssuer, actorSubject, actionKind, subjectId, inputRef, snapshotRef, authorizationEvidenceId, ownerVersion, policyVersion, authorityEpoch }`. An available result is valid only when the implementation resolves the canonical current project/actor/object/action authorization, sealed policy/gate snapshot, ownership version and authority epoch from their actual durable owners.

The binding must acquire transaction-held locks shared by ALL writers that advance these authorities. Lock order is project/authority-epoch boundary, policy snapshot boundary, owner/subject boundary, then the scoped admission key, then run/stage. Lock acquisition must re-read current values under the held locks (READ COMMITTED SELECT FOR UPDATE or equivalently reviewed authority CAS); reading before acquiring an advisory lock is insufficient. Every policy/owner/epoch transition participates in the same named lock protocol. Do not invent an independent advisory lock whose real authority writer does not acquire.

Before replay lookup or inserting ANY relation, admit_run calls that interface within the same transaction, validates the returned binding identities against the verified context and command, checks current allowed=true, and compares its durable ownerVersion/policyVersion/authorityEpoch to BOTH expected command values and p_context. It also verifies snapshot/evidence/input references still belong to that current project/action/subject/actor. Missing/revoked evidence denies; changed versions return EXPECTED_VERSION_CONFLICT; unavailable binding returns AUTHORITY_BINDING_UNAVAILABLE. Locks remain held through commit or rejection. Concurrent revocation either commits first and admission rejects, or waits until this admission commits; no stale intermediate approval is accepted.

No actual canonical durable A1 authority storage, resolver or shared lock implementation was found in the inspected source snapshot. This is an explicit A1.1/A1.2 dependency, NOT an approved gate. This engineering packet MUST install only a deny-only production binding (available=false), or leave admission uncallable until the real binding is supplied in its separately reviewed authority packet. It cannot implement a permissive binding from caller context, pure helper maps or a new “approved” fixture table. The inactive route remains 503. Isolated PG tests may replace this exact interface using a named fixture-owned authority table and shared locks inside the disposable database ONLY; those tests prove admission integration behavior, not production policy authority. Preserve their fixture-only label in every receipt.

Mandatory TOCTOU test: authorize on epoch E/policy P/owner O, pause before transaction, change fixture durable epoch/policy/owner and commit using the shared lock, then call admit_run with stale trusted p_context and command. It must reject with EXPECTED_VERSION_CONFLICT and leave all five relations at zero rows. Repeat for revoked action/evidence (COMMAND_FORBIDDEN) and missing binding (AUTHORITY_BINDING_UNAVAILABLE). A second two-session test holds the shared authority lock in admission while another session revokes; require blocking/serialization, then a subsequent replay denies after revocation even though a run already exists.

## SQL-bound canonical request hash

Both languages use the SAME exact byte contract; SQL never accepts a syntactically valid supplied digest as authority. Version prefix is ASCII `studio.command-request/1:`. Append the six fields in this order: actionKind, subjectId, inputRef, expectedOwnerVersion, expectedPolicyVersion, expectedAuthorityEpoch. Each string field contributes its UTF-8 octet length in unpadded ASCII decimal, then `:`, then its exact UTF-8 bytes. Epoch contributes the same length-prefixed representation of its canonical unpadded nonnegative ASCII decimal. No trimming, Unicode normalization, JSON serialization or locale conversion occurs. Reject invalid Unicode/lone surrogates, control characters, empty/whitespace-only strings, unknown/missing JSON fields and unsafe/noninteger epochs before hashing; keep the packet byte limits. Idempotency key, trusted actor/project, generated IDs and timestamps are outside this request hash and are independently bound by scoped admission identity.

TypeScript hashRunCommand hashes these bytes with SHA256. SQL `studio_core.command_request_hash(p_command jsonb) returns text` strictly decodes the same fields/types, uses octet_length(convert_to(value,'UTF8')), constructs the same length-prefixed byte sequence and computes lowercase SHA256 via the explicitly verified pgcrypto implementation. Do not use jsonb::text or JSON key order as the byte contract. Extension availability/namespace is checked in isolated setup and live admission evidence; unavailable digest capability fails closed.

admit_run computes the SQL digest FIRST and compares it to p_request_hash; mismatch returns REQUEST_HASH_MISMATCH before authority lookup, replay or insertion. Invalid command returns INVALID_COMMAND. The SQL-computed digest is the only digest stored. A caller cannot alter action/input/expected versions and reuse a valid old supplied hash. Cross-language golden fixtures contain ASCII, non-ASCII UTF-8, multi-digit epoch and byte-boundary values; Task 2 compares TypeScript and SQL results exactly. Assertions cover supplied digest tampering, a changed command with stale digest, JSON key reordering, unknown fields and invalid numeric types, each with zero persisted rows.

## Exact physical row contracts

All columns below are required NOT NULL unless marked nullable. Snake_case is physical storage; projection reconstructs canonical camelCase fields exactly. Project/run/stage/event IDs are UUID values generated or resolved server-side; tenant projectId is NOT the Supabase project reference. TEXT identity/version/ref values use the validated input limits or a trusted reviewed source, never caller-installed policy. BIGINT counters/epochs CHECK 0..9007199254740991; positive sequences CHECK 1..9007199254740991. HASH means TEXT CHECK lowercase 64-hex. TIMESTAMP means TIMESTAMPTZ. No cascading deletes or mutations to immutable admissions/progress events.

| Relation | Exact columns |
|---|---|
| studio_runs | project_id UUID; run_id UUID; schema_version TEXT CHECK ='studio.run-envelope/1'; action_kind TEXT CHECK canonical StudioActionKind enum; actor_issuer TEXT; actor_subject TEXT; authorization_evidence_id TEXT; request_hash HASH; idempotency_key TEXT; authority_epoch BIGINT; status TEXT CHECK canonical execution-status enum; content_job_id UUID nullable; seo_engine_run_id UUID nullable; cancel_requested_at TIMESTAMP nullable; created_at TIMESTAMP; started_at TIMESTAMP nullable; finished_at TIMESTAMP nullable; last_event_sequence BIGINT; input_ref TEXT; result_ref TEXT nullable; error_class TEXT nullable |
| studio_run_stages | project_id UUID; run_id UUID; stage_id UUID; stage_name TEXT; attempt_count BIGINT; current_fence BIGINT; lease_owner TEXT nullable; lease_expires_at TIMESTAMP nullable; input_hash HASH; checkpoint_ref TEXT nullable; output_artifact_ref TEXT nullable; state TEXT CHECK canonical Stage enum; row_version BIGINT |
| studio_outbox | project_id UUID; run_id UUID; event_id UUID; stage_id UUID nullable; event_type TEXT; sequence BIGINT; payload_ref TEXT; idempotency_key TEXT; delivery_state TEXT CHECK pending/claimed/delivered/dead; producer_version TEXT; created_at TIMESTAMP |
| studio_run_events | project_id UUID; run_id UUID; sequence BIGINT; schema_version TEXT CHECK ='studio.run-event/1'; stage_id UUID nullable; attempt_id UUID nullable; fence BIGINT nullable; created_at TIMESTAMP; phase TEXT; message_code TEXT; detail_ref TEXT nullable; progress_completed BIGINT nullable; progress_total BIGINT nullable; progress_unit TEXT nullable |
| studio_run_admissions | project_id UUID; run_id UUID; subject_id TEXT; decision_id TEXT; authorization_evidence_id TEXT; expected_owner_version TEXT; expected_policy_version TEXT; authority_epoch BIGINT; snapshot_ref TEXT; command_json JSONB; admitted_at TIMESTAMP |

Run execution status enum: QUEUED, RUNNING, CANCEL_REQUESTED, CANCELLED, RETRY_WAIT, SUCCEEDED, FAILED, BLOCKED, SUPERSEDED. Action enum: INGEST, PLAN, GSC_SYNC, GSC_SCORE, LLM_AUDIT, RESEARCH, BRIEF, GENERATE, REAUDIT, SITE_HEALTH_AUDIT, SITE_HEALTH_REPAIR, VERIFY_URL, INTERLINK_SWEEP, PUBLISH. Stage enum: pending, claimed, running, checkpointed, done, failed, cancelled. row_version is a storage CAS counter (initial 0), not an alternative execution status. admission's subject_id and immutable command_json bind command subject/input/expected versions without adding them to or replacing the canonical envelope.

Keys: studio_runs PK(project_id,run_id), UNIQUE(project_id,actor_issuer,actor_subject,idempotency_key); stages PK(project_id,stage_id), UNIQUE(project_id,run_id,stage_id), UNIQUE(project_id,run_id,stage_name,input_hash), FK(project_id,run_id)→studio_runs; outbox PK(project_id,event_id), UNIQUE(project_id,run_id,sequence), FK(project_id,run_id)→runs and FK(project_id,run_id,stage_id)→stages; events PK(project_id,run_id,sequence), same project/run and nullable composite stage FKs; admissions PK(project_id,run_id), FK→runs. Stage idempotency additionally binds policyVersion through immutable admission expected_policy_version under the common run boundary, not an independently mutable Stage policy field.

Initial stage input_hash equals SQL command digest, state=pending, attempt_count/current_fence/row_version=0; lease pair/checkpoint/artifact null. Initial outbox sequence=1, state=pending, payload_ref=input_ref (private input reference; consumer re-reads authenticated run/admission rather than treating payload as authorization), stage_id=initial stage. Initial event sequence=1, stage_id=initial stage, attempt/fence/detail/progress columns null. Require progress null as a group, or completed>=0, nonempty unit and nullable total>=completed; nullable stage cannot carry a nonnull attempt/fence in this packet. An attempt reference remains null until the separately reviewed attempt/worker authority exists. Lease owner/expiry must both be null or both nonnull.

Canonical actor maps issuer/subject/authorizationEvidenceId from three run columns. No email column. content_job_id/seo_engine_run_id are null in this packet; activation cannot populate them without explicit project-preserving FK/lineage review against actual legacy keys. No speculative FK to an unverified legacy authority is installed. snapshot_ref/decision_id/evidence IDs are immutable canonical authority references validated by lock_current_command_authority; these admission columns are audit bindings, NOT a new policy/approval ledger.

## Isolated PostgreSQL CI execution boundary

Read-only preparation found no psql/postgres/pg_ctl/initdb/docker/podman in the checked local PATH and no PostgreSQL 17 psql at the two known Homebrew locations. The prepared worktree has no node_modules. Local durability/concurrency testing is therefore BLOCKED_TEST_ENV until supplied; do not install PostgreSQL, start local servers or claim mocked durability.

The same packet creates `.github/workflows/studio-command-admission-test.yml`: Ubuntu 24.04 GitHub runner, PostgreSQL 17 disposable service, contents:read only, PR path filter plus workflow_dispatch, no production secrets or environments. Resolve and pin the official PostgreSQL image digest before implementation acceptance; record image digest, server_version, candidate SHA, run ID and attempt in sanitized receipts. Use existing repository-reviewed action pins: checkout 11bd71901bbe5b1630ceea73d27597364c9af683, setup-node 49933ea5288caeca8642d1e84afbd3f7d6820020 (Node 22.22.2), upload-artifact ea165f8d65b6e75b540449e92b4886f43607fa02. Run npm ci from the unchanged package-lock.json inside the hosted test job. Do not upgrade or modify package dependencies.

Fixture credentials belong only to the disposable service; do not copy Supabase/production credentials or print environment dumps. Obtain psql from the hosted runner's available client (verify version) or execute psql inside the job's service container; no pg JavaScript dependency is needed. scripts/test-studio-command-admission.mjs launches independent psql processes for real concurrent sessions and orchestrates explicit database barriers; a single-session sequential test is not a concurrency proof. Test target is loopback plus a uniquely named, marked disposable database in that job; the harness refuses arbitrary hosted URLs, unmarked databases or production-like inherited environment variables.

Use only the selected new migration and minimal fixture roles/pgcrypto setup, not the whole Portal migration batch. Include the exact `\ir ../../supabase/migrations/20261001000000_studio_command_admission.sql` path in tests/sql/studio-command-admission.sql. Cross-language hash comparisons run the TypeScript hash implementation under the existing locked test compiler and query the real SQL hash function; commit receipts establish all-five rollback, scoped races, stale authority and each privilege denial. Capture durable reconnect proof by recording transaction commit on one session, suppressing its acknowledgement, and opening a new session for replay; separately terminate a session before commit and prove rollback. The production deny-only resolver MUST be tested first, before the isolated fixture replaces it with the named durable fixture authority interface.

This bare PostgreSQL fixture proves private SQL and the single-RPC adapter's typed mapping, not Supabase PostgREST exposure or authenticated production RPC behavior. No reviewed studio_core exposed-schema setting exists in the inspected base. Keep a transport-injected adapter to the exact studio_core.admit_run signature and test transport result mapping in Jest; do not add a public SECURITY DEFINER wrapper or expose studio_core in this packet to get a test green. Live API schema exposure/service binding is a separate reviewed activation prerequisite. Production route remains inactive and its authorization binding returns unavailable.

Root reviews the workflow and launches the exact candidate via the official GitHub path after the held writer finishes. The writer cannot push or dispatch it. Hosted PostgreSQL tests remain NOT_RUN until the actual workflow receipt is reviewed; no full architecture/A1/A2 completion is asserted from this isolated packet.


## Dependency and compiler evidence under the local disk limit

Preparation observed about 5 GiB free on the Mac (root earlier measured about 5.33 GiB); the prepared worktree has no node_modules. Do not run npm ci/install locally or create dependency symlinks without a separate reviewed environment decision. Existing primary Portal node_modules is present with TypeScript 6.0.3, Jest 30.4.2 and ts-jest 29.4.10; this is tool availability, not proof that a new worktree test uses the candidate's dependency graph or compiler configuration.

A supervisor may separately review read-only NODE_PATH/absolute binary reuse. If attempted, record actual executable/package real paths, versions, candidate cwd, rootDir/module resolution/config and locked-version parity before relying on it. Do not install, symlink or edit the dirty primary. A transformed Jest pass or bare tsc file-list invocation cannot count as a TypeScript project check: it can silently pick wrong module defaults, miss candidate dependencies or import ambient globals. Preserve the existing A3 compiler/test receipt and its limits.

Preferred meaningful validation is hosted CI: npm ci from candidate package-lock.json, then invoke candidate node_modules/typescript/bin/tsc explicitly with --noEmit --incremental false --project tsconfig.json. This uses the repository root tsconfig (ES2017 target, esnext/bundler modules, isolatedModules=true, JSX react-jsx, root aliases; existing strict=false) and avoids writing tsbuildinfo. Record any baseline errors honestly; do not alter config/dependencies or count an unexecuted command as PASS.

Additionally generate a disposable focused config under RUNNER_TEMP extending the absolute candidate root tsconfig.json, with absolute includes for the new packet modules/routes/tests, noEmit=true, incremental=false, strict=true, explicit types=[node,jest], and typeRoots pointing ONLY to candidate node_modules/@types. Run candidate tsc --project against that focused config; report it separately from whole-repository typecheck. This catches packet defects without pretending targeted inclusion validates unrelated code. Unit tests use candidate Jest and its checked-in jest.config.cjs; do not suppress diagnostics to obtain green tests.

The hosted job then runs the real isolated PG17 harness and per-table role negatives. Node/type/test passes and SQL passes are separate receipt fields; production RPC exposure/current authority remains unavailable, and any hosted test not actually run stays NOT_RUN.


## File map

- Create `lib/studioRuntime/contracts.ts`: canonical contract mapping, command decoder, request hashing.
- Create `lib/studioRuntime/repository.ts`: typed single-RPC adapter, no transaction emulation through sequential REST inserts.
- Create `lib/studioRuntime/commandAdmission.ts`: reauthorization-before-replay orchestration with injected trusted authorization dependency.
- Create `app/api/content-studio/v3/runs/routeCore.ts`: bounded request/result mapping.
- Create `app/api/content-studio/v3/runs/route.ts`: inactive production composition returning RUNTIME_NOT_ACTIVE; no live client created until activation packet.
- Create `supabase/migrations/20261001000000_studio_command_admission.sql`: additive private tables/function only; 14-digit UTC forward filename verified collision-free at prepared HEAD and observed origin/main. Never use a new 8-digit legacy filename.
- Create `tests/content-studio-v3/commandAdmission.test.ts` and `tests/content-studio-v3/runAdmissionRoute.test.ts`: contracts/orchestration/route tests.
- Create `tests/sql/studio-command-admission.sql`: real PostgreSQL atomicity and privilege tests.
- Create `scripts/test-studio-command-admission.mjs`: disposable-DB-only harness, multiple psql sessions for actual concurrency/crash recovery; no implicit production URL.
- Create `.github/workflows/studio-command-admission-test.yml`: credential-free PostgreSQL 17 isolated hosted test job; no production secrets, migration application or dispatch by writer.

### Task 1: Canonical input and trusted-context boundary

**Interfaces:** Produces `decodeRunCommand(value: unknown): RunCommandInput`, `hashRunCommand(input: RunCommandInput): string`, and the frozen context/result types in contracts.ts. Consumes the canonical spec, not helper submission shape.

- [ ] Write failing Jest tests: unknown actor/project/hash fields reject; equal logical fields with reordered JSON have equal hashes; action/input/expected-version change changes hash; unsafe epoch rejects; all canonical action names decode but confer no permission.
- [ ] Run `npm test -- --runInBand tests/content-studio-v3/commandAdmission.test.ts`; expect missing-module/test failures before implementation.
- [ ] Implement strict decoding and fixed-field hashing in contracts.ts; preserve canonical envelope names and status semantics.
- [ ] Repeat the command; require every contract assertion green.
- [ ] Commit only contracts.ts and its tests.

### Task 2: Private atomic admission authority and real database proof

**Interfaces:** Consumes Task 1 fields. Produces admit_run and `StudioRunRepository.admit(command: RunCommandInput, context: VerifiedCommandContext, requestHash: string): Promise<AdmissionResult>` through one RPC. SQL remains unapplied outside isolated fixtures.

- [ ] Write failing SQL fixtures plus the disposable harness and hosted PG workflow; assert five relation row counts are either all 1 or all 0 after a deliberate intermediate constraint failure.
- [ ] Run `node scripts/test-studio-command-admission.mjs` against an explicitly provisioned disposable local PostgreSQL 17 database; expect missing relation/function failure. Harness rejects unmarked databases and hosted URLs; unavailable isolated PG is BLOCKED_TEST_ENV, not PASS.
- [ ] Add cross-language SQL/TypeScript hash golden tests and supplied-hash/changed-command rejection assertions; require zero rows for mismatches.
- [ ] Add the named fixture-only authority resolver and two-session stale-context/revocation/missing-binding tests described above; explicitly assert all five relations remain empty on denial and that revocation shares the held authority lock.
- [ ] Implement additive migration with the deny-only production authority binding and typed single-RPC repository adapter. Unique scoped key resolves concurrent insert races without duplicate runs; no in-memory check before write serves as authority.
- [ ] Test two independent psql sessions submitting the same tuple/hash: one committed run/stage/outbox/admission/event, both receipts same run. Different hash yields conflict; same key in different tenant/issuer/subject is independent. Replaying a later-state fixture returns its current status and never QUEUED.
- [ ] Kill the submitting connection after commit but before receipt retrieval, reconnect and replay; assert same durable run and unchanged row counts. Kill before commit; assert zero partial rows.
- [ ] For EACH of the five tables test anon/authenticated SELECT/INSERT/UPDATE/DELETE denial; test raw service_role DML denial; test PUBLIC/anon/authenticated function EXECUTE denial and service_role RPC success. Set a hostile search_path and verify no authority hijack.
- [ ] Run harness and Jest repository mapping tests; require actual PG session receipts and all privilege negatives green. Record server version and isolation markers without secrets.
- [ ] Commit migration, repository and isolated tests/harness only; do not amend baseline or existing migrations.

### Task 3: Admission orchestration and inactive API composition

**Interfaces:** Consumes repository plus `authorizeCommand(input: RunCommandInput, identity: VerifiedIdentity): Promise<VerifiedCommandContext>`. Produces `admitRun(input: RunCommandInput, identity: VerifiedIdentity, deps: AdmissionDependencies): Promise<AdmissionResult>` and `handleRunAdmission(request: Request, deps: AdmissionDependencies): Promise<Response>`. `VerifiedIdentity = { issuer: string; subject: string }`, obtained by existing server-side auth verification, never body actor data. `AdmissionDependencies = { verifyIdentity(request: Request): Promise<VerifiedIdentity>; authorizeCommand(input: RunCommandInput, identity: VerifiedIdentity): Promise<VerifiedCommandContext>; repository: StudioRunRepository }`. IDs are generated server-side; the RPC resolves a replay before considering newly generated IDs.

- [ ] Write failing tests: authorization executes before each initial/replay RPC; revoked role denies replay; changed policy/owner/epoch returns conflict; cross-project inputRef denies; SQL timeout/outage returns ADMISSION_UNAVAILABLE with no 202; unexpected DB response fails closed.
- [ ] Run `npm test -- --runInBand tests/content-studio-v3/commandAdmission.test.ts tests/content-studio-v3/runAdmissionRoute.test.ts`; expect failure before implementation.
- [ ] Implement orchestration and routeCore using injected verifier/authorizer/repository. Return 202 with receipt only after accepted/replayed committed RPC; do not call Modal, providers, legacy writers, GitHub or CI.
- [ ] Implement route.ts as inactive composition returning 503/RUNTIME_NOT_ACTIVE before constructing a live DB client. Production identity-to-project and snapshot bindings remain activation prerequisites.
- [ ] Verify anonymous/forged body identity, authorization loss, and bounded response mapping; assert email absent from dispatch material and no published/live-verified field is synthesized.
- [ ] Run focused Jest suite, isolated PG harness and `git diff --check`; require green exact-head evidence.
- [ ] Commit orchestration, route core/inactive wrapper and tests.

## Independent review, activation and recovery

A distinct reviewer checks exact candidate SHA, SQL grants/default privileges/function ownership/search_path, tenant/actor dedupe, retry reauthorization, canonical/helper mapping and raw isolated PostgreSQL evidence. Sol accepts the reviewed engineering packet. Unit/mocked tests prove orchestration only; they cannot certify durability, concurrency, RLS or live CPU.

Before activation: implement and independently review the canonical durable authority binding/shared writer lock protocol; prove current-authority checks under concurrent changes (fixture evidence alone is insufficient); reconcile fresh main and applied custom ledger/hashes; verify actual private schema ownership, effective grants and project bindings; integrate reviewed policy/owner/epoch snapshot authority; disposition/harden every reused legacy sink; verify scoped service credential behavior, backup/restore and rollback; complete measured authenticated HTTP CPU/payload evidence and official release path. Outbox dispatcher/claim fencing/reconciler must exist and pass fault tests before enabling a command that promises background execution. Do not acknowledge queued work with no admitted consumer.

This packet neither builds a second scheduler nor changes legacy writers. It provides no dispatch, worker, artifacts, permits, release, cutover or complete A1–A7 claim. P12/P13 remain downstream outcomes and are not a prerequisite to isolated local engineering.

Recovery: before ambiguous retry inspect durable tuple/hash/receipt and job state. Roll back engineering by reverting the reviewed branch change; no destructive migration rollback or live data deletion. Any later additive migration application belongs to a separately reviewed official release packet.
