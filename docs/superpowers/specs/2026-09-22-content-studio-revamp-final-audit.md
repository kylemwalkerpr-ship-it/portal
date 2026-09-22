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

Final static checks confirmed all 50 requested keys in the ordered metric registry and typed interface, one monotonic 1–28 section sequence, unique interface declarations, all T01–T24 blueprint cases, and balanced code fences. Targeted cross-document checks removed stale Jev priority/metric tasks and clarified physical-attempt cost accounting. These are document consistency checks; no implementation test, live A0 probe, migration or production acceptance was executed.

## Source register

- Normative v5 input and current parity matrix: named GitHub refs above; Hjarni 34785,33465,34332; Notion page `3e31a73c-cb00-814e-8c1c-e60edc535157`.
- [TypeSafe API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [confidence](https://docs.typesafe.ai/confidence): vendor interface and model semantics; account capability remains unprobed.
- [Modal pricing](https://modal.com/pricing), [Volumes](https://modal.com/docs/guide/volumes), [billing](https://modal.com/docs/guide/billing), [egress](https://modal.com/docs/guide/network-egress-billing): dated service/storage/budget limitations, not workspace entitlement.
- [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/): consult actual account/runtime during A0; runtime labels cannot demonstrate off-Worker execution.
- [pgvector](https://github.com/pgvector/pgvector), [Postgres constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [locking](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): derivative vector, concurrency and privilege design.

The canonical architecture remains the decision authority; this report explains changes and the blueprint provides their implementation sequence. Git is normative, Hjarni mirrors exact architecture bytes, and Notion provides a concise operating page with exact attachments and hashes. This audit advances no SEO phase and publishes no article.
