# Durable Content Studio authority engineering plan
Status: READ_ONLY_PLAN / NEW_PLANNED / NOT_ADMITTED. Prepared 2026-10-02 UTC.
This plan does not release A0, replace normative documents, apply a migration, or enable a command. A0 map v3 is not accepted. Production command composition and lock_current_command_authority remain deny-only until the binding and writer closure below are accepted.

## Exact sources
Repository kylemwalkerpr-ship-it/portal; observed origin/main 010407026438a3f68e063f41ae0c0cd778ac6d50. Read source worktree HEAD c305086c59d83f50135edd367f0d5e8399879619; no fetch, source edit, or business-row query performed.
All eight released manifest file hashes match. Architecture CS-2026.09.23.8 SHA256 86fb7d46843c7cbb8afb063bd53ec2e2127bf400d8b9baa32469870bf9b49623; blueprint 7423acaa8fdb4f31937bbeec2e637c885293202fdc8da620a1961265633e2366.
Frozen command-admission plan read via git show c305086...:docs/superpowers/plans/2026-09-30-studio-command-admission.md, SHA256 4070eee984ce5bcb365e3e5dae3b5c214a8574d1630283364da819b8a5eaf89e.
Normative sections: N3/N5 (hash domains/Stored envelope); 7.6.1 (row locks/CAS, transaction clock, no session advisory locks); 8.1/8.3/8.4 (one evaluator, every sink, immutable gates); 9.2/9.6/9.7/9.8 (private authority, append-only history, forward migrations); 11.2.1/11.4.1 (stable intent key; owner projection); 17.1/17.3/17.4 (estate registry/reservations); 24.3–24.5 (legacy disposition and cutover).
AGENTS.md official release path and branch discipline were read.

## What is missing
The frozen admission packet defines an integration seam, not its actual authority owners. Clerk verification and public.profiles admin/status can establish existing operator authentication; neither is a durable tenant-project, object or action grant. The reviewed helpers are pure proposals, not durable owners. No production bootstrap grant, project UUID, blanket admin scope, gate PASS or approved fixture row is invented here.
The new resolver must not derive current permission from p_context, matching request hashes, fixture tables, model recommendations, ambient request state, or copied human credentials.
The seven estate hosts are not seven tenant UUIDs. Supabase project ref is not tenant projectId. Exact project creation and host/repository membership must be an accepted authority source operation.

## Frozen interface, unchanged
studio_core.lock_current_command_authority(
 p_project_id uuid, p_actor_issuer text, p_actor_subject text,
 p_action_kind text, p_subject_id text, p_input_ref text,
 p_snapshot_ref text, p_authorization_evidence_id text
) returns jsonb.
Unavailable: {available:false,reason:'AUTHORITY_BINDING_UNAVAILABLE'}.
Available durable result carries available,allowed plus the thirteen binding fields:
projectId, actorIssuer, actorSubject, actionKind, subjectId, inputRef, snapshotRef,
authorizationEvidenceId, ownerVersion, policyVersion, authorityEpoch.
Correction to cardinality: that named list contains ELEVEN binding identity/version fields; including available and allowed the successful object has THIRTEEN total fields. Preserve the exact list and successful JSON contract from frozen plan; do not manufacture two extra identity fields from the shorthand phrase “13 return fields”.
DecisionId is a trusted admission context/audit binding, not an extra resolver return field.

Checks under held locks: server-resolved project active; verified issuer/subject bound to current permitted membership and exact action/object; subject resolves in same project; sealed input belongs to project/subject/action and exact immutable payload digest; current policy snapshot/gate evidence exists, unexpired, unsuperseded, scoped, not revoked; owner version and epoch current; required sources/reviewer evidence current; operation deterministically permitted. allowed=false does not permit anything. Missing source owner means unavailable, not empty/default owner.
admit_run compares the durable return to BOTH expected command versions and trusted context, before replay lookup or five inserts. Same-key replay after revocation must deny. The six-field studio.command-request/1 hash is separate from structured policy/contract hashes and never grants permission.

## NEW_PLANNED physical storage decomposition
These names/columns are proposed implementation mappings, not existing production relations and not a replacement normative payload definition. Before SQL admission the registry packet must define strict payload schemas and exact authority-source provenance. Every immutable fact uses Stored<T> physical columns project_id,object_id,object_version,schema_version,created_at,source_run_id nullable,payload,payload_hash,hash_domain,serializer_version nullable, plus typed composite FKs. Hashes are lowercase64hex; counters are nonnegative safe-integer BIGINT. No arbitrary mutable approved JSON blob.

| Planned relation | Projection/version responsibility |
| --- | --- |
| studio_core.studio_projects | Stable tenant project UUID and immutable project registration versions; state and provenance from approved registry operation. No auto-create from request host. |
| studio_core.studio_authority_current | One CAS row per project: row_version,authority_epoch,current_policy_snapshot_ref,active. This row is the serialization root, not an editable program gate. FK exact immutable project/policy versions. |
| studio_core.studio_principal_bindings | Immutable binding of exact verified issuer+subject to approved project principal; lifecycle changes append events, current pointer CAS. No email identity, user_metadata or fabricated membership. |
| studio_core.studio_authorization_evidence | Immutable project/principal/action/object-scoped decision evidence with rule version, exact evaluated inputs, expiry and authorizer provenance; revocation separate append-only fact/current projection. No authority from schema-valid evidence alone. |
| studio_core.studio_policy_snapshots | Immutable versioned sealed evaluator/applicability snapshot and source pins; a trusted policy role alone seals accepted snapshots. Program gate projection references canonical evidence, never changes history. |
| studio_core.studio_subject_bindings | Immutable project/object identity and kind linking accepted stable intent/route/opportunity/source subject; missing/ambiguous references stay unresolved. |
| studio_core.studio_sealed_inputs | Immutable project/subject/action-bound input reference, registered hash domain/serializer, exact payload/artifact digest and provenance. A mutable source URL cannot be input authority. READY artifact proof required where applicable. |
| studio_core.intent_owners | Canonical planned registry name §17.1, immutable ownership versions and one current CAS projection per stable resolved intent. Unique project+stable intent key; unresolved jurisdiction is not a wildcard. PRIMARY_OWNER_OF graph is read-only projection. |
| studio_core.route_reservations | Canonical §17.1 project/host/path and intent reservation; unique live collision key, version/fence, expiry and unresolved external-write hold. Not the old active-job partial index. |
| studio_core.studio_authority_events | Append-only transition/revocation/seal/epoch events with source/version references and operation identity. A retry cannot emit duplicate business events. |

Avoid independent generic grant evaluator tables. Exact principal grant/remit representation remains a design-freeze dependency; this plan does not pretend it is present in the canonical registry. Append-only versions and narrow CAS current rows must be explicit in migration, not updates to immutable history.
Inputs/ownership may need more than these relations (estate route/repository/host snapshots, source/reviewer state). Their canonical owning packets retain authority; resolver consumes exact project-scoped pointers. Do not duplicate them in a single grant blob.

## Shared transaction protocol
One ordering for every accepted owner/policy/principal/evidence/input/epoch mutation:
1. project authority root SELECT FOR UPDATE; reread current active/epoch AFTER acquisition.
2. current policy boundary and exact sealed policy snapshot; validate under the root lock.
3. owner/subject boundary, then exact principal/evidence/input rows; sort multiple object keys deterministically and lock current projections before immutable versions.
4. scoped admission identity key (project,issuer,subject,key) only after authority locks.
5. run/stage current rows, if the operation reaches runtime.
All locks held through commit/rejection. Row locks are primary. Any advisory locks must be transaction-scoped, documented, acquired by every real writer and used only to cover a missing-row key; they do not replace rereads or root row locking. No SKIP LOCKED for owners; it is queue claiming only. Missing serialization root fails unavailable rather than creating it on admission.
Clock checks use database time after locks; no external network during transaction. Defaults 1s lock/3s statement budget are proposed acceptance values requiring measurement. Commit order determines revocation behavior: revocation first -> rejection; admission first -> revocation waits; subsequent replay always reauthorizes. Every authority change advances its own projection version and appends provenance; epoch movement uses explicit accepted transition, not an arbitrary increment clearing facts.
Migration-only owner role is NOLOGIN; application roles cannot raw-update current roots or historical records. Otherwise ALL-writer claim is false.

## Planned functions and callers
All function names below except frozen resolver are NEW_PLANNED, require distinct review, explicit arg types and response schemas before code. One transition entrypoint accepts a closed operation enum, exact expected versions and trusted source evidence; it is not dynamic SQL or arbitrary table write.
- studio_core.transition_command_authority: project registry binding, accepted principal binding/revocation, policy seal/activate/invalidate, owner/subject/input changes, epoch movement. Only a reviewed dedicated authority service role can invoke operation-scoped functions. No permissive catch-all service_role EXECUTE grants.
- studio_core.read_command_authority_projection: bounded current server-only read for authorizeCommand; it is a prior observation and NEVER replaces transaction-time resolver.
- Existing studio_core.admit_run calls frozen resolver inside its transaction; TypeScript lib/studioRuntime/commandAdmission.ts remains reauthorization-before-replay.
- New lib/studioAuthority/{contracts,repository,authorizeCommand}.ts consume strict registry types and a single transactional transition transport. No production route composition enabled.
- Claim, seal, review, permit issuance/consumption and release final checks call the same authority validation/lock protocol at their protected transition. No application-only lock around separate REST requests.

Observed legacy closure corpus (actual source reads; not exhaustive A0 release):
| Existing path/functions | Disposition before positive activation |
| --- | --- |
| lib/seoFactory/ownership.ts resolveOwner/listRegistry | Read/import accepted existing owner evidence; never model-minted owner. Canonical owner cutover needs exact old-row provenance and parity. |
| lib/seoFactory/persistContentJobCore.ts persistPipelineJob; persistContentJob.ts wrapper; pipeline.ts/pipelineStream.ts/reviewSnapshots.ts/postPersistInterlinkBind.ts callers | Legacy job writes stay legacy-only while drained; new protected commands cannot bypass v3 admission. Class cutover must prevent two schedulers. |
| lib/seoFactory/writingContractStoreCore.ts persistWritingContract,attachWritingContractToJob,reserveOpportunityJob,releaseOpportunityReservation | Seal/reservation wrappers must use accepted version and common transition or fail for v3. Existing raw content_jobs updates cannot advance v3 authorities. |
| same file claimContentStudioExecution,renewContentStudioExecution,assertContentStudioExecution,releaseContentStudioExecution; four corresponding SQL RPCs | Preserve exact old fence during drain. New attempts use reviewed run/stage/attempt authority, no mid-attempt runner switch. |
| lib/seoFactory/researchEvidenceStore.ts persistResearchEvidence; suggestBriefContractCore.ts | Immutable evidence import with lineage; attaching new evidence cannot synthesize gate pass or mutate sealed inputs. |
| lib/seoFactory/contentStudioPipelineCore.ts persistExecutionFailure/persistExecutionStage | Exact attempt/fence/authority transitions or explicit legacy drain scope. |
| app/api/content-studio/jobs/legacyCore.ts POST/PATCH/DELETE; jobs/route.ts POST/PATCH/fencedPatch; strictManualPublication.ts fencedUpdate/strictManualPublicationPATCH | Guarded compatibility mapping or safe rejection; inline release/merge retired. Review/stage booleans do not authorize release. |
| app/api/cron/content-studio-retry/route.ts POST and reconcile-content-jobs/reconcile-incidents plus SEO-engine scheduled writers | A0 exact corpus/disposition prerequisite: absorbed/read-only/retired. Do not enqueue same class while old cron owns it. |
Unknown writers discovered by import/call graph, SQL catalog function bodies, workflows, direct table grants, maintenance scripts or service credential holders default deny until mapped. Source regex scan is not exhaustive proof. A trigger recording changes would detect bypass but cannot transform an unauthorized raw service write into trusted authority; revoke direct DML and use transition APIs.

## Minimum packet sequence and acceptance
A1.AUTH.1 (smallest safe disjoint code packet): strict authority request/result codecs and lock protocol contract, inactive repository adapter, real isolated PG17 negative fixtures and concurrency harness. Fresh main worktree. NEW_PLANNED files:
lib/studioAuthority/contracts.ts, lib/studioAuthority/repository.ts, tests/content-studio-v3/authorityContracts.test.ts, tests/sql/studio-authority-locks.sql, scripts/test-studio-authority-locks.mjs.
Consumes completed strict registry; fixture resolver lives ONLY disposable test DB. No production migration or positive authorizeCommand. Tests true current/stale/unknown and source bindings; deny-only production always unavailable. This progresses engineering without inventing bootstrap policy.

A1.AUTH.2 private scaffold: generate a NEW timestamp migration with verified Supabase CLI 'supabase migration new studio_authority_scaffold' (discover --help/version; never invent final timestamp filename). Installs reviewed inert records, FKs, RLS, default grants, dedicated roles and deny-only resolver. No seeds/bootstrap grants/policy activation, no exposure wrapper. Root must review migration auto-apply consequences independently; merging SQL can apply production under existing workflow. Fixtures use only new migration in disposable PG, never batch production migrations.

A1.AUTH.3 durable source bindings and evaluator: after accepted A0 mapping, explicit project/principal owner, strict registry schemas and policy applicability freeze, implement authoritative transition APIs and resolver using accepted durable owners. Gate/source/reviewer facts and snapshots link exact provenance; fixture-only allowed evidence cannot populate production. Review exact migration/API candidates and execute real concurrent PG tests before acceptance.

A1.AUTH.4 all-writer closure/cutover: exact code+SQL+credential graph; disposition and wrap/retire corpus; grants prohibit raw v3 state writes; legacy jobs drained at pinned runtime; shadow parity and rollback accepted. Every real policy/owner/revocation transition shares locks. Only then may root decide positive authority commissioning.

A1.AUTH.5 command/dispatcher activation: distinct release with actual service transport/schema exposure/role probes, production restore and backup evidence, exact lineage, measured authenticated resource budgets and an admitted outbox consumer. Keep v3 route 503 until no queued promise lacks a real consumer. CREATE/publication and P12/P13 remain separate eligibility/outcomes.

## Deterministic test vectors (real multi-session PG)
1 Missing root/project/principal/policy/evidence/input/owner -> unavailable/denial; zero five admission rows.
2 Exact issuer+subject collision, project isolation, cross-project FKs; email change never changes identity; forged client context cannot insert.
3 Stale owner, policy, epoch after authorization pause -> expected version conflict, no rows.
4 Revocation committed before admission -> forbidden; held admission blocks revocation on SAME root; after revocation equal-key replay denied despite existing run.
5 Policy snapshot expiry evaluated after lock wait; valid-at-request but expired-at-lock denies.
6 Owner/reservation concurrent same intent/path -> one authority; unresolved owner cannot be read as empty; missing root cannot be raced into existence.
7 Sealed-input hash/action/subject/project change -> mismatch/denial; mutable input cannot be sealed from caller-supplied digest.
8 Rejected transition/CAS stale version -> zero projection/event writes; accepted operation retry -> one event and same result.
9 Reordered multi-object operations do not deadlock under common sorted order; lock/statement timeout returns truthful unavailable, no partial writes.
10 Each table raw SELECT/INSERT/UPDATE/DELETE negatives per PUBLIC/anon/authenticated/service_role; exact approved function rights only; hostile search_path and function shadowing inert; migration-owned NOLOGIN role not reachable by app membership.
11 Snapshot/model/retrieval candidate cannot mutate owner/gate; invalid exception/expired permit/missing human review stays denied.
12 Backup/restore of authoritative versions/current pointers and unreconciled reservations preserves epoch; old credential/worker cannot write restored/new epoch (production recovery evidence separate from fixture test).

Isolated fixture PASS proves implementation behavior only. Actual source grants, production transport/API, Cloudflare CPU and recovery NOT_RUN until exact evidence. Cross-language structured hash parity required before SQL independently verifies structured snapshots; use existing TS serializer, do not reconstruct it with jsonb::text.

## Grants, recovery and release limits
Private schema not exposed to anon/authenticated; revoke default PUBLIC EXECUTE for every new function within creation transaction. Service roles receive USAGE and exact RPC EXECUTE, no CREATE/raw DML. Function owner has narrow required table privileges, safe fixed search_path and fully-qualified objects; SECURITY DEFINER justified only at audited private transition boundary. Separate trusted policy sealer, worker and release credentials; existing service-role bypass means effective grants/API tests mandatory.
No destructive rollback. Disable behavior/reinstall deny-only resolver through a forward reviewed change; preserve immutable evidence, in-flight states and source-version pointers. Root records prechange database/artifact backup, expected lock/statement budgets, exact ledger hashes and poststate catalog. Schema DDL and behavior enablement separate releases.

## Explicit unresolved decisions
Accepted A0 full writer/credential inventory; actual tenant UUID/source and bootstrap operation authority; verified issuer/project mapping; object-scoped principal grant/remit model; exact canonical subject/action applicability and owner import/cutover; versioned policy evaluator snapshot schema/serializer; evidence/gate/reviewer expiry/revocation source owners; immutable sealed-input/artifact READY binding; production private SQL transport and least-privilege credentials; migration ledger divergence owner; backup destination/restore drill; measured CPU/lock budgets. Root can make scoped engineering design decisions under user authority but no plan or fixture substitutes for these facts.

Official docs consulted 2026-10-02: https://supabase.com/docs/guides/database/functions (security invoker default, fixed search_path/EXECUTE restrictions); https://www.postgresql.org/docs/17/explicit-locking.html (row locks/transaction lock lifetime/order). Changelog markdown fetch failed (web unsupported content-type; remote URLError); no Supabase implementation performed. Fetch current changelog successfully before any actual feature implementation.
