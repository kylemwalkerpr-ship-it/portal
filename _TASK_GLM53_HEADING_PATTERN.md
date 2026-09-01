# GLM 5.3 — market heading contrast + pattern always visible

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`. No commit/push/deploy. No secrets.
Do not rewrite landing copy or gig inventory. Keep `--ys-*` tokens.

Read files in ≤80 line chunks. Do not load Content Studio docs.

## 1. Split headlines like “This week's recommended briefs.”

Live pattern (landing featured):

```
This week's <em>recommended … briefs.</em>
```

CSS today fights itself:

- `PublicMarketplaceLanding.tsx` ~681–682: `.section-head h2` = `T.onPaper`, `h2 em` = `T.gold` (gold failed AA vs paper)
- `app/globals.css` ~1136–1140: `.cw-market .section-head h2` = `var(--ys-ink)` — **dark ink on dark paper** = invisible “This week's”

Same split (`plain text` + `<em>italic remainder</em>`) also: `Global <em>top briefs.</em>`, `.seller-card h2 em`, any other market `h2 em` / kicker+italic pairs.

**Required:** On **dark paper**, both halves must be **light, ≥4.5:1 vs paper**.
- Non-em: `var(--ys-onPaper)` (not ink)
- em: do **not** use current `T.gold` if it fails AA. Use `var(--ys-onPaper)` or a **new** `onPaperEm` / brighter cream-gold that passes 4.5:1 vs `paper`/`paper2`/`paper3` for **every** palette. Put that pair in `tests/marketplace-palette-contrast.test.ts`.
- On **light vellum/cream** cards, both halves use `ink` / `inkMid` (not gold-on-cream if that fails).

Search **entire** `app/marketplace`, `app/shop`, `components/marketplace`, `app/globals.css` for: `h2 em`, `section-head`, `T.gold` as **text color**, `ys-ink` on headings that sit on paper.

## 2. Background pattern always visible on every market page

`.cw-market::before` is `position:fixed; z-index:-2`. `.cw-market` has `isolation: isolate`. Opaque `background: T.paper` on sections/shell **covers** the pattern.

**Required:** Pattern texture must show through **all** market routes (landing, gigs, categories, providers, templates, cart, order success, shop).

Do this without making text unreadable:
- Shell/page fill: paper color **with alpha** or only on `html/body`, not a fully opaque wall over `::before`
- Keep `::before` **above** the solid fill and **below** content: e.g. `z-index: 0` on pattern, content `z-index: 1`, pattern `pointer-events: none`
- Do not set `::before { opacity: 0 }` or `content: none` except PatternPicker “off”
- Sections (hero, featured, trust, files-rail, footer) must not be 100% opaque slabs that hide the pattern — use `transparent` / `color-mix` / `rgba` paper so the texture reads
- PatternPicker + ThemePicker injection must still work
- Verify `MarketplaceShell` + landing both define `::before` — one contract, no page that zeros the pattern

## Tests

- Contrast: em token vs paper ≥ 4.5 for all palettes
- Optional: assert `.cw-market::before` rules include `background-image` or at least `content:""` and z-index ≥ 0 in shell CSS string

```
npx tsc --noEmit
npx jest tests/marketplace-palette-contrast.test.ts --no-coverage
```

## Report

FILES / IMPLEMENTATION / TESTS / leftover pages if any.
