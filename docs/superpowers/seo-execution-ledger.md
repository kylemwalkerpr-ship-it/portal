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

## 2026-09-17 — P1 base-table least-privilege production acceptance (PR #222)

Docs-only evidence pass. No commit, push, PR, merge, deploy, migration dispatch, or production DDL was performed by this task; every production statement below is recorded evidence from the implementation and its CI/production runs. This section supersedes the 2026-09-15 pre-state for the P1 base-table follow-up row (see `Supervisor scope correction (2026-09-15, post-review)`). Prior entries are unchanged.

**Scope of the PASS:** exactly `public.content_jobs`, `public.seo_backlink_targets`, `public.seo_backlink_outreach`, `public.support_audit_log`, delivered by `supabase/migrations/20260917173300_base_table_least_privilege.sql`. This row-level PASS does not complete P1.

### Implementation PR and CI path

- Implementation PR #222 head `d51a815f78fee2d8783caeb5dd15d69840014c08` passed `Content Studio Review` run #125 and the `Deploy YouSafe Portal` PR-context run #2894.
- PR #222 merged to `main` as `5429e5a124aa25df7d771fada50741a234a21d3b` (squash message `security: harden P1 base table access (#222)`), which is the base of this documentation branch.
- Main `Apply SEO Factory Migrations` run `35257551755` (run #33) completed success. Production ledger row (`supabase_migrations.yousafe_migration_ledger`): `20260917173300_base_table_least_privilege.sql`, applied by `ci-runner` at `2026-09-17T18:14:03.941539+00:00`, `source_git_sha = 5429e5a124aa25df7d771fada50741a234a21d3b`.
- Main `Deploy YouSafe Portal` run `35257551736` completed success including typecheck, unit tests, build, SEO guard, Cloudflare deploy, secrets health, and post-deploy smoke.

### Live SQL proof after the migration (read-only)

- All four tables have RLS enabled.
- Each table has exactly one policy, named `Service role full access`, cmd `ALL`, roles `{service_role}`, with `qual = true` and `with_check = true`.
- Privilege/lookup shape per table: `anon_select=false`, `authenticated_select=false`, `anon_any_column_select=false`, `authenticated_any_column_select=false`.
- Effective access: `service_role_select=true` and `service_role_write=true`.
- Table grants list only `service_role`, with `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`; no `public`/`anon`/`authenticated` table privilege remains.
- Effective role simulation as `anon` against `content_jobs` returned permission denied (the 2026-09-15 anon-readable state no longer reproduces).

### Production behavioral proof after deploy

- Authenticated production Content Studio at `/dashboard/admin/content` loaded 246 jobs into the table.
- Network trace showed repeated `GET /api/content-studio/jobs?limit=100` => `200` and `GET /api/content-studio/jobs?limit=80&status=drafting,pending,publishing,pr_created,merged,failed` => `200`, demonstrating the authenticated API polling fallback is operational after removal of the direct browser `content_jobs` Realtime subscription.

### Local acceptance from the implementation (reported; not re-run in this docs-only pass)

- New regression `tests/p1-base-table-least-privilege.test.ts`: 16/16 pass.
- Focused security/migration suites: 6 suites / 60 tests pass.
- `npx tsc --noEmit`: pass.
- `npm run build`: pass.
- `git diff --check`: pass.
- Independent DeepSeek review: NO BLOCKER / NO HIGH.

### Preserved unrelated claim (code acceptance only)

- `tests/p1-base-table-least-privilege.test.ts` pins the 7-table SEO telemetry browser Realtime subscription (`seo_knowledge`, `seo_cluster_plans`, `seo_interlinks`, `seo_llm_visibility`, `seo_gate_runs`, `seo_engine_runs`, `seo_ranking_scores`) from `components/design/admin-content-studio.tsx`.
- That 7-table claim is recorded as code acceptance only. No production Realtime publication proof (for example, replication/publication membership of those tables) is claimed here.

### Result and remaining P1 work

- The P1 base-table grants/RLS follow-up row is now `PASS` in `docs/superpowers/seo-parity-matrix.md` for exactly the four named tables, with the 2026-09-15 evidence pre-state retained verbatim in the same cell as historical evidence.
- This PASS is scoped to that row only. Overall P1 remains incomplete: `Qualified visibility separated from raw off-mission visibility`, `LLM audit failures excluded from genuine citation-loss math`, and `Reward/forecast inputs are tied to real observations` remain `PENDING`.
- Older point-in-time documents (for example `docs/superpowers/specs/2026-09-15-forward-only-migration-ledger-design.md`, which records that the base-table backlog was left `PENDING` and out of scope for that project) were not edited by this pass; they remain accurate as statements about their own date and are superseded for current status by this section.
- This evidence pass changes only `docs/superpowers/seo-parity-matrix.md` and `docs/superpowers/seo-execution-ledger.md`; no source, workflow, migration, deploy, or production DDL is introduced by the documentation change itself.

## 2026-09-19 — P1 qualified-visibility production acceptance (PRs #224, #225, #227; deploy fix #229)

Docs-only evidence pass. This section records already-merged implementation and authenticated production evidence; it introduces no source, workflow, migration, deploy, or production mutation by itself. Prior ledger entries remain unchanged.

**Scope of the PASS:** the single P1 row `Qualified visibility separated from raw off-mission visibility`. Raw persisted GSC demand remains measurable, while only the four-class `qualified` bucket may drive action/scoring/brief evidence. This row-level PASS does not complete P1.

### Implementation and release path

- PR #224 merged the base implementation as `d5348fd9d7801af7edb954fcd0c280a6e8b8c0ad`: deterministic `junk | off_mission | deep_tail | qualified` classification, full-window persisted scan/summary, Raw/Qualified/Off-mission UI, and qualified-only action boundaries.
- Authenticated production proof after #224 correctly exposed residual campus/lifestyle and brand-navigation variants still reaching opportunity scoring. Follow-up PR #225 merged as `f80ce6be` and PR #227 merged as `a39c124ca153a3da91434e58d57d86fc69477d6c`, tightening the shared classifier rather than patching individual routes. The hardening keeps immigration/visa/F-1/study-permit and narrow tenancy/legal intent actionable while classifying the observed campus/lifestyle families off-mission and self-brand/document-stamp artifacts as junk.
- Main Deploy YouSafe Portal run #2904 (`35424024633`) for `a39c124c` passed checkout, install, typecheck, unit tests, Next/OpenNext build, SEO audit, secrets preparation, and AI-vault sync, then failed only at Cloudflare upload: Wrangler returned code `100328`, `CPU limits are not supported for the Free plan`, because `wrangler.toml` still had an active paid-only `[limits] cpu_ms` block. Secrets cleanup succeeded; secrets-health/smoke were correctly skipped after the failed deploy.
- Deployment-only PR #229 removed the paid-only Cloudflare limits block and merged as `217b4da50b0c05ce1a476fa953f08fb7ccf003c1`.
- Exact-main Deploy YouSafe Portal run #2907 (`35424902862`) for `217b4da5` completed success through typecheck, unit tests, build, SEO audit, Cloudflare credentials, secrets preparation/sync, Cloudflare deployment, ephemeral-secret cleanup, Worker secrets-health verification, and post-deploy smoke.

### Authenticated production measurement proof

Production route: `/api/content-studio/gsc/performance?days=90&limit=40`.

- `ok=true`; requested range `2026-06-21 → 2026-09-18`.
- The requested window was not persisted yet, so the route truthfully returned `usedFallback=true` and selected the latest persisted 90-day window `2026-06-20 → 2026-09-17`; no claim is made that the requested newer range already existed.
- Full-window scope: `persistedRows=2663`, `scannedRows=2663`, `windowRowCount=2663`, `countKnown=true`, `unscannedRows=0`, `complete=true`, `truncated=false`, `rowMismatch=false`, `cap=25000`.
- Raw totals: 36,041 impressions, 2 clicks.
- Qualified: 2,292 impressions, 0 clicks, 140 rows, share `0.063594...` (6.4% of raw impressions).
- Off-mission: 617 impressions, 0 clicks, 135 rows, share `0.017119...` (1.7% of raw impressions).
- Junk: 30,775 impressions, 2 clicks, 1,242 rows.
- Deep-tail: 2,357 impressions, 0 clicks, 1,146 rows.
- Raw observations are preserved and classified. Example from the returned diagnostic rows: `international+student+storage+cornell` remains visible with `visibilityClass=off_mission`; it is not deleted or relabelled as qualified.

### Authenticated production action-boundary proof

Production route: `/api/content-studio/opportunities/score?days=90&limit=200`.

- `ok=true`, `usedFallback=true`, `excludedNonActionable=116`, `count=84`.
- The following exact production residuals are absent from the scored opportunity output: `student rentals near university of south carolina`; `student rentals near florida international university`; `student living university of south carolina`; `international student storage cornell`; `is warwick safe for international students`; `"fy27_stk_housing_rates" pacific`; `you safe`; `you safe consultancy`; `you safe contact number`; `you safe login 2024`; `you safe ltd`.
- The exclusion is driven by the shared classifier/action boundary, not route-specific deny lists: campus/lifestyle observations are `off_mission`; malformed fiscal-year housing metadata and bounded self-brand navigation are `junk`; deep-tail remains observable but non-actionable; only `qualified` is admitted to action scoring.

### Authenticated production UI proof

Content Studio Discover (`/dashboard/admin/content?tab=discover`) renders the persisted full-window visibility strip:

- `Visibility mix · full persisted window · 90d`.
- `Complete measurement` and `2,663 scanned of 2,663 persisted rows`.
- `Raw visibility` = `36,041`, described as impressions persisted in the window with junk + off-mission included.
- `Qualified visibility` = `2,292`, `6.4% of raw impressions · 0 clicks`.
- `Off-mission visibility` = `617`, `1.7% of raw impressions · real demand, not actionable`.
- The evidence drawer explicitly describes `showing top 40 diagnostic rows`, so the limited table is not misrepresented as the full-window measurement.

### Result and remaining P1 work

- The `Qualified visibility separated from raw off-mission visibility` row is now `PASS` in `docs/superpowers/seo-parity-matrix.md`.
- This PASS is limited to persisted GSC visibility classification/measurement and the qualified-only action boundary. It does **not** claim Google property-wide completeness, frozen live GSC values, or that the requested `2026-06-21 → 2026-09-18` window was available; production explicitly used the latest persisted fallback `2026-06-20 → 2026-09-17`.
- Overall P1 remains incomplete. Two P1 rows remain `PENDING`: `LLM audit failures excluded from genuine citation-loss math` and `Reward/forecast inputs are tied to real observations`.
- This evidence pass changes only `docs/superpowers/seo-parity-matrix.md` and `docs/superpowers/seo-execution-ledger.md`.


## 2026-09-19 — P1 LLM-audit failure accounting production acceptance (PR #231)

Docs-only evidence pass. This section records already-merged implementation and authenticated/read-only production evidence; it introduces no source, workflow, migration, deploy, or production mutation by itself. Prior ledger entries remain unchanged.

**Scope of the PASS:** the single P1 row `LLM audit failures excluded from genuine citation-loss math`. Provider/engine failures remain observable as failed audit attempts but are excluded from genuine citation-loss/share-of-voice denominators. This row-level PASS does not complete P1; the reward/forecast observation row remains pending.

### Implementation and release path

- PR #231 (`fix(seo): exclude failed LLM audits from citation loss`) exact head `6fa4732c032ce48cf56b6532d05325cfcaabcf19` merged to `main` as `9c5db317341f512d9d68854d727cf7bc54fde256`.
- The implementation treats rows explicitly flagged `audit_failed` (and compatible legacy engine matrices with no successful engine) as unavailable observations on read/calculation paths rather than uncited outcomes. Failed attempts remain persisted for auditability.
- PR #231 reported local implementation verification: 14 affected suites / 96 tests PASS; TypeScript PASS; `git diff --check` PASS; full Next 16.2.11 + OpenNext Cloudflare build PASS. The attempted DeepSeek diff reviewer was unavailable because the provider returned HTTP 402, so no independent DeepSeek review PASS is claimed for this implementation.
- Exact-main Deploy YouSafe Portal run #2911, run id `35429172831`, for merge SHA `9c5db317341f512d9d68854d727cf7bc54fde256` completed success through checkout/install, typecheck, unit tests, Next/OpenNext build, SEO audit, Cloudflare credential verification, secrets preparation/sync, Cloudflare deployment, secrets-health verification, and post-deploy smoke.

### Production SQL proof — failures are retained but excluded from the denominator

Read-only production query against `public.seo_llm_visibility` on 2026-09-19:

- Prompt attempts (`fan_out=false`): **267**.
- Measured prompt rows after excluding `flags @> {audit_failed}`: **197**.
- Cited measured prompt rows: **0**.
- Failed prompt attempts carrying `audit_failed`: **70**.
- Across all rows, the same current measured/failed split is **197 measured / 70 failed** with **0 cited measured rows**.
- Recent failed rows remain present in the table with `cited=false` and `audit_failed` plus the provider/engine failure reason. Historical failed rows inspected in production still store `share_of_voice=0.000`; the implementation does not claim or require a retroactive rewrite of that legacy stored numeric field.

The arithmetic is therefore explicit: the headline citation denominator is 197 measured observations, not all 267 attempts. The 70 provider/engine failures are operational failures, not 70 additional citation losses.

### Authenticated production API and UI proof

- Authenticated deployed `GET /api/seo-engine/status` at `2026-09-19T07:54:23.714Z` returned `ok=true`, `authMode=service-role`, and `llmVisibility={total:197,cited:0,shareOfVoice:0,measurementState:"measured"}`.
- The authenticated Content Studio live desk rendered `LLM CITED` = `0/197`, matching the measured production denominator rather than the 267 attempted rows.
- The same production status payload preserves failure visibility through the latest daily run summary: `llmAudits=6` and `llmFailed=6`. Provider outages therefore remain visible to operators while being excluded from citation-loss math.

### Caveats and interpretation

- The current measured citation share is genuinely **0/197**. This PASS means failures no longer inflate the citation-loss denominator; it does **not** mean LLM citation performance is healthy.
- Historical failed records may still contain stored `share_of_voice=0.000`. The proven contract is that current read/calculation paths identify `audit_failed` observations and exclude them from measured denominators; no retroactive data rewrite is claimed.
- A provider outage that yields no successful observation is represented as unavailable for measurement rather than silently converted to a genuine 0% citation result.

### Result and remaining P1 work

- The `LLM audit failures excluded from genuine citation-loss math` row is now `PASS` in `docs/superpowers/seo-parity-matrix.md`.
- Exactly one P1 row remains `PENDING`: `Reward/forecast inputs are tied to real observations`.
- This evidence pass changes only `docs/superpowers/seo-parity-matrix.md` and `docs/superpowers/seo-execution-ledger.md`.

## 2026-09-19 — P1 reward/forecast observation integrity implementation acceptance

Implementation-only evidence. This section does **not** mark the row PASS; production proof remains required after merge/deploy.

### Truth boundary implemented

- Forecast-vs-actual evaluation remains diagnostic-only and no longer persists forecast-derived reward events or calibration baselines.
- Manual `/api/seo-engine/rewards` observations are audit-only: `manual_unverified`, `improvement_credited=false`, reward `0`, empty attribution, and no recalibration.
- Training eligibility is restricted to verified `cron_gsc_improvement` evidence with real HTTP(S) URL, exact query, explicit observation window, measured baseline, known action, deterministic `cron-attr:` identity, positive measured click delta/reward, and positive family attribution.
- Calibration reads fail closed. The processed-observation watermark is persisted as `through <observed_at>` in observed-reward calibration provenance rather than inferred from the later calibration write timestamp.
- Eligible evidence is read oldest-first with bounded pagination and a final overflow probe; incomplete history cannot silently advance the watermark.
- Active calibration reporting ignores legacy forecast/manual rows. The admin model-calibration route, daily digest, rewards API, and Ranking UI expose only verified observed-reward lineage as current; legacy rows remain audit history.
- Existing migrations `20260903_seo_engine_integrity.sql` and `20260907_engine_evidence_attribution.sql` already contain the needed reward-evidence columns and idempotency key; no new schema migration is required.

### Local verification

- Focused reward/forecast/backfill/reporting suite: 10 suites / 92 tests PASS.
- Full repository gate: 425 suites PASS / 2 skipped; 4,492 tests PASS / 4 skipped; exit 0 under `TZ=UTC NODE_OPTIONS=--max-old-space-size=8192 npx --no-install jest --ci --runInBand`.
- `npx --no-install tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- `npm run build`: PASS through Next.js 16.2.11 and OpenNext Cloudflare; `.open-next/worker.js` generated. Prebuild-generated SEO data churn was restored afterward.
- Multiple headless Grok read-only review attempts stalled before returning a completed review, so no independent Grok REVIEW_OK is claimed. Supervisor review found and removed the remaining legacy backfill baseline-calibration write before this verification.

### Remaining production proof before PASS

Deploy the exact reviewed SHA, then prove live forecast/manual paths create no training reward rows; inspect persisted verified reward rows for intervention/query/window/baseline/provenance truth; and verify any active calibration is observed-reward lineage with a valid processed-observation watermark. Until that proof exists, the parity row remains `IN_PROGRESS`.

## 2026-09-19 — P1 reward/forecast production acceptance — FINAL P1 closure

This section supersedes the earlier implementation-only reward/forecast acceptance. It records deployed production evidence and closes the final P1 row.

### Release chain

- PR #233 (`fix(seo): bind reward learning to observed interventions`) merged to `main` as `a42c510ec65bcea61c68d6e1d6d63b6d4bec155b`.
- PR #234 (`fix(seo): bound reward attribution runtime`) merged as `60f2b0a382598555c87277ea255291dab43c7474`.
- PR #235 (`fix(seo): batch reward reconciliation`) merged as `7579d27c86dca29bbdd1cbee40161d012bf9daaa`.
- PR #236 (`fix(seo): make reward dedupe conflict-safe`) merged as `d13041148e82209758b4eb32f7b67b00aa525928`.
- Main migration workflow `35456821844` succeeded. `supabase_migrations.yousafe_migration_ledger` records `20260919165400_reward_dedupe_full_unique.sql` applied by `ci-runner` at `2026-09-19T17:02:38.065895+00:00` with `source_git_sha=d13041148e82209758b4eb32f7b67b00aa525928`.
- Live `public.uq_reward_events_dedupe` is now a normal UNIQUE index on `seo_reward_events(dedupe_key)` with no partial predicate, so Supabase/PostgREST `ON CONFLICT (dedupe_key)` bulk upserts are valid while PostgreSQL still permits multiple NULL audit keys.
- Exact-main `Deploy YouSafe Portal` run `35456821822` completed SUCCESS through typecheck, unit tests, Next/OpenNext build, SEO audit, Cloudflare deployment, Worker secret health, and post-deploy smoke.

### Live reward-attribution proof

- Pre-acceptance production baseline was 11 reward rows, all historical forecast-derived audit rows; 0 verified observed improvements; 0 manual audit rows; 2 historical forecast calibration rows; 0 observed-reward calibrations.
- A live production `phase=rewards` engine run recorded at `2026-09-19T17:08:34.929962+00:00` completed `success` with `jobsConsidered=223`, `preparedEvents=724`, `distinctWindows=26`, `events=724`, `historyRows=0`, `duplicatesSkipped=0`, `persistFailed=0`.
- The 724 persisted rows are `cron_gsc_observation` evidence from real HTTP(S) page/query/window measurements with deterministic `cron-attr:` identities. All 724 have a real HTTP(S) URL, exact query, explicit observation window, and cron identity; 530 have a measured baseline and 679 have a known recorded action. Rows missing baseline/action remain non-training.
- All 724 live observations have `improvement_credited=false`, reward 0, and no positive click delta. No row was promoted to `cron_gsc_improvement` merely because GSC data existed.
- A second exact-main workflow acceptance, GitHub run `35457162370`, completed SUCCESS in about four seconds with `events=0`, `historyRows=724`, `duplicatesSkipped=724`, `persistFailed=0`, proving idempotent replay and no duplicate writes.
- Production `seo_engine_runs` therefore contains two consecutive successful reward runs: the first persisted the complete fresh evidence set; the second reconciled the same set entirely as duplicates.

### Training/calibration truth proof

- Final production reward ledger: 735 total rows = 724 real non-credit `cron_gsc_observation` rows + 11 historical forecast audit rows; 0 `cron_gsc_improvement` rows; 0 manual audit rows; no new positive reward rows.
- Authenticated deployed `/api/seo-engine/rewards?limit=40` reports `training.eligibleEvents=0`, `trainingEligibleEvents=0`, default model weights, and `activeCalibration=null`. Legacy forecast calibration rows remain visible only in the audit history.
- Authenticated deployed `/api/content-studio/model-calibration` reports `lastCalibratedAt=null`, `modelVersion=unknown`, `eventsCount=0`, `calibrationNote=null`, proving the two legacy forecast calibration rows are not surfaced as the active calibration lineage.
- Post-observation `Forecast Reward Weekly` run `35457318418` completed SUCCESS and returned `ok=true`, `evaluated=0`, `events=0`, `recalibrated=false`, `weightsChanged=false`, `eligibleObservedRewards=0`, with note `forecast diagnostic pass · 0 evaluated · forecast reward writes=0 · eligible observed improvements=0`.
- The calibration table remained exactly 2 legacy forecast rows and 0 observed-reward calibration rows after that pass. No forecast drift or non-improvement GSC observation moved model weights.
- No synthetic manual production event was inserted solely for acceptance. The manual API boundary is protected by focused route tests: manual input persists only as `manual_unverified`, reward 0, empty training attribution, no recalibration; the shared training predicate rejects it.

### Runtime/fail-closed proof

- The original live reward pass exposed sequential external/database work that could exceed six minutes. PR #234 bounded GSC auth/window work and workflow curl time; PR #235 replaced per-candidate reward-history lookups/writes with one bounded history reconciliation plus one bulk write.
- A production acceptance before #236 then failed quickly and truthfully with `ok=false`, `events=0`, `persistFailed=724`, because the old partial unique index could not satisfy Postgres `ON CONFLICT (dedupe_key)`. No partial reward writes occurred.
- PR #236 corrected that database invariant. After the migration, the reward pass completed in seconds rather than hanging and the immediate rerun was idempotent.

### Result

- `Reward/forecast inputs are tied to real observations` is now `PASS` in `docs/superpowers/seo-parity-matrix.md`.
- Every current P1 row in the parity matrix is now `PASS`.
- Overall SEO parity is **not** complete: P2-P13 remain pending and should be treated as the next workstream.
- Historical ledger sections that said P1 was incomplete remain preserved as dated evidence of their earlier state; this section is the current superseding P1 status.

## 2026-09-20 — P2 technical-integrity production acceptance — FINAL P2 closure

This section records the production evidence used to close all four current P2 rows. It is an evidence/documentation pass only; the implementation changes were already merged and deployed in the owning repositories. Historical P2 `PENDING` statements remain valid for their earlier dates and are superseded for current status by this section.

### Public-estate status and sitemap truth

- Final low-concurrency production crawl at `2026-09-20T04:25:10.833Z` fetched all seven public sitemap roots: apex `70`, Market `350`, Legal `421`, USA `433`, Canada `318`, UK `134`, Australia `18`.
- Aggregate result: **1,744 entries = 1,744 unique URLs**, **0 duplicate sitemap URLs**, **0 sitemap-root errors**, **0 sitemap redirects**, and **0 invalid final statuses**. Artifact: `/tmp/yousafe-p2-low-concurrency-audit.json` on the supervisor host.
- A fresh sitemap-only parameter check after the repair reported **0 query-string sitemap URLs** across the same 1,744 URLs.
- The earlier 1,748-URL canonical audit had isolated the real defects rather than hiding them: seven Legal sitemap URLs redirected; `/us/personal-statement/` ended at a missing apex winner with 404 + canonical mismatch + noindex; the only missing canonical was `https://legal.yousafeconsultancy.com/llms-full.txt`, a plain-text machine file rather than an HTML canonical defect.

### Caseworks/Legal redirect and canonical repair

- PR #151 (`fix: align Legal sitemap with deployed redirect authority`) merged to Caseworks `main` as `0460210007832ed40f3fbd37ce3b7af64bba957`. Exact-main deploy run `35480037188` succeeded; SEO integrity run `35480037165` succeeded.
- The repair made `public/_redirects` a first-class deployed redirect source beside Worker `REDIRECT_MAP` and the dual graph, restored three Legal owners whose redirects targeted missing/unshipped apex winners (`/us/admissions-consultant/`, `/us/personal-statement/`, `/us/research-proposal/`), and excluded every effective redirect source from sitemap output.
- Local/CI acceptance for #151: TypeScript PASS; redirect-integrity 17/17 PASS; sitemap authority 6/6 PASS after build; sitemap drift **421 expected / 421 emitted / 0% drift / 0 redirect sources**; redirect shadowing **0** and dead redirect targets **0**; redirect-intent safety **304 definitions PASS**; production Next build **801 static pages**.
- Live post-deploy proof: all three restored owners return HTTP 200, self-canonical, `index,follow`; the reviewed consolidation redirects remain 301→200; Legal sitemap contains the restored owners and excludes the redirect sources.
- A slow rendered-link recheck before the fix had isolated exactly three durable 404 targets — the same restored owners above. Two Market query URLs that had transiently returned 503 under crawl load (`?q=IRCC study permit`, `?q=vector cut files`) now return HTTP 200 individually; they were load noise, not broken public pages.

### Apex and Marketplace runtime integrity needed for P2

- Marketplace true-static/OpenNext cache architecture was restored through PR #244 and the gig-supply regression through PR #246. PR #246 merged to Portal `main` as `665c6af16c7c24b20c80ff5348d83e87bfc872aa`; its production deploy run `35478073868` succeeded. Live acceptance showed the Market landing again rendering **217 active briefs**, subcategories populated, and a previously failing gig detail URL returning its full page instead of 404.
- The apex site independently exposed the same OpenNext static-cache failure class: homepage returned Cloudflare **1102 CPU exceeded** and `/sitemap.xml` returned 500 while prerender cache files existed. Apex PR #188 configured the static-assets incremental cache and interception, made the custom Wrangler uploader copy `.open-next/cache` into deployable `cdn-cgi/_next_cache`, and added fail-closed parity + live smoke gates. It merged as `8dfd23ea98d947839682845a0d3aa2220c2f8102`; exact-main `Deploy Landing Page` run `35488882026` succeeded.
- Post-deploy supervisor proof: homepage, sitemap, representative blog and guide routes returned 200 in five independent rounds with no 1102 recurrence before the final estate crawl.

### Priority orphan classification and repair

- A rendered-HTML estate graph crawl found **164 sitemap pages with zero inbound rendered links** before repair. P2 does not require pretending every indexable utility/provider/deep-tail page is a priority owner; priority was derived from existing program truth.
- Persisted GSC rows for those 164 pages were classified with the shipped `classifyPersistedGscRow` boundary. Exactly **4** orphan pages had any `qualified` demand:
  - `https://legal.yousafeconsultancy.com/guide/dependent-visa-uk-international-students/` — 499 qualified impressions across 17 rows;
  - `https://legal.yousafeconsultancy.com/guide/health-insurance-requirements-f1-students/` — 14 qualified impressions;
  - `https://legal.yousafeconsultancy.com/guide/stem-designated-mba-programs/` — 10 qualified impressions;
  - `https://legal.yousafeconsultancy.com/guide/masters-data-science-ca/` — 2 qualified impressions.
- Ownership-registry owner/supporting URL intersection added **3 distinct priority destinations beyond those four**:
  - `/guide/day-1-cpt-vs-regular-cpt/`;
  - `/guide/mba-vs-mim/`;
  - `/guide/optional-practical-training-opt-application/`.
- PR #152 made article topic groups native `<details>/<summary>` so closed groups remain in server-rendered HTML; PR #153 (`fix: narrow P2 orphan repair to crawlable guide directory`) intentionally retained only the priority-scope crawlability fix and removed unrelated non-priority registry mutations. PR #153 merged as `105abaddc5b49fb152ee3738a6537560dae1b670`; exact-main deploy run `35490884109`, SEO integrity `35490884108`, and content-quality `35490884121` all succeeded.
- Live `/articles/` production HTML after #153 contains real `<a href>` anchors for **all 7 priority URLs** above.
- Legal-only rendered production recrawl at `2026-09-20T05:08:32.015Z`: **421 pages**, **0 fetch errors**, exactly **1** zero-inbound page: `https://legal.yousafeconsultancy.com/ca/study-permit-refusal-reapply/`. That residual is an explicit P2 justification, not hidden debt: it has no strategic ownership-registry role and the persisted 2026-06-20→2026-09-17 GSC window contains **0 query rows / 0 impressions / 0 clicks** for it. It remains indexable inventory, but it is not an active P2 priority intent.

### Result

- `Sitemap contains zero invalid public URLs` → **PASS**.
- `Meaningful canonical conflicts = 0` → **PASS** for the current sitemap estate; `llms-full.txt` is a plain-text machine file and not treated as an HTML canonical defect.
- `Redirect/4xx/parameter duplicates/broken internal links reconciled` → **PASS** for the production evidence above; the final sitemap estate has no redirects/non-2xx/query-string duplicates, and the durable broken-link targets found in the pre-fix rendered crawl were repaired.
- `Priority indexable orphans resolved or justified` → **PASS**: all 7 priority orphan destinations are live-linked; the one remaining Legal orphan is explicitly non-priority by both ownership and qualified-demand evidence.
- Every current P2 row in `docs/superpowers/seo-parity-matrix.md` is now **PASS**. Overall SEO parity remains incomplete because P3-P13 are still gated.


## 2026-09-20 — P3 intent ownership implementation + ratification acceptance — pre-deploy

This section records the P3 ownership contract, live owner ratification, and local release gates. P3 remains `IN_PROGRESS` until the exact reviewed Portal candidate is merged and deployed; later phases remain gated.

### Authority contract implemented

- `lib/seoFactory/ownership.ts` now exposes one authority predicate: a row authorizes authoring/publication only when `status=confirmed`, its action is one of `keep | expand | merge`, its owner is HTTPS on a known YouSafe estate host, and the owner is not a generic section/index root.
- Generic roots fail closed, including `/`, country roots, `/guide/`, `/blog/`, `/articles/`, `/universities/`, `/from/`, and category roots. Specific hubs such as `/us/student-visas/` and `/uk/family-visas/` remain valid.
- `supply_first`, `build`, missing/unknown action/status, proposed/needs-decision/blocked statuses, and generic roots cannot authorize CREATE even when the destination is live.
- `broadCreateFreeze`, Content Studio contract binding, planner/auto-run operator truth, and the publication/direct-merge paths use the same authority boundary rather than independent policy copies. P0 exact-live destination proof and the P13 broad-create unlock remain intact.

### Registry ratification and production probes

- The authoritative ownership source was ratified on 2026-09-20, merged through `yousafe-seo-strategies` PR #1 as `dad9e2251a36422e159a834c927d739afadb0b58`, and regenerated into `data/seo/ownership-registry.json` and `public/seo-data/ownership-registry.json`; both files are byte-identical and contain 76 rows.
- Final status distribution: **76 confirmed / 0 unresolved statuses**. Final action distribution includes **3 `build`** and **2 `supply_first`** rows that are deliberately mapped but non-authoritative.
- Live probes verified exact/self-canonical/indexed owners for the resolved leaf rows, including OPT travel, SEVIS reinstatement, MIT, University of Washington, F-1 Requirements 2026, UK family visas, marriage-green-card timeline, spouse checklist, Australia 485 English requirements, Ministerial Direction 111, UK skilled-worker healthcare, STEM MBA, Canada spousal sponsorship, Sri Lanka/UAE UK routes, and the UK student-tenant city guide.
- University dual-graph truth was reconciled to the indexed regional owner. Auburn, Missouri, Kansas State, Utah, American University, King’s College London, and Creighton now map to regional `/universities/{slug}` owners; their Legal university/housing pages are supporting/noindex or redirecting surfaces where applicable.
- Row 39 is a confirmed **family namespace** at USA `/universities/` with `action=build`; the root itself is generic and non-authoritative, so each concrete university leaf must resolve before authoring.
- Row 65 reserves the UK dependent-child destination but the target is currently a live 404; `status=confirmed, action=build` records ownership without permitting CREATE/publication until the leaf exists and is separately ratified.
- Marketplace supply was re-proven before ratifying rows 40–41: live search returned **4 F-1-specific gigs** and **23 study-permit gigs**. Both rows are therefore mapped `confirmed/supply_first`, but `supply_first` remains non-authoritative by code contract.
- The old generic `/blog/` mapping for F-1 requirements was corrected to the specific live self-canonical `https://yousafeconsultancy.com/blog/f1-visa-requirements-2026` owner.

### Verification

- P3 ratified focused gate: **23 suites / 259 tests PASS**.
- `npx --no-install tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- Earlier integrated full repository gate: **439 suites passed / 2 skipped; 4,668 tests passed / 4 skipped; exit 0**.
- Production build initially failed closed only because the fresh worktree lacked the untracked Supabase service-role JWT. Re-running with the authorized machine’s existing JWT injected into the process environment completed Next.js 16.2.11 compilation, TypeScript, 1,031-page static generation, and OpenNext Cloudflare bundle generation with **exit 0**. No secret value was copied or printed.

### Result before production deploy

- Registry mapping evidence is complete: 76/76 rows are confirmed and mapped, and current strategic mapping coverage is 100%.
- Local enforcement evidence is complete: only confirmed, allowed-action, non-generic owners can authorize authoring/publication; mapped build/supply/family rows remain fail-closed.
- The three P3 matrix rows remain **IN_PROGRESS**, not PASS, until this exact Portal enforcement candidate is merged to `main` and the exact-main deployment succeeds.
- P4+ remain pending and broad net-new expansion remains frozen until the later P13 expansion gate.


## 2026-09-20 — P3 production acceptance — FINAL P3 closure

This section supersedes the pre-deploy P3 acceptance entry. It records the exact reviewed Portal head, merge, and exact-main production deployment that close the three current P3 matrix rows.

### Release chain

- Source-of-truth registry ratification merged through `yousafe-seo-strategies` PR #1 as `dad9e2251a36422e159a834c927d739afadb0b58`.
- Portal implementation PR #248 (`feat(seo): enforce P3 intent ownership authority`) exact reviewed head `9035d97091d0edd28d0c16d1cabc5781eb82f8bd` passed `Content Studio Review` run #153 (id `35496000625`) and PR-context `Deploy YouSafe Portal` run #2944 (id `35496000575`). The PR-context deploy workflow passed TypeScript, full unit tests, Next/OpenNext build, static-cache population, and SEO audit; production-only deploy/secrets/smoke steps were correctly skipped in PR context.
- PR #248 merged cleanly to `main` as `2aa6a67c5cd7d59c4f2cf7bd354452cf99441874`.
- Exact-main `Deploy YouSafe Portal` run #2945 (id `35496234655`, event `push`, head SHA `2aa6a67c5cd7d59c4f2cf7bd354452cf99441874`) completed **SUCCESS**.
- Main run #2945 passed checkout/install, TypeScript, unit tests, Cloudflare credential verification, Next/OpenNext production build, static incremental-cache population, SEO audit, ephemeral Worker-secrets preparation, AI-vault sync, Cloudflare deployment, ephemeral-secret cleanup, Worker-secret health verification, and the post-deploy studio/build-freshness smoke test.

### Final ownership state

- Both checked-in ownership registry copies are byte-identical at **76 rows**; every strategic row is mapped/confirmed.
- Mapping coverage is **76/76 = 100%**, exceeding the ≥95% P3 threshold.
- Mapping does not equal CREATE permission. Three mapped rows retain `action=build` and two retain `action=supply_first`; all five remain non-authoritative under the shared predicate.
- Row 39 is a confirmed university-family namespace but its generic `/universities/` root cannot authorize authoring; a concrete university leaf must resolve first.
- Row 65 reserves a future UK dependent-child owner whose production URL is currently 404; `action=build` keeps it frozen until the leaf exists and is separately ratified.
- Marketplace supply proof before ratification returned **4 F-1-specific active gigs** and **23 study-permit gigs**; rows 40–41 are therefore mapped but remain `supply_first` and non-authoritative.
- University dual-graph ownership was reconciled to indexed regional owners for Auburn, Missouri, Kansas State, Utah, American University, King’s College London, and Creighton; Legal housing/university satellites remain supporting/noindex or redirecting surfaces where applicable.
- The generic apex `/blog/` mapping for the F-1 requirements intent was replaced by the specific live self-canonical F-1 Requirements 2026 article.

### Enforcement and verification

- `isAuthoritativeOwnershipRow` is the shared authority boundary: `status=confirmed`, action in `keep | expand | merge`, HTTPS known-estate host, and non-generic owner URL.
- Generic roots fail closed, including `/`, country roots, `/guide/`, `/blog/`, `/articles/`, `/universities/`, `/from/`, and category roots.
- Broad-create/publication assertions, Content Studio contract binding, planner/auto-run operator truth, and direct publication/merge paths consume the same boundary. P0 exact-live owner proof and P13 broad-create unlock semantics remain intact.
- Ratified focused acceptance: **23 suites / 259 tests PASS**; `npx --no-install tsc --noEmit` PASS; `git diff --check` PASS.
- Earlier integrated full local repository gate: **439 suites PASS / 2 skipped; 4,668 tests PASS / 4 skipped**, exit 0.
- The exact PR head subsequently passed GitHub’s full unit-test and Next/OpenNext build gates, and the exact merged main SHA passed the real production Cloudflare deploy plus Worker-secret health and smoke.

### Result

- `100% strategic intents have one owner` → **PASS**.
- `≥95% active priority intents mapped` → **PASS** at 100%.
- `CREATE is blocked without owner resolution` → **PASS** in production.
- **P3 is closed.**
- Broad net-new CREATE remains frozen until P13. P4 is the next parity phase; no P4 work is implied by this closure.


## 2026-09-20 — P4 cannibalization safety implementation — PR #251 pre-merge

P4 is now **IN_PROGRESS**. This entry records the implementation safety layer only; it does not claim that any priority collision has been consolidated or that the P4 phase gate is closed.

### Candidate

- Branch: `seo/p4-cannibalization-20260920`.
- P4 implementation commits: `7c158ac0` (`feat(seo): enforce P4 cannibalization safety`) and `3f658f81` (`fix(seo): harden P4 intent identity boundaries`).
- PR: #251, final code head before this documentation update `3f658f81dfbbc165afe159a8aa96470a71f66af3`.
- Branch started from P3 production closure `5a4a773a0bf8531cd9ea737332320779f1912f3d`; current `main` is one unrelated Messenger knowledge-refresh commit ahead, with no overlap in P4-sensitive files.

### Safety contract implemented

- Destructive cannibalization execution is PR-only; direct/main publication and non-PR modes fail closed.
- A complete evidence-backed decision is validated and inserted into the append-only `seo_cannibal_decisions` ledger before the first Git mutation. Pre-mutation persistence failure yields zero branch/file writes.
- A review PR whose `pr_opened` ledger row cannot be persisted returns `needs_decision`; partial state is never reported as clean success.
- `content_inventory` is explicitly synthetic/display-only and never masquerades as qualified GSC evidence or authorizes destructive action.
- Exactly one authoritative P3 row must apply across the competitor set and the selected winner must equal that unique owner.
- P4 identity matching is fail-closed: Canada spousal sponsorship; US F-1/CPT vs OPT vs STEM OPT as related but distinct; Australia subclass 485 vs US I-485; UK Student vs Graduate vs Skilled Worker vs dependant/dependent; and Express Entry checklist/general vs CRS/draw/category/STEM-category vs FSW are kept distinct unless their own ratified authority/evidence permits action. Unrecognized/mixed identities do not act as wildcard matches.
- Exact qualified-query overlap, real metrics, per-loser actions, rollback file SHAs, and current-main file state are checked before mutation.
- Admin/Resolve-All surfaces remain evidence-review only and cannot perform destructive sweeps. Zero-write outcomes are explicit skipped no-ops and do not create terminal compatibility history.

### Local verification

- Focused P4 + adjacent ownership regressions: **16 suites / 191 tests PASS**.
- `npx tsc --noEmit --pretty false`: **PASS**.
- Full Jest: **446 suites PASS / 2 skipped; 4,772 tests PASS / 4 skipped**.
- `git diff --check`: **PASS**.
- Earlier independent DeepSeek review found **no BLOCKER/HIGH**; its three MEDIUM residuals (no-op semantics, asymmetric/over-permissive identity handling, and stageable `node_modules` symlink) were subsequently repaired and regression-tested.
- Local `npm run build` compiled successfully and completed its TypeScript phase, then stopped during Marketplace page-data collection because the local shell had neither `SUPABASE_SERVICE_ROLE_JWT` nor `SUPABASE_SERVICE_ROLE_KEY`. The failing guard is pre-existing Marketplace build-authority protection, not P4 code. Full build acceptance is therefore delegated to PR CI with repository secrets.

### Phase boundary

- No live redirect, noindex, canonical change, PR merge, migration application, deployment, or production consolidation was performed by this implementation pass.
- The five priority families remain subject to current per-collision GSC query×page, HTTP/canonical/indexability, internal-link, backlink/UNKNOWN, authoritative P3 owner, exact repo/path/SHA, and rollback evidence before any actual consolidation.
- P4 remains **IN_PROGRESS** until PR checks/review, merge, exact-main deployment, migration proof where applicable, and live collision evidence close the phase gate. Broad CREATE remains frozen until P13.


## 2026-09-20 — P4 production acceptance — FINAL P4 closure

This section records the approved documentation-only closure. The PR #251 pre-merge entry above is retained as history and is not rewritten. P4 is closed as **PASS**. No Portal code, test, migration, database, redirect, canonical, noindex, ownership-registry, or production-behavior change was made in this closure pass.

### Release chain

- P4 implementation PR #251 (`feat(seo): enforce P4 cannibalization safety`, reviewed P4 code head `3f658f81`) merged cleanly to `main` as `a26501f73a69212e6233dd4f38f8a0106522f353`.
- Post-P4 advisor remediation PR #252 (`security(seo): pin P4 ledger trigger search path`, commit `ce62c688`) merged cleanly to `main` as `77105d511552dd64439aa6dcfcf70a6d8f395324`.
- Exact-main `Deploy YouSafe Portal` run `35510937704` completed **SUCCESS** at `77105d51`.
- Exact-main `Apply SEO Factory Migrations` run `35510937689` completed **SUCCESS** at `77105d51`.
- This closure worktree is based on the exact merge `77105d511552dd64439aa6dcfcf70a6d8f395324` on `seo/p4-live-consolidation-20260920`.

### Evidence method and window

- Family evidence is **persisted qualified GSC** for property `sc-domain:yousafeconsultancy.com`, window `2026-06-22 → 2026-09-19`, **2,660 rows**, last sync `2026-09-20 05:39 UTC`.
- **No live GSC API pull was made for this closure**, so live-query coverage remains **UNKNOWN**. Acceptance rests on the persisted window above plus independent HTTP redirect verification, not on a fresh Google query.
- Decision authority stayed fail-closed throughout: the validator requires exactly one authoritative P3 owner per competitor set; ambiguous or missing ownership blocks action, alongside strict five-family identity boundaries and append-only decision persistence before any mutation.

### Per-family dispositions

1. **Canada spouse/spousal sponsorship — redirect-resolved residual overlap.** Two qualified historical overlaps (`canada spouse visa`, `2024 canada spouse visa`) occur only on legacy loser URLs. Independent verification: both legacy URLs return HTTP 301 to the row-66 owner on `legal.yousafeconsultancy.com` (`/ca/family/canada-spousal-sponsorship-document-checklist-2026/`) and terminate in HTTP 200. No actionable competing pair remains.
2. **US F-1/CPT/OPT/STEM OPT — no actionable overlap.** No actionable qualified overlap; F-1/CPT vs OPT vs STEM-OPT subtype boundaries remain fail-closed.
3. **Australia 485 — no actionable overlap; P3 hygiene residual.** No actionable qualified overlap and no current P4 collision. P3 rows 59/76 remain an ownership-hygiene ambiguity that keeps future destructive actions fail-closed.
4. **UK Student/Graduate/Skilled Worker/dependants — redirect-resolved residual overlap.** One qualified historical overlap only, between a Legal guide and the UK university hub (Warwick). Independent verification: the Legal guide returns HTTP 301 to `https://uk.yousafeconsultancy.com/universities/university-of-warwick/` and terminates in HTTP 200. Route-family pages have no actionable overlap; missing/ambiguous owners remain fail-closed P3 hygiene.
5. **Express Entry — no actionable overlap; P3 hygiene residual.** No actionable qualified overlap; CRS/draw/STEM-category owner gaps remain fail-closed map hygiene, not collision evidence.

Truthful summary: **three exact qualified historical overlaps exist, but all are on already-redirected loser URLs; ZERO actionable currently competing pairs remain.**

### Production ledger and trigger verification

- `public.seo_cannibal_decisions` exists in production.
- The append-only guard trigger `seo_cannibal_decisions_append_only` exists, and its function has a pinned empty `search_path` (advisor remediation `20260920120000_seo_cannibal_decisions_append_only_search_path.sql`).
- The ledger holds **0 rows**; no new destructive consolidation was executed, which is consistent with P4 closing through already-existing redirects rather than new mutations.
- Legacy `cannibal_merges` is **not** P4 authority. The new append-only `seo_cannibal_decisions` ledger is the authoritative P4 decision record.

### Related acceptance context (not a Portal change)

- The caseworks wrong-topic redirect incident was independently repaired and deployed via caseworks PR #155, merge `16c13cc6156f2e4e01b8f1c06bca133a97b00870`; production representative endangered URLs return 200/self with zero redirects. This is recorded only as redirect-health context and is not a Portal code change.

### Caveats

- Live-query coverage is **UNKNOWN** because no live GSC API pull was made. "No actionable collision" means no actionable qualified overlap in the persisted window plus verified live HTTP redirect state for the residual loser URLs; it is not a real-time claim about Google's live index.
- The three historical overlap observations remain in the persisted GSC window for legacy loser URLs; their estate-side resolution depends on existing 301 redirects, which remain independently verified live.
- P3 ownership-hygiene gaps (Australia 485 rows 59/76; Express Entry CRS/draw/STEM-category; any missing/ambiguous owner) remain fail-closed. They do **not** reopen P4 absent a current qualified competing pair, and they continue to block future destructive actions.

### Closure mechanics

- This pass modified exactly `docs/superpowers/seo-parity-matrix.md` and `docs/superpowers/seo-execution-ledger.md`; `git diff --check` PASS.
- The matrix P4 row moved `IN_PROGRESS` → `PASS`; P5+ rows are unchanged.

### Final result

- `Major priority-cluster cannibalization resolved` → **PASS**.
- **P4 is closed. P5 is next.**
- Broad net-new CREATE remains frozen until P13.

## 2026-09-20 — P5 off-mission dispositions and action boundary — IN_PROGRESS checkpoint

**Supervisor:** ChatGPT (final authority). **Executor:** repository implementation pass.
**Branch:** `seo/p5-off-mission-cleanup-20260920` (base `d5688e9f7144d7ae34526db9f6a18dd88d292d32`).
**Status:** **IN_PROGRESS**. Not merged, not deployed, not production-verified. No P5 PASS is claimed here.

### Supervisor decisions recorded

1. Gate 1 (raw vs qualified/off-mission visibility) remains as previously evidenced PASS and is preserved exactly — off-mission rows stay observable in raw measurement and are not rewritten into junk.
2. Gate 2 was **not** accepted as PASS: action-facing keyword planning admitted off-mission GSC terms before the final pipeline backstop. This pass fixes that boundary.
3. "High-impression" for P5 is defined as the smallest descending URL cohort whose cumulative off-mission impressions reach at least **75% of all off-mission impressions, including every URL tied at the boundary**. For `2026-06-22 → 2026-09-19` that is the eight URLs below.
4. Explicit disposition for all eight cohort URLs is **`KEEP_BUT_SILO`**: retain the useful campus-lifestyle page in its current live state; it remains observable but non-mission/non-actionable; no redirect, noindex, retirement, canonical change, and no automatic internal-authority expansion from P5 evidence alone.
5. Dispositions use only the existing program vocabulary `KEEP | KEEP_BUT_SILO | MOVE | MERGE_301 | NOINDEX | RETIRE`.
6. No production mutation was required or performed.

### Cohort and evidence

- Cohort (75% cumulative share), all `https://legal.yousafeconsultancy.com/guide/<slug>/`, all `KEEP_BUT_SILO`: `university-of-south-carolina-student-housing`, `florida-international-university-student-housing`, `portland-state-university-student-housing`, `cornell-university-student-housing`, `university-of-utah-student-housing`, `arizona-state-university-student-housing`, `university-of-oregon-student-housing`, `howard-university-student-housing`.
- Evidence source: persisted GSC query×page rows for `sc-domain:yousafeconsultancy.com`, **read-only**; **no live GSC API pull**, so live-query coverage remains UNKNOWN.
- Window `2026-06-22 → 2026-09-19`, persisted sync `2026-09-20 05:39 UTC`; window holds **2,660 rows** (re-verified read-only during this pass).
- Off-mission totals for the window: **613 impressions / 134 rows / 37 URLs / 0 clicks**.
- Per-URL off-mission split **published by the audit and recorded per entry** (impressions / rows): South Carolina 141/16, Florida International 106/8, Portland State 57/7, Cornell 49/UNKNOWN, Utah 46/1, Arizona State 23/6, Oregon 23/UNKNOWN, Howard UNKNOWN (audit display range 20–29 only).
- Per-URL qualified demand: measured **0** qualified impressions for South Carolina, FIU, Portland State, Cornell and Utah; **UNKNOWN** for Arizona State, Oregon and Howard.
- Per-URL live observations published by the audit and recorded: HTTP **200**, **not in sitemap**, **robots.txt allowed** for all eight — the audit checked robots.txt only and did **not** inspect HTML meta robots state, so it is never an index/follow observation; ownership registry row identified for **Utah only (row 57)**, and row 57 records the Utah Legal housing guide as **live noindex/follow**; observation date 2026-09-20, exact capture time not recorded (date-level note, no fabricated timestamp).
- Recorded as **UNKNOWN (`null`)** with explicit provenance, never as fabricated `0`: per-URL off-mission clicks (all eight), per-URL qualified rows/clicks (all eight), per-URL off-mission rows where the audit gave no count (Cornell, Oregon, Howard), Howard's exact impressions, and ownership rows for the seven URLs where no ownership row was identified.

### Changes in this checkpoint

- New durable contract: `data/seo/p5-off-mission-dispositions.json` (versioned `p5-off-mission-dispositions-v1`, mirrored byte-identical at `public/seo-data/p5-off-mission-dispositions.json`) plus typed helper `lib/seoFactory/p5OffMissionDispositions.ts` (strategic vocabulary, deterministic normalization, lookup, `p5MutationVerdict()`, `validateP5Registry()`). Static import is deliberate so the fail-closed gate cannot depend on an unavailable fetch; no table/migration was added because a committed repository file satisfies runtime gating.
- `lib/seoFactory/keywordPlanner.ts`: GSC-derived board/plan admission now requires the metric-aware `isQualifiedGscDemandQuery()` boundary instead of junk-only filtering; the explicit `includeBrand` opt-in is preserved.
- `app/api/seo-factory/auto-run/route.ts`: Master Planner top-up uses the shared metric-free `isActionableDemandQuery()` boundary; the keyword-plan branch enforces the same guard before candidates are built.
- `app/api/seo-factory/auto-run-stream/route.ts`: keyword-plan fill enforces `isActionableDemandQuery()` (fail-closed defense in depth). Note for the record: this revision has no cluster-plan top-up path; its GSC-derived top-up is the keyword-plan fill.
- `lib/seoFactory/indexCoverageFixes.ts`: `computeIndexFix()` consults the registry first and returns `skipped` with an explicit P5 reason for registered URLs whose disposition is not `KEEP`; `resolveIndexCoverage()` passes the **union of the whole registry with the batch** registered URLs to the delegated repair.
- `lib/seoFactory/siteHealth.ts`: `repairSiteHealth(scope, dryRun, { protectedUrls })` refuses to use protected URLs as orphan link targets or as the rewritten repair hub, and never adds a protected URL to a sitemap — while **retaining** a protected URL that is already listed (protection means "do not alter current state", not "force absent"). Protection for the **full registry** is now the default; the caller list can only add URLs.
- `lib/seoFactory/siteHealth.ts`: `repairSiteHealthChunked(scope, batchStart, batchSize, dryRun, { protectedUrls })` (the live path used by `app/api/content-studio/site-health/route.ts` and `siteHealthComplete.ts`) enforces the same semantics, reports `protectedOrphansSkipped`, and excludes protected orphans from the repair cursor so pagination still advances.
- Tests: `tests/p5-off-mission-dispositions.test.ts`, `tests/p5-site-health-protection.test.ts` (new), `tests/p5-keyword-planner-demand-boundary.test.ts`, `tests/p5-auto-run-demand-boundary.test.ts`.
- Docs: `docs/superpowers/plans/2026-09-20-seo-parity-p5-off-mission.md`; both P5 matrix rows moved `PENDING` → `IN_PROGRESS` with evidence.

### Verification performed (local)

- `git diff --check`: clean.
- `node --check` parses every added/changed TypeScript file.
- Node smoke harness over the real modules (temporary, removed before commit; GitHub/IndexNow boundaries stubbed): **19 checks PASS** after the supervisor repair — registry validates with no problems; per-URL audit evidence matches the supervisor table with UNKNOWN only where actually unknown; `repairSiteHealth` with no caller list still protects all eight registry URLs and retains an existing protected sitemap entry without adding an absent one; `repairSiteHealthChunked` skips both protected cohort orphans, repairs the unregistered one, and writes no protected URL; a caller list containing only an unrelated URL cannot narrow the set; the delegated `resolveIndexCoverage` repair runs through the real site-health layer with the same protection; all eight URLs `KEEP_BUT_SILO` in the closed vocabulary; normalization deterministic/idempotent across host-case, scheme, trailing-slash, tracker, `www.` and hash variants; UNKNOWN stays `null` and is never coerced to `0`; every registered URL blocks with an explicit P5 reason naming disposition and window; an unregistered URL is not blocked; `data/` and `public/` copies are byte-identical; and each classification fixture used by the Jest suites is the real boundary case (off-mission campus demand is non-junk and fails the qualified boundary; qualified immigration/admissions/tenancy demand passes).
- **Environment limitation (unchanged, re-verified):** this worktree's `node_modules` symlink resolves to an empty directory (0 entries), and no sibling worktree or the main checkout has a populated `node_modules`, so Jest and `tsc` could not run locally. No dependency install, no manifest change, no arbitrary Jest version was introduced. The P5 suites and `tsc` therefore remain unproven locally and must pass in CI.
- `git diff --check` clean after the repair; `node --check` parses every added/changed TypeScript file.

### Supervisor repair (2026-09-20, post-checkpoint `dda62b09`) — BLOCKER 1 and BLOCKER 2

The checkpoint commit `dda62b09` was **not** supervisor-approved. Two blockers were repaired in the follow-up commit:

1. **BLOCKER 1 — full registry protection, not current-batch-only.** `resolveIndexCoverage()` previously passed only the registered URLs present in its current batch to `repairSiteHealth()`, so a repo-wide repair triggered by an unrelated URL could still touch another registered `KEEP_BUT_SILO` URL. The site-health mutation layer now builds its protection set from `p5ProtectedUrlKeys()` by default; `opts.protectedUrls` may only union additional URLs in and can never narrow the registry set. `resolveIndexCoverage()` now also passes the explicit union of the whole registry with the batch.
2. **BLOCKER 2 — chunked mutation path.** `repairSiteHealthChunked()` — the live mutating path used by `app/api/content-studio/site-health/route.ts` and `lib/seoFactory/siteHealthComplete.ts` — previously had no P5 protection at all. It now uses the same default full-registry protection: a registered `KEEP_BUT_SILO` URL is never injected as an orphan/internal-link target, never used as the rewritten repair hub, and never added to a sitemap, while unregistered URLs keep their existing behavior.
3. **Evidence-contract repair.** The checkpoint text claimed the audit published "no per-URL split". That was false: the audit did publish concrete per-URL off-mission evidence, but not with complete coverage — exact off-mission impressions for seven of the eight URLs (Howard's value was published only as a 20–29 display range, so his exact impressions remain UNKNOWN/`null`) and exact off-mission row counts for five (South Carolina 16, FIU 8, Portland State 7, Utah 1, Arizona State 6; Cornell, Oregon and Howard UNKNOWN) — plus live HTTP/sitemap/robots.txt observations (robots.txt only; HTML meta robots state was **not** measured). The registry, this ledger, the plan and the parity matrix now record those concrete values and keep `null`/UNKNOWN only where a value genuinely was not published.
4. **Safety semantics preserved.** No second disposition vocabulary, no destructive page change, no fail-closed behavior for unregistered URLs, no broad-CREATE change, and no forced removal of a protected URL that is already present in a sitemap.
5. **Read-only verification of one figure.** Ownership registry row **57** for University of Utah was confirmed read-only against `data/seo/ownership-registry.json` (its `supporting_urls` names the Utah guide URL). Howard's exact impressions could not be re-derived read-only: the audit number depends on the repository's `classifyGscVisibility()` / `isOffMissionDemandQuery()` semantics applied to the persisted per-query rows in `seo_gsc_rows`, and that row-level payload could not be extracted through the available read-only surface, while re-implementing the predicate in SQL would risk a non-authoritative value. The numeric field therefore stays `null` with the 20–29 display-range provenance instead of a fabricated exact value.

Residual unknowns after the repair: per-URL off-mission clicks and qualified rows/clicks (all eight), per-URL off-mission rows for Cornell/Oregon/Howard, Howard's exact impressions, the exact live-observation capture time, and ownership rows for the seven URLs where no row was identified.

Residual scope note that was disclosed here — "the complete-flow noindex fixer (`fixNoIndexPagesChunked()` in `siteHealthComplete.ts`) is a separate mutation path that this repair did not extend registry protection to" — is **closed by the final supervisor repair below (commit `7807aafd`)**. This was a **real potential live mutation risk, not a theoretical one**: the P5 audit never measured HTML meta robots state (its `robotsState` observation is robots.txt-only), and ownership registry row 57 records the Utah Legal housing guide — a cohort URL — as **live noindex/follow**, so a fully-expanded cohort page carrying noindex was possible. The earlier characterisation here ("safe only because no cohort URL carried a noindex directive at the time") was unsupported by any P5 measurement and is **withdrawn**: the audit could not establish it. Protection was therefore moved to the mutation boundary itself instead of relying on today's data.

### Final supervisor repair (2026-09-20, post-`450ad8f3`) — noindex mutation boundary guard

`450ad8f3` was not final-approved because it left that disclosed gap. This repair closes it at the mutation boundary and makes the complete-flow reporting truthful:

1. **Boundary guard.** `fixNoIndexPagesChunked()` (`lib/seoFactory/siteHealthFixes.ts`) now calls the existing `p5MutationVerdict()` (`lib/seoFactory/p5OffMissionDispositions.ts` — no second registry, no new vocabulary) for every candidate URL **before** any GitHub read, strip, write, branch, PR or history append. A blocked URL (registered `KEEP_BUT_SILO` today, and any other non-`KEEP`/unrecognized disposition) is returned in a new `protectedSkipped` list with its explicit P5 reason and is never returned in `fixed` — so it is not rewritten, not branched/PR'd and not logged as fixed. Unregistered URLs and registered `KEEP` URLs keep the exact pre-existing path. Every caller inherits the guard automatically, including `app/api/content-studio/site-health/route.ts` (`fix_noindex_chunked`) and `siteHealthComplete.ts`.
2. **Truthful complete-flow logging.** `runFullSiteHealthCheck()` previously pushed `noindex` history entries from `candidates.slice(0, 20)` — the candidate list — so a protected/skipped page could be logged as "Removed noindex". It now builds entries from the outcomes `fixNoIndexPagesChunked()` actually fixed (exported helper `buildNoIndexFixLogEntries()`), counts protected skips in `repairs.noindexProtectedSkipped`, and leaves the classification (`noindexPages`) intact so the report stays honest about current state.
3. **Safety semantics.** Protection means "preserve current state": the guard never adds and never removes a noindex directive on a protected URL, and unregistered URLs keep pre-P5 behavior exactly.
4. **Regression coverage.** `tests/p5-site-health-protection.test.ts` (extended) proves a real registry `KEEP_BUT_SILO` URL carrying a real noindex directive is skipped in both dry-run and live mode with **zero** GitHub calls (no read, no write, no refs POST, no PR, no history PUT) and is never returned as fixed; an unregistered fully-expanded candidate still writes `index: true`, opens the PR and appends exactly one history entry; and a mixed batch fixes only the unregistered candidate while never naming the protected URL in the PR body or the history payload. `tests/p5-noindex-orchestrator-truthfulness.test.ts` (new) drives the real complete-flow orchestrator with only the scan/live-verify/snapshot/sitemap/GitHub boundaries stubbed, proving `noindexFixed: 0` / `noindexProtectedSkipped: 1`, no mutation of any kind, and a fixed-outcomes-only log contract.
5. **Disclosed remaining manual path (not a blocker).** `repairSinglePage(repo, path, 'remove-noindex')` (the explicit per-page admin action behind `app/api/content-studio/site-health/repair-single/route.ts`) is unchanged: it is a human-initiated single-page action, not the automated bulk/chunked/complete-flow path this repair protects. No P5 page is targeted by automation today, and the audit did **not** measure HTML meta robots state for any cohort URL — so no statement here claims a cohort URL is free of a noindex directive. Ownership registry row 57 records the Utah Legal housing guide as live **noindex/follow**, so the pre-repair gap was a potential live mutation risk (now closed at the automated boundary by `7807aafd`); this note is disclosed so the next pass can decide whether an admin confirm-step is wanted on that manual path too.

Verification for this repair: `git diff --check` clean; `node --check` parses every changed/added TypeScript file. Local substitute evidence (temporary Node smoke harness, removed before commit; GitHub Contents, audit scan, live-verify, snapshot and sitemap-fetch boundaries stubbed, the real modules otherwise unmodified): **41 checks PASS** — 25 against the real `fixNoIndexPagesChunked()` (protected candidate skipped with **zero** GitHub calls in live and dry-run mode; unregistered candidate still written with `index: true`, PR'd and logged; mixed batch only fixes/logs the unregistered page; protected candidates still advance the batch cursor) and 16 against the real `runFullSiteHealthCheck()` (`noindexFixed: 0` / `noindexProtectedSkipped: 1`, no refs POST, no write, no PR, no history payload for a protected-only run; and in a mixed run `noindexFixed: 1` with only the unregistered page written, PR'd and logged). The harness also caught a real defect in the first draft — the function's final `return` omitted the new `protectedSkipped` field (a `tsc` error) — which was fixed before this commit. The Jest regressions above could not be executed locally because this worktree's `node_modules` still resolves to an empty directory (re-verified; no install or manifest change attempted), so CI remains the gate.

### Pre-PR review fixes (post-`1c7045b6`) — truthful orphan outcomes + robots evidence scope

ChatGPT's pre-PR review (run `512570ba-1eea-49f6-9e80-bc2c0f691779`) accepted two blockers; both are fixed on top of `1c7045b6` with **no P5 disposition change, no protected-URL auto-repair and no live mutation**. P5 remains **IN_PROGRESS**.

1. **BLOCKER 1 — orphan outcome accounting was candidate-based.** `runFullSiteHealthCheck({ fixOrphans: true })` logged "Repaired orphan page" from the audit's candidate orphan list, so a P5-protected orphan (a real skip) or an orphan whose repo had no usable hub could be reported as repaired even though `repairSiteHealthChunked()` never touched it, and `orphansFixed` counted the whole candidate batch. `repairSiteHealthChunked()` now returns an additive exact `fixedOrphans` outcome list (repo/path/url/title for each orphan whose hub rewrite really happened), `orphansFixed` is `fixedOrphans.length`, and `FullRepairResult` surfaces `orphansProtectedSkipped`. A repo with no usable hub, or a hub rewrite that would not change content, produces **no** outcome, while the batch cursor still advances past those repairable candidates (covered by a two-batch no-hub regression). The orchestrator builds `orphan` history entries only from `fixedOrphans` (new exported `buildOrphanFixLogEntries()`); the chunked path's own interlink log (`logRepairs`) is likewise fed only from actually-rewritten hubs. A protected orphan therefore never receives a "Repaired orphan page" entry and is never written; the chunked PR title/body now report the actual repaired count plus the candidate count.
2. **BLOCKER 2 — robots evidence scope.** The registry's `liveObservations.robotsState = "allowed"` was a robots.txt crawl-permission observation, but its wording could be read as an HTML meta robots/indexability claim — and it sat next to ownership registry row 57, which records the **Utah Legal housing guide** as **live noindex/follow**. All eight entries now record the explicit value `robots.txt allowed (HTML meta robots state not observed in P5 audit)` (field name kept for compatibility; `data/` and `public/` copies byte-identical), the type comment in `lib/seoFactory/p5OffMissionDispositions.ts` documents it as robots.txt-only, `validateP5Registry()` now rejects any non-null `robotsState` that is not explicitly robots.txt-scoped, and the registry's `knownLimitations` plus Utah's entry notes acknowledge row 57: the P5 audit only established robots.txt crawl allowance and did **not** independently inspect HTML meta robots state. The pre-repair noindex gap could therefore have been a live mutation risk; it is closed at the automated boundary by commit `7807aafd`. The earlier ledger claim ("safe only because no cohort URL carried a noindex directive at the time") is **withdrawn**: the audit never measured meta robots state.
3. **Stale comment.** The `siteHealthComplete.ts` sitemap-sync branch claimed `repairSiteHealthChunked()` "handles sitemap writes"; the chunked path does not write sitemap files (it only reports `sitemapPaths` on `repaired` entries), so the comment now states that it triggers interlink repair and `sitemapsUpdated` counts the requested sync.

Regression coverage added/updated: `tests/p5-orphan-orchestrator-truthfulness.test.ts` (new — real complete-flow orchestrator with one protected cohort orphan and one unregistered repairable orphan: `orphansProtectedSkipped: 1`, `orphansFixed: 1`, only the unregistered URL written/PR'd/logged, no protected URL in any write or history payload), `tests/p5-site-health-protection.test.ts` (`fixedOrphans` exact-outcome assertions plus the no-hub two-batch cursor-progress case) and `tests/p5-off-mission-dispositions.test.ts` (robots.txt-scope wording, row-57/noindex-follow acknowledgement, and a non-vacuous check that the ambiguous `"allowed"` is rejected by `validateP5Registry()`).

Verification for this repair: `git diff --check` clean; both registry JSON copies parse and stay byte-identical; no dependency install, no package/manifest change, no temporary artifact committed. A temporary local harness (removed before commit) exercises the real modules with only the network/DB boundaries stubbed. Jest and `tsc` remain unavailable locally in this worktree, so CI stays the gate; P5 is **not** claimed PASS.

### Final completeness fix (2026-09-20, post-`4e89fa66`) — upstream planner mission-generation boundary

ChatGPT's final read-only review found the remaining P5 Gate 2 gap and the supervisor verified it independently: `lib/seoEngine/planner.ts` — the upstream Master Engine executed by the daily cron as `runPlanner({ draftBriefs: true })` — filtered its three action-influencing signal loops with `isJunkQuery` only. Real-but-off-mission demand such as `university of south carolina student housing` is not junk, matches the housing ontology cell (seeds include `student housing`, `university housing`, `off campus housing`) and was persisted as an `seo_cluster_plans` row — a mission row, refused later by auto-run admission but mounted on the desk upstream. The same off-mission GSC signal also entered `gscCorroboratedCells`, so it could indirectly hand an Ubersuggest-only housing signal the 1.25× `UBER_BOOST` (or rescue a dead-funnel mission) without any on-mission demand.

Closed by one commit on this branch (no amend, no push, no merge, no deploy, no dependency install, no DB/production mutation):

1. **Shared boundary, not a new rule.** `lib/seoEngine/planner.ts` now imports the existing semantic `isActionableDemandQuery()` from `lib/seoFactory/queryNoise.ts` (which is **not** modified) and applies it in every action-influencing signal loop; `isJunkQuery` keeps its existing uses (purge, dashboard read) and its semantics inside the boundary.
2. **Four loop guards.** (a) `neededCells` derivation for `marketSupply` — off-mission signals create no actionable-cell work and issue no marketplace lookup; (b) `gscCorroboratedCells` — off-mission (or junk) GSC can never corroborate a cell, so no boost and no dead-funnel rescue from off-mission proof; (c) candidate/plan admission — off-mission signals never become plans/missions for any source (GSC, Ubersuggest, Ads, GA4); (d) the related-terms loop of an admitted plan — an off-mission term can never ride along as a cluster term/spoke/keyword.
3. **Admission boundary, not ontology deletion.** The housing lifecycle stage and its settlement/tenancy/legal seeds are untouched; qualified housing demand (tenant rights / lease / rental-deposit / newcomer housing) still plans, and the stage/country inclusion-constraint semantics are unchanged. No CREATE-freeze change.
4. **Regression.** New `tests/p5-planner-demand-boundary.test.ts` drives the REAL `runPlanner` (only Supabase/interlink mocked, shared repository pattern) and pins: off-mission GSC + Ubersuggest never plan, never persist (payload-level assertion over the mocked persistence writes) and never leak into an admitted cluster; qualified immigration **and** tenancy-legal housing demand in the same batch still plan and persist; the Ubersuggest-only housing score is bit-identical with and without the off-mission GSC signal (no corroboration grant); off-mission-only demand issues zero marketplace (`gigs`) lookups while qualified housing demand does (non-vacuous control). `tests/planner-filter-inclusion.test.ts` keeps its inclusion/no-relabelling purpose with the on-mission fixture `stockton student housing tenant rights` (asserted `isActionableDemandQuery() === true` and housing-mapped); a bare campus-housing term like the old `stockton student housing rates 2026` is off-mission by design and is not the inclusion behaviour that test exists to prove.
5. **Records.** P5 plan + both P5 matrix rows updated narrowly; the residual sentence claiming the planner may still persist an off-mission cluster plan is removed and replaced with the closure record. P5 stays **IN_PROGRESS** — no PASS claim until CI, merge and exact-main production verification.

Local verification for this fix (Jest and `tsc` remain unavailable in this worktree — its `node_modules` symlink is unreadable from the execution sandbox, so no install or manifest change was attempted): a temporary Node smoke harness (removed before commit) loaded the real planner, ontology, query-noise boundary, scoring and marketplace modules with only Supabase/AI-registry/feeders/shipped-coverage/interlink boundaries stubbed. Fail-first was established: **7 PASS / 4 FAIL** before the fix, with all four failures being the new assertions (off-mission GSC and Ubersuggest planned/persisted; off-mission term inside a plan cluster; off-mission GSC corroborating the Ubersuggest boost; marketplace lookup triggered by off-mission demand). After the fix, the same harness passed **13/13**, including the four `tests/planner-filter-inclusion.test.ts` scenarios with the substituted fixture, the cron-default path (`draftBriefs` omitted/true: only the qualified plan is drafted and persisted, and the off-mission term appears in no draft prompt), and a direct check that the housing stage still carries its `student housing` / tenant-rights / newcomers seeds. Residual disclosed and unchanged in scope: the manual single-page admin `repairSinglePage(repo, path, 'remove-noindex')` action remains as previously recorded; sitemap/noindex duplicate history remains tracked separately by the supervisor; findings B/C/D/E were not touched.

### Explicitly not done

- No redirect, noindex, canonical, robots, retirement or internal-link mutation for any of the eight pages.
- No database write, migration, PR, push, merge, deployment, or production change.
- No P6 work.
- No change to `lib/seoFactory/queryNoise.ts`, the ontology stages/seeds, or the CREATE freeze.

### Next gate

1. PR checks: the seven P5 suites (`p5-off-mission-dispositions`, `p5-site-health-protection`, `p5-noindex-orchestrator-truthfulness`, `p5-orphan-orchestrator-truthfulness`, `p5-keyword-planner-demand-boundary`, `p5-auto-run-demand-boundary`, `p5-planner-demand-boundary`), full Jest where available, `tsc --noEmit`, and the repository's SEO guard.
2. Merge through GitHub, then exact-main deployment verification by the supervisor.
3. Only then may the two P5 matrix rows move from `IN_PROGRESS` toward PASS. Broad net-new CREATE remains frozen until P13.
