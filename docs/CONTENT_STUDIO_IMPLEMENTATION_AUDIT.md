# Content Studio evidence-contract implementation audit

**Date:** 14 September 2026  
**Base / current `main`:** `a33243111623ba2ded3332a010c8346bdf7d05cb`  
**Feature branch:** `feature/content-studio-evidence-contract-20260914`  
**Pull request:** #200 — draft; do not merge from this implementation session  
**Implementer:** GPT-5.6 Sol  
**Reviewer:** Codex

This audit describes the implementation and verification state of the evidence-contract work. It does **not** authorize a merge, deployment, Wrangler execution, article publication, or migration execution.

## Review-blocker implementation status

| Review blocker | Implementation evidence | Status / boundary |
| --- | --- | --- |
| Immutable writing contract continuity | `writingContract.ts`, `writingContractStore.ts`, contract-aware suggest/job/pipeline/stream/revision/shipping paths | Contract identity/hash/version are server-owned. Explicit contract references fail closed on missing or mismatched persistence. Legacy jobs without a contract remain on the legacy path rather than being silently upgraded. |
| JSON/SSE parity | `pipeline.ts`, `pipelineStream.ts`, stored-job execution and shared contract hydration | Both generation paths hydrate the same persisted contract and use the strict execution boundary for contracted jobs. |
| Marketplace demand semantics | `marketplaceDemandFeeder.ts`, demand merge/ranking paths | Marketplace submitted-search counts remain first-party counts and never become monthly keyword volume. Unknown conversion instrumentation remains null/unknown rather than inferred from unrelated historical conversion events. |
| Opportunity identity / reservation | opportunity identity + writing-contract store reservation helpers | Normalized reader intent and jurisdiction are part of identity. Active-status reservation uses the database uniqueness contract rather than a UI-only check. |
| Rewrite acceptance | `rewriteAcceptance.ts`, `revisionQuality.ts`, `linearDesk.ts`, generation pipelines | Missing audit context fails closed. Qualifications, amounts/dates, citations, headings and topical continuity are protected. Rejected rewrites retain the stronger prior draft. |
| Coherent-desk failure | `linearDesk.ts`, strict execution context, pipeline facades | A failed coherent-writing path is not allowed to switch to an isolated production authoring fallback for a contracted run. |
| Manufactured substantive content | `sealedBrief.ts`, `researchDemand.ts` | Missing thesis/takeaways/lede/FAQ substance is not invented to make the brief look complete. Guide apparatus may add structural sections only; unsupported substantive sections such as `Worked Example` are not manufactured. |
| Discovery truthfulness | GSC suggestions, `keywordDiscover.ts`, `researchDemand.ts` | Synthetic strategy rows do not receive fabricated GSC metrics; suggestion states distinguish ok/empty/unavailable; valid F-1/I-485/subclass-485/student-visa demand is not discarded as noise. |
| TinyFish provenance | `tinyfishAdapter.ts` and evidence wiring | Observations carry source class, observation time, jurisdiction/run/checkpoint provenance and source-health state. Competitor observations are not promoted to authoritative factual evidence. Live paid/runtime credentials were not exercised in this review session. |
| Publication proof | `publicationProof.ts`, `publicationStates.ts`, `liveVerify.ts`, deploy-monitor / jobs integration | Contracted publication requires exact approved body/hash/revision marker plus PR/merge/deploy lineage, affirmative canonical/indexability assessment and extracted live article body. HTTP 200 or a caller-supplied phase alone is not proof. |
| Public save/approval gates | `app/api/content-studio/jobs/route.ts` + `legacy.ts` | Public PATCH save still refuses destructive thin overwrites. Contracted merge/approval requires the persisted contract and publication manifest. Bulk approval preserves gated rows as skipped rather than silently treating them as successful. |

## Failure triage from full-Jest run 34914478631

The original failures were not treated as automatically test-only. They were classified after following the failing paths and rerunning the suite.

| Failure group | Classification | Resolution |
| --- | --- | --- |
| `jobs-ship-gate-server.test.ts`: `request.clone is not a function` | Mock/fixture regression masking route behavior | Replaced fake request objects with real `NextRequest` instances. Successful contracted approval/merge fixtures now carry persisted contract identity and publication manifests. Negative gate tests remain. |
| Bulk approval behavior exposed after request repair | **Production regression** | Contract-aware `POST bulk_approve` now preserves skipped ship-gate semantics, counts real failures separately, and returns the legacy-compatible all-skipped 409 / mixed-success response contract. |
| Contracted merge success later failed because `normalizeGithubTarget` disappeared | Mock/fixture regression | The GitHub module is now partially mocked: real helpers remain present while only network fetch is mocked. |
| Bulk child requests contaminated each other through one mutable Supabase query builder | Mock/fixture regression | Each mocked `.from()` begins a fresh logical query so update state cannot leak across bulk children. |
| Linear Desk expected an auto-filled thesis | Obsolete expectation that permitted manufactured content | The test now asserts empty substantive fields and `validateSealedBrief` rejection when the evidence/plan does not supply them. |
| Linear Desk expected `READER_QUESTION` in the wrong prompt surface | Obsolete assertion location | The test checks the actual explore turn produced by `explorePrompt` inside the conversation. |
| Three Linear Desk rewrite tests expected acceptance without current audit context / sufficient candidate depth | Fixture missing newly required rewrite contract | Acceptance-intended cases now supply valid audit context and contract-compliant candidates. Separate damaging-rewrite tests continue to assert rejection. |
| Persistence test source-scanned the public facade for `shouldRefuseThinOverwrite` | Obsolete implementation-coupling expectation | The public PATCH path is behaviorally tested for 409 `thin_overwrite_refused`; a lightweight hop-lock also confirms delegation to the guarded legacy implementation. |
| Editor metrics expected `ensureMinimumOutline` to invent `Worked Example` | Obsolete expectation that permitted manufactured content | Tests now require supplied structure to be preserved, structural apparatus only where appropriate, and no unsupported substantive `Worked Example` insertion. |

A subsequent full-Jest rerun reduced the failure set to the jobs-gate fixture defects above; after those fixture corrections the full suite proceeded without additional masked production failures on the code candidate.

## Database / migration state

`supabase/migrations/20260914_content_studio_evidence_contract.sql` is an **already-applied historical migration**. Do not replay or edit it to imply a new production change.

- Supabase project: `yousafe-saas` / `krggzrxxnqfsbbklatxl`
- Applied migration history version: `20260914181604`
- Hardened repository source commit: `39eef30fe8b0f26607ac152ba79f0bfa8bb2d84d`
- The applied schema includes the evidence-contract tables/columns and hardened access/immutability/reservation controls reviewed in this branch.
- Future schema changes, if any, must be new additive migrations reviewed before execution.
- **No migration was executed during this final failure-resolution pass.**

Allowed `content_jobs.status` values remain:
`pending`, `drafting`, `processing`, `publishing`, `pr_created`, `merged`, `closed`, `failed`.
Execution phases belong in `execution_stage`; active reservation statuses are `pending`, `drafting`, `processing`, `publishing`, `pr_created`.

## Verification protocol

Repository PR CI is the execution source for this review because this session's local container cannot resolve `github.com`; `git ls-remote https://github.com/kylemwalkerpr-ship-it/portal.git HEAD` fails with `Could not resolve host: github.com`. Therefore no local Jest result is claimed.

The PR workflow runs, in order:

```text
npm ci --legacy-peer-deps
npx tsc --noEmit -p tsconfig.json
npx jest --ci
npm run build
```

The separate Content Studio Review workflow runs the focused Content Studio regression set. Final review handoff must cite the exact final head SHA and the two GitHub Actions runs for that same SHA.

On `pull_request`, the deploy workflow skips Cloudflare credential validation, secret synchronization, Wrangler/OpenNext deployment, Worker-secret health checks and post-deploy production smoke steps. The build itself still runs. No manual workflow dispatch is used to bypass this boundary.

## Editorial benchmark protocol and status

`docs/content-studio/ARTICLE_SAMPLES_20260914.md` defines the required **8-dimension, 12-pair blinded benchmark** and the human preference target of at least **9/12** candidate wins, including explicit usefulness and factual-support scoring and a critical-defect rule for fabricated fees/dates/outcomes.

**Benchmark status: NOT RUN / NOT MET.** The listed topics are benchmark slots and editorial fixtures, not generated provider pairs. There are no human preference votes or real provider pairwise scores in this branch. This limitation must remain visible to Codex; it must not be presented as a successful editorial benchmark.

## Remaining external/runtime limitations

- No live TinyFish paid/runtime credential exercise was performed in this pass.
- Marketplace conversion-event emission was not verified against production credentials during this pass; unknown coverage remains represented as unknown in code.
- Exact live deployment verification cannot be demonstrated without an approved merge/deployment, which is outside this task and explicitly prohibited here.
- Destination sister-repository publication was not performed.
- The 12-pair human editorial benchmark remains outstanding as described above.
- No ranking, conversion, publication-success, or human-authorship guarantee is made by this implementation.

## Review boundary

PR #200 must remain draft for Codex review. This implementation session does not merge it, deploy it, run Wrangler, publish an article, or execute a migration.
