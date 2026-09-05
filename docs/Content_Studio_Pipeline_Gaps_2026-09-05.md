# Content Studio Pipeline Gaps — Consolidated Rollup (2026-09-05)

**Repo:** yousafe-portal · **HEAD at write:** `7ade8e4`  
**Prior live baseline:** 42/100 (`docs/Content_Studio_Pipeline_Audit_Report_2026-09-04.md`)  
**Method:** Deduped merge of four DeepSeek audit slices + parent live facts. No invented findings.

---

## 1. Executive score (code vs live)

| Lens | Score | Rationale |
|------|------:|-----------|
| **Code** | **72 / 100** | Wave A/B from the 09-04 fix plan are on `main` with green tests (placement, outline into generate/audit, owner pin, region Evidence/Interlinks, Review scope, over-max trim paths, KEEP---, topic lock, KEYWORD_PASTED_HEADING rewrite). Open **code** P0s remain: generate-depth ×4 (PASS 3b no trim; disclaimer restore without closing budget pass; outline `remaining` ignored; brief min/max ignored) and audit→ship ×2 (`audit_json.shipReady` not written by editor fix paths; Save/`reaudit` rebuild wipes `shipReady`). Discover→Brief has no P0 but two P1 wiring gaps. |
| **Live** | **58 / 100** | Up from **42** (2026-09-04). **Blog Approve→GitHub PROVEN** (7Sisters: `7d82204` / `747846e` / `a87a273`). Regional Canada CRS historically blocked on Clerk + Save; long-form not E2E'd. Wave C still incomplete (regional + article/legal_guide through Approve→GitHub; type-window re-verify under new trim; AI Style on blog path). |

**Conflict note (generate-depth vs types-live):** Slice `04` reported “no P0 in code” and scored code ~85 after Wave A/B closure. Slice `02` independently found four ship-breaking depth/outline/budget holes still present at HEAD (verified: `pipelineStream.ts` PASS 3b assigns `expand.text` with no `enforceBodyWordBudget`; outline path ignores `completed.remaining`; pipelines bind type SPECS only; disclaimer restore after final trim has no third trim). **This rollup keeps the generate-depth P0s as open code gaps** and lowers the code score accordingly. Slice `03` shipReady persist claim (“in-tree for `fix_until_gates`”) does **not** match HEAD: `reaudit/route.ts` writes `contentSpec`/`contentLoop` into `audit_json` and `shipReady` only into the review snapshot — `jobPassesShipGate` still reads `audit_json.shipReady`.

---

## 2. Deduped gap table

### P0

| ID | Stage | Gap | Evidence file | Status |
|----|-------|-----|---------------|--------|
| P0-GEN-1 | Generate / depth | PASS 3b final depth top-up applies expand text with **no** `enforceBodyWordBudget` — mid-loop overshoot into scaffold/outline | `02-generate-depth.md` (`pipelineStream.ts` ~1023–1024) | **open** |
| P0-GEN-2 | Generate / depth | Disclaimer restored after final trim with **no** closing budget pass; hardProtected disclaimer can lock `word_count_over_max` (esp. blogs ≤1200) | `02-generate-depth.md` (`editorialScaffold.ts` ~3068–3081); related hardening `a3e5c89` / `5a2730f` reduced but did not close restore-without-retrim | **open** |
| P0-GEN-3 | Generate / outline | `completeMissingOutlineSections` `remaining` never fail-closed; only `inserted` handled; caps ~6 H2s → incomplete briefs can proceed until audit withhold | `02-generate-depth.md` (`pipelineStream.ts` ~1086–1096; `outlineCompletion.ts`) | **open** |
| P0-GEN-4 | Generate / budget | `generate-stream` accepts brief `minWords`/`maxWords` but pipelines always bind `minWordsForType` / `maxWordsForType` only — operator brief window is dead | `02-generate-depth.md` (`pipelineStream.ts` ~136–138; route threads input) | **open** |
| P0-SHIP-1 | Audit → Approve | Editor gate / `fix_*` verdicts land in `content_job_reviews` (and response `shipReady`) but **`audit_json.shipReady` is not set** — workspace / VII Approve / queue `jobPassesShipGate` 409 while modal Approve can diverge | `03-auditfix-ship.md` (`reaudit/route.ts` ~1330–1341 snapshot vs audit_json; `jobShipGate.ts`) | **open** (partial intent in slice 03; **not** on HEAD) |
| P0-SHIP-2 | Audit → Save | `save` / `reaudit` PATCH rebuild `audit_json` from bare `auditContent()` without `shipReady` — Save destroys a cleared gate | `03-auditfix-ship.md` (`jobs/route.ts` ~1141–1162) | **open** |

### P1

| ID | Stage | Gap | Evidence file | Status |
|----|-------|-----|---------------|--------|
| P1-A2 | Discover → Brief | Radar gaps / backlink gaps / body-level LLM visibility never populate `radarMeta` or reach `suggest-brief` on the advertised path (prompt blocks empty) | `01-discover-brief.md` | **open** |
| P1-E1 | Brief / SEO Intel | SEO Intel lock does not reset on topic/region/keyword change — stale `writerContract` certifies prior topic into Drafting | `01-discover-brief.md` | **fixed** (`seoIntelLock` seed bind + reset on topic/region/keyword) |
| P1-GEN-1 | Generate | Stale token-budget comments (pillar 2800 / blog 1500) vs SPECS (2500 / 1200); stream uses large fixed `maxTokens` → overshoot | `02-generate-depth.md` | **open** |
| P1-GEN-2 | Generate | PASS 5 italic disclaimer not `hardProtected` the same way as `**Disclaimer:**` → trim/re-add churn with P0-GEN-2 | `02-generate-depth.md` | **open** |
| P1-GEN-3 | Generate | `ensureEditorialScaffold` adds disclaimer/TLDR/CTA without type/budget; relies on later PASS 5b | `02-generate-depth.md` | **open** |
| P1-GEN-4 | Generate | Trim failure returns untrimmed original (`removedWords: 0`) while audit still emits `word_count_over_max` | `02-generate-depth.md` | **open** |
| P1-GEN-5 | Types / depth | `finalizePipelineContentType` remaps (e.g. marketplace→blog, host legal_guide→regional) can disagree with UI/brief depth chip | `02-generate-depth.md` | **open** |
| P1-SHIP-1 | Approve surfaces | Direct modal `approve` bypasses `jobPassesShipGate`; workspace / `bulk_approve` / merge-pr enforce it — same “ready” claim, three outcomes | `03-auditfix-ship.md` | **open** |
| P1-SHIP-2 | shipGate | Server gate ignores fingerprint-matched review-snapshot evidence — repaired drafts stay unapprovable until audit_json write lands | `03-auditfix-ship.md` | **open** |
| P1-LIVE-1 | Wave C | Live E2E ×3 incomplete: blog **proven**; **regional** (CA CRS historically Clerk+Save blocked) and **long-form / article→caseworks** not E2E'd | `04-types-live-gaps.md` + parent live facts | **open** (blog fixed live; regional + long-form open) |
| P1-LIVE-2 | Wave C | Re-verify blog 800–1200 / regional 1200–2000 / pillar 2200–2500 under post-scaffold re-trim + disclaimer restore (must not strand under floor) | `04-types-live-gaps.md` | **open** |
| P1-LIVE-3 | Review UX | AI Style (F5) on blog draft path — unresolved since 09-04; needs live re-check post-`c9740cb` | `04-types-live-gaps.md` | **open** |

### P2 (deduped highlights)

| ID | Stage | Gap | Evidence file | Status |
|----|-------|-----|---------------|--------|
| P2-E2 | Brief | SEO Intel lock trivially satisfiable (any non-empty `writerContract`, zero GSC) | `01-discover-brief.md` | **open** |
| P2-D2 | Brief | Dual brief producers overwrite keywords/title without precedence | `01-discover-brief.md` | **open** |
| P2-H2 | Brief / Evidence | URL-less lines (incl. off-region fallback note) counted toward Evidence ≥3 | `01-discover-brief.md` | **open** |
| P2-G1 | Generate unlock | 7-check readiness UI-only; server `generate-stream` accepts bare `{topic}` | `01-discover-brief.md` | **open** |
| P2-A1 | Discover / Intel | Dual demand backends: Discover live/snapshot vs from-intel `seo_gsc_rows` only | `01-discover-brief.md` | **open** |
| P2-G4 | Nav | Draft tab unlocks on topic+title only — bypasses Research 100% mental model | `01-discover-brief.md` | **open** |
| P2-C1 | Planner | `keyword-plan` autodeploy bypasses briefing stage | `01-discover-brief.md` | **open** |
| P2-L1 | Docs / catalog | Handoff “Entrim-only” vs catalog Grok live lane | `01-discover-brief.md`, `04-types-live-gaps.md` | **open** |
| P2-OUT-1 | Outline | Section prompt always 180–350 words regardless of page tier | `02-generate-depth.md` | **open** |
| P2-SHIP-TO | Re-audit UX | Re-audit button no client timeout + `liveLinks:true` fan-out | `03-auditfix-ship.md` | **open** |
| P2-SHIP-KW | Audit & Fix | Deterministic KEYWORD_PASTED_HEADING rewrite existed but pre-loop waste; **`7ade8e4` landed rewrite improvements** — residual: ensure pre-loop deterministic pass on non-over-max docs | `03-auditfix-ship.md` + commit `7ade8e4` | **partially fixed** |
| P2-FIX-ALL | Audit & Fix | `fix_all` has no outline-completion path | `03-auditfix-ship.md` | **open** |
| P2-LIVE-DOC | Docs | Update handoff/SEO docs to Entrim defaults + optional Grok lane | `04-types-live-gaps.md` | **open** |
| P2-LIVE-IL | Brief lock | Interlinks ≥2 no empty-pool unlock affordance | `04-types-live-gaps.md` | **open** |
| P2-LIVE-THR | Brief lock | Hard thresholds (Outline ≥6, Keywords ≥9) block hand-built minimal briefs | `04-types-live-gaps.md` | **open** |
| P2-LIVE-PR | Ship | `merge_pr` skips `shipContent` gates by design — doc or optional pre-merge re-gate | `04-types-live-gaps.md` | **open** |
| P2-LIVE-TEST | Tests | Missing regressions: PASS 3b budget-cap; route min/max honor/reject; `remaining` fail-closed; UI save-fail gate contract | `02-generate-depth.md`, `04-types-live-gaps.md` | **open** |

P3 items from slice 01 (abort copy drift, outline truncate 12, interlink chip vs live filter, knowledge feed drift, radar warnings discarded) omitted from the table as non-blocking polish; see source slice.

---

## 3. What's already fixed since Sept 4 audit

| Area | Commits (selected) | What closed |
|------|-------------------|-------------|
| Placement lock (14-cap / 9/25) | `26cca38` | Auto-map every keyword→H2; denominator = kwList |
| Outline into generate + completion | `f2d3ed1`, `9a24439` | Brief outline in prompt/audit; insert-before-FAQ; Audit & Fix outline path |
| Re-audit false-clear | `f2d3ed1` | Canonical outline passed into evaluate contract |
| Owner / Grok pin | `18bee2f`, `9a24439` | Persist owner pin; hydrate picker; review pin independent |
| SEO action drift | `484de89` | Full-window classify + shared `opportunityAction` |
| Region Evidence / Interlinks | `5a47f8d` | In-region floors; estate off-region penalty |
| Review scope | `4500d4d` | Job/brief-bound Review panels |
| Over-max trim machinery | `4efe48b`, `5a2730f`, `9a24439` | Type max after generate; trim even if outline fails; desk KEEP---/topic lock |
| YMYL disclaimer protect | `3351284`, `a3e5c89` | `**Disclaimer:**` hardProtected; restore after final re-trim (**restore-without-retrim hole remains → P0-GEN-2**) |
| shipGate vs Save (UI) | `e4e5604` | Gate applied before draft Save; save-fail notice; approve-anyway when job exists (**jobs-route audit_json wipe remains → P0-SHIP-2**) |
| KEYWORD_PASTED_HEADING | `7ade8e4` | Deterministic rewrite / gate playbook improvements |
| **Live** Blog → GitHub | 7Sisters ships `7d82204` / `747846e` / `a87a273` | Approve→GitHub **proven** for blog (parent fact; overrides slice 04 “0 live ships”) |

Types-live local verification at audit time: **218/218** tests green across 14 related suites (does not cover the open generate P0 regressions listed above).

---

## 4. Path to 100 (ordered next actions)

1. **Close generate P0s (code):** After PASS 3b expand always `enforceBodyWordBudget`; after `disclaimer_restored_after_final_trim` run a closing trim that can still cut non-protected prose (or pre-reserve disclaimer words); fail-closed on `completed.remaining`; honor brief min/max via `clampBriefWordBudget` or stop accepting them on the route.
2. **Close shipGate P0s (code):** Persist server-derived `shipReady`/`blockers` into `audit_json` on all `fix_*` writers; on `save`/`reaudit` recompute or merge-preserve `shipReady` (one Save must not revert Audit & Fix).
3. **Unify Approve surfaces (P1):** Direct approve should use the same gate evidence as workspace/queue (or explicit humanApproved only from the live editor gate + fingerprint).
4. **Discover→Brief P1s:** Wire or stop advertising dead radar/backlink fields; reset SEO Intel lock to its seed on topic/region change.
5. **Wave C live proof:** Regional (CA) and long-form/article → caseworks through Brief → Draft → Audit & Fix → Approve → GitHub + CF; re-verify all three depth windows under trim+disclaimer; re-check AI Style on blog.
6. **P2 polish that unblocks operators:** Evidence URL-less count; Re-audit timeout/`liveLinks` opt-in; docs Entrim+Grok story; empty Interlinks affordance; regression tests for P0-GEN-*.
7. **Rescore** this rollup after (1)–(5) with a live admin session — target dual score **100 / 100**.

---

## 5. Sources

- `tmp/cs-audit-2026-09-05/01-discover-brief.md`
- `tmp/cs-audit-2026-09-05/02-generate-depth.md`
- `tmp/cs-audit-2026-09-05/03-auditfix-ship.md`
- `tmp/cs-audit-2026-09-05/04-types-live-gaps.md`

**Parent live facts applied:** Blog Approve→GitHub proven (7Sisters); regional Canada CRS historically Clerk+Save blocked; long-form not E2E'd; recent main fixes `9a24439`, `e4e5604`, `5a2730f`, `a3e5c89`, `7ade8e4`; prior live score 42/100 on 2026-09-04.

*End of rollup — docs only.*
