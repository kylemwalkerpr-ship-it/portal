# Live Content Studio defects — implement these fixes

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` only.
Do NOT commit, push, deploy, or print secrets. If git status is denied, skip it.
Do not touch marketplace homepage or study-abroad apex.

Live evidence (2026-08-29, admin desk after ingest/plan/LLM audit):
- Ingest: 133 items / 13 sources, **aiSummarized=0**, hung feeds skipped ~6–8s.
- Planner: 20 missions toasted; GET `/api/seo-engine/plan` still returned junk terms (`yousafeconsultancy.com`, `yousafe`, Pacific.edu PDF path) and **wrong country** (`uk student visa process for warwick university` → US).
- LLM audit: 0/4 cited, 0/153 share of voice (do not try to fake citations).
- Generate-stream: job `12ae1be9` created **drafting**, `runbios-minimax`, **0 words**, URL `legal…/ca/uk-student-visa-requirements-2026/`. SSE 200 then hung until 7 min client timeout. Worker `maxDuration` is 300s.
- Older job `af9ddb1f` (2742w, score 71) stuck on quality: "In 60 seconds must contain 3–5 separate bullet lines".
- Merged job "i-589 asylum application help" is live at `/us/student-visas/opt-stem-opt-complete-guide/` with duplicated H1 "opt application — opt application".

---

## P0 — Generate-stream must not leave an empty drafting job

Files: `app/api/seo-factory/generate-stream/route.ts`, `lib/seoFactory/pipelineStream.ts`.

1. **Heartbeat the SSE** so Cloudflare does not idle-kill the connection. Every 15s yield a comment or `{type:'progress', message:'still drafting'}` while waiting on the model.
2. **Hard wall inside 270s** (under `maxDuration = 300`): stop refine loops, keep the last checkpointed draft, emit `final` with whatever content exists + `shipMode:'none'` + a clear `shipError` like `stream budget exhausted — resume from checkpoint`. Never hang past the isolate kill.
3. **try/finally on the stream**: if the client disconnects or the isolate is dying, UPDATE `content_jobs` for `earlyJobId`:
   - if content/checkpoint length > 200: `status='drafting'`, `error_message='Interrupted — click Resume'`, persist `content` + `word_count`.
   - if content empty: `status='failed'`, `error_message='No draft produced before stream ended'`.
   Do **not** leave status=drafting with null content (that is job `12ae1be9`).
4. **Resume**: `regenerationMode:'resume'` + `existingJobId` already exist — ensure stream uses `input.resumeContent` from the job row when present so a second click continues instead of a blank article.
5. **Default writeSegments**: for `legal_guide` / long-form (minWords ≥ 1600), default `writeSegments` to 2 if unset so MiniMax can finish a pass inside the wall.
6. Tests: unit-test the job-row finalizer helper (empty → failed; partial → drafting+error). Mock supabase if needed.

Keep `maxDuration` at 300 unless wrangler already documents a higher paid cap — do not invent 900s if CF will 400 the deploy.

---

## P0 — Planner must not persist or display junk; country must follow hints

Files: `lib/seoFactory/queryNoise.ts`, `lib/seoEngine/planner.ts`, tests for `isJunkQuery` / `bestCellForTerm`.

1. `isJunkQuery` already has `BRAND_RE` and PDF/URL filters, but **GET dashboard still shows junk** because old `seo_cluster_plans` rows are not filtered. In `loadPlansDashboard` (and any GET shape used by the desk), **drop rows** where `isJunkQuery(primary_term)` is true.
2. At the start of `runPlanner`, **delete** (or set status=`rejected`) existing plan rows whose `primary_term` is junk so they cannot reappear by score.
3. `bestCellForTerm`: if `hintedCountries(term)` has exactly one country, **never** return a different country. Zero the score of other countries (or skip them). Warwick + UK must not become US.
4. If hints has one country and the best stage score for that country is still `< MIN_CELL_MATCH_SCORE`, **drop the term** (do not invent US/visa).
5. Tests:
   - `isJunkQuery('yousafeconsultancy.com')` true
   - `isJunkQuery('yousafe')` true
   - `isJunkQuery('...pacific.edu/sites/default/files/users/user2983')` true
   - `bestCellForTerm('uk student visa process for warwick university').country === 'UK'`
   - `bestCellForTerm('appendix fm se documents checklist').country === 'UK'`

---

## P1 — In 60 seconds scaffold must produce 3 `- ` bullets

Files: `lib/seoFactory/editorialScaffold.ts`, `lib/seoFactory/contentQualityGate.ts`, existing scaffold tests.

After scaffold runs, the `## In 60 seconds` section must contain **≥3 lines** matching `/^[-*+]\s+\S/m`.
If the model wrote a paragraph or `1. 2. 3.` list, **rewrite that section** into three dashed bullets derived from H2 titles (already sketched ~line 648 / 2005 — make it unconditional and covered by a test with a paragraph TL;DR and a numbered TL;DR).
Do not invent keywords. Do not count inline hyphens as bullets.

---

## P1 — Refuse ship when topic and path/H1 are different articles

Files: `lib/seoFactory/pipeline.ts` (existing content-topic mismatch), `lib/seoFactory/ship.ts` or `shipGate.ts`.

Before Git write: if the **canonical path last slug** (or H1) shares **no significant token** with `primaryKeyword`/`topic` (ignore stopwords), set `shipMode='none'`, do not merge, surface `Content-topic mismatch`.
Add a test: topic `i-589 asylum application help` + path `/us/student-visas/opt-stem-opt-complete-guide/` → refuse.
This is how the live OPT page got an asylum job.

Also: duplicated H1 `opt application — opt application` — if H1 equals `left — left` after split on em dash, collapse to one phrase in `formatContract` / scaffold title clamp.

---

## P2 — Knowledge ingest AI summaries

File: `lib/seoEngine/knowledge.ts`.

`aiSummarized=0` because `generateEngineText` default pair is too slow for 8 items inside ingest timeouts.
For ingest summaries only: call `generateEngineText` with `aiProvider: 'runbios-glm-53-flash'` (single lead, not engine-pair), `skipQualityContract: true`, `timeoutMs: 25000`, `maxTokens: 250`.
If the call fails, keep storing the item (already does) and increment `aiErrors` — also include `aiSummarized` and `aiErrors.length` in the ingest toast payload if the UI reads `data` (admin-seo-engine ingest handler).

Do not block ingest on summaries.

---

## Do not

- Fake LLM citations to raise 0/153 voice.
- Change live marketplace homepage.
- Approve/merge content from this task.
- Print secrets.

## Verify

```
npx tsc --noEmit
npx jest tests/query-noise.test.ts tests/planner*.test.ts tests/editorial-scaffold.test.ts tests/content-quality-gate.test.ts --no-coverage
```
(Adjust globs to the test files you actually touch.)

## Report

Files, tests, remaining limits (Worker 300s wall is a platform cap).
