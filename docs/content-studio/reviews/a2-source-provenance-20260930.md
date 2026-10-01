# Helper review revision

## Scope

Bounded correction to the A2 source provenance pure helper at clean starting HEAD `6c796631eb8cc2198a5d000e42e34365382213ce`.

Changed paths:

- `lib/sourceProvenance/index.ts`
- `tests/source-provenance-contract.test.ts`
- `HELPER_REVIEW_REVISION.md`

## Correction

- Reject available observations with complete coverage and a supplied fraction below `1`.
- Reject empty observations with a supplied positive coverage fraction. A complete empty result may use fraction `0`; its fixture now states that explicitly.
- Validate Gregorian month/day and time components before accepting an ISO timestamp. Leap days are accepted only in leap years; JavaScript date rollover no longer makes impossible dates valid.

## Regression evidence

Tests were added before the helper correction. Initial RED command:

```text
npm test -- --runInBand tests/source-provenance-contract.test.ts
```

Observed before implementation: `FAIL`; 1 suite failed, 3 tests failed, 13 passed. The failures reproduced the two fraction contradictions and acceptance of February 30 (which produced only the incidental `WINDOW_ORDER_INVALID` issue).

Final GREEN command:

```text
npm test -- --runInBand tests/source-provenance-contract.test.ts
```

Observed after correction: 1 suite passed, 16 tests passed, 0 failed.

Focused type check:

```text
npx tsc --ignoreConfig --noEmit --strict --target ES2020 --module commonjs lib/sourceProvenance/index.ts
```

Observed: exit 0, no diagnostics.

Diff whitespace check:

```text
git diff --check
```

Observed: exit 0, no diagnostics.

## Risk and limitation

Coverage-fraction consistency is enforced only for the two positive states: available requires `1` when a fraction is supplied, while empty requires `0` when supplied. `null` remains unspecified. Timestamp validation remains limited to the helper's existing ISO timestamp form and does not validate timezone-offset policy beyond syntactic form and finite parsing. This is pure validation only; no adapter, integration, or activation behavior changed.

Changes are left uncommitted for Sol supervisor review.
