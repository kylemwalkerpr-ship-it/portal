# Master Engine GSC push-through — worklog

Instructor brief: `SEO strategies/DEEPSEEK_MASTER_ENGINE_GSC_PUSH_THROUGH.md`
Workspace: `yousafe-portal`

## Phase A
Date: 2026-08-18

**Files touched:**
- `lib/seoFactory/queryNoise.ts` — added `GscQueryClass` + `classifyGscQuery(term, row)` (eligible / junk / deep_tail); folded `BRAND_RE` (yousafe/mycaseworks/yousafeconsultancy) and `PURE_NUMERIC_RE` into `isJunkQuery` so the deleted local filter loses no coverage.
- `lib/seoFactory/opportunities.ts` — deleted local `isNoise`; both call sites (live-row intake + dedupe) now use `isJunkQuery`. Single unified filter.
- `lib/seoFactory/opportunityEngine.ts` — junk rows dropped at pool construction via `classifyGscQuery` (junk → `ignore` by exclusion: never scored, never queued, never briefed); `deep_tail` rows kept for later mix scoring. Added `GSC_STRIKE_SEEDS_2026_08` constant with the locked 2026-08-18 snapshot metrics (5 seeds, exact numbers from brief §4.2).
- `tests/gsc-push-through.test.ts` — NEW: classifier table (7 junk cases incl. the exact quoted Pacific PDF query, 4 eligible snapshot queries, deep-tail boundary cases), opportunity play table (Bristol → quick_win, lease-break → quick_win, junk absent from output, owned URL never content_gap), seed fixture classification, and injected-live-GSC acceptance test for `loadFactoryOpportunities`.

**Tests run:**
- `npx tsc --noEmit` — PASS (clean)
- `npx jest tests/gsc-push-through.test.ts tests/query-noise.test.ts tests/opportunity-cannibal.test.ts` — 33/33 PASS
- `npx jest` (full suite) — 92 suites / 998 tests PASS, 1 skipped (pre-existing skip)

**Pass/fail:** All Phase A acceptance checks pass:
- [x] `isJunkQuery('"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983') === true` (pre-existing query-noise test + new classifier table)
- [x] That term never appears in `loadFactoryOpportunities()` output when injected as a fake GSC row (unit test with mocked `getGscAccess` + `global.fetch`, no network)
- [x] Bristol-like row `{impressions:248, clicks:1, position:10.2}` → engine play `quick_win`, factory action `strike_distance` — not `content_gap`
- [x] Existing query-noise and opportunity tests still pass
- [x] `npx tsc --noEmit` clean
- [x] Worklog written

**Evidence the factory behavior changed:**
- Before: the quoted Pacific PDF query could reach `scoreOpportunities` and (with coverage matches) surface as an opportunity / cannibal-sweep row; the radar had two filters (`isNoise` in opportunities.ts + `isJunkQuery` in the engine) that disagreed.
- After: one classifier (`queryNoise.ts`) decides; junk is excluded at intake in `loadFactoryOpportunities` AND at pool construction in `scoreOpportunities`. The injected-row test proves the PDF query cannot appear in factory output, and Bristol-class rows come out as `strike_distance` — the next factory action would change from "maybe queue a meal-plan PDF query" to "expand the Bristol owner."

**What I did not verify:**
- Live GSC data (not called; snapshot numbers used exactly as locked).
- Phase B/C work (eligible-only scoring, `gscMix` feed, war-room/autopilot routing of the five seeds) — not started, per the brief.
- The pre-existing uncommitted change in `lib/supabase.ts` (resolveSupabaseKey) — untouched, unrelated.

**Questions for instructor:**
- None blocking. Noted for Phase B: `deep_tail` rows remain in the engine pool (they score low naturally); the brief's §4.2 `deep_demand_build` deferral ("only if an owner URL exists, otherwise defer") will be handled when scoring/routing lands.

---

## Phase B
Date: 2026-08-18  ·  Approved to start after Phase A sign-off (instructor: "Phase B is now unblocked")

**Files touched:**
- `lib/seoFactory/gscMix.ts` — NEW: `computeGscMix(gsc)` — one classifier (`classifyGscQuery`) re-aggregates the same rows into eligible-only totals, junk/deep-tail shares, `recommendedPlays` (improve_eligible_rank / fix_ctr / strike_distance / click_proven / deep_demand_build / page1_defend), and `strikeDistance`. Accepts `queries` or `queryRows` alias (engine shapes differ). `junkSharePenalty(share)` = `1 - min(0.6, share)`. Aggregate passes through unchanged when no breakdown is supplied (junk share 0) — zero behavior change for existing callers.
- `lib/seoFactory/masterEngine.ts` — SERP subsystem now scores the ELIGIBLE aggregate (`g_impressions/g_clicks/g_ctr/g_position/g_ctr_deviation/g_expected_traffic/g_ctr_curve/g_impression_ctr_eff/g_dwell_time/g_pogo_stick`), each dampened by `junkSharePenalty`. `g_ctr_deviation` is suppressed past #20 (pos-32 0.3% CTR is on-curve). `gsc.queryRows` added to the input type. `recommend()` adds a serp recommendation: `serp_eligible_rank` ("Improve eligible rank…") when eligible position > 20, else `serp_ctr_gap` ("Fix CTR…") only when eligible CTR is below the curve at that position. `predict()` forecasts from eligible impressions/CTR. `MasterEngineReport.gscMix` added (always populated).
- `lib/seoEngine/rankingModel.ts` — `scoreDemand` uses `computeGscMix` (eligible-only), applies the junk-share penalty, suppresses the CTR-gap reason past #20, and adds a "junk query share… demand penalized" reason when share > 20%. `gsc.queryRows` added.
- `lib/seoFactory/authorityScoring.ts` — `scoreTopicAuthority` computes the mix from optional `queryRows` and passes eligible totals + junk share into `demandComponent`, which now suppresses the CTR-gap term past #20 and applies the junk-share penalty.
- `lib/seoFactory/masterEngineFeed.ts` — `MasterEngineFeed.gscMix` added (returned by `assembleMasterEngineFeed`); `renderMasterEnginePromptBlock` emits a compact line: `- GSC mix: eligible position X · junk share Y% · N strike-distance URL(s)`.
- `tests/master-engine-feed.test.ts` — stub report updated for the required `gscMix` field (no coverage removed).
- `tests/gsc-push-through-phase-b.test.ts` — NEW: 12 tests (see below).

**Phase B acceptance checks:**
- [x] Locked domain fixture (29 clicks / 10959 imp / pos 33 + 40% junk share) yields a serp recommendation of **"Improve eligible rank…"** and NOT "Fix CTR" (asserted on `report.recommendations` filtered to subsystem `serp`).
- [x] Feed JSON includes `gscMix.junk.share` and `gscMix.strikeDistance` (asserted on `assembleMasterEngineFeed` with mocked supabase/llm/ahrefs — no network; a Bristol-like row surfaces in `strikeDistance`).
- [x] Autopilot prompt block contains the words `eligible position` and `junk share` (asserted on `renderMasterEnginePromptBlock`).

**Additional locked behavior (tests):**
- Polluted mix (90% junk impressions at pos 5, 10% eligible at pos 32) does NOT produce a healthy SERP score (< 0.5); inverted mix (15% junk at pos 32, 85% eligible at pos 5) scores strictly higher on the SERP subsystem. Same content, same eligible CTR — position + junk share decide.
- `g_ctr_deviation` is null past #20.
- rankingModel `scoreDemand`: polluted < inverted; no "CTR gap" reason past #20.
- authorityScoring `demand`: polluted < inverted.
- `computeGscMix` passes the aggregate through unchanged when no per-query breakdown is supplied.

**Tests run:**
- `npx tsc --noEmit` — PASS (clean)
- `npx jest tests/gsc-push-through-phase-b.test.ts` — 12/12 PASS
- `npx jest` (full suite) — 93 suites / 1010 tests PASS, 1 skipped (pre-existing skip; baseten abort-retry console noise unchanged)

**Evidence the factory would publish differently:**
- A property at the locked domain totals with 40% junk share now reads as "Improve eligible rank" in the Master Engine feed, never "fix CTR" — the 0.3%-CTR-at-pos-33 trap is gone.
- Demand/SERP scores are computed from eligible queries only; a 90%-junk property scores unhealthy on SERP while the inverted mix scores healthy, so Autopilot/planner cannot chase PDF-query impressions.
- The feed exposes the mix (junk share + strike-distance URLs) so the studio cannot hide behind a site-wide 0.3% CTR.

**What I did not verify / left for later phases (per instructor):**
- `seoWarRoom.ts` `isNoiseQuery` — second intake, Phase C unifies it.
- `GSC_STRIKE_SEEDS_2026_08` live routing / `pickAutoRunCandidates` `content_gap` — Phase C.
- keywordPlanner junk-drop before cluster assignment — Phase C.
- `lib/supabase.ts` pre-existing unrelated change — untouched.

**Questions for instructor:**
- None blocking. Phase B stopped here; not starting Phase C until **APPROVED — Phase B**.

---

## Phase B — Punch 1 (hydrate queryRows in the real write path)
Date: 2026-08-18  ·  Re-work after punch-list rejection: the scoring library was
correct when rows were present, but production never handed the classifier any
rows, so the factory had not actually changed what it publishes.

**Root cause:** every live caller passes aggregates only (or no gsc at all), and
`jobToMasterInput.gscOf` stripped `queryRows`. `computeGscMix` with no rows passed
the aggregate through as eligible with junk share 0, so Autopilot still saw
10.3K impressions at pos 33 as eligible volume and the studio could still hide
behind a site-wide 0.3% CTR.

**Files touched:**
- `lib/seoFactory/masterEngineFeed.ts` — added `hydrateGscQueryRows(existing?)`: when the request has no `queryRows`, loads the same sources the radar uses (live `fetchSiteSearchAnalytics(28).topQueries`, falling back to `loadGscSnapshot().topQueries`) and maps them to `{ term, impressions, clicks, position }` queryRows. No new table, no new GSC client. `assembleMasterEngineFeed` now hydrates rows before `scoreMaster` and passes them as `input.gsc.queryRows`, backfilling the aggregate fields (`impressions/clicks/ctr/position`) from `mix.totals` when the caller sent none so existing null-checks still fire.
- `lib/seoFactory/jobToMasterInput.ts` — `gscOf` now forwards `queryRows` from `gsc_json` instead of stripping them (mapped + filtered to term/url rows); a blob with only rows is still treated as present.
- `tests/gsc-push-through-phase-b.test.ts` — added 2 punch-1 feed tests that call `assembleMasterEngineFeed({ topic })` with **no gsc on the request**, with `@/lib/gscAnalytics` (unconfigured) and `@/lib/seoDataLoaders` (locked 40%-junk + Bristol-like snapshot) mocked.
- `tests/job-to-master-input.test.ts` — added `forwards queryRows from gsc_json instead of stripping them`.

**Punch-1 acceptance (all green, no injected rows):**
- [x] `assembleMasterEngineFeed({ topic })`, no gsc, snapshot mocked to the locked mix → `feed.gscMix.junk.share ≈ 0.4` (toBeCloseTo 0.4), `feed.gscMix.strikeDistance.length ≥ 1` (Bristol-like pos 10.2 / 248 imp), `feed.promptBlock` contains `eligible position` and `junk share`.
- [x] Same hydrated fixture → `feed.gscMix.eligible.position > 20` and promptBlock contains `improve eligible rank` / not `fix ctr`.
- [x] `jobToMasterInput.gscOf` forwards `queryRows` (2 rows) alongside aggregate fields.

**Tests run:**
- `npx tsc --noEmit` — PASS (clean)
- `npx jest tests/gsc-push-through-phase-b.test.ts tests/gsc-push-through.test.ts tests/master-engine-feed.test.ts` — 33/33 PASS
- `npx jest tests/job-to-master-input.test.ts` — 6/6 PASS
- `npx jest` (full suite) — 93 suites / 1013 tests PASS, 1 skipped (pre-existing skip)

**Evidence the factory behavior changed:** the feed test now passes with no rows
injected — the feed hydrates the same locked mix from the snapshot loader and the
prompt block exposes eligible position + junk share, so the brief actually written
sees the rank problem (not a CTR problem) without any caller cooperation.

**What I did not verify / left for later phases (per instructor):**
- `seoWarRoom.isNoiseQuery`, `GSC_STRIKE_SEEDS` live routing, `pickAutoRunCandidates`
  `content_gap`, keywordPlanner junk-drop — Phase C.
- `computeGscMix` numeric-`queries` coercion (`Array.isArray`) — deferred to next touch.
- `lib/supabase.ts` pre-existing unrelated change — untouched.

**Questions for instructor:**
- None blocking. Stopped after punch 1; not starting Phase C until sign-off.

---

## Phase C
Date: 2026-08-18  ·  Approved to start after Phase B sign-off (instructor: "Phase C is unblocked")

**Files touched:**
- `lib/seoFactory/strikeSeeds.ts` — NEW: `GSC_STRIKE_SEEDS_2026_08` (the five locked pages with `canonicalUrl`/`host`/`repo`/`filePath`/`keywords`/`mode`) + `matchStrikeSeed(term, page)` — deterministic keyword-token and page-path matching, no network.
- `lib/seoFactory/opportunityEngine.ts` — seed routing at scoring: a matched seed forces `play` = `quick_win` (expand) or `defend` (apex homepage), prepends the owner URL to coverage matches, and sets `sourcePage` = seed `canonicalUrl`. Re-exports `GSC_STRIKE_SEEDS_2026_08`. A seed is never `content_gap`.
- `lib/seoFactory/ownership.ts` — `resolveOwner` short-circuits a strike-seed keyword to an `OwnerPlan` with `action='expand'` (or `'keep'` for the apex homepage), the exact seed `canonicalUrl`/`filePath`/host/repo, and `routingSource='strike_seed'` (new union member) — before the registry match, so a seed can never be stolen to standing rules or a sibling.
- `lib/seoFactory/seoWarRoom.ts` — `isNoiseQuery` now delegates to the unified `isJunkQuery` (second intake unified; the exact quoted-PDF junk is caught by the shared classifier). The queue map sets `host`/`repo`/`ownerUrl`/`filePath` from the matched seed so auto-run expands the owner URL.
- `lib/seoFactory/keywordPlanner.ts` — drops junk (`isJunkQuery`) before clustering (brand still allowed when `includeBrand`), and forces `lane='expand'` (or `'monitor'` for the homepage) when `plan.routingSource === 'strike_seed'`, so the five seed pages are expand-existing with `ownerUrl` set — never `build_new`.
- `lib/seoFactory/opportunities.ts` — `pickAutoRunCandidates` no longer admits `content_gap`/`deep_demand_build`; only expand-existing plays (strike_distance / refresh / page1_defend) ship from the radar.
- `lib/seoFactory/queryNoise.ts` — added `isJunkTopic(term)`: the same junk heuristics as `isJunkQuery` MINUS the >8-word rule, so the pipeline refuses GSC-leak junk (PDF paths, quoted doc stamps, brand/numeric pastes) without rejecting legitimate long-tail topics.
- `lib/seoFactory/pipeline.ts` + `pipelineStream.ts` — the topic/keyword guard now uses `isJunkTopic` (refuses junk-query jobs before generation) instead of the narrower `isFileOrUrlLikeTerm`.
- `tests/gsc-push-through-phase-c.test.ts` — NEW: seed routing table, engine seed→quick_win+owner URL, `resolveOwner` seed→expand/keep, auto-run content_gap drop, junk guard.
- `tests/keyword-planner-phase-c.test.ts` — NEW: planner drops the injected junk query before clustering and emits the Bristol seed as an `expand` plan item with `ownerUrl` set (snapshot + supabase + gscAuth + registry mocked, no network).

**Phase C acceptance checks:**
- [x] `matchStrikeSeed` matches the four guide/lease owner keywords (mode `expand`) and the apex homepage (mode `defend`, `/`), and returns null for the junk PDF query.
- [x] `scoreOpportunities` over the four seed keywords + one junk PDF query returns quick_win for each seed with `sourcePage` = seed `canonicalUrl` and `coverage.matched = true`; zero junk terms; zero `content_gap`.
- [x] `resolveOwner` for each seed keyword → `routingSource='strike_seed'`, `action='expand'`, `canonicalUrl`/`filePath`/host/repo match the seed; homepage → `action='keep'`, host `apex`, `landing-page/content/index.md`.
- [x] `pickAutoRunCandidates` drops `content_gap`/`deep_demand_build`; keeps quick_win/refresh/defend.
- [x] Keyword planner drops junk before clustering and emits the Bristol seed as an `expand` plan item (never `build_new`, never a sibling).
- [x] `isJunkTopic` refuses GSC-leak junk but keeps a long-tail topic; `isNoiseQuery` delegates to the unified classifier.

**Tests run:**
- `npx tsc --noEmit` — PASS (clean)
- `npx jest tests/gsc-push-through-phase-c.test.ts` — 10/10 PASS
- `npx jest tests/keyword-planner-phase-c.test.ts` — 2/2 PASS
- `npx jest` (full suite) — 96 suites / 1031 tests PASS, 1 skipped (pre-existing skip)

**Evidence the factory behavior changed:**
- A brief generated for a seed keyword now resolves to the existing owner URL with `action='expand'` and the exact repo file path — the factory's next action is "expand Bristol / Pacific / Warwick / lease-break", never "open a sibling or a net-new page".
- Auto-run can no longer pick a `content_gap` (net-new) term from the radar, and the pipeline refuses junk-query jobs before they generate, so a quoted Pacific PDF query cannot regenerate.
- The planner drops junk before cluster assignment and locks the five seeds to `expand` lanes, closing the last intake that used to let junk through.

**What I did not verify / left for later (per instructor):**
- Live GSC is never called in Jest (snapshot/injected rows only).
- `computeGscMix` numeric-`queries` `Array.isArray` coercion — deferred to next touch of that file.
- Copy rewrites of the five pages — out of scope for this brief ("Do not rewrite Bristol / Pacific / Warwick / lease-break copy").
- `lib/supabase.ts` pre-existing unrelated change — untouched.

**Questions for instructor:**
- None blocking. Stopped after Phase C; awaiting review.
