# P6 closeout attempt — BLOCKED (2026-09-21)

> Record for task `P6-CLOSEOUT-20260921` on branch `seo/p6-closeout-20260921`, base `d23a13e47db37b5552c0269e0538d2e9cec6af5a` (= `main`) plus the already-staged P7 docs commit `759c05445310622e7d82173652dece52185d30d6`.
>
> **P6 stays IN_PROGRESS — never PASS.** This attempt mutated no `seo_interlinks` row (1,899 planned / 0 rejected / 0 applied before and after), changed no code, migration or workflow, and does not touch P7, P8–P13, the `MARKET-PORTAL-AUTH-HANDOFF-1102` / `auth/sign-in` work, or broad net-new CREATE.

## Why this file exists (and what happened to the canonical docs)

The closeout's canonical home is the P6 row of `docs/superpowers/seo-parity-matrix.md` plus an append-only entry in `docs/superpowers/seo-execution-ledger.md`. Those edits were authored and committed **locally** (commit `6bb21483`; 2 files, +80/−1) but could not be pushed from this run:

- the sandbox denies `git`'s HTTPS remote helper — `fatal: cannot exec 'git-remote-https': Operation not permitted`, reproduced on two invocations (with and without `-u`), so `git push` cannot complete from this workspace; and
- a byte-exact rewrite of those two files through the GitHub contents API is out of reach in one call (ledger `211,933` bytes, matrix `88,420` bytes), and a non-byte-exact rewrite of a 200 KB canonical record is not an acceptable risk.

The delivered branch therefore carries the same evidence as this standalone record, with the exact proposed canonical blocks reproduced in [Appendix A](#appendix-a--proposed-parity-matrix-p6-cell-block). A reviewer can either paste those blocks into the canonical documents or push local commit `6bb21483` from an environment whose git transport works.

## Repository, main, CI and deploy state (read-only)

- `origin/main` = `d23a13e47db37b5552c0269e0538d2e9cec6af5a`; this branch's base commit `759c0544…` changes only the P7 row of the parity matrix (1 file, +1/−1) and is left untouched here.
- PR #256 (`seo/p6-internal-authority-20260920`) merged → `ab6305a7c5c362f01b46947e53be0e462772c88e`; official `Apply SEO Factory Migrations` run `35556091287` = success, i.e. `20260920130000_seo_interlinks_verification_truth.sql` is applied.
- PR #257 (`seo/p6-backlog-reconciliation-20260921`) merged → `96abd1b2ee6f41ba3b04062e937e149db47814f9`.
- PR #258 (`seo/p6-batch-a-proof-fix-20260921`) merged 2026-09-21T05:46:53Z → `58f13ca2e98b8a6ab7cad35f8d2a6859c8b3f007` (2 commits, 8 files); GitHub compare `58f13ca2…d23a13e4` = `ahead`, ahead_by 9 ⇒ contained in the current `main`.
- **PR 258 exact-main deployment verified live:** `Deploy YouSafe Portal` run `35565841544` (event `push`, branch `main`, `head_sha` `58f13ca2…`) is `completed`/`success` with every step green — `Typecheck`, `Unit tests`, `Build (Next + OpenNext)`, `Populate static incremental cache`, `Deploy via OpenNext to Cloudflare (with transient-failure retry)`, `Remove ephemeral Worker secrets file`, `Verify Worker secrets health (startup check)` and `Post-deploy smoke test (studio contract + build freshness)` — the last of which hard-asserts that production serves exactly the buildId built from that commit. The current `main` deploy run `35581942397` (`head_sha` `d23a13e4…`) is also green.
- Independent live production probe now (`node scripts/smoke-prod.mjs`, read-only GETs, 2026-09-21T11:07Z): **4/4 PASS** — portal root 200 `text/html` (122,062 bytes), studio auth-gate 307 → `/sign-in/student` (200), `GSC connect API guard` 401, build freshness `buildId YkwYn5Tqc2_7onlWrstFC` CDN-consistent across both sampled pages. No deployment was triggered by this closeout (and none may be: direct provider deploys are prohibited by `AGENTS.md`).

## Production `seo_interlinks` truth (independent of the report tool)

Independent PostgREST count probes plus a full paginated row pull with the public anon key (read-only; 2026-09-21T11:07Z):

| fact | value |
| --- | --- |
| rows total | **1,899** |
| `status` counts | `planned` **1,899** · `applied` **0** · `rejected` **0** · `gated` **0** |
| distinct `target_url` / `source_slug` | **236** / **206** |
| target hosts | `yousafeconsultancy.com` 1,456 · `portal.yousafeconsultancy.com` 332 · `market.yousafeconsultancy.com` 111 |
| rows with any P6 truth/job/staging/gate field non-null | **0** for each of `source_url`, `source_job_id`, `staged_at`, `verification_state`, `verified_at`, `verification_evidence`, `applied_at`, `verification_attempted_at`, `gate_reason`, `gate_updated_at` (each probe returned `content-range: */0`) |
| control for those zeroes | positive: the P6 additive columns resolve HTTP 200 as a projection; negative: an unknown column returns HTTP 400 `42703` (`column seo_interlinks.nonexistent_p6_col does not exist`), so the zeroes are real zeroes rather than swallowed errors |
| `created_at` range | 2026-08-09T07:18:28Z → 2026-09-17T18:27:36Z |

Independent plain-GET probes confirm the three backlog targets that answer 200 (`market.yousafeconsultancy.com/categories/{immigration,study-permits,work-permits}` → 200) and sampled dead targets (`yousafeconsultancy.com/us/visa`, `yousafeconsultancy.com/uk/work` → 404).

## Canonical P6 disposition report (executed live)

`scripts/p6-interlink-disposition.mts` was executed unmodified over the repository modules (bundled as an ESM entry with the dependency tree's esbuild, because this workspace's managed `node_modules` has no `.bin`, so `npx tsx` is not runnable; env from `.env.production`; SELECT-only CLI, no `--apply` flag exists):

- `rawBacklog` **1,899**, `total` 1,899, `truncated` **false**, `rowLimit` 5,000;
- classes: `applied_present` **0** · `target_404` **1,643** (186 distinct targets) · `legacy_auth_wall` **183** (47 distinct targets) · `live_target_source_verified` **0** · `live_target_source_unverified` **73** (3 distinct live targets) · `unknown` **0**;
- `approvedUseful` = `{ denominator: 73, numerator: 0, unverified: 73 }`;
- `stale` = `{ target404: 1,643, legacyAuthWall: 183, rejected: 0 }`; `gate.evaluated` remains the module's foundation flag `false` (the report deliberately never asserts a gate verdict);
- the report's 1,899 `(id, target_url)` pairs reconcile **1:1** with the independent production pull (0 rows only-in-report, 0 rows only-in-independent).

## Gate arithmetic per the existing P6 contract

- **Verified-applied / approved-useful = 0 / 73 = 0.0%**, far below the ≥80% gate ⇒ **NOT MET**.
- The raw 1,899 is explicitly **not** the approved-useful denominator (documented in `scripts/p6InterlinkDisposition.ts` and the P6 plan), so no whole-backlog ratio is claimed. The one reading that would print a passing number — (0 verified applied + 1,826 explicitly rejected/stale) / 1,899 = 96.2% — is excluded by the same contract: rows whose target is 404/410 or a legacy auth wall are by definition **not** “approved useful”, so that numerator and denominator are disjoint by construction.

## Batch A (bounded; dry run only)

Dry run (`--json`; hard max 200 respected, default limit 50):

- scanned **1,899** candidate rows (planned + the full 8-column no-proof NULL fence), probed **236** distinct exact targets, re-confirmed **177/177** head-dead targets with a fresh uncached GET; `observedStatusCounts` = 404 1,627 · 200 204 · 503 68;
- **1,477 eligible proven-404/410 historical rows**; 1 head-dead row failed GET re-confirmation; 1,427 rows lay beyond the run limit; 73 live-200 rows, 332 legacy Portal-wall rows and 17 transient-unknown rows stayed untouched by design; `noncanonicalTargetRows` 0; `truncated` false;
- **0 writes**: `before == after` (`planned` 1,899, `rejected` 0, `applied` 0), `attemptedWrites` 0, `writeResults` empty.
- The gap between the report's non-portal 404 rows (1,494) and Batch A's eligible set (1,477) is fully accounted for: 17 rows were transient 503/unknown at Batch A probe time and stay untouched (fail-closed), plus 1 head-dead row whose GET re-confirmation returned no status.
- Exclusion-policy cross-check: the report's 1,643 `target_404` rows = 1,456 `yousafeconsultancy.com` + 149 `portal.yousafeconsultancy.com` + 38 `market.yousafeconsultancy.com`; Batch A additionally excludes every legacy Portal-wall target (332 rows) even when it answers 404.

## The real blocker (write path)

`--limit 200 --apply --confirm REJECT-BATCH-A-STALE-404-410` → **exit 1**, zero IO:

```
Refusing to run: apply mode requires genuine service-role authority — supabaseAuthMode()=degraded-anon — apply requires service-role; the anon fallback is read-only by contract
No Supabase client was created; no DB or network call was made.
```

This run holds no service-role credential: the requested Cloudflare and Supabase MCP profiles exposed no tools, and the only key reachable from the workspace is the public anon key in `.env.production` (`.env.local` is absent and the run sandbox exposes no secret store). That refusal is the tool's designed fail-closed prerequisite, not a defect. The batch was **not** bypassed with ad-hoc SQL writes and no direct provider/CLI mutation path was used.

## Already-designed reconciliation/finalization steps: zero eligible subjects

- The job-bound scheduled reconciliation (`lib/seoFactory/interlinkReconciliation.ts`), the ship-time background finalizer and the admin `verify-published` route all require exact source/job identity plus a live `<a href>` proof on the live source. **0 rows carry `source_url`, `source_job_id` or `staged_at`**, so no subject is eligible and the pass would finalize nothing (`missingJobIdentityRows` covers the whole `source_url`-bearing subset, which is empty).
- Source identity cannot be recovered from `source_slug`: `source_slug` is a planner identity, exact `source_slug` → `content_jobs.slug` resolution found only 2 of 206 sources, and the P6 contract forbids guessing the job. Fabricating identity, destructive retargeting or new architecture is out of scope ⇒ **STOP**, per the closeout stop rule.

## Verification performed in this closeout

`node node_modules/jest/bin/jest.js --ci --runInBand tests/p6-` → **22 suites PASS, 380 tests PASS, 0 failures** (the real toolchain from the linked dependency tree; `--runInBand` because the sandbox denies the worker pool's process-kill teardown, which makes the default parallel mode crash in an unrelated jest-worker `EPERM`, not in any test). Focused first: `tests/p6-batch-a-stale-rejection.test.ts`, `tests/p6-interlink-disposition-report.test.ts`, `tests/p6-interlink-least-privilege.test.ts` → 3 suites / 99 tests PASS.

## Result

- **PASS not claimed; status BLOCKED.** The gate moved from “unevaluable” to *evaluable* and is **0/73 = 0.0%**. Closing it requires P6-external authority: a genuine service-role operator credential so the already-designed, already-authorized Batch A rejection can run (1,477 eligible rows, ≤200 per run, 8 runs), plus real verified-applied volume for live targets, which can only come from real ship jobs with exact job identity.
- Zero production mutation: 1,899 planned / 0 rejected / 0 applied before and after this attempt. No P7, P8–P13, migration, workflow or application-code change.
- Local commit `6bb21483` (not pushed; see above) contains the proposed canonical updates: the P6 cell block below appended to `docs/superpowers/seo-parity-matrix.md` (status stays `IN_PROGRESS`, P7 PASS row untouched), plus this record appended as a new section of `docs/superpowers/seo-execution-ledger.md`.

## Appendix A — proposed parity-matrix P6 cell block

Append inside the existing `| P6 | … |` evidence cell, before its closing ` |` (the text below is exactly what local commit `6bb21483` inserted):

<!-- prettier-ignore -->
 **P6 closeout attempt 2026-09-21 (branch `seo/p6-closeout-20260921` at base `d23a13e47db37b5552c0269e0538d2e9cec6af5a`, plus the staged P7 docs commit `759c05445310622e7d82173652dece52185d30d6`) — BLOCKED; the gate is now EVALUABLE and NOT met (0/73 = 0.0%).** Repo/main/CI/deploy reconciled read-only: PR #256 → `ab6305a7c5c362f01b46947e53be0e462772c88e` (official `Apply SEO Factory Migrations` run `35556091287` success = the P6 migration is applied), PR #257 → `96abd1b2ee6f41ba3b04062e937e149db47814f9`, PR #258 → `58f13ca2e98b8a6ab7cad35f8d2a6859c8b3f007` (merged 2026-09-21T05:46:53Z and contained in `main`: GitHub compare `58f13ca2...d23a13e4` = `ahead`, ahead_by 9). **The PR 258 exact-main deployment is LIVE:** `Deploy YouSafe Portal` run **`35565841544`** on that exact merge commit is `success` with every step green, including `Deploy via OpenNext to Cloudflare (with transient-failure retry)`, `Verify Worker secrets health (startup check)` and `Post-deploy smoke test (studio contract + build freshness)` — the step that hard-asserts production serves exactly the buildId built from that commit; the current `main` `d23a13e4` deploy run `35581942397` is also green, and an independent local `node scripts/smoke-prod.mjs` run (2026-09-21T11:07Z, read-only GETs) returned **4/4 PASS, live buildId `YkwYn5Tqc2_7onlWrstFC`, CDN consistent**. Production `seo_interlinks` truth (independent PostgREST count probes plus a full 1,899-row pull, 2026-09-21T11:07Z): **1,899 rows, all `planned`; 0 `applied`, 0 `rejected`, 0 `gated`**; 236 distinct `target_url` / 206 distinct `source_slug`; hosts `yousafeconsultancy.com` 1,456 · `portal.yousafeconsultancy.com` 332 · `market.yousafeconsultancy.com` 111; **0 rows carry any of `source_url`, `source_job_id`, `staged_at`, `verification_state`, `verified_at`, `verification_evidence`, `applied_at`, `verification_attempted_at`, `gate_reason`, `gate_updated_at`** (positive control: the P6 additive columns resolve HTTP 200; negative control: an unknown column returns HTTP 400 `42703`, so these zeroes are real zeroes). Canonical read-only disposition report (`scripts/p6-interlink-disposition.mts` executed unmodified over the real modules, same timestamp): `rawBacklog 1,899`, `truncated false`, `rowLimit 5,000`; classes `applied_present 0 · target_404 1,643 · legacy_auth_wall 183 · live_target_source_verified 0 · live_target_source_unverified 73 · unknown 0`; `approvedUseful {denominator 73, numerator 0, unverified 73}`; `stale {target404 1,643, legacyAuthWall 183, rejected 0}`; the report's 1,899 `(id, target_url)` pairs reconcile **1:1** with the independent production pull. **Gate per the implemented contract = verified applied / approved useful = 0/73 = 0.0%, far below 80% — NOT MET.** The raw 1,899 is explicitly NOT the denominator, and the degenerate reading that would print 96.2% (1,826 explicitly rejected/stale rows over the raw backlog) is excluded by the contract: dead/legacy-wall rows are not "approved useful", so those sets are disjoint by construction. Batch A ran bounded and dry by default: it scanned 1,899 candidate rows, probed 236 distinct exact targets, re-confirmed **177/177** head-dead targets with a fresh GET, and selected **1,477 eligible proven-404/410 historical rows** (1 head-dead row whose GET re-confirmation failed, 1,427 rows beyond the 50-row demo limit, 73 live-200 rows and 332 legacy Portal-wall rows untouched by design, 17 transient-unknown rows untouched) with **zero writes** (`before == after`: planned 1,899 / rejected 0 / applied 0). **The write path is BLOCKED by the tool's own by-design credential gate, not by a defect:** the identical invocation with `--limit 200 --apply --confirm REJECT-BATCH-A-STALE-404-410` exits **1** with `apply mode requires genuine service-role authority — supabaseAuthMode()=degraded-anon … No Supabase client was created; no DB or network call was made`, because this run has no service-role credential (the Cloudflare/Supabase MCP profiles exposed no tools) and the only reachable key is the public anon key in `.env.production`; the repository tool was deliberately **not** bypassed with ad-hoc SQL writes. Already-designed finalization steps have **zero eligible subjects**: job-bound scheduled reconciliation (`source_job_id IS NOT NULL`) and the admin `verify-published` path both require exact source/job identity, and 0 rows carry `source_url`/`source_job_id`/`staged_at`, so moving any of the 73 live-target rows to verified-applied would require fabricating identity — forbidden by the P6 contract. **No production row was mutated by this attempt; P6 stays IN_PROGRESS (never PASS), P5 PASS and the staged P7 PASS row are untouched, and closure now requires P6-external authority (a real service-role operator credential to run the rejection batch) plus genuine verified-applied volume from real ship jobs.**

The ledger record for this attempt is the body of this file (sections above), inserted as a new dated section at the end of `docs/superpowers/seo-execution-ledger.md`.
