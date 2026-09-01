# INSTRUCTOR → GLM 5.3 Flash
**Updated:** 2026-08-27 07:16 ET
**Turn:** ci-green-1
**Repo:** yousafe-portal
**Status:** ACT

You are the implementer. Do the whole job in this turn. Do not wait for chat. Do not invent extra work.

## Goal
Make GitHub Action **Deploy YouSafe Portal** go green on `main`. Latest failed run: `33066193676` on `4e75ca4`.
`npx tsc --noEmit` is already clean. Failure is **unit tests** (Jest), 3 tests in 2 files.

## Failing tests (CI, 2026-08-27 11:11 UTC)

### 1) tests/ownership-routing.test.ts ~line 163
Suite: ownership resolver — explicit blog / regional destinations stay off caseworks
Test: routes Blog Post to the apex landing-page blog even when the keyword matches a legal pillar
FAIL: `expect(p.filePath).toContain('landing-page/app/blog/')`
Received: `landing-page/content/blog/uk-spouse-visa-document-checklist-2026.md`
canonicalUrl correctly contains `yousafeconsultancy.com/blog/` and not legal.

### 2) tests/ownership-routing.test.ts ~line 198
Same suite: recomputes the repo and content type when a cluster overrides a regional blog to legal
FAIL: `expect(p.host).toBe('legal')`  Received: `'apex'`
Fixture uses `ownerUrlHint: 'https://legal.yousafeconsultancy.com/ca/study-permit-refusal-reapply-2026/'`
Test also expects repo `caseworks`, filePath `app/ca/study-permit-refusal-reapply-2026/page.tsx`, contentType `legal_guide`.

### 3) tests/rhythm-scan.test.ts ~line 124
Suite: runRhythmScan
Test: marks extreme repetition non-remediable (deterministic repair cannot fully clear)
FAIL: `expect(result.alerts[0].remediable).toBe(false)`  Received: `true`
Comment in test: 26x is beyond the pronoun-rotation cap → not a one-click fix.
`alerts[0].count` already >= 5.

## How to work
1. Read the two test files and the production code they call. Fix **production** if the tests encode the intended ownership/rhythm policy. Fix **tests** only if they are stale vs a deliberate, already-shipped path change (e.g. blog now lives at `content/blog` not `app/blog`). Do not weaken tests to green CI if that would ship UK spouse blog onto the wrong host or mark unfixable rhythm as remediable.
2. Run locally:
   `npx tsc --noEmit -p tsconfig.json`
   `npx jest tests/ownership-routing.test.ts tests/rhythm-scan.test.ts --no-coverage`
   All three previously-failing tests must pass. Do not ignore unrelated failures if you cause them.
3. Touch only files required for this green. Do not stage `_watch/`, briefs, worklogs, e2e scripts.

COMMIT: yes
PUSH: yes

Stage only the files you actually changed for this fix (not `_watch/`).

Commit message:

fix(ci): align ownership routing and rhythm scan with deploy tests

Push main.

Then overwrite `_watch/GLM.md` with: SHA, `git status -sb`, jest result, tsc result, files changed, one-sentence why. Then STOP.
