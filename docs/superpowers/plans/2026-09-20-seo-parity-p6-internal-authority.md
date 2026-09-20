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

**Lifecycle ordering is load-bearing:** both ship success paths `await` staging **first** and only then launch live verification (`ship.ts` line order: `stageEngineInterlinksForVerification` → `verifyLiveInBackground`). Launching verification first would race the staging write, and a verifier that finished before the rows existed could never finalize them. This ship-time call is best-effort only — the durable post-deploy opportunity is the scheduled reconciliation pass in section C2.

### C. `applied` only after `verifyLiveUrl` ok=true + exact live proof

Finalization runs only when `verifyLiveUrl(input).ok === true` for that exact `canonicalUrl`. Three callers reach it: `POST /api/content-studio/verify-published` (admin, explicit); the **ship-time background path** — `verifyLiveInBackground()` → `runBackgroundLiveVerification()`, which finalizes for `input.canonicalUrl` when, and only when, the verification it just ran resolved `ok === true`; and the **durable scheduled reconciliation pass** (`lib/seoFactory/interlinkReconciliation.ts`, section C2), which is the post-deploy opportunity of record. A finalization failure is logged in isolation and can never weaken or fail a successful content verification:

- exact, normalized `<a href>` match against the LIVE source HTML (`live_exact_href`) — never plain text, `<script>` or JSON substring; trailing-slash tolerant, query/fragment strict;
- structurally safe reading: HTML comments, CDATA, `<script>`/`<style>`/`<template>`/`<textarea>`/`<title>` payloads and markup serialized inside attribute/JSON strings are stripped by a tokenizer before any anchor is read; root-relative/same-site hrefs are resolved against the verified source canonical and refused when they would leave that host;
- the target must also be live via the existing link-validity authority (`verifyUrlsLive` + `classifyLiveStatus`);
- `present` → atomic update to `status='applied'` + `applied_at` + `source_url` + `verification_state='present'` + `verified_at` + JSON evidence (source, target, proof kind, observed href, bounded source context, HTTP observations);
- live source but href missing → `absent` (stays planned); target not live → `target_not_live` (stays planned); source failure → `source_not_live` / `unverifiable`, never applied;
- idempotent: only `status='planned'` rows are selected or updated, so a transient failure can never downgrade a verified applied row;
- every write returns its **actual affected-row count** and any DB error: a zero-match concurrency race is counted as skipped (never as applied/staged/verdict truth) and a failed write is reported in `dbErrors` + `error` instead of looking like a benign no-op.

### C2. Durable post-deploy re-verification (shipping is not the only opportunity)

The ship-time background call is best-effort by construction: it runs in the same serverless task that just wrote Git, usually before the production deployment is observable, and not at all if the invocation is dropped. The durable seam is therefore a bounded server-side reconciliation pass wired to the **existing** scheduled lifecycle surface — `POST /api/cron/seo-engine-daily` (CRON_SECRET only, driven by `.github/workflows/seo-engine-daily.yml`), as its own `phase: 'interlinks'` and inside the daily `phase: 'all'`:

- `lib/seoFactory/interlinkReconciliation.ts` reads at most 200 `status='planned'` rows that already carry a durable `source_url` (query-filtered, so the unstaged backlog can never starve them);
- a source is attempted only after a 30-minute deployment-lag window and outside a 20-hour re-verification cooldown, and at most **3 sources per run** are verified (`INTERLINK_RECONCILE_*` env-tunable) — no broad production mutation, only staged planned interlinks are verified;
- `verifyLiveUrl` is the only gate; finalization runs for the **exact staged `source_url`** and only on `ok === true`; the finalizer re-proves the exact live anchor + live target and still updates `planned` rows only;
- an `ok=false` verdict (deployment not yet observable) is benign pending truth — no phase error; a verifier throw / DB-write failure is a real error (run goes `partial`); a missing verification-truth column (migration not applied) is reported explicitly as `unavailable` rather than as an empty estate or a red cron.

No new route, no unauthenticated mutation surface, and no operator click is required: the daily scheduled run is the automatic re-verification opportunity, and the admin `verify-published` path remains available for immediate checks.

### D. Unguarded applied writer removed

`markInterlinkApplied` (no callers) is deleted; `recordAppliedEngineInterlinks` (loose substring → applied) is deleted. Exhaustive repository audit (`tests/p6-interlink-least-privilege.test.ts`) proves the only file that can write `status: 'applied'` is the live-proof verifier, that its patch carries the full proof contract, and that it is guarded to planned rows.

### E. Dead targets stop at persistence

`persistInterlinkPlan()` now requires live internal target proof via `filterLiveInternalUrls` **before** any Supabase client exists. Dead/synthetic targets that were checked and rejected are counted in a truthful `filtered` count and persist **zero** rows — expected P6 hygiene, **not** a fatal engine error. Only a verifier exception (unavailable) or a DB-write failure returns a real error with zero writes; no replacement URL is ever invented. `persistPlannerInterlinks()` returns `{ stored, filtered, errors }`, and the planner/cron surface `filtered` as a count while pushing only real errors (planner `persistErrors`, cron `allPhaseErrors`). Existing lifecycle/verification columns are omitted from the upsert payload, so replanning can never reset applied/gate/verification truth.

### F. Draft injection fails closed

`lib/seoFactory/interlinkInjection.ts` `pruneInterlinksToLiveTargets()` is pure and fail-closed: verifier throw or no live proof → zero links, `ok:false`. `pipelineStream` uses it for all automatic planner/radar interlinks (the old best-effort `catch` that retained unverified links is gone), reports the withheld count, and invents no replacement. `loadEngineInterlinksForCell()` additionally excludes rows whose durable verdict already proved the target/source dead (`target_not_live`, `source_not_live`) from automatic suggestions while keeping the rejected/held lifecycle guard.

### G. Read-only P6 disposition report

`scripts/p6InterlinkDisposition.ts` (+ read-only CLI `scripts/p6-interlink-disposition.mts`) classifies persisted rows using durable fields + injected live target checks into `applied_present | target_404 | legacy_auth_wall | live_target_source_verified | live_target_source_unverified | unknown`. Unknown stays unknown. `hasDurableVerificationProof` requires `source_url`, `verification_state='present'`, `verified_at`, **`verification_evidence`** and `applied_at` — the same shape the migration's fail-closed `applied` CHECK enforces. The report exposes `truncated` + `rowLimit` (`fetchP6DispositionRowsWithTruncation` proves truncation with one bounded probe row beyond the 5,000-row cap) instead of silently presenting a capped read as the complete estate. The CLI observes targets through the repository link-validity authority (`verifyUrlsLive` → `classifyLiveStatus`), so the HEAD→GET fallback for HEAD-hostile hosts and the authority-host exemptions are identical to every other link audit. SELECT-only by construction: the module has no update/delete/upsert/insert/rpc call.

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
- `tests/p6-interlink-anchor-proof-hardening.test.ts` — comment/script/style/template/serialized-payload anchors are never proof; real absolute and root-relative (same-site resolved) anchors are; cross-host, fragment and query cases; staging locators use the same rules.
- `tests/p6-interlink-durable-reconciliation.test.ts` — the scheduled reconciliation seam: exact source identity, ok=true-only finalization, benign pending vs verifier-unavailable/DB errors, min-age/cooldown/bound bounds, loader failure, pre-migration `unavailable`, and no write verb/applied literal in the module.
- `tests/p6-interlink-reconciliation-cron.test.ts` — cron `phase:'interlinks'` and `phase:'all'` wiring, benign pending/filtered truth stays green, real reconciliation/persistence failures stay `partial` with truthful phase errors.

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

**Second supervisor-review repair (one ordinary commit, no history rewrite).** Independent review of the repaired foundation raised six findings, all addressed in the newest ordinary repair commit (no rebase/squash/amend; the previous commits above are untouched):

1. *Durable post-deploy finalization* — the ship-time background verification was the only automatic opportunity and normally ran before production was observable. Added `lib/seoFactory/interlinkReconciliation.ts` and wired it to the existing scheduled surface (`/api/cron/seo-engine-daily` `phase:'interlinks'` + inside `phase:'all'`, CRON_SECRET, `.github/workflows/seo-engine-daily.yml`), bounded (≤200 staged rows scanned, ≤3 sources verified per run, 30-min deployment lag, 20-h cooldown), planned+`source_url` rows only, `verifyLiveUrl` ok=true-only finalization for the exact staged source identity. No new route and no unauthenticated mutation surface; the immediate ship verification remains best-effort but is no longer the only automatic path; no operator click is required.
2. *Proof correctness* — `extractAnchorHrefs`/`exactAnchorHrefMatch` now tokenize the HTML and structurally skip comments, CDATA and `<script>`/`<style>`/`<template>`/`<textarea>`/`<title>` payloads (including `<a href=…>` text serialized inside an attribute string), and safely resolve root-relative/same-site hrefs against the verified source canonical while refusing any href that would leave that host. Regressions added in `tests/p6-interlink-anchor-proof-hardening.test.ts`.
3. *Planner persistence status semantics* — `persistInterlinkPlan`/`persistPlannerInterlinks` now return a truthful `filtered` count for successfully checked-and-rejected dead/synthetic targets (zero persisted, **no** error), while a verifier exception/unavailability or DB-write failure still returns a real error with zero writes. The cron surfaces `interlinksFiltered` and no longer goes red just because dead planner targets were rejected.
4. *DB write observability* — staging and verdict/applied writes now report actual affected rows (`skipped` for zero-match concurrency races) and surface DB failures in `failed`/`dbErrors` + `error`; an error is never converted into applied truth.
5. *Disposition report fidelity* — `hasDurableVerificationProof` now requires `verification_evidence` exactly as the DB constraint does; the report exposes `truncated`/`rowLimit` (proven with one bounded probe row beyond the cap) instead of implying the capped read is complete; the CLI observes targets through the repository link authority (`verifyUrlsLive` → `classifyLiveStatus`, HEAD→GET fallback) while staying SELECT-only.
6. *Docs/tests* — this plan, the ledger and the parity matrix were corrected; the "automatic at ship instant" framing is replaced by the durable scheduled seam; accepted residuals are recorded below; focused regressions were added for every repaired behaviour.

Repair evidence: the temporary no-dependency Node harness over the real changed modules (only Supabase/planner/link-validity boundaries stubbed) is **88 PASS / 0 FAIL** after this repair, covering the sanitizer/proof rules, same-site resolution, staging/finalize write observability, the durable reconciliation cadence/fail-closed/error semantics, planner filtered-vs-error semantics, and disposition evidence/truncation truth. `node scripts/migration-ledger-policy.mjs --check` exit 0; `node scripts/migration-order.mjs --json` still lists 75 entries with `20260920130000` after `20260920120000_...`; type-stripped parse check of every changed `.ts`/`.mts` file; exhaustive grep still shows exactly one `status: 'applied'` writer (`lib/seoFactory/interlinkVerification.ts`); `git diff --check` clean; no dependency install and no manifest/lockfile change.

**Branch shape (truthful).** This branch is now **five commits above base** `e44fa01944423babe906c45f36c06bf4b6a8b4d4`: `e9bfe607` (foundation) → `c7f2b43d` (first supervisor-review repair) → `eb2b1133` (test-lifecycle hardening) → the docs-only correction commit → this ordinary repair commit. The intended in-place amend of `e9bfe607` was denied by the runtime's Git broker (no destructive-git authority; no bypass attempted), so **nothing here is amended in place and the branch is not a single commit today**. Collapsing later needs no further local history rewrite: `git rebase -i --autosquash e44fa019` under destructive-git authority, or a normal **squash-merge** landing one commit on `main`.

**CI status (truthful).** Jest and `tsc` are unproven **everywhere**: they could not run locally (`node_modules` resolves to an empty directory; no install attempted, no manifest change) and **PR CI has not yet been run for P6** — the branch has not been pushed and no PR exists. PR CI remains required and unexecuted; nothing at this checkpoint is claimed proven by CI.

## Accepted residuals (recorded, NOT claimed PASS)

1. **Pre-migration fail-closed state (unchanged).** Until `20260920130000_seo_interlinks_verification_truth.sql` is applied, `loadEngineInterlinksForCell()` yields no automatic engine suggestions (its select fails closed to an empty list), and the new reconciliation seam reports `unavailable` (reason = missing column) instead of verifying anything or turning the daily run red. Nothing is applied or claimed in that state.
2. **Degraded anon service-role mode is now a hard prerequisite.** The migration's least-privilege grants assume server writes really run as `service_role`. If the deployed key resolves to the anon key (`isServiceRoleAchieved() === false`; legacy-JWT service key missing), previously the open `FOR ALL` policy let it write; after the migration those writes fail — and the new staging/verdict paths surface the failure truthfully (`failed`/`dbErrors` + `error`) rather than looking like a no-op. Applying the migration therefore requires verifying healthy service-role auth first.
3. **Legacy/API-only surfaces not migrated.** `app/api/seo-engine/interlink/route.ts` (admin manual plan persistence) now reports the truthful `filtered` count but still generates+persists plan metadata directly; `lib/seoEngine/backlinkEngine.ts`, `app/api/content-studio/interlinks/route.ts`, `app/api/content-studio/system-health/route.ts` and `app/api/seo-engine/status/route.ts` remain read-only consumers of raw `seo_interlinks` counts. None of these is a second `applied` writer (exhaustively scanned), and none is claimed verified.
4. The 1,899-row production backlog remains unclassified/unreconciled, source identity remains unresolved for 204 of 206 pre-existing sources, and the ≥80% gate stays unevaluable — all unchanged by this repair.

## Explicitly not done (frozen)

- No migration applied, no Supabase/production mutation, no `seo_interlinks` row changed.
- No production reconciliation/rejection/retarget, no backlog classification run against production.
- No push, PR, merge or deploy.
- Broad net-new CREATE remains frozen until P13.

## Required P6 work still open

1. Apply the migration through the official workflow and prove the ledger entry (supervisor).
2. Authorized read-only disposition run against production; then the bounded reconciliation/rejection/retarget decision for the 1,643 404 and 183 legacy auth-wall rows (separate authorization; **not** part of this foundation commit).
3. Move rows from `planned` to proven `applied`: after a ship the immediate background path finalizes when the deployment already satisfies `verifyLiveUrl` (`verifyLiveInBackground` → `runBackgroundLiveVerification`), the **scheduled** pass re-verifies staged sources automatically once the deployment is observable (`reconcileStagedInterlinks` on the daily cron; no operator click required), and the admin `verify-published` path remains available; backlog rows with no ship/verify event still need an authorized verification run.
4. Re-evaluate the ≥80% gate only after the approved-useful denominator is defined from real live-target evidence.
