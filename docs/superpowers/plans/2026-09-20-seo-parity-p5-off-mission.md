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
- **Unknowns (deliberately `null`, never `0`):** per-URL off-mission impressions/rows/clicks, per-URL qualified demand, and live status / sitemap / robots / ownership observations for all eight URLs. The audit published cohort totals, not a per-URL split, so the registry records `null` plus the provenance needed to re-derive the values later (`classifyGscVisibility()` over persisted rows). Live-query coverage is therefore **UNKNOWN**.

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

C. **Fail-closed protection** — `computeIndexFix()` consults the registry first: a registered URL is `skipped` with an explicit P5 reason unless its disposition is `KEEP`. `resolveIndexCoverage()` also passes the registered URL set to the delegated `repairSiteHealth()` repair, which no longer injects orphan links or sitemap entries for protected URLs. URLs not in the registry are untouched.

D. **Tests** — `tests/p5-off-mission-dispositions.test.ts`, `tests/p5-keyword-planner-demand-boundary.test.ts`, `tests/p5-auto-run-demand-boundary.test.ts`.

E. **Records** — this plan, the parity matrix rows, and the execution ledger entry.

## Deliberate consequences and residuals

- **Off-mission strike-seed keyword.** The locked 2026-08 strike seed `university of the pacific student housing` is off-mission-classified, so it can no longer enter GSC-driven planning. Strike-seed *routing* is unchanged for terms that do clear the boundary.
- **`seoEngine` planner persistence.** `lib/seoEngine/planner.ts` can still persist an off-mission-titled `seo_cluster_plans` row for diagnostic surfaces; the auto-run admission boundary now refuses to turn it into a mission. Tightening the planner's own persistence was out of this pass's scope.
- **Per-URL and live observations remain UNKNOWN** (above). P5 cannot claim page-level or live-index truth it does not have.
- **No destructive action.** No redirect/noindex/canonical/robots/internal-link change is implemented for any of the eight pages.

## Verification status at this checkpoint

- Environment limitation: this worktree's `node_modules` symlink resolves to an empty/inaccessible directory, so Jest and `tsc` could not run locally (no dependency install was attempted, and no manifest was modified).
- Substitute local evidence: a Node-based smoke harness over the real modules (registry validation, normalization/idempotence, UNKNOWN-never-0, mutation verdicts for all eight URLs, unregistered-URL pass-through, byte-identical data/public copies, and the exact classification facts used by the three Jest suites) — **23 checks PASS**.
- `node --check` parses every changed/added TypeScript file; `git diff --check` is clean.
- The three Jest suites and `tsc` must run in CI; P5 stays **IN_PROGRESS** until they pass on the exact merge commit and deployment evidence is recorded by the supervisor.

## Acceptance criteria (not yet met)

- All three P5 suites pass in CI; `tsc` and `git diff --check` pass on the reviewed head.
- Auto-run cannot produce an off-mission mission from a cluster plan or a keyword-plan fill.
- Registered `KEEP_BUT_SILO` URLs cannot be mutated by automated index-coverage/site-health repair.
- Unregistered URLs keep their pre-P5 behavior.
- P5 moves to PASS only after merge + exact-main production verification by the supervisor. Broad net-new CREATE remains frozen until P13.
