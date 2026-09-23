# Content Studio — v8 A0.1 documentation-integrity audit

Date: 23 September 2026. Input: historical CS-2026.09.23.7 at `2af720e8290c67806f335da746f91af35dd2c5f6`. Corrected design: **CS-2026.09.23.8**.

**Verdict: A0.1 documentation-integrity correction ready; runtime performance UNVERIFIED and implementation entry still gated.** No code, database migration, provider/account probe, production probe, phase promotion or deployment was performed by this amendment. This revision supersedes v7 documentation only; it does not advance any program or runtime gate.

## Evidence and decisions

The attached Sol conversation (`Pasted markdown(1).md`) was read in full. It is an investigation source, not fresh runtime proof. Current Portal main was read at `3d916b09671ab726de2fc1aa3b87f79e7712c6ac`; parity blob `0d2e1f5ed78adaf48334f87a21caa9a602e398cd` preserves open outcomes. The user's P0–P11 code-PASS correction is retained separately. A read-only Luna/high review assessed the worker boundary; the primary author checked and integrated its findings. **Actual dated 2026-09-23 executor observation:** the Codex catalog advertised `gpt-5.6-luna` efforts `low`, `medium`, `high`, `xhigh`, `max`; only `gpt-5.6-luna/high` positively succeeded. Future packet admission must re-resolve the exact Luna model and catalog, select and record a supported effort/rationale, verify selected-effort access, use `RDC_CODEX_CLI`, and record native-nested versus separate-CLI orchestration; no automatic model/provider-family fallback.

| Finding | Correction | Required implementation proof |
|---|---|---|
| F21: async framework advice could replace Modal with a second scheduler | Retain Modal primary; one Postgres run authority; Queue optional IDs-only transport or measured bounded canary | Account capability, idempotency, durable acknowledgement, retention recovery and quota tests |
| F22: endpoint-only CPU measurements can omit auth/SSR costs | Total invocation budget; public allowlist vs protected routes; Clerk verification and current scope checks; cohort-specific telemetry | T25 and A0.6 measurements; all observed invocations <10ms, target percentiles and zero resource errors |
| F23: SSE disconnect may relaunch ingestion | Durable admission, same-key recovery, sequenced stored Tape events; remove legacy synchronous fallback | T26/T27 dropped response, disconnect, replay and concurrent retry tests |
| F24: generic execution status confused with editorial lifecycle | One-to-one StudioRunEnvelope and append-only event projection; content_jobs and seo_engine_runs retain separate meanings | Mapping/cutover evidence and no duplicate run authority |
| F25: old executor defaults conflict with user direction | Sol supervises; Luna family executes at task-selected verified effort over RDC/local CLI; distinct review; explicit orchestration; no provider-family fallback | T30 packet/capability checks; existing external jobs untouched |
| F26: code PASS confused with gate PASS and kickoff bypassed program hold | Separate code/deployment/program fields; provenance and typed blockers; read-only kickoff until eligible | T29; P11 delivery reconciliation; no automatic gate promotion |

## Verification scope

JSON parsing plus bounded standards-faithful structural and negative-fixture checks cover the delivery schema/state, required phase keys, adaptive Luna policy, advertised-versus-verified effort admission, prohibition of fallback, transport/orchestration distinction, architecture section/interface uniqueness and preservation of the 50 requested variables. The delivery schema's `allOf` conditionals enforce orchestration consistency: native nested mode requires `nativeChild=true` and `AVAILABLE_AND_USED`; separate CLI mode requires `nativeChild=false` and rejects `AVAILABLE_AND_USED`. The 9/9 negative fixtures reject wrong executor, invalid/unverified effort admission, fallback enabled, missing phase, mismatched phase key, unknown top-level/policy fields, invalid evidence/state relationship and transport/orchestration mismatch; a valid code-PASS/gate-IN_PROGRESS fixture is intentionally accepted. No local Draft 2020-12 validator package was available in the candidate worktree, no dependency was installed, and full Draft 2020-12 evaluation was not independently run. Schema validation is not an authorization engine.

**Historical v7 integrity defect and correction:** the v7 manifest recorded architecture and blueprint SHA-256 values for bytes with one extra appended newline; those values did not match the committed v7 bytes. CS-2026.09.23.8 corrects this by hashing the exact final bytes stored for each of the other eight listed documents and excluding the manifest itself. This is a documentation-integrity correction with no runtime impact. The v8 state replaces the stale universal executor pin with an adaptive `studio.executor-policy/2` record: exact model re-resolution, advertised versus verified efforts, selected effort/rationale/access, `RDC_CODEX_CLI`, and explicit orchestration mode. The dated candidate records `gpt-5.6-luna`, selected/verified `high`; it does not claim account access for the other advertised efforts.

**Read-only integration readiness observation (dated 2026-09-23):** authenticated GitHub, Supabase and Cloudflare capability probes returned scoped names/status observations only. They were not authorization, entitlement, production telemetry, deployment proof, schema/RLS/capacity proof or permission for further operations, and are not represented as live inventory in the delivery state.

## Historical v7 audit (preserved; superseded only by explicit v8 corrections)

# Content Studio — v7 architecture amendment audit

Date: 23 September 2026. Input: CS-2026.09.22.6 at `c23ed7e4c687eeca59933e46e1e37e796afea681`. Corrected design: **CS-2026.09.23.7**.

**Verdict: documentation amendment ready; runtime performance UNVERIFIED and implementation entry still gated.** No code, database migration, provider provisioning, production probe, phase promotion or deployment was performed by this amendment.

## Evidence and decisions

The attached Sol conversation (`Pasted markdown(1).md`) was read in full. It is an investigation source, not fresh runtime proof. Current Portal main was read at `3d916b09671ab726de2fc1aa3b87f79e7712c6ac`; parity blob `0d2e1f5ed78adaf48334f87a21caa9a602e398cd` preserves open outcomes. The user's P0–P11 code-PASS correction is retained separately. A read-only Luna/high review assessed the worker boundary; the primary author checked and integrated its findings.

| Finding | Correction | Required implementation proof |
|---|---|---|
| F21: async framework advice could replace Modal with a second scheduler | Retain Modal primary; one Postgres run authority; Queue optional IDs-only transport or measured bounded canary | Account capability, idempotency, durable acknowledgement, retention recovery and quota tests |
| F22: endpoint-only CPU measurements can omit auth/SSR costs | Total invocation budget; public allowlist vs protected routes; Clerk verification and current scope checks; cohort-specific telemetry | T25 and A0.6 measurements; all observed invocations <10ms, target percentiles and zero resource errors |
| F23: SSE disconnect may relaunch ingestion | Durable admission, same-key recovery, sequenced stored Tape events; remove legacy synchronous fallback | T26/T27 dropped response, disconnect, replay and concurrent retry tests |
| F24: generic execution status confused with editorial lifecycle | One-to-one StudioRunEnvelope and append-only event projection; content_jobs and seo_engine_runs retain separate meanings | Mapping/cutover evidence and no duplicate run authority |
| F25: old executor defaults conflict with user direction | Sol supervises; native Luna/high executes; independent review; no provider fallback | T30 packet/capability checks; existing external jobs untouched |
| F26: code PASS confused with gate PASS and kickoff bypassed program hold | Separate code/deployment/program fields; provenance and typed blockers; read-only kickoff until eligible | T29; P11 delivery reconciliation; no automatic gate promotion |

The v6 findings F01–F20 below remain applicable and preserved as historical audit evidence. Their dates and source pins are not newly verified production facts. New runtime T25–T30 tests are specified, not executed. CPU targets, account quotas, auth costs, current P11 delivery and operational A0 exits remain unverified unless separately evidenced.

## Official references consulted

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/queues/platform/limits/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/workflows/reference/limits/
- https://clerk.com/docs/reference/backend/authenticate-request
- https://clerk.com/docs/guides/sessions/manual-jwt-verification

## Historical v6 audit (preserved; superseded by explicit v7 and v8 corrections)

# Content Studio — final architecture audit

**Audit date:** 22 September 2026. **Input:** CS-2026.09.22.5. **Corrected design:** CS-2026.09.22.6.

**Verdict: APPROVED DESIGN; IMPLEMENTATION BLOCKED by the canonical program and required A0 evidence.** Retain Alternative 2 strangler migration. The architecture is coherent after the corrections below; it is not certified deployed behavior, an account-capability finding or a ranking guarantee.

## Evidence and scope

The v5 canonical Git file at `content-studio-revamp`, head `8dfcbcd17c0afe381b2e5a47209131602b6c1770`, was read and its exact SHA-256 verified as `93d64ed33b40fa2e459b1d9f172e1cf8fb1b775bbdc404529713364766ee8e30`. Hjarni 34785 contained the same bytes; Notion identified v5 and retained its attachment; the former v4 file was a non-normative pointer. Root AGENTS.md and Supervisor Arc 33465 were read. The audit examined contracts and boundaries, using scoped independent review findings where available and direct verification of the cited source text. It does not claim a new complete DeepSeek/Grok implementation audit or any live production probes.

Current main was re-pinned to `4b0a310f22a43e532c2f16ce08df3897d760caf4`. Its parity matrix blob `0d2e1f5ed78adaf48334f87a21caa9a602e398cd` records P0–P8 PASS, P9/P10/P11 IN_PROGRESS and P12/P13 PENDING. The incoming handoff's P10-PASS claim is contradicted by that record. P9 has zero verified backlink wins. P10 has deployed instrumentation but awaits the required real production paid-order observation. P11 does not claim its live outcome gate passed. This audit preserves those gates and does not alter the program matrix or unrelated phase jobs.

## Keep, change, defer

**Keep:** authoritative Postgres, evidence/provenance, deterministic gates, current owner/slug protections, immutable writing contracts, qualified human YMYL review, exact Git/deployment/live lineage, Modal asynchronous compute, bounded Jev, commercial relevance and one-authority migration.

**Change:** replace underspecified boundaries with typed state/failure records, atomic permit consumption, verified artifact publication, explicit current-state acceptance, conservative budget reservations and an implementable relational schema/packet map.

**Defer:** universal knowledge graph, automatic ontology induction, graph embeddings, embedding every fact/query/history item, multiple vector services, model-based routine routing/priority, large local-model default generation and autonomous release. None is needed for the first safe intelligence cohort. Introduce each only after a measured decision/retrieval benefit and capacity proof.

## Findings and disposition

“Blocking” below means the v5 wording could not safely guide dependent implementation. Each is corrected in v6; tests remain implementation exits, not claimed executions.

| ID | Severity | Finding | Applied correction / acceptance owner |
|---|---|---|---|
| F01 | Blocking | Handoff says P10 closed while canonical outcome evidence says open | Re-pin current main; distinguish deployed instrumentation from observed business outcome; program start gate remains closed |
| F02 | Blocking | D2 actions differ from canonical action vocabulary | One action registry; legacy aliases rejected or explicitly mapped; generic CREATE cannot choose a subtype |
| F03 | Blocking | Jev state lacks exact subject/snapshot/choice identity and loses semantic meaning/provenance | DecisionState/2 binds project/revision/owner/policy/snapshot/eligible-set plus short task meanings and typed health/window features |
| F04 | Blocking | DecisionRecord cannot represent failed calls, missing actual model or native Score/Noul | Lossless answer union; nullable absent response fields; explicit provider outcome and immutable acceptance history |
| F05 | Blocking | Model-dependent abstention/routing/priority would add unnecessary authority and cost | D3/D4/D5 deterministic; Jev retained for relation, diagnosis, eligible intervention and validated-target ranking |
| F06 | Blocking | Metric schema cannot express required artifact/query/currency/cohort/window context | Strict seo.metrics/2 provenance; all 50 keys retained; one underlying observation identity and overflow collection reference |
| F07 | Blocking | Release sequence can perform external writes before consuming authorization | PREPARE_PR and fresh MERGE permits; transactional consume+operation intent before each network mutation; no future live proof required to issue permit |
| F08 | Blocking | A DB lock cannot fence independent Git writers; cancelled old deploy could overwrite newer live work | Protected remote writer/merge semantics, target generation and desired-deployment pointer; uncertainty reconciliation; auto-merge disabled until proven |
| F09 | Blocking | Artifact local write/hash does not prove Volume visibility/durability; stale worker can overwrite a shared path | Unique upload paths, explicit commit, independent reload/read/hash, READY DB manifest, immutable sealed access and safe GC |
| F10 | Blocking | “Every hash uses canonical serialization” conflicts with byte artifacts | Separate exact-byte digests from versioned canonical structured-object hashes; golden fixture registry |
| F11 | Blocking | T2-only vector doctrine conflicts with required pgvector retrieval | One bounded hot derivative pgvector index in T1; bulk snapshots T2; identity/evidence remain authoritative outside vectors |
| F12 | Blocking | Ontology changes incorrectly grouped with harmless embedding changes | Identity/predicate/scope changes invalidate affected eligibility/contracts; owners remain reserved until reviewed reconciliation |
| F13 | Blocking | Reviewer name/ID alone cannot exclude machine impersonation; one claim version cannot identify many independently versioned claims | Authenticated human principal + verified credential version + exact approval-to-claim-version joins; revoke/remit recheck at permit consumption |
| F14 | Before activation | Permanent intent key, temporal facts and relation vocabularies insufficiently defined | Stable IDs independent of mutable evidence; legal-valid and recorded times; typed scoped aliases; relation registry and typed membership joins |
| F15 | Before activation | Vector absence/top-k can be mistaken for no collision or novelty | Mandatory estate-wide owner/reservation/conflict set; incomplete evidence blocks critical conclusion; information gain binds compared revisions/coverage |
| F16 | Before activation | Saved-draft availability claim conflicts with all bodies held behind Modal | Small private T1 draft chunks, CAS saves and capacity bounds; large research/render artifacts remain T2 with honest outage state |
| F17 | Before activation | Free compute plan assumed to expose billing APIs and support persistent warmth | Actual account probe; zero warm minimum, per-attempt cost reservations, stale-spend hold, separate provider budgets and explicit finite reserves |
| F18 | Before activation | Five-second polling can exhaust daily request allowance even when CPU is low | Cross-tab coordinator, adaptive/terminal/hidden behavior, measured account-wide daily request budget and isolated load tests |
| F19 | Before activation | Calibration sample pooled across tasks; selected-action outcomes invite causal/selection errors | Grouped/time-separated holdout, per-family/slice gates and error bounds, abstention sampling, separate label/acceptance/outcome streams |
| F20 | Before activation | Epoch-free rollback/dual running can restore a stale authority | Domain epoch, drain/fence, single switch, old writer revocation, forward-only truth and explicit legacy retirement exits |

## Deep-audit conclusions

**Jev:** its useful boundary is a compact, meaningful task projection after deterministic eligibility. It should not rediscover facts, do date arithmetic, decide whether to obey a gate, select credentials or approve legal claims. One task/revision per state, explicit choices, full response/attempt provenance and current-state revalidation are essential. The blueprint defines four enabled families, schemas, rubric meanings, scheduling, limits, retry/circuit behavior, raw-versus-interpretation cache, family-specific calibration and demotion. Default Choice is sufficient; Score/Noul are optional shadow experiments. A model failure is abstention, never a silent substitute or confident NO_ACTION.

**Modal:** maximize intelligence per unit of measured cost using deltas, deterministic CPU, small embedding/reranking batches and zero warm minimum. Do not budget by article quota or treat duplicate computation as free. Volume is an artifact plane with explicit publication/verification, not a database. Billing/API capability and monthly allowance are account evidence. The design can pursue a free-first launch; it cannot guarantee free unlimited storage/uptime or zero overage without verified provider controls and observed workload.

**Semantics:** begin with the relational chains actually needed to answer ownership, support, gaps and funnel questions. One purpose vector is useful but is not the universal article representation; add answer-unit/offer embeddings selectively. No second graph or vector authority. Evidence disagreement, unresolved scope and missing coverage remain visible. Exact vector search is a recall reference, not a semantic truth oracle.

**Release/YMYL:** models produce candidates. Humans with actual remit approve consequential content; Sol controls merge decisions; a narrowly commissioned release workflow holds merge credentials. A consumed permit is monotonic even after timeout. Candidate, PR, CI, merge, deploy and live proof are distinct events. Source/reviewer changes invalidate pending authority synchronously at consumption, even if a notification job is delayed.

**Learning:** begin with correct observation and prediction records, not online self-modifying policy. Preserve known/unknown acquisition, real paid-event proof, independently verified backlinks, cohort versions, refunds and confounders. A positive correlation does not prove causal uplift or that the unchosen action was worse. Mature evidence can propose a reviewed rubric/calibration/priority change.

## Outstanding operational evidence — intentionally not invented

Sol's later A0 packets must prove: remaining program closures; current repository/route/workflow target map; effective live DB schema/migration ledger/roles/extensions and capacity; complete legacy disposition; every release/maintenance/direct-main sink; actual Cloudflare telemetry/account limits; provider credentials/entitlements/retention; Modal Volume/gateway/readback/backup/restore behavior and account billing; TypeSafe account/model availability; qualified reviewer supply; source/release/end-to-end canaries. Missing evidence blocks only dependent work after the global program start condition; no fabricated IDs, settings, thresholds or signatures are substituted.

## Documentation verification

Final static checks confirmed all 50 requested keys in the ordered metric registry and typed interface, one monotonic 1–28 section sequence, unique interface declarations, all T01–T24 blueprint cases plus adaptive T25–T30 packet-policy shape, and balanced code fences. Targeted cross-document checks removed stale Jev priority/metric tasks and clarified physical-attempt cost accounting. These are document consistency checks; no implementation test, live A0 probe, migration or production acceptance was executed.

## Source register

- Normative v5 input and current parity matrix: named GitHub refs above; Hjarni 34785,33465,34332; Notion page `3e31a73c-cb00-814e-8c1c-e60edc535157`.
- [TypeSafe API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [confidence](https://docs.typesafe.ai/confidence): vendor interface and model semantics; account capability remains unprobed.
- [Modal pricing](https://modal.com/pricing), [Volumes](https://modal.com/docs/guide/volumes), [billing](https://modal.com/docs/guide/billing), [egress](https://modal.com/docs/guide/network-egress-billing): dated service/storage/budget limitations, not workspace entitlement.
- [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/): consult actual account/runtime during A0; runtime labels cannot demonstrate off-Worker execution.
- [pgvector](https://github.com/pgvector/pgvector), [Postgres constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [locking](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): derivative vector, concurrency and privilege design.

The canonical architecture remains the decision authority; this report explains changes and the blueprint provides their implementation sequence. Git is normative, Hjarni mirrors exact architecture bytes, and Notion provides a concise operating page with exact attachments and hashes. This audit advances no SEO phase and publishes no article.
