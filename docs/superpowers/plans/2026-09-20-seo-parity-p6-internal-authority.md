# SEO Parity P6 — Internal Authority Execution (foundation checkpoint)

> **Implementation record — P6 is IN_PROGRESS, never PASS.** This document records the P6 *foundation repair* only. Nothing here authorizes or performs a production/backlog mutation: no migration was applied, no `seo_interlinks` row was changed, no reconciliation/rejection/retarget ran, and broad net-new CREATE stays frozen until P13.

**Goal:** make interlink `applied` mean "verified live", stop new dead targets at persistence, and make every automatic draft link fail closed — before any backlog reconciliation is authorized.

**Design source:** `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md` (§ P6 — Internal authority execution).

**Branch:** `seo/p6-internal-authority-20260920` (base `e44fa01944423babe906c45f36c06bf4b6a8b4d4`).

## Authoritative audit facts (read-only, 2026-09-20)

- **1,899** persisted `seo_interlinks` rows: all `planned`; **0 applied, 0 rejected, 0 gated**.
- **206 sources / 236 targets.**
- **1,643 rows** point at real 404 targets; **183 rows** point at legacy Portal auth-wall targets; only **73 rows** have a current canonical live target (**3 Marketplace category URLs**).
- `source_slug` is a **planner identity, not a URL**. `content_jobs` has no `cluster_id`, and exact `source_slug` → `content_jobs.slug` resolution finds only **2** sources. Source URL/live proof therefore had to become durable before *any* lifecycle mutation.
- The daily planner still persisted synthetic/dead targets (`generateInterlinkPlan` templates journey/cross-country/`seo-*` targets without liveness proof).
- `ship.ts` wrote `status=applied` from an in-memory body substring immediately after commit/merge, before production live verification.

**The raw 1,899 is NOT the approved-useful denominator.** The P6 gate (≥80% of approved useful backlog verified applied or explicitly rejected/stale) remains **unevaluable** at this checkpoint: 0 verified applied.

## Foundation repair implemented (this checkpoint)

### A. Verification truth is a schema contract

`supabase/migrations/20260920130000_seo_interlinks_verification_truth.sql` (authored, **not applied**):

- additive nullable columns `source_url text`, `verification_state text`, `verified_at timestamptz`, `verification_evidence jsonb`;
- closed vocabulary CHECK (`present | absent | source_not_live | target_not_live | unverifiable`, plus NULL = "no verdict yet");
- **validated fail-closed constraint**: `status='applied'` requires nonblank `source_url`, `verification_state='present'`, non-null `verified_at`, `verification_evidence`, and `applied_at` (production applied count is 0, so no existing row is touched);
- two justified partial indexes (`source_url`, `verification_state`), `notify pgrst, 'reload schema'`, idempotent/re-runnable DDL, and **no row reconciliation/backfill of any kind**.

### B. No pre-deploy `applied` claim

`lib/seoFactory/interlinkVerification.ts` `stageEngineInterlinksForVerification()` replaces the old ship-time applied writer. After a successful direct-main write or merge, a planned row whose exact target URL is **structurally embedded** in the shipped draft (markdown link / HTML anchor only) records `source_url = <plan canonicalUrl>` and stays `planned` (`applied_at` null, no `present` verdict). Planner slugs locate candidate rows; the canonicalUrl is the only source identity, and a different durable source identity is never overwritten.

**Lifecycle ordering is load-bearing:** both ship success paths `await` staging **first** and only then launch live verification (`ship.ts` line order: `stageEngineInterlinksForVerification` → `verifyLiveInBackground`). Launching verification first would race the staging write, and a verifier that finished before the rows existed could never finalize them.

### C. `applied` only after `verifyLiveUrl` ok=true + exact live proof

Finalization runs only when `verifyLiveUrl(input).ok === true` for that exact `canonicalUrl`. Two callers reach it: `POST /api/content-studio/verify-published` (admin, explicit) and the **normal background ship path** — `verifyLiveInBackground()` → `runBackgroundLiveVerification()`, which finalizes for `input.canonicalUrl` when, and only when, the verification it just ran resolved `ok === true`. A finalization failure is logged in isolation and can never weaken or fail a successful content verification:

- exact, normalized `<a href>` match against the LIVE source HTML (`live_exact_href`) — never plain text, `<script>` or JSON substring; trailing-slash tolerant, query/fragment strict;
- the target must also be live via the existing link-validity authority (`verifyUrlsLive` + `classifyLiveStatus`);
- `present` → atomic update to `status='applied'` + `applied_at` + `source_url` + `verification_state='present'` + `verified_at` + JSON evidence (source, target, proof kind, observed href, bounded source context, HTTP observations);
- live source but href missing → `absent` (stays planned); target not live → `target_not_live` (stays planned); source failure → `source_not_live` / `unverifiable`, never applied;
- idempotent: only `status='planned'` rows are selected or updated, so a transient failure can never downgrade a verified applied row.

### D. Unguarded applied writer removed

`markInterlinkApplied` (no callers) is deleted; `recordAppliedEngineInterlinks` (loose substring → applied) is deleted. Exhaustive repository audit (`tests/p6-interlink-least-privilege.test.ts`) proves the only file that can write `status: 'applied'` is the live-proof verifier, that its patch carries the full proof contract, and that it is guarded to planned rows.

### E. Dead targets stop at persistence

`persistInterlinkPlan()` now requires live internal target proof via `filterLiveInternalUrls` **before** any Supabase client exists. Dead targets are filtered; a verifier throw or an all-dead batch persists **zero** rows and returns a truthful error; no replacement URL is ever invented. `persistPlannerInterlinks()` propagates per-cluster errors (planner `persistErrors`, cron `allPhaseErrors`) instead of swallowing them. Existing lifecycle/verification columns are omitted from the upsert payload, so replanning can never reset applied/gate/verification truth.

### F. Draft injection fails closed

`lib/seoFactory/interlinkInjection.ts` `pruneInterlinksToLiveTargets()` is pure and fail-closed: verifier throw or no live proof → zero links, `ok:false`. `pipelineStream` uses it for all automatic planner/radar interlinks (the old best-effort `catch` that retained unverified links is gone), reports the withheld count, and invents no replacement. `loadEngineInterlinksForCell()` additionally excludes rows whose durable verdict already proved the target/source dead (`target_not_live`, `source_not_live`) from automatic suggestions while keeping the rejected/held lifecycle guard.

### G. Read-only P6 disposition report

`scripts/p6InterlinkDisposition.ts` (+ read-only CLI `scripts/p6-interlink-disposition.mts`) classifies persisted rows using durable fields + injected live target checks into `applied_present | target_404 | legacy_auth_wall | live_target_source_verified | live_target_source_unverified | unknown`. Unknown stays unknown. Raw backlog is reported separately from the approved-useful denominator/numerator; the gate stays `evaluated: false`. SELECT-only by construction: the module has no update/delete/upsert/insert/rpc call.

### H. Least privilege (proven safe; no browser write dependency)

Repository audit: every `seo_interlinks` write is server/admin (`lib/seoEngine/interlink.ts`, `lib/seoFactory/interlinkVerification.ts`); the browser only subscribes read-only via `subscribeToTables` (pinned by `tests/p1-base-table-least-privilege.test.ts`). The migration therefore replaces the open `FOR ALL` policy with a `service_role` full-access policy plus an explicit `anon, authenticated` SELECT policy for the existing Realtime read contract, revokes all privileges from `public, anon, authenticated`, grants SELECT back to `anon, authenticated`, and grants all to `service_role`.

## Tests authored (NOT yet run — Jest/tsc unavailable locally, and PR CI has not been run for P6)

- `tests/p6-interlink-verification-db-contract.test.ts` — migration/order/contract/least-privilege SQL.
- `tests/p6-interlink-exact-href-proof.test.ts` — exact anchor proof; plain text/script/JSON rejected.
- `tests/p6-interlink-staging-vs-applied.test.ts` — staging writes `source_url` only.
- `tests/p6-interlink-finalize-live-proof.test.ts` — applied proof, absent/target_not_live/source failure, idempotency, no downgrade, verifier failure.
- `tests/p6-interlink-persistence-liveness-gate.test.ts` — dead-target filtering, live Marketplace category survives, verifier-failure zero writes, replanning preserves lifecycle/verification truth.
- `tests/p6-interlink-draft-injection-fail-closed.test.ts` — fail-closed prune + pipeline source contract.
- `tests/p6-interlink-least-privilege.test.ts` — exhaustive writer audit; no unverified applied path.
- `tests/p6-interlink-disposition-report.test.ts` — classification and read-only construction.

Existing suites updated for the new contracts: `tests/interlink-lifecycle-truth.test.ts`, `tests/interlink-marketplace-persistence-guard.test.ts`, and the `persistPlannerInterlinks` mocks in `tests/engine-evidence-handoff.test.ts`, `tests/master-engine-e2e.test.ts`, `tests/p5-planner-demand-boundary.test.ts`, `tests/planner-filter-inclusion.test.ts`, `tests/seo-engine-daily-gsc-persist.test.ts`.

## Verification performed at this checkpoint

Jest/tsc are unavailable in this worktree (`node_modules` resolves to an empty directory; no install attempted). Substitute evidence:

- temporary no-dependency Node smoke harness over the real modules (only Supabase/planner/link-validity boundaries stubbed), **48/48 checks PASS**, including RED controls showing the new assertions reject the pre-P6 behaviours (substring "proof", best-effort link retention, applied-without-proof patch);
- `node scripts/migration-ledger-policy.mjs --check` exit 0 (manifest, naming policy, transaction safety);
- `node scripts/migration-order.mjs --json` places the new migration after `20260920120000_...` and before the index tier;
- `node --check` parse of every changed `.ts` file (three files need TS-annotation-free copies because Node's checker does not strip types in `--check` mode; all parse);
- exhaustive grep: no `markInterlinkApplied`, no `recordAppliedEngineInterlinks`, and the only `status: 'applied'` writer is `lib/seoFactory/interlinkVerification.ts`;
- `git diff --check` clean.

**Supervisor-review repair (autosquash `fixup!` commits — NOT amended in place).** Review rejected the first foundation commit `e9bfe607` on one material blocker: ordinary successful shipping could leave valid staged links planned indefinitely, because finalization was reachable only from the admin `verify-published` path and both ship success paths launched `verifyLiveInBackground()` before awaiting staging. Repaired in `c7f2b43d` (new `runBackgroundLiveVerification()` finalizes for the exact `input.canonicalUrl` only when the `verifyLiveUrl` it just ran resolved `ok === true`, isolated from content-verification failure; both ship success paths now await staging before launching verification; new `tests/p6-interlink-background-finalize.test.ts` and `tests/p6-ship-interlink-lifecycle-order.test.ts`) and `eb2b1133` (test-lifecycle hardening so the background-finalize negative cases cannot pass vacuously). Repair evidence: temporary no-dependency harness over the real `lib/seoFactory/liveVerify.ts` **14 PASS / 0 FAIL**, including a RED control showing pre-repair fire-and-forget semantics finalize nothing; git-proven ordering against the rejected tree (`e9bfe607` verify 853/1011 before stage 857/1013; repaired tree stage 862/1020 before verify 867/1025).

**Branch shape (truthful).** This branch is **three commits above base** `e44fa01944423babe906c45f36c06bf4b6a8b4d4`: `e9bfe607` (foundation) → `c7f2b43d` (supervisor-review repair) → `eb2b1133` (test-lifecycle hardening), plus a docs-only correction commit that removes stale "same commit / amended in place / proven by PR CI" claims. The intended in-place amend of `e9bfe607` was denied by the runtime's Git broker (no destructive-git authority; no bypass attempted), so **nothing here is amended in place and the branch is not a single commit today**. Collapsing later needs no further local history rewrite: `git rebase -i --autosquash e44fa019` under destructive-git authority, or a normal **squash-merge** landing one commit on `main`.

**CI status (truthful).** Jest and `tsc` are unproven **everywhere**: they could not run locally (`node_modules` resolves to an empty directory; no install attempted, no manifest change) and **PR CI has not yet been run for P6** — the branch has not been pushed and no PR exists. PR CI remains required and unexecuted; nothing at this checkpoint is claimed proven by CI.

## Explicitly not done (frozen)

- No migration applied, no Supabase/production mutation, no `seo_interlinks` row changed.
- No production reconciliation/rejection/retarget, no backlog classification run against production.
- No push, PR, merge or deploy.
- Broad net-new CREATE remains frozen until P13.

## Required P6 work still open

1. Apply the migration through the official workflow and prove the ledger entry (supervisor).
2. Authorized read-only disposition run against production; then the bounded reconciliation/rejection/retarget decision for the 1,643 404 and 183 legacy auth-wall rows (separate authorization; **not** part of this foundation commit).
3. Move rows from `planned` to proven `applied`: after a ship the background path finalizes automatically (`verifyLiveInBackground` → `runBackgroundLiveVerification`), and the admin `verify-published` path remains available; backlog rows with no ship/verify event still need an authorized verification run.
4. Re-evaluate the ≥80% gate only after the approved-useful denominator is defined from real live-target evidence.
