# A1 pure helper packet revision

Scope: `lib/estateOwnership/index.ts` and its focused contract tests.

## Review correction

The independent review identified two route normalization defects: `trailingSlash: 'preserve'` discarded a supplied final slash, and WHATWG URL parsing normalized raw path backslashes before path validation.

## Regression first: observed RED

Added exact regressions in `tests/estate-ownership-contract.test.ts` before changing implementation. Command:

```text
npx jest tests/estate-ownership-contract.test.ts --runInBand
```

Observed: **FAIL**, 1 suite failed; 2 tests failed and 8 passed. The preserve case expected `/guide/` and received `/guide`. The backslash case expected `null` and received a normalized `/guide/private/` route. Exit code: 1.

## Correction and verification

The helper now rejects a literal backslash in the supplied URL before parsing, and retains a supplied trailing slash in `preserve` mode (with root and `always`/`never` behavior intact).

Focused GREEN command:

```text
npx jest tests/estate-ownership-contract.test.ts --runInBand
```

Observed: **PASS**, 1 suite passed; **10 tests passed**. Exit code: 0.

Focused standalone helper typecheck:

```text
npx tsc --ignoreConfig --noEmit --strict --target ES2022 --moduleResolution bundler --module ESNext lib/estateOwnership/index.ts
```

Observed: no diagnostics; exit code: 0. (`--ignoreConfig` is required by the installed TypeScript 6 CLI when checking a specified file.) `git diff --check` also passes.

## Risk and limitation

This change is confined to pure route normalization. It does not validate route behavior in application integration paths; those were intentionally outside this packet's scope.
