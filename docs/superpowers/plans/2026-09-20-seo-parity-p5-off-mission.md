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
- **Published live observations (recorded per entry):** HTTP **200**, **not in sitemap**, **robots allowed** for all eight; ownership registry row identified for **Utah only** (row 57, confirmed read-only in `data/seo/ownership-registry.json`), null/UNKNOWN for the other seven because no ownership row was identified — which is not proof that none exists. Observation date 2026-09-20; the exact capture time was not recorded, so `observedAt` carries a date-level note rather than a fabricated timestamp.
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

C. **Fail-closed protection** — `computeIndexFix()` consults the registry first: a registered URL is `skipped` with an explicit P5 reason unless its disposition is `KEEP`. The site-health mutation layer (`repairSiteHealth()` **and** `repairSiteHealthChunked()`) protects **every** `p5ProtectedUrlKeys()` URL by default: a registered URL is never an orphan/internal-link target, never the rewritten repair hub, and never a sitemap addition — and a protected URL already listed in a sitemap keeps its existing entry, because protection means "do not alter current state", not "force absent". `resolveIndexCoverage()` passes the union of the whole registry with its batch as defense in depth, and `opts.protectedUrls` may only union more URLs in — never narrow the registry set. URLs not in the registry are untouched.

D. **Tests** — `tests/p5-off-mission-dispositions.test.ts`, `tests/p5-site-health-protection.test.ts` (supervisor-repair regressions), `tests/p5-keyword-planner-demand-boundary.test.ts`, `tests/p5-auto-run-demand-boundary.test.ts`.

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

## Verification status at this checkpoint

- Environment limitation (re-verified): this worktree's `node_modules` symlink resolves to an **empty** directory and no sibling worktree or main checkout has a populated `node_modules`, so Jest and `tsc` could not run locally (no dependency install was attempted, and no manifest was modified).
- Substitute local evidence: a Node smoke harness over the real modules (temporary, removed before commit; GitHub/IndexNow boundaries stubbed) — **19 checks PASS**: registry validation; per-URL audit evidence with UNKNOWN only where actually unknown; byte-identical data/public copies; registry protection cannot be narrowed by a caller list; `repairSiteHealth` with no caller list still protects all eight cohort URLs, retains an existing protected sitemap entry and never adds an absent one; `repairSiteHealthChunked` skips both protected orphans, repairs the unregistered one, and writes no protected URL; and the delegated `resolveIndexCoverage` repair runs through the real site-health layer with the same protection.
- `node --check` parses every changed/added TypeScript file; `git diff --check` is clean.
- The four P5 Jest suites and `tsc` must run in CI; P5 stays **IN_PROGRESS** until they pass on the exact merge commit and deployment evidence is recorded by the supervisor.

## Acceptance criteria (not yet met)

- All four P5 suites pass in CI; `tsc` and `git diff --check` pass on the reviewed head.
- Auto-run cannot produce an off-mission mission from a cluster plan or a keyword-plan fill.
- Registered `KEEP_BUT_SILO` URLs cannot be mutated by automated index-coverage/site-health repair — in the bulk path or the chunked path — even when the triggering batch contains none of them.
- Unregistered URLs keep their pre-P5 behavior.
- P5 moves to PASS only after merge + exact-main production verification by the supervisor. Broad net-new CREATE remains frozen until P13.
