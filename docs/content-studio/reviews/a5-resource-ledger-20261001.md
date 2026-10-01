# Helper review revision

Starting point: clean worktree at `293deeb34336e87133506d61aa74e8372be32f2d`.

## Scope and correction

The focused Studio resource ledger presentation now fails closed for estimated values unless the duration is a finite, nonnegative number and the unit, method, and method version are nonblank strings. Invalid estimates render as `UNKNOWN` and prevent `NO_ACTION`; a zero duration remains valid. The changes are limited to:

- `lib/studioResourceLedger/index.ts`
- `components/studioEstateShell/StudioEstateShell.tsx`
- `tests/studio-estate-shell.test.ts`
- `docs/content-studio/reviews/a5-resource-ledger-20261001.md`

## Regression evidence

The malformed estimate cases were added before the correction. RED was observed with:

```text
npm test -- --runInBand tests/studio-estate-shell.test.ts
FAIL tests/studio-estate-shell.test.ts
Expected: "UNKNOWN"
Received: "Estimated NaN seconds"
Test Suites: 1 failed, 1 total
Tests:       1 failed, 10 passed, 11 total
```

After the correction, the same command was GREEN:

```text
npm test -- --runInBand tests/studio-estate-shell.test.ts
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

The changed helpers also passed `npx tsc --noEmit --pretty false` (exit 0), and `git diff --check` passed (exit 0).

## Risk and limitation

This is a runtime presentation guard for the current helper API; it does not validate estimates at their source or change any integration/admission behavior. The contract treats zero as a legitimate duration and rejects negative values, non-finite values, and missing or whitespace-only metadata.

Ready for supervisor review. No commit has been made.
