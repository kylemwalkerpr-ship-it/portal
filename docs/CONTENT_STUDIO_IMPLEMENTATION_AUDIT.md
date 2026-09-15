# Content Studio evidence-contract implementation audit

**Date:** 15 September 2026  
**Base:** `a33243111623ba2ded3332a010c8346bdf7d05cb`  
**Feature branch:** `feature/content-studio-evidence-contract-20260914`  
**Pull request:** #200 — draft; do not merge or deploy from this implementation session  
**Implementer:** GPT-5.6 Sol  
**Reviewer:** Codex

This audit describes implementation and test coverage after Codex reviews `5205607087` and `5206721676`. It does **not** authorize a merge, deployment, Wrangler execution, article publication, or migration execution. Final CI run IDs/results belong in the PR description and review handoff so recording a passing run does not require another documentation-only commit.

## Codex review 5205607087: eight production findings

| # | Finding | Implementation boundary | Behavioral / regression coverage |
| --- | --- | --- | --- |
| 1 | Normal Studio UI could bypass the contract path | `app/api/seo-factory/generate-stream/route.ts` resolves contract requirement from the persisted `existingJobId`; Studio drafting reuses the reserved Full Brief job; contracted Content Studio HTTP generation uses `runContentStudioPipeline` / `runContentStudioPipelineStream` rather than client opt-in. | `tests/content-studio-ui-contract-route.test.ts`, `tests/content-studio-production-entrypoints.test.ts`, `tests/content-studio-architecture-boundary.test.ts` |
| 2 | SSE closed authoring permission while generation was still running | `lib/seoFactory/contentStudioPipelineCore.ts` owns one strict `AsyncLocalStorage` execution context for the entire SSE producer, including multiple progress events and awaited provider turns. A lease heartbeat runs for the producer lifetime. `contentStudioExecutionContext.ts` closes inherited permission after the execution window. | `tests/content-studio-stream-producer.test.ts`, `tests/content-studio-execution-isolation.test.ts` |
| 3 | Drafting replaced the persisted brief with a newly generated brief | Strict Linear Desk execution loads `contractBrief` and skips Explore/rebriefing. `lib/seoFactory/linearDesk.ts` is the public contract-aware facade; the single implementation is in `linearDeskCore.ts`. | `tests/linear-desk.test.ts`, `tests/content-studio-codex-regressions.test.ts`, architecture boundary tests |
| 4 | JSON/SSE desk rewrites lacked usable audit context / provenance | The public Linear Desk facade replaces mutable request keyword coverage with immutable `contractQueryCoverage`; the desk implementation performs canonical before/after audits and feeds exact demand/synthesized provenance to `acceptRewriteCandidate`. | `tests/linear-desk.test.ts`, `tests/content-studio-execution-isolation.test.ts`, `tests/content-studio-codex-regressions.test.ts` |
| 5 | Contract ownership, scope, and requested model were not fully enforced | `pipelineContract.ts` hydrates reader question, target scope and model from the persisted contract. `contentStudioPipelineCore.ts` re-resolves ownership before authoring; `contentAiProvider.ts` rejects provider/model drift; `renderTarget.ts` rechecks owner target and accepted content before artifact generation. | `tests/content-studio-production-entrypoints.test.ts`, `tests/content-studio-codex-regressions.test.ts`, `tests/content-studio-git-lease.test.ts`, revision-route coverage |
| 6 | SSE terminal `error` events could bypass recovery persistence | Strict stream producer persists failure on explicit error events, premature EOF, thrown producer errors, cancellation, and consumer interruption. Accepted content is retained where available. | `tests/content-studio-stream-producer.test.ts`, `tests/content-studio-failure-recovery.test.ts` |
| 7 | Two executions of one persisted job lacked execution ownership / fencing | New additive lease schema plus `writingContractStore.ts` and `contentStudioPipelineCore.ts` implement atomic claim, monotonic attempt token, heartbeat renewal and owner+attempt+expiry-conditioned terminal writes. `githubContents.ts` fences Git mutations with the same execution token. | `tests/content-studio-execution-lease.test.ts`, `tests/content-studio-stream-producer.test.ts`, `tests/content-studio-git-lease.test.ts`, `tests/content-studio-manual-publication-lease.test.ts`, `tests/content-studio-author-revise-route.test.ts` |
| 8 | Changed article content could verify with an unchanged revision marker | Publication manifest binds the marker to both exact marked repository artifact hash and normalized substantive body hash. Deployment reconciliation verifies the exact artifact at merge/deployed commits; live verification recomputes the article body digest. Markdown/MDX-to-HTML normalization is tested so legitimate rendering does not fail simply because markup changes. | `tests/content-studio-publication-hash.test.ts`, `tests/content-studio-publication-proof.test.ts`, `tests/content-studio-publication-monitor.test.ts`, `tests/content-studio-live-verify-http.test.ts` |

## Codex review 5206721676: four remaining blockers

| # | Finding | Resolution | Behavioral / executable coverage |
| --- | --- | --- | --- |
| A | Underlying job writes could bypass execution-owner fencing | Strict `persistPipelineJob` now uses the exact job + contract + opportunity + `execution_owner` + monotonic `execution_attempt` + unexpired lease fence for its guard read, primary update and compatibility retry. `pipelineStream.ts` keeps the verified full-lifetime SSE producer and wraps its direct `content_jobs` client with `streamContentJobFence.ts`, so early progress writes and compatibility retries are fenced too. The strict persistence path deliberately does not perform the legacy broad sibling-closing update because that update is not execution-owned. | `tests/content-studio-persist-fencing.test.ts`, `tests/content-studio-stream-fenced-persistence.test.ts`, `tests/content-studio-stream-producer.test.ts`, `tests/content-studio-codex-regressions.test.ts` |
| B | Lease status rules rejected successful merge completion and failed-job recovery | The unapplied lease SQL now distinguishes normal acquisition from explicit failed-job recovery. The current owner+attempt can assert/renew/release while terminal persistence finishes, including merged/failed transitions; a failed job can be reacquired only through the explicit recovery claim. Fencing tokens remain monotonic and stale attempts cannot finalize after takeover. | `tests/content-studio-execution-lease.test.ts`, `tests/content-studio-author-revise-route.test.ts`, plus `tests/sql/content-studio-execution-lease.sql` executed against disposable PostgreSQL 16 in the focused CI workflow |
| C | Saved contract slugs could disagree with repository paths | `suggest-brief` re-resolves the model-selected final slug through ownership routing before sealing the immutable contract, so `metadata.targetSlug`, `ownership.filePath` and `ownership.canonicalUrl` describe the same destination. | `tests/content-studio-suggest-brief-slug.test.ts`, ownership checks in `tests/content-studio-codex-regressions.test.ts` |
| D | Equivalent numbered-list Markdown and HTML produced different publication hashes | Publication-body canonicalization now normalizes ordered-list presentation across Markdown/MDX and rendered HTML while retaining list item text and numeric facts. Equivalent rendering hashes identically; changing a substantive number still changes the digest and fails verification. | `tests/content-studio-publication-hash.test.ts`, publication proof/live verification suites |

The restored strict SSE path is intentional: contracted SSE is **not** implemented by substituting the JSON producer. Its original whole-producer ALS context and heartbeat remain in `contentStudioPipelineCore.ts`; lower-level persistence is fenced at the actual database mutation doors.

## Other evidence-contract behavior retained

- Immutable writing-contract identity/hash/version is server-owned and verified on reload. Persisted evidence content hashes are recomputed from stored payloads rather than trusting source URLs or the stored hash column alone.
- Marketplace submitted-search counts remain first-party counts, not provider monthly volume. Unknown conversion instrumentation remains unknown/null.
- Opportunity identity includes normalized reader intent and jurisdiction; active opportunity reservation remains database-backed.
- Missing substantive brief content fails closed. Thesis, takeaways, lede, FAQ answers and unsupported substantive outline sections are not fabricated merely to satisfy a gate.
- Suggestion-provider state distinguishes successful empty responses from unavailable/error responses; measured GSC rows are not supplemented with fabricated observed metrics.
- TinyFish observations carry source class, observation time, jurisdiction/run/checkpoint provenance, source-health state and research gaps. Competitor observations are not authoritative factual evidence.
- Revision acceptance preserves qualifications, dates/amounts, citations/headings, topic continuity, keyword provenance and word bounds; missing audit context fails closed.
- Contracted publication proof requires repository/path identity, expected marker, exact artifact/body digests, PR/merge/deployment lineage, affirmative canonical/indexability assessment and an extracted substantive live article body. HTTP 200 or caller-supplied phase is never sufficient.

## Database / migration state

### Already applied historical migration — do not replay or edit

`supabase/migrations/20260914_content_studio_evidence_contract.sql`

- Supabase project: `yousafe-saas` / `krggzrxxnqfsbbklatxl`
- Applied migration history version: **`20260914181604`**
- Hardened repository source commit: `39eef30fe8b0f26607ac152ba79f0bfa8bb2d84d`
- This migration was already applied before this implementation pass. It must not be replayed or modified to imply another production schema change.

Allowed `content_jobs.status` values remain `pending`, `drafting`, `processing`, `publishing`, `pr_created`, `merged`, `closed`, `failed`. Execution phases belong in `execution_stage`; opportunity-reservation active statuses remain `pending`, `drafting`, `processing`, `publishing`, `pr_created`.

### New additive execution-lease migration — **UNAPPLIED / RUNTIME PREREQUISITE**

`supabase/migrations/20260915_content_studio_execution_lease.sql`

Schema-review package: `docs/content-studio/EXECUTION_LEASE_SCHEMA_REVIEW_20260915.md`

This migration is deliberately **UNAPPLIED**. Strict contracted runtime concurrency/fencing depends on this schema being reviewed and applied in a separate authorized migration step. Code-review readiness does not authorize that step.

The submitted SQL provides:

- atomic claim against exact job + contract identity;
- expired-lease takeover only through a new claim;
- monotonically increasing `execution_attempt` fencing tokens;
- owner+attempt checks on renew/check/release;
- an explicit failed-job recovery acquisition mode rather than making terminal rows generally claimable;
- current-owner finalization/release across successful merge and failed execution states;
- lease-expiry checks on renew/check and application terminal writes;
- 15-minute default lease with 4-minute application heartbeat for long provider/Grok calls;
- immediate lease renewal/fencing at the Git mutation boundary;
- service-role-only function execution with public/anon/authenticated revoked;
- additive/default-compatible columns for existing jobs.

### Disposable PostgreSQL concurrency verification

The focused review workflow starts PostgreSQL 16 and executes the review-only schema/lifecycle script in a disposable transaction:

```text
psql -v ON_ERROR_STOP=1 -f tests/sql/content-studio-execution-lease.sql
```

The script applies the candidate execution-lease DDL/functions to the disposable database and rolls the transaction back after asserting: normal atomic claim, active-opportunity uniqueness, failed→explicit-retry acquisition, merged-owner finalization/release, failed-owner release/retry, expired takeover with an incremented attempt token, and rejection of stale owner/attempt tokens. This does **not** touch the live Supabase project and is not migration execution authorization.

Concurrency/Git-boundary tests submitted with the migration are also listed in the schema-review package. **No migration in this section was executed by this implementation session.**

## Full-Jest failure triage retained from earlier review passes

The earlier `34914478631` failures were followed through the public paths rather than automatically classified as test-only. Important outcomes included:

- real `NextRequest` fixtures replacing clone-less request mocks;
- a real bulk-approval production regression fixed so gated rows remain `skipped` and true failures stay distinct;
- GitHub helper mocks changed to preserve real target normalization;
- Supabase test builders isolated per request;
- manufactured-thesis / `Worked Example` expectations replaced with fail-closed behavior;
- acceptance-intended rewrite fixtures upgraded to valid audit/contract context while damaging rewrites remain rejected;
- thin overwrite protection tested behaviorally through the public PATCH route.

Later facade/core splits keep one public entry door while moving implementation behind it. Source-level tests therefore inspect implementation cores for implementation policy and public facades for recovery/fencing delegation rather than requiring implementation text to remain physically in the facade file.

## Verification protocol

GitHub Actions is the executable verification source for this review because this session cannot establish a usable local GitHub checkout. No local Jest/build result is claimed.

Main PR verification executes:

```text
npm ci --legacy-peer-deps
npx tsc --noEmit -p tsconfig.json
npx jest --ci
npm run build
```

A separate `Content Studio Review` workflow executes the disposable PostgreSQL lifecycle script plus the focused Content Studio regression set. Final review handoff must cite both workflow runs for one exact head SHA.

On a `pull_request` event, Cloudflare credential validation, secret synchronization, Wrangler/OpenNext deployment, Worker-secret health checks and post-deploy production smoke verification remain skipped. The Next/OpenNext build itself must pass. No workflow dispatch is used to bypass this boundary.

## Editorial benchmark protocol and status

`docs/content-studio/ARTICLE_SAMPLES_20260914.md` defines the required **8-dimension, 12-pair blinded benchmark**, including at least **9/12** candidate human-preference wins, usefulness/factual-support ratings and a zero-critical-fabrication gate for fees/dates/outcomes/rules.

**Benchmark status: NOT RUN / NOT MET.** Fixtures and regression tests are not a blind article-quality benchmark. There are no completed human preference votes or live provider pairwise scores in this branch.

## Remaining external/runtime limitations

- The new execution-lease migration is **UNAPPLIED** and is a runtime prerequisite for strict same-job execution fencing. It requires independent Codex schema review and separately authorized migration execution.
- No live TinyFish paid/runtime credential exercise was performed in this pass.
- Production Marketplace conversion-event emission was not verified with live credentials; unknown instrumentation coverage remains unknown in code.
- Production provider/model behavior under live credentials remains externally unverified beyond mocked/contract tests.
- No merge or authorized deployment was performed, so live destination publication verification cannot be demonstrated here.
- Some destination repositories do not configure GitHub Environment objects; the proof layer records environment approval as `not configured` rather than fabricating an approval, while still requiring authorized workflow/job/commit/artifact proof.
- The 12-pair human editorial benchmark remains outstanding.
- No ranking, conversion, publication-success, human-authorship, merge, or release guarantee is made.

## Review boundary

PR #200 must remain draft for independent Codex review. This implementation session does not merge it, deploy it, run Wrangler, publish an article, or execute a migration. Passing CI establishes code-review readiness only.
