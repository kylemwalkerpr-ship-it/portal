# Estate-wide CMS Implementation Contract

**Version ECM-2026.09.25.1** · Implementation contract · **Design only; every new path disabled**

This document translates the normative Content Studio architecture into testable storage, transition, and adapter contracts for an estate-wide CMS. It does not supersede or amend the architecture. Where this contract is less specific, the architecture controls. A conflict blocks the affected implementation until a versioned correction is reviewed.

## 1. Authority, provenance, and current status

### 1.1 Exact source pins

| Source | Pin | Use |
|---|---|---|
| Repository base for this document | `main` / `a77a4626c7223a25c7f70e11a8031d85aa52d396` | Exact source tree from which this contract was authored. |
| Normative architecture | `docs/superpowers/specs/2026-09-22-content-studio-revamp-architecture.md`, version `CS-2026.09.23.8`, released source commit `22c685e38d46367eec18332f264b7f1480d8305e` | Sole normative design authority. |
| Prior reviewed design final | thread `01a0d862-1abf-7c22-a32a-6e75efb63969` | Required design review provenance. The thread body was not available in this authoring environment; no additional claims are attributed to it here. |
| Reviewer corrections final | thread `01a0d866-260f-7193-9773-9df104964b8f` | Required correction provenance. The thread body was not available in this authoring environment; no additional claims are attributed to it here. |
| Frozen migration manifest | `supabase/migration-baseline.json`, generated `2026-09-16T00:37:03.553Z` from repository `kylemwalkerpr-ship-it/portal` at `39e43edbb06ba47893235ba0a6972eb0cff59db2`, 69 files | Historical frozen baseline input; not a current live ledger. Never rewrite it to reflect later migrations. |
| Current repository phase record | `docs/superpowers/seo-parity-matrix.md`, blob `0d2e1f5ed78adaf48334f87a21caa9a602e398cd` as cited by CS-2026.09.23.8 | Dated architecture evidence: P9–P11 IN_PROGRESS and P12–P13 PENDING in its cited snapshot. Re-pin before implementation. |
| Supplied live ledger observation | Sol live query, `2026-09-25T11:59:57Z`: five applied ledger hashes reported positive | Limited observation only. The raw five-row extract is attached below; it establishes only those recorded applications. It does not establish the whole ledger, extensions, capacity, quota, backup/restore, or Worker role. |

The five-row query result is attached below. The prior final-thread transcripts remain separate review provenance; do not treat their absence from this document as a missing live-ledger row. Before dependent migration work, reconcile the complete ledger and verify post-state. Keep evidence identity separate from the interpretation derived from it.

### 1.2 Established and unresolved

**Established by the pinned repository/design:** the architecture requires a single owner per decision domain, a durable Postgres run authority, fail-closed fencing, purpose-scoped single-use permits for external writes, explicit decision traces, dependency-aware invalidation, source provenance, estate route/intent ownership and reservations, and resource accounting that distinguishes unknown from zero. Current run lease RPCs and legacy ownership/reservation paths are migration inputs and must not be assumed equivalent to their successors.

**Reported, narrow live observation:** five applied migration ledger hashes tested by Sol's query were positive at the timestamp above. The raw five rows are attached below; they do not represent the complete ledger. Do not infer which additional migrations are applied from the repository, frozen baseline, or these five matches.

**Unresolved prerequisites:** complete live migration ledger and drift reconciliation; `pgvector`/`pg_jsonschema` (or reviewed alternatives) availability and versions; live schema/grants/RLS; table/index sizes and capacity forecast; backup destination and successful restore drill; actual active Worker/service role and its effective privileges; measured request-plane CPU/telemetry and Cloudflare plan; Modal/Jev/account capabilities, quotas and current costs; qualified reviewer capacity; A0.4 legacy disposition and A0.5/A0.6/A0.7 evidence. The active Worker role is not established by a repository role name or deployment history.

**Holds:** A0.2 and A0.3 are held pending their complete evidence packages. A0.4–A0.7 are specified dependencies, not recorded as complete. P9–P13 retain the canonical matrix status and controls; this contract changes none of them. All new CMS write, decision-authority, migration, provider, publication, CREATE, and activation paths remain disabled. Read-only documentation work is not evidence that any operational gate passed.

### 1.3 Raw five-row applied-ledger extract and post-state

Read-only SQL against project `yousafe-saas` (`krggzrxxnqfsbbklatxl`), database `postgres`, observed `2026-09-25 11:59:57.595724+00`. Source: `supabase_migrations.yousafe_migration_ledger`, filtered to these five filenames. Values below are the raw returned columns, not a complete ledger.

| filename | sha256 | applied_at (UTC) | source_git_sha | applied_by |
|---|---|---|---|---|
| `20260914_content_studio_evidence_contract.sql` | `6d9cfaf327b0f2813e97a4e3abeb0c8812140172ab5985e0b47223098b6d48d4` | `2026-09-16 07:53:44.755092+00` | `39e43edbb06ba47893235ba0a6972eb0cff59db2` | `adoption-baseline` |
| `20260915_content_studio_execution_lease.sql` | `d7c3d7bd10141bc1ada29a02d71a78afc6d3ff5952dcc3b4c4b2b8b2401793f0` | `2026-09-16 07:53:44.755092+00` | `39e43edbb06ba47893235ba0a6972eb0cff59db2` | `adoption-baseline` |
| `20260916122441_content_studio_provider_parity.sql` | `554a2a5c044d0037626738af4fe55c8e48f49659c8138a4531085f3f496fbf86` | `2026-09-16 13:34:33.420263+00` | `958de55ccba51d87221584a0caee645f25f0048f` | `ci-runner` |
| `20260917173300_base_table_least_privilege.sql` | `355eb0e63ff1cae553cac07e330bf0e8207a0ceafbfb9e362856c5c0b5f4a277` | `2026-09-17 18:14:03.941539+00` | `5429e5a124aa25df7d771fada50741a234a21d3b` | `ci-runner` |
| `20260920130000_seo_interlinks_verification_truth.sql` | `51ff7a204c9c18b3128cf4335b136c1381a1b4232aaedb3bdb639bc57fce9a01` | `2026-09-21 03:01:53.096291+00` | `ab6305a7c5c362f01b46947e53be0e462772c88e` | `ci-runner` |

Post-state read at `2026-09-25 11:59:55.184436+00`: `content_jobs`, `content_studio_evidence_items`, `content_studio_stage_events`, and `content_studio_writing_contracts` each have RLS enabled, FORCE disabled, anon SELECT/INSERT false, authenticated SELECT false, service_role SELECT true; policy counts are 1, 0, 0, 0 respectively. `seo_gate_runs` and `studio_specialist_signals` each have RLS enabled, FORCE disabled, anon SELECT/INSERT true, authenticated SELECT true, service_role SELECT true, one policy. This database snapshot establishes neither active Worker credentials nor complete capacity or migration reconciliation.

## 2. Contract-wide invariants

1. Postgres is the only authoritative store for run/stage state, owner/reservation state, approval state, permit state, and the resource ledger. Artifacts and external providers are not state authorities.
2. The current `claim_content_studio_execution`/renew/check/release lease is a legacy execution lease. It does not fence a new durable `Run`/`Stage` transition. Never use one token in place of the other or claim parity without A0.3 evidence and A2 tests.
3. Every mutation checks project scope, actor authorization, aggregate version, applicable authority epoch, and the current purpose-specific fence in one transaction. Missing/unknown evidence is a denial with a reason, not a permissive default.
4. A transaction records external-write intent and its permit before any network call. No network call occurs while holding a database lock. An uncertain result is reconciled; it is never blindly retried as a new write.
5. Decision recommendations cannot set ownership, approve YMYL claims, issue permits, pass gates, or trigger external effects.
6. There is no universal freshness TTL. Each source declares its own validity and invalidation rules. Unset or unsupported expiry is explicit and blocks the dependent consequential action where currentness is required.
7. `NO_ACTION`, `ABSTAIN`, and `FAIL` are distinct decision outcomes. Capacity pressure, model confidence, or missing data cannot rewrite one into another.
8. Numeric CPU, compute, storage, cost, or quota values require measured source evidence and units. Do not insert architecture examples, estimates, or vendor defaults as observed values.

## 3. Logical schema and dependency order

These are logical records and constraints, not SQL definitions. A0.3 must map each to an existing authoritative relation or propose a reviewed forward-only migration. There is no migration in this change.

| Order | Logical records | Required dependencies and invariants |
|---|---|---|
| 0 | Existing project/actor/role registry; source-binding and schema-version registry | Project identity comes from authenticated server context. A request-supplied project or role never grants access. Source binding pins source, account/property scope, adapter/schema version, secret reference, data rights, and source-specific freshness/invalidation policy. |
| 1 | `estate_repository`, `estate_host`, `estate_route`, route observations/snapshots | Repository and host are registered before route inventory. Route key uses a pinned normalization version. Unknown/inaccessible hosts are quarantined and prevent an estate-wide completeness assertion. |
| 2 | Semantic entities/aliases, identity versions, intent records, intent-owner projection, route/slug reservations | Resolved jurisdiction/entity/reader job and stable intent identity precede ownership. Aliases may remain ambiguous. Unique constraints enforce at most one active primary owner per normalized intent and one active reservation per normalized route/slug key within its declared scope. |
| 3 | Source runs, immutable evidence/artifact manifest, observations and metric projections | Every observation references a source run, source binding, scope, window, retrieval time, schema/adapter version, and exact source artifact or permitted evidence digest. `unavailable`, `partial`, `empty`, `failed`, and numeric zero remain distinct. |
| 4 | Claims, claim-source edges, claim validity, YMYL approvals, approval dependency edges | Claims link exact source passages/facts and jurisdiction/effective period. Approval binds reviewer principal/credential remit, exact content revision/render hash, exact claim set, policy version, and source support fingerprints. |
| 5 | Decision records and decision-trace events | Immutable input snapshot, evidence IDs/watermarks, policy/scorer/model pins, considered choices, rejected choices and reason codes, uncertainty, outcome, and any selected action are recorded before downstream work. |
| 6 | Durable run, stage, attempt, checkpoints, outbox/inbox receipts | Run creation, initial stage, dispatch outbox, reservations, authority/policy snapshot and idempotency key are committed atomically. Execution fence and stage lease are independent of the existing legacy job lease. |
| 7 | External-write intents, permits, observations/reconciliation receipts | Intent refers to immutable reviewed payload hash, sink, target, purpose, authorization/evidence, expiry/revocation dependencies, idempotency key, and expected generation. Permit is purpose-bound, one-use, atomically consumed before dispatch. |
| 8 | Projected, observed, reserved, charged resource events and account projections | A resource reservation is admitted only against an established cap and known remaining headroom. Unknown charge remains reserved/unknown; it is never cast to zero. Event sources and dedupe keys are provider/call-specific. |

Foreign keys are project-scoped. Append-only facts/events are distinct from current projections. Projections update with compare-and-swap versions. Deletion defaults to restricted/tombstoned history. Only reviewed migrations may add physical state, after A0 gates, legacy mapping, RLS/grant review, backup/restore proof and migration-order checks.

## 4. Durable run and stage fencing

The existing job lease protects its existing job lifecycle only. The durable CMS execution protocol adds `run_id`, `stage_id`, `attempt_id`, monotonically increasing `stage_fence`, lease owner/expiry, `input_hash`, `policy_version`, and checkpoint/output references. A lease timeout makes the stage eligible for recovery; it does not make an old worker current again.

Each stage claim increments the fence under a row lock or equivalent serializable transition. Every heartbeat, checkpoint, completion, failure, cancellation, and reservation conversion supplies the current fence and an unexpired lease. The database transition rejects a stale fence even if the legacy job lease still appears valid. The old lease likewise cannot authorize a durable transition. Outbox delivery is at-least-once; inbox receipt means only that the event was seen, not that the business transition completed.

Run submission transaction: validate actor/project/idempotency; read current authority and policy versions; reserve any required identity/resource capacity; insert run + stage + outbox + immutable decision/gate snapshot; commit; return run identity. Dispatch and all provider/model/release calls happen after commit. Reconciliation repairs expired dispatch claims and unknown external outcomes using stable idempotency keys and provider readback.

## 5. External write intent and permit protocol

### 5.1 Intent record

`ExternalWriteIntent` is immutable after sealing and contains: `projectId`, `intentId`, `runId`, `stageId`, `sinkKind`, `sinkIdentity`, `targetIdentity`, `purpose`, `payloadHash` and hash domain, exact candidate/revision/head identifiers, authorization evidence ID, decision ID, policy/authority versions, prerequisite approval IDs, idempotency key, expected external generation, created time, expiry/revocation dependencies, and status (`prepared`, `permitted`, `dispatching`, `succeeded`, `rejected`, `unknown`, `reconciled`, `cancelled`). Credentials are references held by the authorized sink adapter; they are never included in the intent or decision payload.

### 5.2 Permit semantics

`ExternalWritePermit` binds exactly one intent, payload hash, sink, target, purpose, authorization, current policy/authority epochs, approval set, and expiration condition. It is single-use. In one Postgres transaction, consume the permit and append a dispatch attempt before the adapter can call the sink. Unique constraints prevent a second consumption. A failed pre-dispatch transaction permits no external call. After consumption, failures require reconciliation/new intent and new authorization where policy says so; a consumed permit is never reset.

Permits are revoked before dispatch when any bound revision, owner, policy/authority epoch, required source support, reviewer credential, approval, target ownership, or sink configuration changes. Expiry is policy/source-specific, not a shared duration. A permit whose expiry rule is absent for a consequential write is not issuable. A transport timeout after dispatch yields `unknown`, retains resource reservation, and triggers sink readback/reconciliation rather than a duplicate write.

## 6. Decision trace and outcome semantics

Each immutable `DecisionRecord` captures: the normalized question; decision-state hash; project and estate snapshot; source watermarks and health; claims/owner/policy versions; deterministic features with definitions; model/provider/version and exact request/response hashes where used; alternatives evaluated; explicit accepted/rejected choice list with machine-readable and human-readable reasons; uncertainty and missing evidence; reviewer/actor; selected outcome; and downstream run or no-op reference. Sensitive raw inputs stay in governed artifacts, referenced by access-controlled IDs and exact digest.

Closed outcomes:

| Outcome | Meaning | Required behavior |
|---|---|---|
| `NO_ACTION` | Evidence was sufficient to decide that no intervention is warranted for this decision scope/window. | Persist the rationale, rejected interventions, evidence snapshot, policy version, and next re-evaluation trigger if any. It is a completed business decision, not failure or missing work. |
| `ABSTAIN` | Decision cannot safely choose because evidence is missing/ambiguous/conflicting, policy is outside scope, or the bounded decision process declines. | Persist the precise blocker and recovery path. Do not imply that doing nothing was affirmatively selected. No protected action follows. |
| `FAIL` | An attempted operation encountered a technical/permanent/retryable error or violated an invariant. | Persist error class and stage/attempt; follow bounded retry/reconcile policy. Do not relabel it as `NO_ACTION` or `ABSTAIN`. |
| `SELECTED_ACTION` | One allowed intervention is chosen with adequate evidence and eligibility. | It only creates a proposal/run. It does not authorize a protected write or publication. |

An empty candidate set is not automatically `NO_ACTION`: if discovery coverage is incomplete or required sources are unavailable, record `ABSTAIN`. A policy rejection is a rejected choice with a trace reason; it is not a hidden omission.

## 7. Claim validity and dependent YMYL approval invalidation

Each source binding declares `validityRuleId`, source-specific expiry semantics, invalidation events, jurisdiction/scope, and whether source health is required at approval or dispatch. Rules may be event-based, source-issued effective dates, provider watermarks, recheck requirements, or an explicitly reviewed time limit. No system-wide freshness duration is defined here.

For each claim, persist source IDs and exact passage/fact versions, authority class, scope/jurisdiction, effective interval, retrieval/observation time, source health, and support fingerprint. A source update, withdrawal, contradiction, jurisdiction mismatch, effective-date boundary, credential revocation, changed claim bytes, changed render, changed owner, or changed policy creates an append-only invalidation event. Traverse explicit dependency edges; invalidate exactly dependent approvals and unconsumed pending permits. Never rewrite an approval to look current. A YMYL approval remains valid only for its bound reviewer credential/remit, exact revision/render, exact claim dependencies, and current source validity rules. Re-review creates a new approval record.

At review, release-intent creation, and permit consumption, re-evaluate all relevant validity predicates. Invalid/unavailable support blocks the claim or dependent action according to policy. An unrelated source or claim change must not invalidate approvals without a dependency edge.

## 8. Provenance, estate ownership, canonical and slug reservations

### 8.1 Provenance contract

Every source observation records connector/source identity, account/property scope, collection method/version, retrieval time, effective window, coverage/completeness, health, license/retention class, raw artifact locator or exact digest, and normalization/schema version. Derived values record parent evidence IDs plus method/version. Human review records principal, remit credential version, action, time, and exact reviewed hashes. A URL or model statement alone is not evidence. Ingestion/provider failure is not zero.

### 8.2 Ownership and route identity

Register every repository, host, route, canonical relationship, and route observation with source revision/time and normalization version. Estate completeness includes inaccessible/unknown hosts explicitly. Intent identity includes jurisdiction, entity/program, audience and reader job as required by the architecture; text similarity only discovers collision candidates. One authority assigns the primary intent owner. Alias or label changes cannot silently transfer ownership.

Before an action that proposes or changes a URL, transactionally reserve both the normalized semantic intent and normalized route/slug key in the declared host/repository scope. Check current owner version, canonical graph, redirects, tombstones, route history, live observation, pending reservations, and external ownership conflicts. An active or live owner blocks duplicate creation even when a prior job reservation expired. Canonical targets must resolve inside a registered estate and pass policy; no model-minted host/path is eligible. Reservation expiry releases only the temporary hold; it never deletes owner or route history.

## 9. Resource ledger: projected, observed, charged, unknown

Keep separate records for (a) projected consumption and estimate method/version, (b) reserved headroom, (c) observed physical usage with meter/source/window/units, and (d) charged amount/currency and billing source/window. Each field includes state, not just a number. State set: `known`, `unknown`, `unavailable`, `not_applicable`, `estimated`. Zero is a known numeric measurement with evidence; null/unknown cannot be summed as zero. Estimates retain bounds/confidence and never become charges. Currency is explicit.

Admission checks the established hard cap, existing reservations, unknown-charge reserve and applicable source quota in a serializable/locked account transition. If cap, remaining capacity, units, or billing telemetry are unknown, budget-sensitive work abstains/blocks. After a provider call, reconcile by provider call ID/idempotency key and retain uncertain costs as reserved until resolved. Never infer CPU from wall time or invent cost from an unverified rate. The ledger is not established by this document: caps, quota, backup destination and metering truth require A0.3/A0.7 evidence.

## 10. A0, phase, and activation gates

| Gate | Required evidence before dependent implementation or activation |
|---|---|
| A0.2 — held | Pinned `main` and P0–P13 matrix; measured request-route CPU/bundles/import graph/payloads; authoritative Cloudflare telemetry and plan/limits; cron disposition; history of resource-limit incidents; signed stay-free/paid baseline decision. |
| A0.3 — held | Full live ledger rows reconciled by filename and hash to frozen baseline and current forward migrations; the five positive rows retained as partial evidence; execution-lease and provider-parity status; extensions/versions; live schema/grants; table/index sizes, quota/utilization/forecast; approved backup destination and successful restore drill; forward-only discrepancy plan. |
| A0.4 | Complete legacy subsystem/table disposition (`REUSE`, `WRAP_TEMPORARILY`, `MIGRATE_STATE`, `REPLACE_AND_RETIRE`), invariants, single-authority cutover, rollback and dual-run end conditions. |
| A0.5 | Effective grants/RLS and service-role boundaries, named hardening prerequisites, private-by-default targets, proof of the actual active Worker role and its effective authority. |
| A0.6 | Exhaustive external write/merge/deploy/publish sink inventory, disposition, credential scope map, direct-main/autodeploy controls and uncertain-write/deploy cancellation reconciliation. |
| A0.7 | Live Modal/Jev/account/Volume capability and billing probes, current official price/allowance evidence, metering and hard-reserve model, reviewer supply and approved data rights/retention. |
| P9–P13 | Re-pin the canonical phase matrix and preserve each phase's own proof. This contract does not pass, waive, or promote any phase. New P13 CREATE/publication paths remain disabled until its existing cluster/action authorization and per-action gates pass. |

Kyle's explicit 2026-09-25 direction authorizes only the separately scoped, non-activating strict-client prerequisite packet and this contract; it does not open implementation of the proposed estate-wide CMS runtime. Any later implementation requires Sol to admit its own packet against the current entry and phase gates; every activation remains held until its applicable A0 and P12/P13 evidence is established. No enable flag, migration, provider call, new CMS path, or protected action is activated by this document.

## 11. Negative test vectors

The implementation must make each vector a deterministic denial, invalidation, reconciliation state, or explicitly described outcome. Tests must assert both the rejected mutation and the persisted reason/evidence; they must not call external providers.

| ID | Input / race | Required result |
|---|---|---|
| N01 | Request supplies another project ID but authenticated actor has no membership | Reject before read/write; no cross-project row disclosure. |
| N02 | Two workers claim same stage concurrently | One current fence; stale claimant cannot checkpoint, finish, release reservation, or renew. |
| N03 | Legacy job lease valid, durable stage fence stale | Reject durable transition; lease domains are not interchangeable. |
| N04 | Durable stage lease valid, legacy job lease expired | Do not mutate legacy job; do not infer legacy lease renewal from CMS fence. |
| N05 | Duplicate outbox delivery with same event ID | One inbox receipt/effect; receipt alone does not mark business stage complete. |
| N06 | Run insert succeeds but outbox insert would fail | Entire submission transaction rolls back; no acknowledged run lacking dispatch record. |
| N07 | Worker response arrives after stage fence advanced | Preserve artifact as untrusted/orphan candidate if policy allows; do not publish checkpoint/output projection. |
| N08 | Permit has correct target but different purpose or payload hash | Reject consumption; no sink call. |
| N09 | Two callers consume the same permit simultaneously | Exactly one atomic consume; at most one dispatch attempt. |
| N10 | Required approval/source/owner/policy changes after permit issue but before consume | Revoke pending permit; reject consumption. |
| N11 | Sink timeout after dispatch with no authoritative readback | Mark outcome `unknown`; retain reservation/cost hold; reconcile before any retry. |
| N12 | Caller retries unknown sink write with new idempotency key | Reject or quarantine as duplicate-risk; require reconciliation and reviewed new intent. |
| N13 | Permit expired under its source-specific validity rule | Reject even if its stored timestamp appears recent under a different source's rule. |
| N14 | No expiry/validity rule exists for a consequential source or permit | Block approval/issuance/dispatch; do not insert a global default TTL. |
| N15 | Official source withdraws or contradicts a linked YMYL fact | Invalidate dependent claims/approvals and pending permits; leave unrelated approvals current. |
| N16 | Source for a different jurisdiction has newer retrieval time | Reject it as support; recency cannot cure scope mismatch. |
| N17 | Content bytes or rendered output changes after reviewer approval | Invalidate approval by bound hash mismatch; require new human approval. |
| N18 | Model/service principal claims a human reviewer identity | Schema/authorization rejects approval; model identity cannot satisfy reviewer credential. |
| N19 | Ambiguous alias or similar query proposes a new primary owner | Keep unresolved/candidate; no ownership mutation or permit. |
| N20 | Two concurrent runs reserve same normalized intent | One reservation wins under uniqueness/lock; loser records collision and cannot CREATE. |
| N21 | Two different intents reserve same normalized route/slug on same host | One wins; other blocks pending canonical/ownership review. |
| N22 | Existing live owner exists but temporary reservation expired | Existing owner still blocks duplicate CREATE. |
| N23 | Canonical target is unknown, unregistered, cross-project, or points to unresolved route | Reject route change/release. |
| N24 | Host inventory has an inaccessible registered host | Do not report complete estate coverage; quarantine decisions in affected scope. |
| N25 | Provider returns an empty but complete result set | Store `empty` with complete coverage; do not confuse with unavailable or numeric metric zero. |
| N26 | Provider times out / partial page / schema parse fails | Store `unavailable`, `partial`, or `failed`; required-source decision abstains/blocks, never zero-fills. |
| N27 | Resource measurement is zero with meter evidence | Store known zero and its unit/window/source; keep distinct from unknown. |
| N28 | Resource amount/currency/meter is missing after a physical provider call | Keep charge `unknown`, retain reserve; never sum as zero or release hold. |
| N29 | Projected estimate is mistaken for observed/charged amount | Reject state transition; preserve estimate method/version and separate ledger dimensions. |
| N30 | Cap, quota, Worker CPU, or price is not measured/verified | Budget-sensitive action blocks; no guessed threshold or fabricated amount. |
| N31 | Candidate set is empty because required source is unavailable | Record `ABSTAIN` with blocker, not `NO_ACTION`. |
| N32 | Evidence is sufficient and trace concludes no intervention is warranted | Record `NO_ACTION`, rationale, rejected choices and trigger; do not enqueue content generation. |
| N33 | Technical execution error is labeled `NO_ACTION` | Reject outcome transition; retain `FAIL` and error/attempt details. |
| N34 | Decision omits rejected choices/reasons or evidence watermarks | Reject decision as incomplete; no proposal/run may depend on it. |
| N35 | Jev/model output selects action forbidden by deterministic policy or P gate | Persist as rejected recommendation with reason; never convert it into authority. |
| N36 | P9 outreach/acceptance presented as verified win | Reject P9 win transition absent independently verified live referring-page proof. |
| N37 | P10 instrumentation/deployed event presented as real business outcome | Preserve distinction; do not close outcome gate without its required event proof. |
| N38 | P11 generated mention/visibility observation presented as qualified outcome | Reject promotion absent P11's required eligible evidence and program gate. |
| N39 | P12/P13 pending/blocked, but new path sets its feature flag true | Configuration validation/activation guard rejects; record remains disabled. |
| N40 | Attempt to add/edit frozen historical migration to make ledger match | CI/policy denies; only reviewed new forward-only migration may address divergence after gates. |

## 12. Delivery and acceptance boundary

This contract is accepted as documentation only when its single-file scope is verified, the architecture pins above remain exact, `git diff --check` passes, and no migration, runtime/schema/code, configuration activation, spend, provider call, production mutation, push, or PR is included. This is not A0 evidence and cannot be used as implementation admission or phase/release proof.
