# Content Studio Evidence Contract Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete PR #200 so Content Studio uses honest discovery evidence, a persisted immutable WritingContract across all production generation paths, fail-closed editorial/publication verification, correct Marketplace measurement semantics, and behavioral proof suitable for Codex review.

**Architecture:** Keep the existing Studio, ownership, renderer, ship, and quality-gate architecture. Make `WritingContractV2` the server-owned generation boundary; add focused persistence/loading/reservation/publication helpers and make JSON/SSE/revision/ship consume them instead of reconstructing state from UI fields. Preserve the already-applied database migration as immutable history; any additional schema requirement must use a new additive migration.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, Jest 30, Supabase JS 2, existing GitHub/Cloudflare release workflow.

**Spec:** `docs/content-studio/GPT_SOL_TAKEOVER.md` plus `docs/GROK_4_6_CONTENT_STUDIO_IMPLEMENTATION_CONTRACT.md` on branch `docs/content-studio-grok-architecture-20260914`.

## Global Constraints

- Work only on `feature/content-studio-evidence-contract-20260914`; keep PR #200 draft.
- Do not merge, deploy, run Wrangler, or publish articles.
- `main` refreshed at `a33243111623ba2ded3332a010c8346bdf7d05cb` before implementation.
- Do not overwrite Codex's restored `planner.ts`; preserve commit `ca0bfb1f50446eb3ee8dde348c0b44fae43f7e2f` behavior.
- Do not edit/replay `supabase/migrations/20260914_content_studio_evidence_contract.sql`; live history is `20260914181604`. Future schema changes are new additive migrations only.
- `content_jobs.status` remains limited to `pending`, `drafting`, `processing`, `publishing`, `pr_created`, `merged`, `closed`, `failed`; workflow detail belongs in `execution_stage`.
- Active opportunity reservations are `pending`, `drafting`, `processing`, `publishing`, `pr_created`.
- A Cloudflare preview, HTTP 200, merge state, or caller-supplied phase is never live-artifact proof.

---

### Task 1: Establish behavioral regression tests before production wiring

**Files:**
- Create: `tests/content-studio-evidence-contract.test.ts`
- Modify only existing focused tests when an exported production seam needs direct coverage.

**Interfaces:**
- Consumes: `buildOpportunityIdentity`, Marketplace feeder helpers, discovery source-state helpers, `buildWritingContract`, contract persistence/load helpers, `acceptRewriteCandidate`, publication verification helpers.
- Produces: executable regression coverage for every takeover-required case.

- [ ] Add Jest cases for distinct F-1 renewal/OPT intent, I-485/AU-485 separation, equivalent-intent stability, and concurrent reservation behavior.
- [ ] Add discovery cases proving suggestion `empty` vs `unavailable`, valid immigration queries survive filtering, and strategy hypotheses never acquire synthetic impressions/position.
- [ ] Add Marketplace cases proving submitted-search counts remain first-party fields, never provider monthly volume, and conversion coverage remains `unknown` without explicit current-window instrumentation proof.
- [ ] Add WritingContract cases proving immutable identity/version continuity through persistence/load and invalid mandatory brief content fails closed.
- [ ] Add rewrite cases for missing audit context, lost negation/qualification, changed amount/date, citation loss, heading loss, and unrelated replacement.
- [ ] Add deterministic fake-model JSON/SSE parity coverage and no isolated-draft fallback after coherent writer failure.
- [ ] Add publication cases for missing marker/canonical/indexability/body, wrong SHA/deploy lineage, stale old article, and exact-SHA success.
- [ ] Add database-contract assertions for RLS/grants/immutability using schema/migration behavior without replaying production migration.
- [ ] Run focused test command after each implementation slice: `TZ=UTC npm test -- tests/content-studio-evidence-contract.test.ts --runInBand`.

### Task 2: Make discovery evidence and opportunity reservation honest

**Files:**
- Modify: `app/api/content-studio/gsc/suggestions/route.ts`
- Modify: `lib/seoFactory/keywordDiscover.ts`
- Modify: `lib/seoEngine/researchDemand.ts`
- Modify: `lib/seoFactory/opportunityIdentity.ts`
- Add/modify focused reservation helper used by UI/queue/retry paths.

**Interfaces:**
- Consumes: `OpportunityIdentity`, live `content_jobs` status constraint.
- Produces: stable `opportunity_id`, atomic reservation result, explicit suggestion-source state, hypothesis-only strategy records.

- [ ] Remove strategy-corpus rows from all measured GSC scoring inputs; hypothesis records carry null observed metrics.
- [ ] Return `ok | empty | unavailable` suggestion-provider state based on actual provider result/error.
- [ ] Narrow noise filtering so F-1, US I-485, AU subclass 485, and valid UK/CA/AU student-visa demand remain eligible while privacy/spam junk stays rejected.
- [ ] Use normalized `readerIntent` in identity and reserve via an insert/claim path that relies on the existing unique active-status index; duplicate concurrent claims resolve to the existing active job rather than creating siblings.
- [ ] Ensure inventory/collision reads paginate instead of stopping at the first bounded page where the production API supports paging.

### Task 3: Persist and load the server-owned WritingContract end to end

**Files:**
- Modify: `lib/seoFactory/writingContract.ts`
- Create: `lib/seoFactory/writingContractStore.ts`
- Modify: `app/api/content-studio/suggest-brief/route.ts`
- Modify: `lib/seoFactory/persistContentJob.ts`
- Modify: `lib/seoFactory/pipeline.ts`
- Modify: `lib/seoFactory/pipelineStream.ts`
- Modify relevant jobs/revision/ship routes that save, resume, revise, or ship Content Studio jobs.
- Modify the Content Studio UI only to retain/display contract identity; it must not become the source of truth.

**Interfaces:**
- Produces: `persistWritingContract(db, contract, jobId)`, `loadWritingContract(db, {contractId, contractHash, jobId})`, and a canonical pipeline contract resolver.
- Contract rows are insert-only; a new version is a new row. Job columns mirror current contract identity for lookup.

- [ ] Build a validated sealed brief from `suggest-brief`; on missing mandatory editorial/evidence fields return `brief_invalid` or `needs_research`, never generic thesis/lede/takeaways/FAQ.
- [ ] Resolve owner/host, evidence hash, requested model, opportunity identity, build `WritingContractV2`, persist it, and return `contractId`, `contractVersion`, `contractHash`, `evidenceHash` with the brief response.
- [ ] Save those identifiers on `content_jobs`; reload queued/resumed jobs from the immutable contract table and compare ID/hash before generation/revision/ship.
- [ ] Make JSON and SSE execution resolve the same canonical contract and reject conflicting client field copies.
- [ ] Make revision and ship preserve/verify the same contract identity; changing editorial substance creates/uses a new contract version rather than mutating an old row.

### Task 4: Fail closed in coherent writing and rewrite acceptance

**Files:**
- Modify: `lib/seoFactory/sealedBrief.ts`
- Modify: `lib/seoFactory/linearDesk.ts`
- Modify: `lib/seoFactory/rewriteAcceptance.ts`
- Modify: `lib/seoFactory/pipeline.ts`
- Modify: `lib/seoFactory/pipelineStream.ts`

**Interfaces:**
- Consumes: persisted `WritingContractV2`, full keyword provenance, before/after audits.
- Produces: accepted current revision or structured rejection; no silent semantic downgrade.

- [ ] Remove substantive fallback creation from `sealBriefFromAssembly`; mandatory missing brief fields remain missing and validation reports them.
- [ ] Replace `linearDesk`'s local length-only rewrite check with `acceptRewriteCandidate` supplied with audits, required keyword provenance, headings/sources, and contract word bounds.
- [ ] Throw/classify `BriefInvalidError` when repaired model output still fails validation; map job `execution_stage` to `brief_invalid`/`needs_research` without inventing content.
- [ ] Remove isolated-draft fallback after `runLinearDesk` failure in both JSON and SSE paths.
- [ ] Any visible post-acceptance transformation must trigger a fresh final audit/rewrite-validation decision; render-safe serialization may remain deterministic.

### Task 5: Wire Tinyfish evidence and truthful source health

**Files:**
- Modify: `lib/seoFactory/tinyfishAdapter.ts`
- Modify: `lib/seoFactory/masterEngineFeed.ts`
- Modify: `lib/seoFactory/writingContract.ts`
- Modify evidence persistence helpers used during brief creation.

**Interfaces:**
- Produces: research run/checkpoint identity, `ok | empty | unavailable | unconfigured` state, normalized source provenance, explicit gaps included in evidence hash/contract.

- [ ] Validate configured API base/protocol/host and reject unsafe destinations; never allow arbitrary user-controlled fetch URLs.
- [ ] Distinguish auth/timeout/malformed/empty outcomes in mocks and persisted source status.
- [ ] Normalize only valid HTTP(S) source URLs and preserve observed timestamp/query/provider/run identity.
- [ ] Feed Tinyfish observations and source gaps through `masterEngineFeed` into the persisted evidence snapshot and WritingContract evidence hash.
- [ ] Do not claim live Tinyfish collection unless Worker credentials are actually exercised; tests use deterministic mocks for error paths.

### Task 6: Preserve Marketplace units and explicit conversion coverage

**Files:**
- Modify: `lib/seoEngine/marketplaceDemandFeeder.ts`
- Modify: `lib/seoEngine/demandFeeders.ts`
- Modify: `lib/seoEngine/keywordDemand.ts`
- Preserve restored `lib/seoEngine/planner.ts` unless a strictly additive compatibility edit is unavoidable and blob equality is rechecked first.

**Interfaces:**
- Marketplace fields: submitted search count/session count/click count/conversion count plus explicit coverage state/window.
- External `volume` stays provider monthly demand only.

- [ ] Default feeder queries protected Supabase aggregate with service role and surfaces database errors/empty state explicitly.
- [ ] Remove historical-any-conversion inference. Mark conversions measured only from explicit instrumentation/window coverage; otherwise `marketplaceConversionCount = null` and `conversionCoverage = 'unknown'`.
- [ ] Ensure `mergeDemandSignals` never promotes Marketplace counts into monthly `volume`; retain first-party fields through ranking/planning.
- [ ] Keep category/jurisdiction/service matching canonical and avoid unsupported recommendation claims.

### Task 7: Require durable publication lineage and exact artifact proof

**Files:**
- Modify: `lib/seoFactory/publicationStates.ts`
- Modify: `lib/seoFactory/liveVerify.ts`
- Modify: `lib/seoFactory/deployMonitor.ts`
- Modify: `app/api/content-studio/verify-published/route.ts`
- Modify job persistence/UI status mapping where merged/deployed/live labels are derived.

**Interfaces:**
- Publication manifest includes expected revision marker/body identity, repo/path/canonical, PR number, approved head SHA, merge SHA, deployment run/commit identity.
- `live_verified` requires all evidence dimensions to be affirmative.

- [ ] `canClaimLiveSuccess` fails when marker, canonical assessment, indexability assessment, extracted article body, or exact lineage is absent/unknown.
- [ ] `evaluateLiveArtifact` extracts/checks article body rather than navigation/footer and rejects wrong/stale content.
- [ ] Verify PR head/check evidence belongs to the exact approved SHA; verify deployment lineage contains the expected merge/artifact commit.
- [ ] Persist verification pending/failure/success and next-attempt metadata; remove reliance on fire-and-forget verification surviving Worker termination.
- [ ] UI labels distinguish PR open, checks pending/passed, merged, deployment pending, deployed/verifying, live verified, and failures.

### Task 8: Correct audit/benchmark documentation and produce Codex handoff evidence

**Files:**
- Modify: `docs/CONTENT_STUDIO_IMPLEMENTATION_AUDIT.md`
- Modify: `docs/content-studio/ARTICLE_SAMPLES_20260914.md`
- Modify: `docs/content-studio/GPT_SOL_TAKEOVER.md` only if needed to append tested-head handoff facts without changing historical migration claims.

**Interfaces:**
- Produces truthful implementation status and eight-dimension benchmark worksheet/results.

- [ ] Replace unsupported “addressed” claims with exact files/tests and distinguish applied schema from application readiness.
- [ ] Restore rubric dimensions: usefulness, factual support, specificity, coherence, natural prose, format fit, originality/value, CTA relevance.
- [ ] Include 12 paired evidence-backed draft cases with human preference field and critical-defect field; do not label topic lists/model self-scores as a completed benchmark.
- [ ] If live runtime author generation is unavailable, record benchmark as blocked/incomplete and identify any actual alternate model used rather than changing production policy.

### Task 9: Verification, CI, and return to Codex

**Files:**
- No production changes unless validation exposes a concrete defect; fixes repeat the task-specific test cycle.

- [ ] Run/trigger focused tests for `tests/content-studio-evidence-contract.test.ts` and relevant existing suites.
- [ ] Run TypeScript: `npx tsc --noEmit` (with repository-supported Node memory option if CI requires it).
- [ ] Run full Jest suite in UTC: `TZ=UTC npm test -- --runInBand`.
- [ ] Run production build: `npm run build`.
- [ ] Attempt `npm run lint`; if Next 16 makes `next lint` non-operational, report the exact failure rather than calling it passed.
- [ ] Inspect GitHub Actions for the exact final head SHA; old green runs are not evidence.
- [ ] Keep PR #200 draft and return: PR URL, final SHA, resolved Codex findings with file references, migration source/history mapping, exact commands/results, representative dossiers/contracts/revisions, benchmark status, and remaining blockers.
