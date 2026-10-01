# Helper review revision

Baseline: clean HEAD `67807a1ba7f4e1ac9835a4a06b5465d6327e86db`.

## Scope and correction

- `lib/studioRunAuthority/index.ts`: reject unrecognized runtime stage states in claim and transition paths; reject a transition whose incremented version would exceed `Number.MAX_SAFE_INTEGER`.
- `tests/studio-run-authority.test.ts`: add regressions for unknown-state claiming and transition overflow, including the valid increment from `Number.MAX_SAFE_INTEGER - 1` to `Number.MAX_SAFE_INTEGER`.

## Regression evidence

Added tests first, then ran:

```text
npm test -- --runInBand tests/studio-run-authority.test.ts
```

RED output: `Test Suites: 1 failed, 1 total`; `Tests: 2 failed, 12 passed, 14 total`. Unknown state returned `LEASE_STILL_ACTIVE` rather than `INVALID_STAGE_STATE`; the overflow transition returned `allowed: true` with version `9007199254740992`.

After the smallest correction, the same command was GREEN:

```text
Test Suites: 1 passed, 1 total
Tests: 14 passed, 14 total
Snapshots: 0 total
```

Focused helper type check:

```text
npx tsc --ignoreConfig --noEmit --strict false --target ES2017 --module esnext --moduleResolution bundler --skipLibCheck --isolatedModules lib/studioRunAuthority/index.ts
```

Passed with exit code 0. This uses the repository's `strict: false` TypeScript setting. A separate strict-mode probe reported existing errors at lines 237, 244, and 251 for passing optional decision fields to `required(...values: string[])`; no unrelated typing changes were made.

## Risk and limitation

These are pure helper checks. They do not prove storage uniqueness, transactional behavior, or concurrent compare-and-set guarantees, which remain outside this packet. The strict-mode probe is not clean due to the noted pre-existing optional-field errors. Changes are left uncommitted for Sol supervisor review.

## Bounded schema revision

This revision was made on the same candidate: HEAD `67807a1ba7f4e1ac9835a4a06b5465d6327e86db`; the pre-revision tracked diff SHA256 was `41e93e32f09863a44f7aff70aefc0597b7692ceecd488d3112b65d5f1e2bc759`. The worktree registry showed this packet's checkout only, and the current session had no other agent.

Added two regressions before changing the helper. Both use otherwise valid requests and `schemaVersion: 'studio.run-stage/999'`: a pending unleased stage for `claimStage`, and a running stage with valid lease, owner, fence, and exact predecessor for `transitionStage`. RED result: `2 failed, 14 passed, 16 total`; both paths accepted the unsupported schema and produced a mutated stage.

The correction checks `current.schemaVersion === 'studio.run-stage/1'` at the start of both paths and returns the existing `INVALID_STAGE_STATE` failure reason otherwise. No type was weakened and no existing test or state/overflow fix was removed.

Verification after the correction:

```text
npm test -- --runInBand tests/studio-run-authority.test.ts
Test Suites: 1 passed, 1 total
Tests: 16 passed, 16 total

./node_modules/.bin/tsc --ignoreConfig --noEmit --strict false --target ES2017 --module esnext --moduleResolution bundler --skipLibCheck --isolatedModules lib/studioRunAuthority/index.ts
Passed (exit code 0), using the repository's strict: false helper settings.

git diff --check
Passed (exit code 0).
```

The change remains uncommitted for independent exact-diff Sol review. No push, merge, deployment, activation, install, full build, or Docker operation was performed.

## Supervisor verification reconciliation

The canonical schema-revision job `cs-a3-stage-schema-review-revision-20261001-v2` ended `BLOCKED verification_failed`; it was not replayed. Its explicit TypeScript command omitted `--strict false`:

```text
npx tsc --ignoreConfig --noEmit --target ES2022 --moduleResolution bundler --module ESNext lib/studioRunAuthority/index.ts
```

The supervisor independently reproduced exit 2 with existing optional-field TS2345 errors at lines 239, 246, and 253. The installed TypeScript CLI applies strict checking in this invocation. Focused Jest independently passed 16/16. The same helper TypeScript command with explicit `--strict false`, matching repository settings, independently passed (exit 0), as did `git diff --check`. No typing changes were made to bypass the failed command; root must reconcile the verification contract before declaring the canonical job accepted.


## Supervisor reconciliation

The original v2 canonical receipt remains BLOCKED verification_failed and is not rewritten. The standalone TypeScript verifier supplied by Sol used TypeScript6 strict defaults while this repository explicitly sets strict:false. Supervisor ran the actual repository command npx tsc --noEmit --pretty false at the unchanged candidate; exit0. Independent GPT6.1Sol reviewed exact tracked diff fa28f00e6c2f94bb15e869ac97add5524f310d00105e5b6e0b83aa58dc67c57a, repeated16tests, and checked schema/state/overflow edge cases:PASS limited helper correction. No source/type/config weakening or execution replay occurred. This supervisor validation supports the code commit, not a fabricated canonical receipt or runtime activation.
