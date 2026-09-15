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
