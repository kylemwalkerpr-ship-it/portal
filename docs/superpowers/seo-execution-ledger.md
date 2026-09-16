# SEO Cleanup → Expansion Execution Ledger

Append-only supervisor record for the program defined in `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`.

Do not rewrite prior evidence to make a later state look cleaner. Add a new dated entry when facts change.

## 2026-09-15 — Control-plane resume / parity recon

**Supervisor:** GPT-5.6 Sol
**Worker:** not started
**Repo:** `kylemwalkerpr-ship-it/portal`

### Repository parity

- Verified local repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`.
- `origin` fetch/push: `https://github.com/kylemwalkerpr-ship-it/portal.git`.
- Local `main`: `377a3a3a02c5d3bb21fb7aad766279346c6ddc77`.
- Fetched `origin/main`: same SHA.
- Authoritative `git ls-remote origin refs/heads/main`: same SHA.
- Local `main` ahead/behind tracked upstream: `0/0`.
- Worktree/index were clean at recon.

### Control branch

- Remote/local tracking branch: `seo/cleanup-expansion-parity-20260915`.
- Pre-plan tip: `6329c88a60149f31c655ef3e77af12c681a99b09`.
- Divergence from main before plan/matrix/ledger: `0` behind, `1` ahead.
- Existing unique change: design spec only (`6329c88`, 602-line design document).
### Confirmed P0 defects

1. `lib/seoEngine/interlink.ts` sets the market estate base to `https://portal.yousafeconsultancy.com` and emits `/marketplace/categories/<id>`.
2. Current public Marketplace helper `lib/marketplaceSeo.ts` correctly defines `market.yousafeconsultancy.com` and rejects the retired `/marketplace` public prefix.
3. `lib/seoEngine/llmVisibility.ts` includes `portal.yousafeconsultancy.com` but omits `market.yousafeconsultancy.com` from `ESTATE_DOMAINS`.
4. `lib/seoFactory/ownership.ts` already publishes `HOST_PUBLIC.market = https://market.yousafeconsultancy.com`; its Portal hostname map is currently treated as legacy-input recognition, not canonical emission.
5. Repository contains legitimate Portal/auth URLs as well as stale Marketplace URLs. P0 must distinguish them instead of global search/replacing Portal.

### Supervision/automation state

- Remote Desktop Commander is online and can execute terminal/file operations on the authorized Mac.
- Freebuff CLI is available at `/Users/phantomdarne/.nvm/versions/node/v22.22.2/bin/freebuff` and accepts `--cwd <path>`.
- GitHub CLI is authenticated for the repo.
- No open PR existed for the control branch at this checkpoint.

### Next gate

1. Review the control-doc diff for scope and correctness.
2. Commit/push the plan, parity matrix, and ledger on the control branch.
3. Open the control PR to `main`; because it is documentation-only, verify the required checks and merge through GitHub.
4. Refresh `main` after merge.
5. Create `seo/parity-p0-estate-truth` from that fresh main.
6. Invoke Freebuff/GLM with the exact P0 plan; worker stops at PR handoff for supervisor review.

## 2026-09-15 — P0 execution on `seo/parity-p0-estate-truth` (Tasks 1–5)

**Supervisor:** GPT-5.6 Sol
**Worker:** GLM 5.3 Flash (Freebuff)
**Branch:** `seo/parity-p0-estate-truth` (worktree; pre-docs tip `c51f99046c122dd3ff34f29afd120996cb8efede`)

### Task 1 — Repository truth / branch hygiene (supervisor-executed)

- Total deleted: 33 branches (47 remote branches remain).
- Composition of the 33: 4 direct/reachable safe deletions, plus 29 squash-merge deletions where the branch's CURRENT tip exactly matched its merged PR head and the reachable main landing commit had an identical Git tree. The original PR heads of those 29 were NOT reachable from `main`; the tree identity proves it.
- Active/unique/ambiguous branches retained, including `seo/gsc-soft404-canonicalization`.

### Ruling — squash-merge branch deletions

For the 29 squash-merge deletions, the branch tip was proven byte-identical to the merged PR head, and the corresponding main landing commit (the squash commit actually reachable from `main`) had an identical Git tree. Identical trees mean identical final file state: no unique file state existed on those branch tips that is not already the state of `main`. Under AGENTS.md — which requires only that a branch not fully contained in `main` be either archived or its unique work intentionally discarded — there was no unique work to preserve, so deletion was safe without archive tags. The original PR heads themselves are not claimed reachable from `main`; only the tree identity is claimed, and only the tree identity is needed.

### Tasks 2–3 — URL contract tests + engine reconciliation (GLM, supervisor-accepted)

- Created `tests/seo-estate-public-url-contract.test.ts` (failing first for the defect, then green after Tasks 3 changes).
- `lib/marketplaceSeo.ts`: shared `marketplaceCategoryHref` emits `https://market.yousafeconsultancy.com/categories/<id>`; blank input falls back to `immigration` (never a bare `/categories/`).
- `lib/seoEngine/interlink.ts`: `ESTATE_BASE.market` derived from the shared canonical helper via `getMarketplaceBaseUrl()`; retired Portal-host base removed.
- `lib/seoEngine/llmVisibility.ts`: `ESTATE_DOMAINS` now includes `market.yousafeconsultancy.com` while Portal remains a legitimate surface.
- `lib/seoFactory/ownership.ts`: unchanged (review only); `HOST_FROM_HOSTNAME['portal…']='market'` accepted as legacy-input alias.

### Task 4 — Stale planned interlink reconciliation (GLM implemented; supervisor applied atomically)

- Script: `scripts/reconcile-stale-planned-interlinks.mts` — strictly READ-ONLY evidence tooling (final supervisor correction: `--apply` and all DB update code removed). It queries only `status='planned'` rows with the exact retired prefix, validates every match-prefix row against `^https://portal[.]yousafeconsultancy[.]com/marketplace/categories/[a-z0-9]+(?:-[a-z0-9]+)*$`, maps by pure prefix replacement preserving the category id, fails closed on malformed rows, existing-row `(source_slug,new_target_url)` collisions, AND intra-mapping collisions (supervisor correction), and prints a full rollback mapping. It issues no writes of any kind; the production reconciliation was applied atomically via supervisor SQL.
- Live dry-run evidence (run while the script still had an apply path, before the read-only conversion; counts and mapping identical): `MODE: DRY-RUN`, `affected_count: 70`, `malformed_count: 0`, `collision_count: 0`, `rollback_count: 70`; exact output saved at `/tmp/p0-interlink-reconcile-dryrun` (copy at `/tmp/p0-interlink-reconcile-dryrun.txt`).
- Supervisor atomic apply result (via SQL): stale planned retired rows = 0; exactly 70 clean planned rows remain (35 immigration, 17 study-permits, 18 work-permits); wrong `target_host` = 0; none marked applied.

### Task 5 — Verification gate (all run 2026-09-15 on the worktree)

1. Focused URL-contract tests: `npx jest tests/seo-estate-public-url-contract.test.ts` → **7/7 passed** (includes supervisor-correction assertion: shared `marketplaceCategoryHref('')` → `https://market.yousafeconsultancy.com/categories/immigration`).
2. `npm run test:agent-harnesses` → **command does not exist** in this repo's `package.json` scripts (checked `package.json` + `scripts/`); no equivalent agent-harness target present. Not a test failure — a missing target; recorded as-is, tests not weakened.
3. Full suite: `npm test -- --run` → jest rejects `--run` (vitest-only flag); ran `npm test` → **367 suites passed / 5 skipped, 3827 tests passed / 25 skipped** (pre-correction run was 3826/3851; the +1 is the supervisor-correction blank-input assertion); pre-existing benign teardown warning (worker force-exit) only.
4. Typecheck: repo has no `typecheck` script; ran `npx tsc --noEmit` (TypeScript ^6.0.0) → **exit 0** (run before and after the blank-input correction).
5. Build: `npm run build` → **exit 0** (Next.js 16.2.11 + OpenNext Cloudflare bundle complete, Worker saved to `.open-next/worker.js`).
6. Runtime SEO source scan: repo-wide search for `portal.yousafeconsultancy.com/marketplace/categories` → only the reconciliation script's retired-prefix constant (by design), the plan, and the matrix. `lib/` Portal references are legitimate Portal/auth surfaces (email links, Clerk, GA4, war-room footer, contact CTA, internal API routes) or the accepted ownership legacy-input alias — no executable SEO engine emission of the retired Marketplace category URL.
7. `git diff --check` → clean (exit 0).

### Handoff state

- Matrix updated with P0 PASS evidence; no commit/push/PR/merge/deploy performed by the worker per instructions.
- Remaining for supervisor: review this ledger + matrix diff, commit/push branch, open PR to `main`, run required checks, merge through GitHub; deployment only via `.github/workflows/deploy.yml`.

## 2026-09-15 — Post-P0 Task 1 security boundary

**Supervisor:** GPT-5.6 Sol
**Primary executor:** DeepSeek V4.1 Flash / Novita + OpenCode (transitioned; provider review currently blocked by insufficient Novita balance)
**Branch:** `security/support-rpc-boundary-20260915`
**Base:** `main` / `origin/main` = `ca23e3d76dfc9fc0516a8021e5c21729c845de00`

### Live read-only evidence

- Production PostgreSQL version: `17.6`.
- `public.support_notify(uuid,text,text,text,text,text)` and `public.support_log_action(uuid,text,text,text,text,jsonb)` are both `SECURITY DEFINER`, owned by `postgres`, and currently executable by `anon`, `authenticated`, and `service_role`.
- `support_notify` accepts an arbitrary recipient UUID and inserts a support notification without binding the request to caller identity.
- `support_log_action` accepts an arbitrary actor UUID and verifies only that the supplied profile has role `support|admin`; it does not bind that actor UUID to the caller.
- `seo_backlink_dashboard` has no `security_invoker` relation option in production; prior authenticated audit established anonymous view access across the four internal views.
- Service-role SELECT was independently verified on every underlying relation used by the four views: `content_jobs`, `inquiries`, `inquiry_messages`, `support_audit_log`, `seo_backlink_targets`, and `seo_backlink_outreach`.

### Implementation and verification

- RED was observed before implementation: `tests/support-security-boundary.test.ts` failed 3/3 because the migration did not yet exist.
- Added guarded additive migration `supabase/migrations/20260915_support_security_boundary.sql`; it does not redefine function bodies or view queries and performs no data writes.
- The migration revokes `PUBLIC`/`anon`/`authenticated` function execution, grants only `service_role`, enables `security_invoker=true` on all four internal views, revokes public client privileges, and grants service-role SELECT.
- Fresh-replay guards use exact `to_regprocedure(...)` signatures and `to_regclass(...)` view checks so live-only schema drift does not break bootstrap migration order.
- Focused security regression: `npx jest tests/support-security-boundary.test.ts --runInBand` → **3/3 PASS**.
- Migration-order regression: `npm test -- tests/migration-order.test.ts` → **8/8 PASS**.
- TypeScript: `npx tsc --noEmit` → **exit 0**.
- Repository caller search found no browser/client caller for either support RPC or three of the four views. `seo_backlink_dashboard` is read through `createSupabaseAdminClient()`; deployment explicitly syncs `SUPABASE_SERVICE_ROLE_JWT` and marks anon fallback unhealthy.

### Executor transition / blocker

- OpenCode 1.18.31 launched in detached GNU screen `estate-audit-deepseek` in the exact security worktree.
- TUI independently verified `DeepSeek V4.1 Flash · Novita` and reasoning variant `max`.
- A bounded review-only security prompt was submitted; Novita returned `Forbidden: not enough balance` before model execution. No DeepSeek finding is claimed from that attempt.
- Task 1 remains `IN_PROGRESS` until the migration reaches production through the approved GitHub path and post-apply privilege checks prove `anon/authenticated=false`, `service_role=true`.

### Supervisor scope correction (2026-09-15, post-review)

- Corrected the Task 1 claim to name its exact objects: two RPCs — `public.support_notify(uuid,text,text,text,text,text)` and `public.support_log_action(uuid,text,text,text,text,jsonb)` — and four views — `content_job_health_summary`, `inquiry_engagement`, `seo_backlink_dashboard`, `support_user_notes_v`. The earlier parity-matrix wording "Supabase support/internal security boundary is least-privilege" was too broad and has been replaced in `docs/superpowers/seo-parity-matrix.md`.
- Supervisor live read-only finding: production base tables are separately exposed through permissive grants/RLS. Effective anon reads returned 240 `content_jobs` rows and all 14/14 `seo_backlink_targets` plus 14/14 `seo_backlink_outreach` rows; `support_audit_log` exposes anon SELECT privilege/policy shape, but its current effective anon row count was 0 (no rows leaked). The Task 1 migration does not remediate this; it is recorded as a separate unresolved security follow-up (new `PENDING` matrix row).
- Compatibility constraint recorded: `content_jobs` cannot simply be locked to `service_role` in Task 1 because the live Content Studio browser Realtime client subscribes to `public.content_jobs` with the anon key (`lib/supabaseRealtime.ts` → `createSupabaseBrowserClient()`; live caller `components/design/admin-content-studio.tsx:7533`, mounted via `components/design/admin.jsx:19`). Base-table hardening must be Realtime-compatible.
- `seo_backlink_targets` / `seo_backlink_outreach` appear server-side only (`lib/seoEngine/backlinkEngine.ts` → `createSupabaseAdminClient()`), and `support_audit_log` is used server-side (`app/api/admin/users/[id]/route.ts`), but broad base-table hardening remains explicitly out of scope for Task 1.
- Migration and focused test were re-verified GREEN and left unchanged (no churn): `tests/support-security-boundary.test.ts` 3/3, `tests/migration-order.test.ts` 8/8, `npx tsc --noEmit` exit 0.

### Execution resumed — first-party OpenCode provider (2026-09-15)

- The earlier Novita provider block (`Forbidden: not enough balance`) was superseded: execution resumed successfully on the first-party OpenCode provider `deepseek` with model `deepseek-flash` (= DeepSeek V4.1 Flash), build variant `max`.
- The resumed run reviewed the staged implementation and left `supabase/migrations/20260915_support_security_boundary.sql` and `tests/support-security-boundary.test.ts` unchanged (no churn).
- The only edits made were documentation scope corrections: the narrowed Task 1 claim (two RPCs + four views) and separate base-table follow-up row in the parity matrix, and the corresponding ledger record.
- Accepted the supervisor correction that `admin-command-center.tsx` is DEPRECATED / not mounted and must not be cited as live Realtime compatibility evidence; the live path recorded is `components/design/admin-content-studio.tsx:7533` via `lib/supabaseRealtime.ts` → `createSupabaseBrowserClient()`.
- The run stopped without commit, push, PR, merge, deploy, or production DDL. No approval is claimed; Task 1 remains `IN_PROGRESS`.

### Production acceptance — merge, deploy, migration, live boundary (2026-09-15)

- PR #203 (`security: harden support RPC and internal view boundary`) squash-merged to `main` as `9a21bfab291d5f381a2fce765a77a949a4d5ad8e`, which is the exact base of this evidence worktree. Read-only re-verification during this documentation pass confirmed the PR merge commit and both workflow run IDs below.
- `Deploy YouSafe Portal` run `35024648249` completed success (`headSha` = `9a21bfab291d5f381a2fce765a77a949a4d5ad8e`), including Cloudflare deploy, secrets health, and post-deploy smoke test.
- Migration run `35024648323` overall FAILED and must not be recorded as green. The failure is unrelated to Task 1: the older `20260911_marketplace_search_intelligence.sql` failed with `42P16` ("cannot drop columns from view"), and `content_jobs_fts_index.sql` hit HTTP 503 scheduled maintenance. The run log proves `20260915_support_security_boundary.sql = OK`.
- Production SQL after the maintenance window: both support RPCs (`public.support_notify(uuid,text,text,text,text,text)`, `public.support_log_action(uuid,text,text,text,text,jsonb)`) have EXECUTE `anon=false`, `authenticated=false`, `service_role=true`.
- Production SQL after the maintenance window: all four views (`content_job_health_summary`, `inquiry_engagement`, `seo_backlink_dashboard`, `support_user_notes_v`) have SELECT `anon=false`, `authenticated=false`, `service_role=true`, and all four view reloptions contain `security_invoker=true`.
- Security advisors snapshot `2026-09-15T21:45:45Z`: no longer list either support RPC in `anon`/`authenticated` SECURITY DEFINER warnings and no longer list the four views as `security_definer_view` findings. Unrelated advisor backlog remains.
- Result: the narrow Task 1 claim is now `PASS` in `docs/superpowers/seo-parity-matrix.md` (two RPCs + four views only). The separate base-table least-privilege follow-up row remains `PENDING` and out of scope for Task 1.
- This evidence worktree is documentation-only: it changes only `docs/superpowers/seo-parity-matrix.md` and `docs/superpowers/seo-execution-ledger.md`, and performs no commit, push, PR, merge, deploy, or production DDL. Stopped for supervisor review.

## 2026-09-15 — Forward-only migration ledger adoption (Phase 3)

Phase 3 G3 docs-only evidence for the Forward-Only Migration Ledger Adoption rollout: G0 pre-state, G1 adoption run, G2 independent supervisor verification. No source diff; no secrets or token values are recorded in this section.

**Executor:** DeepSeek V4.1 Flash (deepseek/deepseek-flash, high) · **Branch:** `architecture/migration-ledger-phase-3-evidence` · **Base:** `36dcd418fb2e706f5b01353ce6cc0cf4d0c4d479`

### G0 — pre-adoption state (read-only)

- Dispatch `expected_main_sha`: `36dcd418fb2e706f5b01353ce6cc0cf4d0c4d479`.
- Manifest baseline `generatedFrom.gitSha` (`supabase/migration-baseline.json`, `migrationCount: 69`): `39e43edbb06ba47893235ba0a6972eb0cff59db2`.
- Last old-runner run before adoption: `35024648323` (failure, pre-existing replay issue; not caused by adoption).
- Ledger pre-state: `SELECT to_regclass('supabase_migrations.yousafe_migration_ledger') AS ledger_reg;` → `null` (ledger absent; expected fail-closed RED).
- Native pre-state `supabase_migrations.schema_migrations`: `count(*) = 7` — `drop_all_stripe_columns`, `gsc_connection`, `conversation_ai_mode`, `attorney_show_bar_number`, `marketplace_gig_gallery_public`, `provider_credential_visibility_controls`, `content_studio_evidence_contract` (sorted versions `20260616092444`, `20260616095653`, `20260907103305`, `20260907104004`, `20260909124337`, `20260911112020`, `20260914181604`).
- Corroborating privileged connector runtime identity (read-only, not workflow transport proof): `current_user=postgres`, `session_user=postgres`, `role=none`.

### G1 — adoption run (dispatch-only workflow)

- Run ID `35070817047` — https://github.com/kylemwalkerpr-ship-it/portal/actions/runs/35070817047
- Environment `migration-ledger-adoption` with required reviewer approval; run conclusion `success`; secret-value pattern check found none.
- Workflow runtime role: `current_user=postgres`, `session_user=postgres`, `role=none`.
- Exact verified summary line: `LEDGER ADOPTION VERIFIED: 69/69 files, source_git_sha=39e43edbb06ba47893235ba0a6972eb0cff59db2, native_history_unchanged=true, runtime_role_verified=true`

### G2 — independent supervisor verification (read-only)

- Row count: `total_rows=69`, `distinct_rows=69`.
- Provenance: rows with `applied_by <> 'adoption-baseline'` OR `source_git_sha <> '39e43edbb06ba47893235ba0a6972eb0cff59db2'` = `0`; rows with `applied_by = 'ci-runner'` = `0`.
- Hash equality (`shasum -a 256 -c` of the manifest against `supabase/migrations`): `69 OK, 0 FAILED`.
- Canonical pair SHA-256 equality: production ledger pair = `67c8b69fc9500881686b5b8f1b8fba05765377d37c1daf4aa85e1de41aa2645d`; local manifest pair = `67c8b69fc9500881686b5b8f1b8fba05765377d37c1daf4aa85e1de41aa2645d`; identical.
- Native post-adoption `supabase_migrations.schema_migrations`: `count(*) = 7`, exact sorted version/name list identical to G0 (unchanged): `drop_all_stripe_columns`, `gsc_connection`, `conversation_ai_mode`, `attorney_show_bar_number`, `marketplace_gig_gallery_public`, `provider_credential_visibility_controls`, `content_studio_evidence_contract`.
- Production read-only verification found trigger `yousafe_migration_ledger_immutable` enabled (`tgenabled = 'O'`) on `supabase_migrations.yousafe_migration_ledger`, using function `supabase_migrations.yousafe_migration_ledger_immutable`.
- `runtime_role_verified=true` (from the actual adoption workflow Management API path).

### T13 immutability evidence (local, $0)

- T13 (append-only trigger: `INSERT` succeeds; `UPDATE`/`DELETE` rejected with SQLSTATE `55000`; trigger-absent RED control accepted the `UPDATE`) was proven at $0 on a disposable **local PostgreSQL 17.11** instance using the exact committed DDL (`composeLedgerDdl()` in `scripts/migration-ledger-adoption.mjs`).
- This was a local engine-level reproducibility proof of the committed DDL — **not** a Supabase Management API test and not a production action.

### Scope

- Docs-only: the Phase 3 evidence change touches only `docs/superpowers/seo-execution-ledger.md`; no source, workflow, or migration file changed, and no push, PR, merge, deploy, or Phase 4 work was performed by this task.
