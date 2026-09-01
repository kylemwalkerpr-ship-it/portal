# GLM 5.3 — finish market palette (do NOT restart)

Flash already did 90%. It spent an hour then broke `MarketplaceShell.tsx` CSS-in-JS (backticks in a template literal). You close the job.

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`. No commit/push/deploy. No secrets.
Do not rewrite landing copy. Do not re-inventory the whole market. Do not re-tune palettes unless tsc/tests fail.

## Already done (keep)

- `components/marketplace/palettes.ts` + contrast gate expanded (`tests/marketplace-palette-contrast.test.ts` — 289 tests passed)
- `palette-boot.ts` + layout inline scripts
- token replacements, 0.35s transitions
- `tests/marketplace-palette-tokens.test.ts`

## You must

1. `npx tsc --noEmit` — if errors in `MarketplaceShell.tsx`, the `<style>{\`...\`}</style>` block cannot contain unescaped backticks. Use quotes in comments. Nested `${` must be valid JS.
2. `npx jest tests/marketplace-palette-contrast.test.ts tests/marketplace-palette-tokens.test.ts --no-coverage`
3. If tsc is already clean, grep remaining faded copy: `rgba(255,255,255,0.` under 0.75 on dark paper, `opacity: 0.4` on text in `app/marketplace` + `components/marketplace`. Replace with `T.onPaper` / `T.onPaperSoft` only where it's **text**.
4. Stop. Short report: FILES / tsc / jest / leftover issues.

Read files in 80-line chunks. Do not load Content Studio docs.
