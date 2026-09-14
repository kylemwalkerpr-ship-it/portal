# GPT Sol takeover — Content Studio PR #200

Prepared 14 September 2026. GPT Sol replaces Grok as IMPLEMENTER. Codex remains reviewer. This does not automatically change the Studio's configured runtime author model.

## Assignment and boundaries

Complete the existing evidence-contract implementation on `feature/content-studio-evidence-contract-20260914`, PR https://github.com/kylemwalkerpr-ship-it/portal/pull/200.

Read the entire original contract:
https://github.com/kylemwalkerpr-ship-it/portal/blob/docs/content-studio-grok-architecture-20260914/docs/GROK_4_6_CONTENT_STUDIO_IMPLEMENTATION_CONTRACT.md

Read Codex's review:
https://github.com/kylemwalkerpr-ship-it/portal/pull/200#pullrequestreview-5200835584

Refresh main and the PR before editing, read AGENTS.md, and preserve branch work. Keep the PR draft. Do not merge, deploy, run Wrangler, or publish articles. Return a complete pushed branch for Codex review.

Grok's local-only patches are unavailable here. Recover them if actually accessible; otherwise implement the missing behavior yourself. Do not wait for Grok or claim local work is committed. Use real patches/full files with blob-SHA checks; never replace a file with a stub or truncate it to satisfy a connector limit.

## Recovery completed by Codex

- `planner.ts` was restored in commit `ca0bfb1f50446eb3ee8dde348c0b44fae43f7e2f` from intact `fffd7e891c831b8abc12f5d762ceda50e8f3bbe3`.
- The complete file is restored, including marketplace in DemandSourceId and first-party search/session/conversion fields.
- Exact remote file equality was checked. Do not overwrite this restoration.
- Hardened migration source committed in `39eef30fe8b0f26607ac152ba79f0bfa8bb2d84d`.

## Database: already applied, not pending

The user explicitly authorized Codex to apply the Content Studio migration. It was applied to the existing `yousafe-saas` project `krggzrxxnqfsbbklatxl` through the authenticated Supabase connector. No pasted token was used or persisted.

- Applied migration: `content_studio_evidence_contract`
- Supabase history version: `20260914181604`
- Exact source: `supabase/migrations/20260914_content_studio_evidence_contract.sql` at `39eef30`.
- No development/staging branch existed; this was applied directly to the existing project under the user's latest instruction. No staging test is claimed.
- No application merge or deployment accompanied the database change.
- Nullable content_jobs columns and three new private tables were added.
- RLS enabled on evidence, writing-contract, and stage-event tables.
- PUBLIC/anon/authenticated table access revoked; service-role privileges retained.
- Stage-event sequence access restricted and service-role usage granted.
- Contract trigger rejects changes to any row field and rejects deletion.
- Positive contract version and stage attempt checks added.
- Opportunity reservation index covers actual allowed active statuses: pending, drafting, processing, publishing, pr_created. The previous proposed statuses matched none of the live status constraint's active values.

Post-apply verification: all three tables have RLS, no anon/authenticated SELECT/INSERT/UPDATE/DELETE privileges, and service-role INSERT access. A transactional probe confirmed contract identity UPDATE and DELETE rejection and was rolled back.

Database allowed content_jobs statuses observed: pending, drafting, processing, publishing, pr_created, merged, closed, failed. New execution stages belong in execution_stage, not status. Map transitions explicitly.

Do not blindly replay the migration. The repository filename prefix (20260914) differs from Supabase's assigned history version (20260914181604). Inspect the repo migration runner and history; reconcile this deliberately without dropping schema or deleting migration history. Future changes should be new additive migrations. Never edit an already-applied migration and imply production changed.

The applied schema is a foundation, not proof that the workflow is complete. Contract IDs should uniquely identify each immutable version (job_id, contract_version is unique when job_id exists). Do not update an existing contract row to represent a new version. Additional foreign keys, evidence constraints, retention, reservation retry semantics and transaction wiring need implementation/review.

## Priority implementation work

1. Trace all actual GitHub files against the contract; correct the audit's unsupported completion claims. The prior package contained helpers without the production integration.
2. Make discovery evidence honest:
   - Remove fabricated strategy impressions/positions in gsc/suggestions.
   - Distinguish empty/unavailable suggestion providers.
   - Stop blanket exclusion of F-1, I-485, AU 485 and valid student-visa demand; retain jurisdiction and spam/privacy checks.
   - Paginate inventory and reserve opportunities atomically across UI/queue/retry paths.
   - Keep distinct reader intent in opportunity identity; test equivalent variants and distinct questions.
3. Implement server-owned WritingContract persistence and loading:
   - suggest-brief → contract ID/version/hash → saved job → reload/queue → JSON/SSE → revision → ship.
   - UI field copies must not substitute for the persisted contract.
   - No manufactured thesis, FAQ, lede or takeaways when validation fails.
   - Missing critical evidence stops at needs_research/brief_invalid.
4. Integrate the shared rewrite validator into linearDesk and both pipelines:
   - Require adequate validation context; preserve sources, headings, facts, qualifications and keyword provenance.
   - No isolated-draft fallback after coherent-writing failure.
   - No post-acceptance kit/scaffold insertion without reevaluation.
   - Consolidate execution behind JSON/SSE and ensureMinimumOutline behavior by format.
5. Complete Tinyfish evidence collection:
   - Verify the existing adapter's documented API, auth, output validation, SSRF handling and source provenance.
   - Persist source status, gaps and run/checkpoint IDs through masterEngineFeed and the writing contract.
   - ChatGPT connector availability is not Worker credential availability.
   - Report untested live collection honestly; use mocks for error paths.
6. Preserve Marketplace measurement semantics:
   - Keep first-party counts separate from monthly provider volume throughout keywordDemand merge and ranking.
   - The committed feeder now queries Supabase, but its default conversion coverage uses existence of any historical conversion event. That is not proof of current instrumentation/window coverage for every query. Fix this before claiming zero conversions measured.
   - Match real category/jurisdiction/service inventory and add privacy-preserving article-to-confirmed-conversion attribution.
7. Complete publication verification:
   - canClaimLiveSuccess/evaluateLiveArtifact must reject absent marker, absent canonical assessment, absent indexability assessment, or empty/wrong article body.
   - Wire helpers into liveVerify, durable monitoring, job persistence and UI labels.
   - Exact PR head/check/merge/deploy/artifact lineage is required. HTTP 200 or phase labels are insufficient.
   - No fire-and-forget work relied on for durable success.
8. Update docs to reflect deployed schema versus unfinished application work. Do not treat migration success as editorial readiness.

## Tests and evidence

Push behavioral tests, including `tests/content-studio-evidence-contract.test.ts`, not merely a command referring to an absent file.

Required cases: intent identity separation; concurrent reservation; suggestion outage/empty; valid immigration terms; no synthetic metrics; persisted contract continuity; invalid brief rejection; damaging rewrite rejection; JSON/SSE parity; Marketplace volume isolation; unknown conversion coverage; fail-closed live proof; exact-SHA transitions; anonymous/authenticated access denial and service-role operation; immutable version insertion.

Run focused tests, TypeScript, required suite/build, and relevant destination renderer tests. Existing green CI on an earlier incomplete head is not evidence for this implementation. Record exact tested SHA and commands.

Restore the original eight-dimension editorial rubric and actual paired benchmark (at least 12 cases, human preference target 9/12, required usefulness/factual-support ratings and no critical defects). Topic lists, fixture openings and model self-scores are not a completed benchmark. Use real evidence-backed drafts; if runtime Grok is unavailable, report that limitation and identify any actual alternate model used. Do not silently change the production model policy.

## Return to Codex

Provide PR URL, latest head SHA, resolved review findings with file references, migration history/source mapping, test results, representative evidence dossiers/contracts/revisions, real article evaluation status, and all remaining blockers.

Codex will review the fully pushed implementation. User's no-merge/no-deploy boundary remains in effect. Do not claim completion from a preview, migration, helper module, or green badge alone.
