# SEO Parity P5 — Off-Mission Dispositions and the Action Boundary

> **Implementation record.** P5 is **IN_PROGRESS**. Nothing in this plan authorizes a redirect, noindex, canonical change, retirement, merge, migration, deployment or any production mutation for the pages below.

**Goal:** give the highest-impression off-mission URLs an explicit, durable disposition, and stop off-mission GSC demand from entering any action surface before the final pipeline backstop.

**Design source:** `docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md` (§7.2 strategic disposition vocabulary, §7.3 qualified visibility).

**Branch:** `seo/p5-off-mission-cleanup-20260920` (base `d5688e9f7144d7ae34526db9f6a18dd88d292d32`).

---

## Supervisor decisions carried into this implementation

1. **Gate 1 stays as evidenced PASS.** Raw vs qualified/off-mission visibility is preserved exactly: off-mission rows remain observable in raw measurement surfaces and are never rewritten into junk.
2. **Gate 2 was not accepted as PASS.** Action-facing keyword planning admitted off-mission GSC terms before the final pipeline backstop. This phase fixes that boundary.
3. **High-impression is defined by cumulative share, not a threshold:** the *smallest descending URL cohort whose cumulative off-mission impressions reach at least 75% of all off-mission impressions, including every URL tied at the boundary*. For `2026-06-22 → 2026-09-19` that cohort is the eight URLs below.
4. **All eight cohort URLs are `KEEP_BUT_SILO`.** Semantics: retain the useful campus-lifestyle page in its current live state; it stays observable but is non-mission/non-actionable; no redirect, noindex, retirement, canonical change, and no automatic expansion of its internal-authority role from P5 evidence alone.
5. **No competing vocabulary.** P5 uses the existing strategic dispositions only: `KEEP | KEEP_BUT_SILO | MOVE | MERGE_301 | NOINDEX | RETIRE`.
6. **No production mutation** is required or performed for this implementation.

## Evidence (exact, not inferred)

- Source: persisted GSC query×page rows for `sc-domain:yousafeconsultancy.com`, read-only; **no live GSC API pull**.
- Window: `2026-06-22 → 2026-09-19`; persisted sync `2026-09-20 05:39 UTC`.
- Window total: **2,660 rows** (re-verified read-only during this implementation).
- Off-mission totals for the window: **613 impressions / 134 rows / 37 URLs / 0 clicks**.
- Cohort rule: the 75% cumulative-share rule above; cohort size 8.
- **Published per-URL split (recorded per entry, never fabricated):** off-mission impressions / rows — South Carolina 141 / 16, Florida International 106 / 8, Portland State 57 / 7, Cornell 49 / UNKNOWN, Utah 46 / 1, Arizona State 23 / 6, Oregon 23 / UNKNOWN, Howard UNKNOWN (audit display range 20–29 only). Qualified impressions: measured **0** for South Carolina, FIU, Portland State, Cornell and Utah; **UNKNOWN** for Arizona State, Oregon and Howard.
- **Published live observations (recorded per entry):** HTTP **200**, **not in sitemap**, **`robots.txt` allowed** for all eight — the audit checked robots.txt only and did **not** inspect HTML meta robots state, so this is never an index/follow observation; ownership registry row identified for **Utah only** (row 57, confirmed read-only in `data/seo/ownership-registry.json`, and row 57 records the Utah Legal housing guide as **live noindex/follow**), null/UNKNOWN for the other seven because no ownership row was identified — which is not proof that none exists. Observation date 2026-09-20; the exact capture time was not recorded, so `observedAt` carries a date-level note rather than a fabricated timestamp.
- **Unknowns (deliberately `null`, never `0`):** per-URL off-mission clicks and per-URL qualified rows/clicks for all eight; per-URL off-mission rows for Cornell, Oregon and Howard; Howard's exact impressions; and the exact live-observation time. Any of these can be re-derived read-only from persisted `seo_gsc_rows` with `classifyGscVisibility()` over the same window; until then they stay `null`.

## The eight cohort URLs (all `KEEP_BUT_SILO`)

All on `https://legal.yousafeconsultancy.com/guide/<slug>/`:

1. `university-of-south-carolina-student-housing`
2. `florida-international-university-student-housing`
3. `portland-state-university-student-housing`
4. `cornell-university-student-housing`
5. `university-of-utah-student-housing`
6. `arizona-state-university-student-housing`
7. `university-of-oregon-student-housing`
8. `howard-university-student-housing`

## Durable contract

- `data/seo/p5-off-mission-dispositions.json` — versioned (`p5-off-mission-dispositions-v1`) registry, mirrored byte-identical at `public/seo-data/p5-off-mission-dispositions.json` (same convention as the ownership registry).
- `lib/seoFactory/p5OffMissionDispositions.ts` — typed helper: strategic vocabulary, deterministic normalization, registry lookup, `p5MutationVerdict()`, `validateP5Registry()`.
- The registry is **static-imported** on purpose. This is a fail-closed gate, so it must not depend on a runtime fetch that could be unavailable — an unavailable fetch must never mean "allow".
- No database table or migration was added: a committed repository data file satisfies the runtime gate, so a migration would only add deployment risk.

## Required implementation (this pass)

A. **Planner/action boundary** — `lib/seoFactory/keywordPlanner.ts` now admits a GSC term to the board (and therefore the plan) only when `isQualifiedGscDemandQuery()` passes; the explicit `includeBrand` opt-in is preserved verbatim. Auto-run's Master Planner top-up (`app/api/seo-factory/auto-run/route.ts`) replaces junk-only admission with `isActionableDemandQuery()` (cluster plans carry no GSC row metrics, so the metric-free boundary is the correct one). The stream route's keyword-plan fill (`app/api/seo-factory/auto-run-stream/route.ts`) applies the same metric-free guard as fail-closed defense in depth. The final pipeline backstop (`isJunkTopic`) and the broad CREATE freeze are untouched.

B. **Dispositions** — the eight URLs above, window and cohort rule recorded as data.

C. **Fail-closed protection** — `computeIndexFix()` consults the registry first: a registered URL is `skipped` with an explicit P5 reason unless its disposition is `KEEP`. The site-health mutation layer (`repairSiteHealth()` **and** `repairSiteHealthChunked()`) protects **every** `p5ProtectedUrlKeys()` URL by default: a registered URL is never an orphan/internal-link target, never the rewritten repair hub, and never a sitemap addition — and a protected URL already listed in a sitemap keeps its existing entry, because protection means "do not alter current state", not "force absent". `resolveIndexCoverage()` passes the union of the whole registry with its batch as defense in depth, and `opts.protectedUrls` may only union more URLs in — never narrow the registry set. The **noindex mutation boundary itself** (`fixNoIndexPagesChunked()` in `lib/seoFactory/siteHealthFixes.ts`, shared by `app/api/content-studio/site-health/route.ts` and `siteHealthComplete.ts`) consults `p5MutationVerdict()` per candidate URL **before any read/write/branch/PR/history write**: a blocked URL is reported in `protectedSkipped` and skipped, never returned as fixed, never rewritten, never branched/PR'd and never logged as "Removed noindex". URLs not in the registry are untouched.

D. **Tests** — `tests/p5-off-mission-dispositions.test.ts`, `tests/p5-site-health-protection.test.ts` (supervisor-repair regressions, including the noindex boundary), `tests/p5-noindex-orchestrator-truthfulness.test.ts` (complete-flow noindex logging truthfulness), `tests/p5-orphan-orchestrator-truthfulness.test.ts` (complete-flow orphan outcome truthfulness), `tests/p5-keyword-planner-demand-boundary.test.ts`, `tests/p5-auto-run-demand-boundary.test.ts`.

E. **Records** — this plan, the parity matrix rows, and the execution ledger entry.

## Deliberate consequences and residuals

- **Off-mission strike-seed keyword.** The locked 2026-08 strike seed `university of the pacific student housing` is off-mission-classified, so it can no longer enter GSC-driven planning. Strike-seed *routing* is unchanged for terms that do clear the boundary.
- **`seoEngine` planner persistence.** `lib/seoEngine/planner.ts` can still persist an off-mission-titled `seo_cluster_plans` row for diagnostic surfaces; the auto-run admission boundary now refuses to turn it into a mission. Tightening the planner's own persistence was out of this pass's scope.
- **Some per-URL fields remain UNKNOWN** (above): per-URL off-mission clicks and qualified rows/clicks, per-URL rows for Cornell/Oregon/Howard, Howard's exact impressions, and the exact live-observation time. P5 records the page-level facts the audit did establish and claims no truth it does not have.
- **No destructive action.** No redirect/noindex/canonical/robots/internal-link change is implemented for any of the eight pages.

## Supervisor repair (post-checkpoint `dda62b09`, before the follow-up commit)

`dda62b09` was **not** supervisor-approved. Two blockers were repaired in the follow-up commit and the evidence contract was corrected:

1. **BLOCKER 1 — full registry protection, not current-batch-only.** The mutation layer now protects all `p5ProtectedUrlKeys()` by default; caller-provided URLs may only union in. A repo-wide repair triggered by an unrelated URL can therefore no longer touch a different registered `KEEP_BUT_SILO` URL.
2. **BLOCKER 2 — chunked mutation path.** `repairSiteHealthChunked()` (live path from `app/api/content-studio/site-health/route.ts` and `lib/seoFactory/siteHealthComplete.ts`) enforces the same semantics: protected cohort URLs are never injected as orphan/internal-link targets, never used as the rewritten hub and never added to a sitemap; unregistered behavior is unchanged.
3. **Evidence-contract repair.** The earlier claim that "the audit published no per-URL split" was false and has been removed from this plan, the registry, the ledger and the parity matrix; the concrete per-URL values above are now recorded, with `null` only where a value genuinely was not published.
4. **Safety semantics.** No second disposition vocabulary, no destructive change, no fail-closed behavior for unregistered URLs, no broad-CREATE change, and no removal of an already-present protected sitemap entry.

## Final supervisor repair (post-`450ad8f3`) — noindex mutation boundary guard

The follow-up commit disclosed one remaining mutation gap: `fixNoIndexPagesChunked()` had no P5 guard, so the complete-flow noindex fixer could in principle rewrite a registered cohort page, and `siteHealthComplete.ts` logged "Removed noindex" from the *candidate* list rather than from actual fixed outcomes. Repaired here:

1. **Guard at the mutation boundary.** `fixNoIndexPagesChunked()` now calls the existing `p5MutationVerdict()` (no new registry, no new vocabulary) for every candidate URL **before** any GitHub read, strip, write, branch, PR or history append. A blocked URL (registered `KEEP_BUT_SILO` today, and any other non-`KEEP`/unrecognized disposition) is returned in a new `protectedSkipped` list with its explicit P5 reason and is not returned as fixed. Unregistered URLs and registered `KEEP` URLs keep their exact pre-existing path. Every caller of the function inherits the guard.
2. **Truthful complete-flow logging.** `runFullSiteHealthCheck()` now builds its `noindex` history entries from the outcomes `fixNoIndexPagesChunked()` actually fixed (via `buildNoIndexFixLogEntries()`), not from the candidate list, and reports skipped protected candidates in `repairs.noindexProtectedSkipped`. A protected/skipped page can no longer be logged as fixed.
3. **State preservation.** The guard never adds or removes a noindex directive on a protected URL; a protected page that already carries noindex stays noindex, and one that does not stays as it is.

Regression evidence (added to `tests/p5-site-health-protection.test.ts` and `tests/p5-noindex-orchestrator-truthfulness.test.ts`): a real registry `KEEP_BUT_SILO` URL with a real noindex directive is skipped in both dry-run and live mode with **zero** GitHub calls (no read, no write, no branch, no PR, no history PUT) and is never returned as fixed; an unregistered fully-expanded noindex candidate still writes `index: true`, opens the PR and appends exactly one fix-history entry; a mixed batch fixes only the unregistered candidate and never names the protected URL in the PR body or history payload; and the complete-flow orchestrator reports `noindexFixed: 0` / `noindexProtectedSkipped: 1` with no GitHub mutation when the only candidate is protected.

## Pre-PR review fixes (post-`1c7045b6`) — truthful orphan outcomes + robots evidence scope

ChatGPT's pre-PR review (run `512570ba-1eea-49f6-9e80-bc2c0f691779`) accepted two blockers; both are fixed on top of `1c7045b6` with **no disposition change, no protected-URL auto-repair and no live mutation**. P5 remains **IN_PROGRESS**.

1. **Orphan outcome truthfulness.** `repairSiteHealthChunked()` now returns an additive exact `fixedOrphans` outcome list (only orphans whose hub rewrite really happened), `orphansFixed` is that list's length (never the candidate batch length), and `FullRepairResult.orphansProtectedSkipped` surfaces protected skips. A repo with no usable hub or an unchanged hub produces no outcome while the batch cursor still advances. `runFullSiteHealthCheck({ fixOrphans: true })` builds `orphan` history entries only from those outcomes (`buildOrphanFixLogEntries()`), so a P5-protected or otherwise unrepaired orphan is never written or logged as "Repaired orphan page".
2. **Robots evidence scope.** `liveObservations.robotsState` is now recorded for all eight entries as the explicit robots.txt-scope string `robots.txt allowed (HTML meta robots state not observed in P5 audit)` (field name kept; `data/` and `public/` copies byte-identical). The type comment documents the scope, `validateP5Registry()` rejects a non-null `robotsState` that is not robots.txt-scoped, and the registry `knownLimitations` plus Utah's entry notes acknowledge ownership registry row 57: the P5 audit only established robots.txt crawl allowance and did **not** inspect HTML meta robots state, so the pre-repair noindex gap could have been a live mutation risk (closed at the automated boundary by `7807aafd`).
3. **Stale comment.** The `siteHealthComplete.ts` sitemap-sync branch comment no longer claims `repairSiteHealthChunked()` handles sitemap writes (it does not; it only reports `sitemapPaths`).

Regression coverage: `tests/p5-orphan-orchestrator-truthfulness.test.ts` (new — protected + unregistered orphan mixed run: `orphansProtectedSkipped: 1`, `orphansFixed: 1`, only the unregistered URL written/PR'd/logged), `tests/p5-site-health-protection.test.ts` (`fixedOrphans` assertions and no-hub pagination progress) and `tests/p5-off-mission-dispositions.test.ts` (robots.txt scope, row 57 acknowledgement, validator rejection of ambiguous `"allowed"`).

## Verification status at this checkpoint

- Environment limitation (re-verified): this worktree's `node_modules` symlink resolves to an **empty** directory and no sibling worktree or main checkout has a populated `node_modules`, so Jest and `tsc` could not run locally (no dependency install was attempted, and no manifest was modified).
- `tests/p5-site-health-protection.test.ts` now additionally covers the noindex mutation boundary (protected candidate skipped before any GitHub call in dry-run **and** live mode; unregistered candidate still fixed, PR'd and logged; mixed batch never logs the protected page). `tests/p5-noindex-orchestrator-truthfulness.test.ts` covers the complete-flow report (`noindexFixed`, `noindexProtectedSkipped`, no mutation) and the fixed-outcomes-only log contract.
- Substitute local evidence for this repair (temporary Node smoke harness, removed before commit; only GitHub Contents, audit scan, live-verify, snapshot and sitemap-fetch boundaries stubbed): **41 checks PASS**, 25 driving the real `fixNoIndexPagesChunked()` and 16 driving the real `runFullSiteHealthCheck()`. The harness caught a real first-draft defect (the function's final `return` omitted `protectedSkipped` — a `tsc` error) that was fixed before commit.
- Substitute local evidence: a Node smoke harness over the real modules (temporary, removed before commit; GitHub/IndexNow boundaries stubbed) — **19 checks PASS**: registry validation; per-URL audit evidence with UNKNOWN only where actually unknown; byte-identical data/public copies; registry protection cannot be narrowed by a caller list; `repairSiteHealth` with no caller list still protects all eight cohort URLs, retains an existing protected sitemap entry and never adds an absent one; `repairSiteHealthChunked` skips both protected orphans, repairs the unregistered one, and writes no protected URL; and the delegated `resolveIndexCoverage` repair runs through the real site-health layer with the same protection.
- `node --check` parses every changed/added TypeScript file; `git diff --check` is clean.
- The six P5 Jest suites and `tsc` must run in CI; P5 stays **IN_PROGRESS** until they pass on the exact merge commit and deployment evidence is recorded by the supervisor.

## Acceptance criteria (not yet met)

- All six P5 suites pass in CI; `tsc` and `git diff --check` pass on the reviewed head.
- Auto-run cannot produce an off-mission mission from a cluster plan or a keyword-plan fill.
- Registered `KEEP_BUT_SILO` URLs cannot be mutated by automated index-coverage/site-health repair — in the bulk path or the chunked path — even when the triggering batch contains none of them.
- Registered `KEEP_BUT_SILO` URLs cannot be mutated by the noindex fixer (`fixNoIndexPagesChunked()` and the complete-flow `runFullSiteHealthCheck({ fixNoindex: true })`) and can never be reported/logged as a completed noindex fix.
- Complete-flow orphan repair reports and logs only actually repaired outcomes: protected orphans are surfaced in `repairs.orphansProtectedSkipped` and can never be reported/logged as "Repaired orphan page" or written.
- Unregistered URLs keep their pre-P5 behavior.
- P5 moves to PASS only after merge + exact-main production verification by the supervisor. Broad net-new CREATE remains frozen until P13.
