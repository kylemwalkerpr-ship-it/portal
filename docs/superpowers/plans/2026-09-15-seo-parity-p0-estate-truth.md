# SEO Parity P0 — Estate Truth and Branch Hygiene

> **For GLM 5.3:** implement this phase only. GPT-5.6 Sol is the supervising reviewer. Do not merge or deploy.

**Goal:** Establish trustworthy branch/host/link truth before any SEO cleanup or expansion work can act on stale evidence.

**Architecture:** Keep `main` as production truth. The control branch holds this plan, the design, parity matrix, and execution ledger only. After those documents are merged, create `seo/parity-p0-estate-truth` from refreshed `main`. Preserve Portal where it is legitimately an authenticated/app surface, while eliminating retired Portal-host Marketplace URLs from SEO engine output.

**Primary contract:** Public Marketplace category URLs are `https://market.yousafeconsultancy.com/categories/<id>`. Internal Next.js route names under `app/marketplace/...` do not define the public URL contract.

**Design source:** `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`

---

## Task 1: Re-establish exact repository truth

**Files:**
- Modify: `docs/superpowers/seo-parity-matrix.md`
- Modify: `docs/superpowers/seo-execution-ledger.md`

**Step 1:** Read root and repo `AGENTS.md`, the design, this plan, matrix, and ledger.

**Step 2:** Run `git fetch --prune origin`, `git status --short --branch`, `git remote -v`, and compare local `main`, `origin/main`, and `git ls-remote origin refs/heads/main`.
**Step 3:** Inventory remote branches. For every deletion candidate, record branch tip SHA, whether that exact SHA is reachable from `origin/main`, associated PR state when available, and disposition (`DELETE_SAFE`, `RETAIN_UNIQUE`, `RETAIN_ACTIVE`, `REVIEW`).

**Step 4:** Delete only `DELETE_SAFE` branches. Never infer safety from a similar branch name or PR title. Re-fetch and prove the retained/deleted state afterward.

**Step 5:** Update the matrix and ledger with exact commands/SHAs and the branch-disposition summary.

## Task 2: Lock the Marketplace public URL contract with failing tests

**Files:**
- Create: `tests/seo-estate-public-url-contract.test.ts`
- Test: `tests/marketplace-clean-url-estate.test.ts`

**Step 1:** Add regression assertions that `marketplaceCategoryHref('study-permits')` resolves to `https://market.yousafeconsultancy.com/categories/study-permits`.

**Step 2:** Assert an unknown service falls back to `https://market.yousafeconsultancy.com/categories/immigration`.

**Step 3:** Assert `ESTATE_DOMAINS` includes `market.yousafeconsultancy.com`. Keep `portal.yousafeconsultancy.com` only as an explicitly legitimate Portal/auth estate surface; it must not be the Marketplace public canonical.

**Step 4:** Add a focused source-contract assertion that the interlink engine no longer emits `portal.yousafeconsultancy.com/marketplace/categories/`.

**Step 5:** Run the new test and confirm it fails for the current defect before production code changes.

## Task 3: Reconcile engine URL generation
**Files:**
- Modify: `lib/marketplaceSeo.ts`
- Modify: `lib/seoEngine/interlink.ts`
- Modify: `lib/seoEngine/llmVisibility.ts`
- Review only unless evidence requires change: `lib/seoFactory/ownership.ts`
- Test: `tests/seo-estate-public-url-contract.test.ts`

**Step 1:** Reuse the existing canonical Marketplace helper in `lib/marketplaceSeo.ts`; do not introduce a competing host constant.

**Step 2:** Change `marketplaceCategoryHref` to build the clean public `/categories/<id>` URL on `market.yousafeconsultancy.com`. Preserve category validation/fallback behavior.

**Step 3:** Make the interlink estate base consistent with the canonical Marketplace helper where practical. Do not change authenticated Portal navigation or unrelated dashboard URLs.

**Step 4:** Add `market.yousafeconsultancy.com` to the LLM citation estate. Preserve Portal only because it remains a legitimate Portal/auth surface, not as a Marketplace canonical.

**Step 5:** Treat `HOST_FROM_HOSTNAME['portal.yousafeconsultancy.com'] = 'market'` in ownership as an accepted legacy-input alias unless a test proves it emits a retired public URL. Input normalization is not canonical emission.

**Step 6:** Run focused tests and confirm the new URL contract is green.

## Task 4: Detect and reconcile stale planned interlinks safely

**Files:**
- Create or modify only the smallest existing SEO maintenance script surface required by recon.
- Modify: `docs/superpowers/seo-parity-matrix.md`
- Modify: `docs/superpowers/seo-execution-ledger.md`

**Step 1:** Query/count planned `seo_interlinks` whose target begins with the retired Marketplace form. Capture count and representative rows without mutating them.
**Step 2:** If stale planned rows exist, implement a deterministic dry-run reconciliation from `https://portal.yousafeconsultancy.com/marketplace/categories/<id>` to `https://market.yousafeconsultancy.com/categories/<id>`. Reject malformed/non-category targets instead of guessing.

**Step 3:** Produce an affected-row list and rollback mapping before any database update. Do not mark rows `applied`; URL reconciliation is not deployment proof.

**Step 4:** Only after supervisor review of the dry run, apply the exact mapping and verify stale planned-row count becomes zero. If database access is unavailable, mark this matrix item `BLOCKED_EXTERNAL` with evidence rather than fabricating zero.

## Task 5: Verification gate and handoff

**Step 1:** Run focused URL-contract tests.

**Step 2:** Run `npm run test:agent-harnesses`.

**Step 3:** Run `npm test -- --run`.

**Step 4:** Run `npm run typecheck`.

**Step 5:** Run `npm run build` because P0 changes public URL-generation contracts used by Next.js surfaces.

**Step 6:** Re-scan runtime SEO engine code for the retired emitted Marketplace URL. Legitimate Portal/auth references are not failures; emitted Marketplace canonicals are.

**Step 7:** Update matrix and ledger with exact test results, branch cleanup evidence, stale-row reconciliation evidence, commit SHA, and remaining blockers.

**Step 8:** Commit and push `seo/parity-p0-estate-truth`, open a PR to `main`, and stop. GLM must not self-approve, merge, deploy, or run a direct Cloudflare deployment.

## P0 acceptance criteria

- Local/fetched/authoritative `main` parity is proven.
- Branch deletion queue contains only exact-tip merged/superseded branches; unique/active work is retained.
- No known SEO engine component emits `https://portal.yousafeconsultancy.com/marketplace/categories/...`.
- Marketplace category interlinks emit `https://market.yousafeconsultancy.com/categories/<id>`.
- LLM estate recognizes the current public Marketplace host without erasing legitimate Portal/auth identity.
- Existing stale planned interlinks are reconciled or explicitly `BLOCKED_EXTERNAL` with evidence.
- Required tests/typecheck/build pass, or the PR remains blocked with exact failure evidence.
