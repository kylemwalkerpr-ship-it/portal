# Finish live-defects — remaining only

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`. Do NOT commit/push/deploy. Do not touch marketplace homepage or study-abroad apex.

P0 planner + generate-stream wall + TL;DR rewrite + `collapseDuplicatedTitle` are **already in the working tree**. Do not revert them. Finish the gaps below.

---

## 1. Tests for streamJobFinalizer (P0 leftover)

File exists: `lib/seoFactory/streamJobFinalizer.ts`.

Create `tests/stream-job-finalizer.test.ts`:

- Import `interruptedJobPatch` (pure).
- Empty / null / `"   "` content → `{ status: 'failed', error_message: 'No draft produced before stream ended' }` (or whatever the helper actually uses — match the implementation).
- Content length > 200 chars → `{ status: 'drafting', error_message: contains 'Interrupted' or 'Resume', content preserved, word_count > 0 }`.
- `failedMessage` override wins on empty.

Run: `npx jest tests/stream-job-finalizer.test.ts --no-coverage`

---

## 2. Planner tests already in master-engine-e2e — make them pass

`tests/master-engine-e2e.test.ts` already asserts:

```
bestCellForTerm('uk student visa process for warwick university').country === 'UK'
bestCellForTerm('appendix fm se documents checklist').country === 'UK'
```

Confirm `lib/seoEngine/planner.ts` `bestCellForTerm` **skips countries not in `hintedCountries` when that set size is 1**. If a hinted country cannot beat `MIN_CELL_MATCH_SCORE`, return `{ stage: '', country: hinted, score: 0 }` — do not fall through to US.

Add to `tests/query-noise.test.ts` if missing:

```
expect(isJunkQuery('yousafeconsultancy.com')).toBe(true)
expect(isJunkQuery('yousafe')).toBe(true)
expect(isJunkQuery('pacific.edu/sites/default/files/users/user2983')).toBe(true)
```

Run: `npx jest tests/query-noise.test.ts tests/master-engine-e2e.test.ts --no-coverage`

---

## 3. Scaffold tests for paragraph + numbered TL;DR (P1 leftover)

In `tests/editorial-scaffold.test.ts` (or create it), call `applyDeterministicRepairs` / `ensureEditorialScaffold` on a body that has:

```
## In 60 seconds
This is a paragraph not a list.

## Next
```

and another with:

```
## In 60 seconds
1. First
2. Second
3. Third
```

After repair, `## In 60 seconds` body must have **≥3 lines** matching `/^[-*+]\s+\S/m`.

Run: `npx jest tests/editorial-scaffold.test.ts tests/content-quality-gate.test.ts --no-coverage`

---

## 4. Ship refuse: topic vs **path last slug** (P1 leftover — this is how asylum landed on OPT)

Current mismatch in `lib/seoFactory/pipeline.ts` ~869 only checks keyword-in-body. **Add a path-slug check** before `shipContent`:

```
const slug = (plan.filePath || plan.canonicalPath || '').split('/').filter(Boolean).pop() || ''
```

Normalize tokens: lowercase, split on `[-_\s]`, drop stopwords `{the,a,an,for,of,to,in,on,and,or,with,from,guide,complete,help,application}`.

If topic/primaryKeyword significant tokens ∩ slug tokens is **empty**, set:

```
shipError = `Content-topic mismatch: topic "${topic}" vs path ".../${slug}"`
shipMode = 'none'
```

Do **not** Git write.

Mirror the same block in `lib/seoFactory/pipelineStream.ts` where `Content-topic mismatch` already exists (~1189).

Add `tests/topic-path-mismatch.test.ts` (or extend pipeline test) that **unit-tests a small exported helper** — do not run the full pipeline.

Export from `lib/seoFactory/topicPathGuard.ts` (new, ~40 lines):

```
export function topicPathMismatch(topic: string, primaryKeyword: string, filePath: string): string | null
```

Return a string when asylum vs `opt-stem-opt-complete-guide`; return null when topic `uk student visa requirements` vs path `.../uk-student-visa-requirements-2026.md`.

Call this helper from pipeline + pipelineStream.

---

## 5. Knowledge ingest summaries (P2 leftover)

`lib/seoEngine/knowledge.ts` ~469 `generateEngineText` — ingest still uses default pair + 400 tokens.

Change **only this call** to:

```
generateEngineText({
  ...,
  maxTokens: 250,
  timeoutMs: 25000,
  aiProvider: 'runbios-glm-53-flash',
  skipQualityContract: true,
})
```

If `generateEngineText` does not accept those keys, add optional fields in `lib/seoEngine/engineAi.ts` without changing other callers:

- `timeoutMs` default existing
- `aiProvider` pin skips complement pair when set
- `skipQualityContract` skips the writing-quality system suffix

On catch: increment `result.aiErrors` (string array or count — match existing type). Include `aiSummarized` and `aiErrors` on the ingest return value already used by the toast.

Do not fail ingest if AI fails.

---

## 6. generate-stream default writeSegments

`pipelineStream.ts` already defaults 2 for minWords ≥ 1600. In `app/api/seo-factory/generate-stream/route.ts` ~171, keep passing `body.writeSegments` through; if the UI omits it, leaving `undefined` is correct so pipelineStream applies the default. **Do not** force 2 on regional/blog.

Verify `resumeContent` is set from the job row when `regenerationMode === 'resume'` / `existingJobId`. If missing, load `content` from `content_jobs` and set `input.resumeContent`.

---

## Verify

```
npx tsc --noEmit
npx jest tests/stream-job-finalizer.test.ts tests/query-noise.test.ts tests/master-engine-e2e.test.ts tests/editorial-scaffold.test.ts tests/content-quality-gate.test.ts tests/topic-path-mismatch.test.ts --no-coverage
```

Fix any type errors in generate-stream/route.ts from the prior wall (budgetTimer, onClientAbort, sawFinal).

## Do not

Fake LLM citations. Approve/merge. Print secrets. Revert planner/stream/TL;DR/title work already applied.
