# Instructor brief — Master Engine GSC push-through

**To:** DeepSeek V4 Pro (implementation)
**From:** Senior instructor (review + approval only)
**Date:** 2026-08-18
**Workspace for code:** `Documents/GitHub/yousafe-portal`
**Do not commit or push.** Write a worklog at the end of each phase. The instructor reviews, requests changes, and only approves when the acceptance bar is fully met.

---

## 0. Your role and the review loop

You implement. The instructor does not write the feature code.

1. Read this file end to end, then the files listed in §3, before you edit anything.
2. Implement **Phase A only**. Stop. Write `_WORKLOG.md` in the portal repo root (or update it) with: files touched, tests run, what you verified, what you did not verify.
3. Wait for instructor review. If the instructor sends a punch list, fix only those items. Do not expand scope.
4. Repeat for Phase B, then Phase C. Do not start a later phase until the previous one is **approved**.
5. Never invent GSC numbers. The snapshot in §1 is the locked evidence. If live GSC differs, log it; do not silently replace the snapshot.

**Approval standard:** the instructor approves only when every acceptance check in the current phase is true, tests pass, and the factory would change *what it publishes next* because of this work — not just add comments.

---

## 1. Locked diagnosis (do not argue with this)

Google Search Console, property `yousafeconsultancy.com` / `sc-domain:yousafeconsultancy.com`, last ~28 days (through 2026-08-18):

| Metric | URL property (screenshot) | Domain property (live pull) |
|---|---:|---:|
| Clicks | 26 | 29 |
| Impressions | 10.3K | 10,959 |
| CTR | 0.3% | 0.26% |
| Average position | **31.7** | **33.0** |

**Causal chain (locked):**

1. Average position is **impression-weighted**. Most impressions sit on page 3–4 (rank ~30+).
2. At rank ~30, a 0.2–0.4% CTR is the expected SERP click curve. This is **not** a title-tag-only problem.
3. Impressions rose (~200/day → ~500/day) while position **worsened** mid-August (≈24 on 2026-08-03 → ≈51 on 2026-08-15). More long-tail URLs are being shown, not ranking better.
4. A large slice of *query* impressions are **wrong-intent**: quoted University of the Pacific housing-rate / PDF / `user2983` / `pacific.edu/sites/...` strings. Many of those sit at positions 1–10 and still get **0 clicks** because the searcher wants the official PDF, not YouSafe.
5. Pages that already have volume and *some* clicks are mid-SERP. Those are the only near-term CTR levers:

| Page | Imp. | Clicks | CTR | Pos |
|---|---:|---:|---:|---:|
| `/guide/uk-university-of-bristol-international-student-guide/` | 248 | 1 | 0.4% | 10.2 |
| `/guide/university-of-the-pacific-student-housing/` | 193 | 1 | 0.5% | 9.8 |
| `/guide/uk-university-of-warwick-international-student-guide/` | 189 | 1 | 0.5% | 13.8 |
| Homepage `yousafeconsultancy.com/` | 134 | 4 | 3.0% | 8.2 |
| `/ca/canada-express-entry-stem-category-occupations-list-2026/` | 101 | 1 | 1.0% | 31.7 |
| `/us/breaking-a-lease-international-student-us/` | 76 | 4 | **5.3%** | 10.4 |

When the estate ranks ~8–10 on a query people actually want (lease-break, homepage, OPT vs PGWP), CTR is 3–8%. The 0.3% site average exists because those queries are a tiny share of impressions.

**Operating rule to encode in the engine:**

> Ignore site-wide CTR until impression-weighted position of *eligible* queries is under ~12. Do not spend factory capacity on PDF-filename, quoted official-document, or `userNNNN` queries. Spend it on strike-distance pages that already earn impressions at positions 8–14 *and* have proven click intent.

---

## 2. Goal / non-goals

### Goal

Teach the SEO Master Engine, Opportunity Radar, Autopilot, and keyword planner to **push through** this exact failure mode:

- Suppress junk / official-PDF impression noise **before** scoring.
- Reweight SERP scoring so **rank on eligible queries** outranks raw impression count.
- Classify strike-distance (pos 8–14, real impressions, non-junk) as the default factory play.
- Classify wrong-intent official-document rankings as **ignore**, never `expand_or_build`.
- Surface a GSC mix report (eligible vs junk vs deep-tail) on the Master Engine feed so the studio cannot hide behind a 0.3% CTR.

### Non-goals (instructor will reject these)

- Rewriting Bristol / Warwick / Pacific / lease-break **copy** in this brief. That is a later editorial batch. This brief is **engine + routing**.
- Changing Ahrefs title/meta clamps, citation crème policy, or word-count floors unless a test forces a one-line fix.
- New database tables unless you can prove an existing JSON field on `masterEngineFeed` / opportunity objects cannot hold the mix report.
- Tuning weights from intuition. Use the locked snapshot and deterministic tests.
- “CTR optimizer” that rewrites titles for rank-30 junk queries.

---

## 3. Files you must read first

All paths are under `Documents/GitHub/yousafe-portal` unless noted.

| File | Why |
|---|---|
| `lib/seoFactory/queryNoise.ts` | Already knows meal-plan / PDF / `user\d+` / quoted-date junk. Opportunity path must use **this**, not a weaker local `isNoise`. |
| `lib/seoFactory/opportunities.ts` | `isNoise()` is weaker than `isJunkQuery`. Radar still lets some PDF-ish terms through. |
| `lib/seoFactory/opportunityEngine.ts` | Play classification + scoring. Must learn strike-distance vs ignore-junk. |
| `lib/seoFactory/authorityScoring.ts` | Demand weight currently treats raw GSC volume as good. Must penalize junk and deep-tail. |
| `lib/seoFactory/masterEngine.ts` | SERP subsystem signals (`g_impressions`, `g_clicks`, CTR, position). Must score *eligible* GSC, not the polluted average. |
| `lib/seoFactory/masterEngineFeed.ts` | Studio feed. Must expose mix + recommended plays. |
| `lib/seoFactory/observedSignals.ts` | `ctrCurveFit`, `lostQueryRate`, `newQueryVelocity` — align expected CTR with rank. |
| `lib/seoEngine/rankingModel.ts` | `scoreDemand` uses raw impressions/position/CTR. Same pollution. |
| `lib/seoFactory/keywordPlanner.ts` | Must not plan new pages from junk queries. |
| `lib/seoFactory/dailyWarRoom.ts` | Autopilot consumer of opportunities. |
| `tests/opportunity-engine.test.ts` (create if missing) | Lock the new plays. |
| `tests/` existing master-engine / ranking / query-noise tests | Update, do not delete coverage. |

---

## 4. Product rules to encode (not comments — code)

### 4.1 Eligible vs junk vs deep-tail

Introduce a single classifier (prefer extending `queryNoise.ts`, not a third filter):

```ts
export type GscQueryClass = 'eligible' | 'junk' | 'deep_tail'

export function classifyGscQuery(term: string, row: { impressions: number; position: number; clicks: number }): GscQueryClass
```

Rules (deterministic, test these):

| Class | When |
|---|---|
| `junk` | `isJunkQuery(term)` OR `isFileOrUrlLikeTerm(term)` OR ≥2 quoted fragments OR meal-plan PDF leftovers OR `user\d+` OR `.pdf` / `pacific.edu/sites` / `files/users` |
| `deep_tail` | not junk AND (`impressions < 10` AND `position > 20` AND `clicks === 0`) |
| `eligible` | everything else |

`opportunities.ts` **must delete** its local `isNoise` and call `isJunkQuery` / `classifyGscQuery`. Two filters is how junk leaked.

### 4.2 Factory plays (additive, do not rename existing plays)

Add or map:

| Play / action | Meaning | Factory behavior |
|---|---|---|
| `strike_distance` (already exists as action) | Eligible query, position **8–14**, impressions ≥ 30, clicks ≥ 0 | **Default next work.** Expand existing owner URL. Do not create a sibling. |
| `click_proven` | Eligible, clicks ≥ 3, position ≤ 12 | Defend + CTR polish (title/meta only). |
| `ignore` | `junk` | Never queue, never brief, never regenerate. |
| `deep_demand_build` | Eligible, impressions ≥ 80, position ≥ 20 | Only if an owner URL already exists. Otherwise defer. |
| `page1_defend` | Eligible, position ≤ 8, impressions ≥ 20 | Hold. Do not spawn a new page. |

Priority for Autopilot / War Room (highest first):

1. `click_proven` / `page1_defend` on existing owners
2. `strike_distance` on the snapshot pages (Bristol, Pacific housing, Warwick, lease-break, homepage)
3. `deep_demand_build` on existing owners only
4. Never `content_gap` for junk or for queries that already have an owner URL

Hard-code the snapshot URLs as **seed strike-distance targets** in a small constant (not a CMS). Tests must assert they classify as strike-distance given the snapshot metrics.

```ts
export const GSC_STRIKE_SEEDS_2026_08 = [
  { path: '/guide/uk-university-of-bristol-international-student-guide/', impressions: 248, clicks: 1, position: 10.2 },
  { path: '/guide/university-of-the-pacific-student-housing/', impressions: 193, clicks: 1, position: 9.8 },
  { path: '/guide/uk-university-of-warwick-international-student-guide/', impressions: 189, clicks: 1, position: 13.8 },
  { path: '/us/breaking-a-lease-international-student-us/', impressions: 76, clicks: 4, position: 10.4 },
  { path: '/', impressions: 134, clicks: 4, position: 8.2, host: 'apex' },
] as const
```

Use them to (a) boost matching live GSC rows and (b) fixture tests. Do not invent more seeds.

### 4.3 Scoring — impression-weighted position of *eligible* queries

Today demand/SERP scoring treats 10.3K impressions at pos 31.7 as “lots of demand.” That is the bug.

For any GSC aggregate used by Master Engine / ranking model / authority scoring:

```
eligibleImpressions = sum(impressions where class === 'eligible')
eligibleClicks      = sum(clicks where class === 'eligible')
eligibleCtr         = eligibleClicks / max(1, eligibleImpressions)
eligiblePosition    = impression-weighted mean position of eligible rows only
junkShare           = junkImpressions / max(1, totalImpressions)
```

- **Demand** must use `eligibleImpressions`, not total.
- **CTR gap** must compare `eligibleCtr` to the expected CTR at `eligiblePosition` (`ctrCurveFit` in `observedSignals.ts`). Do not flag “CTR too low” when position is worse than 20.
- **Position goodness** must treat 31.7 as *bad*, not as “we are being seen.”
- Apply a **junk-share penalty** (e.g. multiply SERP subsystem by `1 - min(0.6, junkShare)`) so a property drowning in PDF queries cannot look healthy.

Expected CTR curve (use existing helper if it already matches; otherwise document the function you add):

| Position | Approx expected CTR |
|---:|---:|
| 1 | 28% |
| 3 | 10% |
| 8 | 3% |
| 10 | 2% |
| 20 | 0.6% |
| 30 | 0.3% |
| 40+ | ≤0.2% |

A page at pos 10 with 0.5% CTR is a **title/intent** problem. A property at pos 32 with 0.3% CTR is **on-curve**. The engine must say which case it is.

### 4.4 Master Engine feed contract

`assembleMasterEngineFeed` must add a `gscMix` (name may vary, keep it stable) object:

```ts
{
  windowDays: 28
  totals: { clicks, impressions, ctr, position }
  eligible: { clicks, impressions, ctr, position }
  junk: { impressions, share }
  deepTail: { impressions, share }
  recommendedPlays: Array<{ play, url or term, reason }>
  strikeDistance: Array<{ url, impressions, position, ctr }>
}
```

Expose this on the studio Master Engine panel as one compact block: “Eligible position X · junk share Y% · N strike-distance URLs.” No new page. Reuse `master-engine-panel.tsx`.

If the panel cannot render new fields without a large UI rewrite, still compute `gscMix` and put a 6-line text block in `promptBlock` so Autopilot and briefs consume it. UI polish can wait; **data must exist**.

### 4.5 Autopilot / brief / regenerate

- `dailyWarRoom` / auto-run must prefer `strike_distance` + existing `canonicalUrl` / owner URL. Mode = **expand**, never **new**, for seed URLs.
- Keyword planner must drop `junk` before cluster assignment.
- Regenerating a junk-query job is forbidden: if the primary keyword classifies as junk, the planner/war-room must refuse and point at the owner page to expand instead.

---

## 5. Phases (stop after each)

### Phase A — Classify and stop the leak (no UI required)

1. Unify noise filters (`opportunities.ts` → `isJunkQuery`).
2. Add `classifyGscQuery` + tests (junk / eligible / deep_tail).
3. Opportunity engine: junk → `ignore`; pos 8–14 eligible → `quick_win` / `strike_distance`; do not `content_gap` an owned URL.
4. Fixture tests using the locked snapshot rows (Pacific PDF quoted queries = junk; Bristol 248/10.2 = strike-distance; lease-break 76/10.4/5.3% = click_proven or strike-distance).

**Phase A acceptance**

- [ ] `isJunkQuery('"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983') === true`
- [ ] That term never appears in `loadFactoryOpportunities()` output when injected as a fake GSC row (unit test with injected rows).
- [ ] Bristol-like row `{impressions:248, clicks:1, position:10.2}` classifies as strike-distance / quick_win, not content_gap.
- [ ] Existing query-noise and opportunity tests still pass.
- [ ] `npx tsc --noEmit` clean.
- [ ] Worklog written.

### Phase B — Score eligible GSC only

1. Master Engine SERP signals + rankingModel `scoreDemand` + authorityScoring demand: eligible aggregates only.
2. CTR-gap warning suppressed when position > 20 (or expected CTR < 0.8%).
3. `gscMix` on the feed + prompt block.
4. Tests: polluted mix (90% junk impressions at pos 5, 10% eligible at pos 32) must **not** produce a healthy SERP score; inverted mix must score better on position/CTR than the polluted mix.

**Phase B acceptance**

- [ ] A fixture with the locked domain totals (29 clicks / 10959 imp / pos 33) plus 40% junk share produces a SERP recommendation of “improve eligible rank,” not “fix CTR.”
- [ ] Feed JSON includes `gscMix.junk.share` and `gscMix.strikeDistance`.
- [ ] Autopilot prompt block contains the words `eligible position` and `junk share`.
- [ ] tsc + targeted Jest pass.

### Phase C — Route the factory at the five seed URLs

1. War room / auto-run / keyword planner: next actions for the five seed paths are **expand existing**, with `canonicalUrl` set to the live legal/apex URL.
2. Do **not** create `uk-graduate-visa` siblings or new Pacific-PDF articles.
3. Studio radar: junk queries hidden by default (existing junk chip / filter is fine if it now uses the unified classifier).

**Phase C acceptance**

- [ ] Given only the five seed metrics + one junk PDF query, the top 5 planned actions contain the five seeds (or their owner keywords) and **zero** junk terms.
- [ ] Expand mode + targetUrl present for each seed that is not the homepage.
- [ ] tsc + Jest for planner/war-room/opportunities.

---

## 6. Tests you must add

Create `tests/gsc-push-through.test.ts` (name may vary) covering:

1. Classifier table (min 8 cases from §1 queries).
2. Opportunity play table (junk → ignore; Bristol → strike-distance; lease-break → click_proven or strike-distance).
3. Eligible-position math: weighted mean ignores junk rows.
4. Expected-CTR: pos 32 @ 0.3% is on-curve; pos 10 @ 0.4% is a CTR gap.
5. Feed `gscMix` shape (can use a pure helper; do not hit live GSC in CI).

Do not call the live GSC API in Jest.

---

## 7. Constraints (standing estate rules — still in force)

- Citations: `lib/seoFactory/citationPolicy.ts` + crème official sources only. No Wikipedia, no consultants, no invented `.gov` paths.
- Word counts: `countBodyWords` only. Legal guides 2200–2800 body words.
- Ownership: host → repo via `ownership.ts`. University/housing guides stay on their owner URL. Do not steal blogs onto `caseworks` unless the registry says legal.
- Repair jobs **in place** (`existingJobId`). Do not spawn sibling “UK Graduate Visa” queue rows.
- No `select('*')` on `content_jobs` in new code.
- Do not store or print secrets.

---

## 8. What “done” looks like to the instructor

The instructor will reject the work if any of these are true:

- Radar still ranks a quoted Pacific PDF query as an opportunity.
- Master Engine still treats 10k impressions at pos 32 as strong SERP health.
- Autopilot’s next action is a net-new page instead of expand-Bristol / expand-Pacific / expand-Warwick / expand-lease-break.
- CTR is described as the primary site-wide problem.
- No tests, or tests that only snapshot strings.
- Scope creep into copy rewrites of the five pages (that is a later brief).

The instructor will **approve** when Phase A–C acceptance boxes are honestly true, CI-relevant tests pass, and a cold read of the feed/prompt would tell a junior editor: “Ignore the 0.3% CTR. Push these four URLs from position 10 toward page 1. Do not write another meal-plan PDF page.”

---

## 9. Worklog template (append each phase)

```
## Phase _
Date:
Files:
Tests run:
Pass/fail:
Evidence the factory behavior changed:
Questions for instructor:
```

Stop after Phase A. Do not proceed until the instructor replies **APPROVED — Phase A**.
