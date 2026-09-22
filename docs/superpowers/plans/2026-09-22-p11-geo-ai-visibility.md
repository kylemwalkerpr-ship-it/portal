# P11 GEO / AI Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make P11 answer-engine visibility evidence ownership-aware, failure-aware, provenance-preserving, secure, and explicitly denominator-correct without inventing content or generic AI-SEO prescriptions.

**Architecture:** Preserve `seo_llm_visibility` and `lib/seoEngine/llmVisibility.ts` as the existing evidence plane. Add a focused pure truth-contract module for strategic owner targets, provider-attempt status, citation URL normalization/classification and coverage aggregation; persist the richer contract additively on the existing table and enrich `engines_json` rather than creating a parallel AI-SEO platform. Bind default audits to the authoritative 76-row ownership registry, expose coverage through the existing API/admin surface, and make remediation owner-first and CREATE-frozen.

**Tech Stack:** Next.js App Router, TypeScript, Jest, Supabase/Postgres, Cloudflare/OpenNext.

**Spec:** `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`

## Global Constraints

- Current repository/live evidence outranks notes and handoff snapshots.
- P9 and P10 remain truthfully open; P11 work must not manufacture predecessor outcomes.
- Citation denominator is successful provider/query attempts only; unavailable/provider/parse failures never become uncited successes.
- Zero successful attempts means citation share is `null`/unavailable, never `0%`.
- Use `lib/seoFactory/ownership.ts` plus `data/seo/ownership-registry.json` as the ownership authority; create no parallel host/topic ownership map.
- Current authoritative ownership requires `status=confirmed` and action `keep|expand|merge`; `build` and `supply_first` do not authorize current-owner citation claims.
- Preserve raw cited URLs and normalized URLs; distinguish authoritative owner, current support/other estate, wrong owner, known retired public URL, unknown estate URL, and competitor.
- Broad CREATE remains frozen until P13. An unowned P11 query blocks/no-ops; it never creates a new page.
- Do not add or recommend `llms.txt` absent provider-specific measured evidence; this implementation performs no `llms.txt` change.
- Only the two commissioned providers in `contentAiRegistry` are runtime-supported; never claim ChatGPT, Gemini, Perplexity, Copilot, or AI Overview support.
- Generic provider/content-model self-reported citations are not relabeled as verified public search-engine citations; provenance/coverage must remain explicit.
- No production mutation until branch tests/CI/merge and official workflows authorize it. Migration is additive and applied only by the official migration workflow.
- Harden `seo_llm_visibility` so `anon`/`authenticated` cannot mutate authoritative evidence; service-role/admin path remains the server writer.
- Do not touch unrelated worktrees/jobs, especially `MARKET-PORTAL-AUTH-HANDOFF-1102`.

## Review Focus

1. Malformed structured output with recoverable URLs must remain `parse_failure` and stay out of the successful denominator.
2. US Form I-485 must never inherit Australia subclass 485 ownership, and F-1/OPT/STEM OPT plus UK Student/Graduate/Skilled Worker must remain distinct through the existing ownership resolver.
3. A current YouSafe URL owned by another strategic intent must be classified as `wrong_current_owner`, not a successful authoritative-owner citation.
4. Mixed provider outcomes (success + unavailable/failure/parse failure) must keep every component visible while denominator math counts only successful attempts.
5. Historical rows with no P11 contract fields must remain legacy/unknown rather than being silently backfilled or coerced into the new measurement state.

---

### Task 1: P11 truth contract

**Files:**
- Create: `lib/seoEngine/geoVisibilityTruth.ts`
- Create: `tests/p11-geo-visibility-truth.test.ts`
- Modify: `lib/seoEngine/llmVisibility.ts`

**Interfaces:**
- Consumes: `OwnershipRow`, `HOST_PUBLIC`, `isAuthoritativeOwnershipRow`, existing `EngineAudit` evidence.
- Produces: `GeoAuditStatus`, `CitationClassification`, `StrategicAuditTarget`, `classifyCitationUrl`, `selectStrategicAuditTargets`, `summarizeProviderAttempts`, strict parse-success semantics.

- [x] **Step 1: Write failing tests** for authoritative target selection, I-485/AU-485 separation via existing ownership truth, URL normalization/classification, known retired Marketplace path, wrong-owner citation, malformed response => `parse_failure`, mixed outcome coverage, and zero-success `shareOfVoice=null`.
- [x] **Step 2: Run** `npx jest --runInBand tests/p11-geo-visibility-truth.test.ts` and verify RED because the P11 truth module/status behavior does not yet exist.
- [x] **Step 3: Implement** the smallest pure contract and adjust `EngineAudit`/parser result so only a structurally parsed response is `success`; regex-recovered malformed output remains evidence with `status=parse_failure` and never enters citation math.
- [x] **Step 4: Re-run** the focused test and the existing `seo-llm-visibility*` + P1 failure-accounting suites; require GREEN.
- [x] **Step 5: Commit** `feat(seo): add P11 GEO visibility truth contract`.

### Task 2: Additive persistence and least privilege

**Files:**
- Create: `supabase/migrations/20260922130000_p11_geo_visibility_truth.sql`
- Create: `tests/p11-geo-visibility-db-contract.test.ts`
- Modify: `lib/seoEngine/llmVisibility.ts`

**Interfaces:**
- Consumes: Task 1 target/status/classification/coverage types.
- Produces: nullable historical-compatible P11 columns on `seo_llm_visibility`: contract/run/owner/query-family/prompt/audit-status/failure/extraction/raw+normalized URL/classification/competitor-URL/coverage/timestamps; new writes populate them.

- [x] **Step 1: Write failing migration-contract tests** asserting additive nullable columns, closed status CHECK vocabulary, no historical backfill, broad legacy policy removal, `REVOKE ALL` from `anon`/`authenticated`, service-role server access, and no security-definer function.
- [x] **Step 2: Run** the new DB-contract test plus migration-order/ledger-policy tests and verify RED on the missing migration.
- [x] **Step 3: Add** the migration and update persistence to write all P11 fields while preserving legacy columns/`engines_json`.
- [x] **Step 4: Re-run** DB-contract, migration-order, migration-ledger-policy, and LLM visibility suites; require GREEN.
- [x] **Step 5: Commit** `feat(seo): persist secure P11 GEO evidence`.

### Task 3: Ownership-bound strategic audit execution

**Files:**
- Modify: `lib/seoEngine/llmVisibility.ts`
- Modify: `app/api/seo-engine/llm-visibility/route.ts` only if response typing requires it
- Create: `tests/p11-geo-visibility-execution.test.ts`

**Interfaces:**
- Consumes: `selectStrategicAuditTargets`, commissioned provider registry, Task 2 persistence contract.
- Produces: default audits from authoritative strategic owners, explicit blocked state for unresolved custom queries, explicit `provider_unavailable|provider_failure|parse_failure|success` attempts, prompt id/version and provider/model provenance.

- [x] **Step 1: Write failing tests** showing the default pool comes from authoritative ownership rows (not planner/knowledge/random seed expansion), five required strategic families appear when eligible, unowned explicit queries block without provider execution, unconfigured commissioned providers surface as unavailable, and mixed outcomes persist visible coverage.
- [x] **Step 2: Run** the focused execution test and verify RED on current adaptive/fuzzy behavior.
- [x] **Step 3: Wire** the strategic target selection and closed status model into `auditQuery`/`runVisibilityAudits`; retain explicit query text but require authoritative owner resolution for P11 measurement.
- [x] **Step 4: Re-run** focused + existing audit/cron/action-stream route suites and require GREEN.
- [x] **Step 5: Commit** `feat(seo): bind GEO audits to strategic owners`.

### Task 4: Evidence-driven remediation safety

**Files:**
- Modify: `lib/seoEngine/citationRemediation.ts`
- Modify: `lib/seoEngine/llmVisibility.ts`
- Create: `tests/p11-citation-remediation-safety.test.ts`

**Interfaces:**
- Consumes: authoritative owner URL/id and classified competitor/current-estate evidence from Tasks 1–3.
- Produces: owner-expansion/research/no-action remediation only; no fuzzy creation fallback and no generic `llms.txt` prescription.

- [x] **Step 1: Write failing tests** proving missing owner => no action, an owner-bound loss can only target that existing owner, wrong-owner/retired evidence is surfaced as estate repair, competitor evidence opens research rather than copied claims, and source contains no active `llms.txt` or `mode:new` remediation path.
- [x] **Step 2: Run** the focused test and verify RED against current fuzzy `content_jobs`/cluster fallback and generic action list.
- [x] **Step 3: Replace runtime remediation matching** with exact owner-bound behavior; preserve old pure helpers only if existing callers/tests require them, but runtime P11 may not use fuzzy CREATE fallback.
- [x] **Step 4: Re-run** remediation + LLM + Content Studio affected suites; require GREEN.
- [x] **Step 5: Commit** `fix(seo): make GEO remediation evidence driven` (follow-up client-safety fix `fix(seo): keep P11 remediation client-safe`).

### Task 5: Visible P11 coverage and denominator reporting

**Files:**
- Modify: `lib/seoEngine/llmVisibility.ts`
- Modify: `app/api/seo-engine/status/route.ts`
- Modify: `components/design/admin-seo-engine.tsx`
- Create: `tests/p11-geo-visibility-reporting.test.ts`

**Interfaces:**
- Consumes: P11 coverage fields and enriched `engines_json`.
- Produces: visible attempted/success/unavailable/provider-failure/parse-failure/authoritative/other-current/wrong-or-retired/competitor/no-citation counts, explicit successful denominator, legacy-row count, and `null` share when successful=0.

- [x] **Step 1: Write failing route/source tests** for all required counters, legacy rows remaining separate, zero-success null, and admin copy that names the successful-attempt denominator rather than a naked percentage.
- [x] **Step 2: Run** reporting/status/admin tests and verify RED.
- [x] **Step 3: Implement** aggregation/read-side reporting and the bounded admin evidence panel additions without changing unrelated UI.
- [x] **Step 4: Re-run** focused reporting/status/admin suites; require GREEN.
- [x] **Step 5: Commit** `feat(seo): expose P11 GEO evidence coverage`.

### Task 6: Exact-head verification and truthful program record

**Files:**
- Modify: `docs/superpowers/seo-execution-ledger.md`
- Modify: `docs/superpowers/seo-parity-matrix.md` only to record truthful P11 implementation/evidence state; do not mark PASS without live gate proof.
- Modify: this plan with execution evidence if useful.

**Interfaces:**
- Consumes: all prior task commits and verification output.
- Produces: reviewable branch with exact evidence and no false phase promotion.

- [x] **Step 1: Run** all P11/P1/ownership/provider/migration focused suites, `npx tsc --noEmit`, full `npm test -- --runInBand`, `npm run build`, and `git diff --check`; restore any generated artifacts that are not intentional. (Executed 2026-09-22 gen-4: focused 12 suites / 104 tests PASS; full serial Jest 504 suites PASS / 2 skipped, 5,742 tests PASS / 4 skipped, exit 0; `tsc` exit 0; `git diff --check` clean; credential-backed Next.js 16.2.11 + OpenNext Cloudflare build PASS — see ledger for exact numbers.)
- [x] **Step 2: Record** exact local results and read-only production baseline in the execution ledger: 267 historical rows; 197 legacy measured under P1 rules; 70 `audit_failed`; 3 malformed; 6 no-sources; 0 measured estate citations; 55 distinct queries; latest observation 2026-09-15; 0 fan-out rows; insecure pre-P11 public policy/grants; two commissioned runtime providers only. (Also recorded: authoritative-owner cohort 67 of 76 confirmed rows after the shared fail-closed predicate excludes 5 build/supply_first + 4 generic section roots.)
- [x] **Step 3: Keep P11 non-PASS** unless post-deploy live P11 observations satisfy the canonical gate; explicitly retain public-answer-engine/provider limitations and P9/P10 open outcomes. (Ledger + matrix record P11 as IN_PROGRESS / implementation ready; PASS not claimed.)
- [x] **Step 4: Self-review the whole branch** because no independent executor/reviewer is available; fix Critical/Important findings with RED→GREEN tests, then re-run affected/full verification. (Two repairs applied and now committed at `c843fadca0fc35e0ba9dcb1448cfd58c477397f6` — the stable runtime/test P11 implementation checkpoint — with post-commit verification 3 focused Jest suites / 19 tests PASS: gen-2 — `loadLlmVisibilityEvidence` exact-latest-P11-only evidence + batch shareOfVoice from successful provider attempts with the counters actually returned (a provable defect: declared but omitted from the return object, caught RED by `tests/p11-geo-visibility-execution.test.ts`); gen-3 — action-stream SSE/`recordEngineRun` persist and name the provider-attempt denominator alongside legacy query counts, pinned by `tests/p11-action-stream-provider-denominator.test.ts`.)
- [x] **Step 5: Commit** `docs(seo): record P11 GEO visibility evidence`. (Documentation is being committed in this checkpoint; the commit SHA is not embedded here because it cannot be known until the commit itself exists.)
