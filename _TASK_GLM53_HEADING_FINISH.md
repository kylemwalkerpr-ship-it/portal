# Flash/5.3 FINISH — heading contrast + pattern (do not restart)

Prior 5.3 run already set `onPaperEm`, landing `h2 em`, globals `--ys-onPaper*`. You CLOSE.

No commit. Marketplace only. Reads ≤80 lines.

1. `app/globals.css` `.cw-market .section-head h2` must be `var(--ys-onPaper)` not `ys-ink`. `h2 em` = `var(--ys-onPaperEm)`.
2. Landing `.section-head h2 em` = `T.onPaperEm` (not gold).
3. Pattern: `.cw-market::before` z-index above paper fill, below content; sections `background: transparent` or alpha paper so texture shows. Do not `content:none`.
4. Contrast test: onPaperEm vs paper ≥4.5 all palettes.
5. `npx tsc --noEmit` && `npx jest tests/marketplace-palette-contrast.test.ts --no-coverage`

STOP. Report FILES / tsc / jest.
