# RANKING MODEL ARCHITECTURE — Studio Powerhouse v1

> Status: **LIVE** — model engine `seo-ranking-model-v1`, persistence in `seo_ranking_scores` /
> `seo_forecast_runs` / `seo_reward_events` / `seo_model_calibration`, surfaced in the
> Command Center → Engine → 📊 Ranking tab.
>
> Governed by `SEO_MASTER_PLAN.md` and the `_pipeline/` supervisor. Written 2026-08-09.

---

## 0 · Executive summary

The estate already runs a deterministic, evidence-led SEO brain (`seoEngine` + `seoFactory`):
daily policy/trend ingestion, GSC demand, opportunity engine, keyword clustering, AEO/SEO/GEO
authority scoring, LLM share-of-voice audits, interlink graph, backlink outreach ledger, ship
gates and live verification. What was missing was **one composite ranking model** that fuses
every signal family into a single explainable score, projects a **30/60/90-day forecast**, and
**learns from shipped outcomes** via a reward/credit-assignment loop.

This document (1) summarizes the researched landscape of how real search engines and answer
engines rank today, (2) specifies the model we built, (3) maps **have / working-on / missing /
leverage**, and (4) gives the **90-day execution plan to maximize ranking probability in 2–3
months**.

**Honesty clause (engineering, not hype):** no system can *guarantee* rankings, and Google does
not publish a spec. What we can build — and have built — is the closest thing to a mirror of the
observable ranking model, so every decision the studio makes is the decision an ideal agent
would make given the same evidence. Ranking velocity in a YMYL niche (immigration law) is
bounded by **domain trust + link authority**; the model optimizes everything we control and
prioritizes the fastest wins.

---

## 1 · Research synthesis: how ranking actually works (2025–2026)

### 1.1 Google: index-time vs query-time

Google splits scoring into two phases (Search Central "ranking systems" + antitrust disclosures):

| Index-time (computed at crawl/render) | Query-time (computed per search) |
|---|---|
| PageRank/link analysis (static authority) | Location, device, personalization slices |
| Content semantics + embeddings (BERT/MUM/neural) | Query intent & term weighting |
| Page experience / Core Web Vitals | NavBoost/Glue behavioral logs (13 months of clicks, `goodClicks`, `badClicks`, `lastLongestClicks`) |
| Structured data / canonical / technical | Generative synthesis (AI Overviews, feature classifiers) |
| Site-wide quality classifiers (helpful-content, SpamBrain) | Freshness boosts for breaking/trending events |

Implication for the studio: **index-time factors are what we can ship today** (depth, schema,
canonicals, speed, site-wide E-E-A-T), while **behavioral factors (NavBoost)** are what GSC
position/CTR history proxies for us.

### 1.2 SERP features & zero-click reality

- AI Overviews appear on ~half of informational queries; **~67% of AIO sources do not rank in the
  top-10 organic results** for the same query (Surfer). Citations ≠ rankings.
- Featured snippets, PAA, video/image packs are chosen by intent classifiers — procedural
  queries → snippets/steps, exploratory → PAA, etc.
- CTR declines when features occupy position 0 → the value mix shifts from "rank #1" to
  "rank #1-3 **and** be citable".

### 1.3 Backlinks & topical authority

- PageRank descendants + **Reasonable Surfer** (equity flows probabilistically by link position/
  anchor), **TrustRank** (topical dampening from trusted seeds), **SpamBrain** link-spam
  neutralization (permanent loss), and **NavBoost/Chrome referral** signals (high-authority
  referral traffic multiplies link weight).
- **Entity salience** (patent US8661029B1) and Knowledge-Graph co-citation can lift a domain
  even without direct backlinks when behavior consistently treats it as the "next step".
- YMYL consensus (Pittock et al.): 2–3 months is a window for **targeted authority**, not
  broad authority — digital PR (HARO/Qwoted/SourceBottle), data-led studies, entity stacking
  (GBP, Wikidata, schema `Attorney`/`LegalService`, bar-association `sameAs`), and strictly
  on-topic clusters.

### 1.4 AEO (Answer Engine Optimization)

Answer engines (featured snippets, PAA, direct answers) extract **passages**, not pages:

- Direct **answer capsules** (20–25 words, right under a question H2/H3)
- **Structured lists** (steps, checklists, document packs)
- **Statistics + named sources** (Princeton GEO: +30–40% visibility from stats/quotes)
- **FAQPage/HowTo/Article schema** (+10–40% visibility on Perplexity/AIO per studies)
- **Fan-out coverage** — answering a main query *and* its sub-queries makes you **~161% more
  likely** to be cited in AI answers.

### 1.5 GEO / LLM citation behavior

- RAG engines dispatch multiple background sub-queries; they prefer pages with extractable
  chunks, entity clarity, freshness, and verifiable sourcing.
- Platform skew matters: ChatGPT Search leans encyclopedic/authoritative; Perplexity weights
  **recency (up to ~40%)** + community validation; Google AIO blends top URLs + community;
  Claude is conservative, rigor-first, caveat-aware.
- AI-referred traffic converts ~4–5x higher than average organic — citations are the new
  top-of-funnel.

### 1.6 "Reward systems" (what algorithms reward — and our feedback loop)

Real engines "reward": intent fit, fresh & unique information gain, trusted sources, satisfying
sessions (no pogo-sticking), and clear entities. Our studio mirrors this with an internal
**reward ledger**: every shipped page's outcome (Δ impressions / Δ clicks / Δ position) is
credited to the actions that produced it, and the model's signal weights are **recalibrated**
within hard bounds. The model is therefore *dynamic by construction* — it re-weights itself
from what the estate actually experiences.

---

## 2 · The model: `seo-ranking-model-v1`

### 2.1 Signal families (weights sum to 1.0)

| Family | Weight | What it measures | Evidence source |
|---|---|---|---|
| `demand` | 0.18 | GSC volume, CTR gap, position headroom | `pullGscSignals`, war room |
| `intent` | 0.14 | Intent taxonomy fit + reward alignment | deterministic classifier |
| `topicalAuthority` | 0.16 | Entity salience, cluster fill, hub depth | `authorityScoring`, ontology |
| `aeoGeo` | 0.14 | Answer-ability, citation-ability, fan-out | `authorityScoring`, `llmVisibility` |
| `eeat` | 0.12 | Author creds, gov citations, disclaimers, accuracy | `audit`, `contentQualityGate` |
| `linkEquity` | 0.10 | Internal graph density + backlink authority proxy | `interlink`, `backlinkEngine` |
| `behavioral` | 0.08 | Position trajectory, CTR trend, click momentum | GSC history, `gscHistory` |
| `indexability` | 0.08 | Crawlable, canonical, schema, llms.txt, page speed | `crawlChecks`, `siteHealth` |

Every family is **0–100, bounded, deterministic, explainable** (`reasons[]` per family). The
composite `total` (0–100) is the weighted sum modulated by evidence **confidence** (from
`intelligence.ts`) — identical to the engine's existing philosophy: *no AI in the score, AI only
in briefs/audits*.

### 2.2 Intent taxonomy

`classifyIntent(term)` → `{ primary, subType, reward[] }`:
- `primary`: informational · commercial · transactional · navigational · local
- `subType`: procedural · comparative · definitional · checklist · eligibility · document ·
  timeline · cost · general
- `reward[]`: human-readable alignment notes (e.g. procedural → "snippet/AIO eligible", cost →
  "needs official fee tables", document → "form pack + schema").

### 2.3 Forecast (`buildForecast`)

Given current GSC metrics + a set of planned actions (each with strength 1–3), projects
**30/60/90-day** position, impressions, clicks, and probability-of-top-10. Model:
- Action uplift table (refresh, depth-expand, schema, interlink, new page, backlink, geo-fix) —
  each contributes bounded, log-decaying lift toward an asymptotic floor.
- Projected position improves with diminishing returns; probability of top-10 derived from a
  logistic curve on projected position + authority.
- **Assumptions are explicit** in every forecast (auditable, never presented as fact).

### 2.4 Reward loop (`computeReward`, `creditOutcome`, `recalibrateWeights`)

- `computeReward(deltas)` → 0..1 reward from Δ clicks / Δ impressions / Δ position (position
  gain weighted hardest).
- `creditOutcome(event)` attributes the reward across **action families** and persists a
  `RewardEvent` to `seo_reward_events`.
- `recalibrateWeights(current, rewards, lr)` re-weights families **boundedly** (each family
  clamped to its [base ± 0.05] band; sum re-normalized to 1.0) and records a row in
  `seo_model_calibration` — the dynamic-model audit trail.

### 2.5 Execution tracker — forecast vs actual (`forecastTracker.ts`)

The forecast is only useful if we measure it. `assembleForecastTracker` + `loadForecastTracker`
compare every **matured** 30/60/90-day projection against the real GSC numbers at (or near) its
maturity date:

- **Verdicts** per topic per horizon: `over_predicted` (model promised more than reality),
  `under_predicted` (reality beat the model), `on_track` (inside tolerance: ±2.5 ranks / ±25%
  impressions·clicks), `mixed` (metrics conflict — position is the headline tie-break), and
  `no_data` (nothing to compare — never counted as a result).
- **Actuals are chosen honestly**: point-in-time `gsc_snapshots` rows nearest the maturity date
  (±4 days) first; live 90-day-window signals only as a clearly-flagged `approximate_window`
  fallback; an absent topic falls to `no_data` rather than a fabricated comparison. Query
  matching is exact-normalized or a *safe subset direction* (snapshot query is a more specific
  form of the topic); the reverse direction is refused so a broader query's metrics are never
  attributed to a narrower topic, and every non-exact match is flagged `prefix match`.
- **Fleet summary**: per-horizon on-track rates, avg position error, **position bias** (+ = the
  model is systematically optimistic), worst misses and best surprises (top-5 by magnitude).
- Served by `/api/seo-engine/tracker`, run daily by the cron `track` phase (recorded in
  `engine_runs`), and surfaced as the 🎯 Execution Tracker panel in the Command Center.

This is the *second* half of the feedback loop: the reward loop tells us which **actions** pay
off; the execution tracker tells us whether the **projections** were any good — feeding the
monthly calibration review (§4, item 12). Regression tests in
`tests/seo-forecast-tracker.test.ts` lock the verdict math, tolerance bands, matching direction,
and empty-input robustness.

### 2.6 Regeneration filters (extended)

`filterRegenerationCandidates` (intelligence.ts) now supports, in addition to the original set:
`minRankingScore`, `minConfidence`, `minAeoGeo`, `freshnessWindowDays`. Strict semantics are
preserved (an empty result is an honest signal — never falls back to excluded/cannibalized items).

### 2.7 Lineage timelines

`assembleLineageTimeline(nodes, events)` renders the full **job → regeneration chain** as a
time-ordered, annotated timeline (source job → regen reason/mode → gate events → status), and
`/api/seo-engine/lineage` serves it per job or per topic. The Command Center shows it visually.

---

## 3 · Have / working-on / missing / leverage

| Pillar | We have | We're working on | Missing (now built) | Leverage |
|---|---|---|---|---|
| Demand | GSC live + snapshot, war room, opportunity engine | planner runs daily | — | Live GSC OAuth; IndexNow |
| Intent | opportunity engine plays, `pickAngle` | — | **Unified intent taxonomy + reward alignment** | Planner + launch composer auto-fill |
| Topical authority | clusters, ontology, authorityScoring | deep-interlink, estate sweep | **Composite topical family in ranking model** | DUAL_GRAPH university map, cluster fill |
| E-E-A-T | audit, gate, eeat.ts, ship gates | — | **E-E-A-T family inputs in model** | Author bylines, gov citations |
| Backlinks | backlinkEngine + outreach ledger + dashboard view | outreach automation | **linkEquity proxy in model** | HARO/digital PR per §1.3 |
| AEO/GEO | authorityScoring, llmVisibility audits, compliance gate | — | **aeoGeo family + fan-out scoring** | FAQ schema, answer capsules |
| Behavioral | gscHistory snapshots | — | **behavioral family + reward loop** | 13-month click proxy |
| Indexability | crawlChecks, siteHealth, canonical ledger | — | **indexability family** | llms.txt, sitemap pings |

**Everything in the "Missing" column ships in this change set** — one model, one schema, four
APIs, cron wiring, tests, and dashboard panels.

---

## 4 · 90-day execution plan (maximize ranking probability in 2–3 months)

### Days 1–30 — Foundation + fastest wins
1. **Indexability sweep** (indexability family): canonicals, sitemap, robots, llms.txt, schema
   on all canonicals; fix any `noindex` leakage (guard suite B1/B3 already tracks this).
2. **AEO/GEO retrofit on live canonicals**: answer capsule + FAQ block + stats panel on the top
   20 money pages; FAQPage/HowTo schema where valid.
3. **Topical consolidation**: resolve remaining cannibalization via the existing merge tooling;
   every cluster resolves to exactly one canonical (keyword-cluster mode is already enforced).
4. **Digital PR kickoff**: run the backlink outreach ledger (editorial lanes, gov/edu targets
   seeded); pitch 3–5 HARO-style queries weekly; publish one data-led study (processing-time
   dataset) for linkable asset.
5. Daily cron: knowledge → planner → **ranking model + forecast** → LLM visibility.

### Days 31–60 — Authority compounding
6. Ship the planner's top-ranked cluster missions with ranking-model-priority ordering; every
   brief carries its model score + recommended actions + forecast.
7. Entity stacking: author pages with credentials + `sameAs` (bar associations, LinkedIn),
   consistent NAP/entity signals across estate.
8. Reward loop live: after each GSC refresh, record outcomes; let `recalibrateWeights` tune the
   model. Watch the calibration ledger — it tells us what *this estate* responds to.
9. Interlink graph completion (seo_interlinks applied rates > 80% in priority cells).

### Days 61–90 — Defend + convert
10. Defense plays (`page1_defend`, `decay_refresh`) from the war room; refresh decayed canonicals
    with the regeneration pipeline (lineage preserved).
11. LLM visibility target: ≥40% share of voice on the top-10 audit queries (from baseline);
    add new fan-out sub-queries to the audit bank.
12. Monthly model review: compare forecast vs actual in the 🎯 Execution Tracker (the daily
    `track` phase already snapshots on-track rate + position bias into `engine_runs`);
    recalibrate; update this document. Watch position bias — positive means the model is
    systematically optimistic and the launch composer should trust it less on aggressive plays.

### Definition of "ranking" (measurable)
- 30 days: top-50 on ≥25% of targeted cluster terms; indexable 100% of canonicals; zero
  cannibalization pairs.
- 60 days: top-20 on ≥25%; first featured-snippet/AIO citations observed via llmVisibility.
- 90 days: top-10 on ≥15% of targeted terms in at least one jurisdiction; ≥3 earned external
  links from editorial lanes; AIO citations ≥ 5.

---

## 5 · Model governance & auditability

- Every score row carries `model_version`, `evidence`, `reasons`, `computed_at`.
- Every forecast carries explicit `assumptions`.
- Every reward event and calibration row is immutable history.
- The Command Center → Engine → 📊 Ranking tab exposes: ranking radar (family breakdown),
  forecast chart (30/60/90), lineage timeline viewer, reward attribution + weight deltas, and
  the 🎯 Execution Tracker (forecast vs actual per topic).
- Regression tests (`tests/seo-ranking-model.test.ts`, `tests/seo-intelligence.test.ts`,
  `tests/seo-forecast-tracker.test.ts`) lock determinism, bounds, filter strictness, forecast
  monotonicity, reward attribution, and forecast-vs-actual verdicts.

---

## 6 · Sources

- Google Search Central — ranking systems guide; SpamBrain; helpful content; AI Overviews.
- Marie Haynes — NavBoost deep dive; DOJ antitrust disclosures; API-leak analysis.
- Princeton GEO (arXiv 2311.09735); Surfer "How LLMs select sources"; Profound citation
  patterns; Frase GEO playbook.
- Reasonable Surfer patent US7716225B1; entity salience patent US8661029B1; TrustRank lineage.
- Search Engine Land / Ahrefs / Moz 2025–2026 tracker data cited inline above.
