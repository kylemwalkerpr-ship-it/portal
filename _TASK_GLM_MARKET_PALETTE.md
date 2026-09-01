# Market palettes: contrast + no color-load flash

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` only.
Do NOT commit, push, or deploy. Do not print secrets.
Do NOT replace marketplace homepage copy/structure or study-abroad apex.
This is a **slow, thorough** pass. Inventory every market surface before editing.

## Product intent

1. **Every piece of text** in the market app must be **legible** on its background. No washed-out, faded, or low-contrast copy (placeholders, captions, muted labels, stars, prices, legal disclaimers, disabled states that are still readable copy, footer, nav, gig cards, drawer, cart, templates, providers).
2. **Palette must not “load” when navigating.** Switching market pages (home → gig → category → cart → providers → templates → shop) should feel **continuous**. Colors must already be present on first paint. No flash of default mahogany then the user’s palette. No blank/wrong-color wait. Palette *changes* (picker) should **transition smoothly** (background/color ~300–400ms), not pop.

## Surfaces in scope (all of these)

- `app/marketplace/layout.tsx` + every page under `app/marketplace/`
  - `/` `PublicMarketplaceLanding.tsx`
  - `/gigs/[slug]`, `/categories`, `/categories/[categoryId]`
  - `/providers`, `/providers/[id]`
  - `/templates`, `/templates/[slug]`
  - `/cart`, `/order/success`
- Shop host using the same shell: `app/shop/layout.tsx` and shop pages
- Shared chrome: `components/marketplace/MarketplaceShell.tsx`, `CategoryBar`, gig cards, drawers, `PalettePicker`, `components/marketplace/palettes.ts`, `tokens.ts`, `contexts/palette-context.tsx`
- Any inline `style={{ color / background }}` under those trees
- `app/globals.css` rules that target `.cw-market`

Out of scope: portal dashboard, messenger `[data-theme]`, Clerk, Content Studio, study-abroad apex, Payhip product pages if they are not our React tree.

## Root cause you must prove, then fix

Palette today is applied in **`PaletteProvider` via `useEffect` + `applyPaletteCssVars` on `.cw-market`**. That is **after first paint**. SSR/layout fallback uses mahogany (`#4A2A1A`). Stored palette in `localStorage` key `ys-marketplace-palette` therefore **flashes** on every full navigation / first visit of a market page, and the Suspense fallback in `app/marketplace/layout.tsx` is a solid paper color with no tokens.

### Required architecture (do this, do not invent a second theme system)

1. **Blocking first-paint script** in `app/marketplace/layout.tsx` and `app/shop/layout.tsx` (or once in root **only if** it is gated to market/shop hosts — do not restyle the portal dashboard). Inline `<script>` that:
   - Reads `ys-marketplace-palette`
   - Looks up known names (keep a tiny name→token map or `data-palette` on `html`)
   - Sets `--ys-*` on `document.documentElement` **and** `.cw-market` if present
   - Sets `document.body.style.backgroundColor` to paper so the document never flashes white
   - Must run **before** React hydration (inline in layout, not `useEffect`)
2. Keep `PaletteProvider` as the source of truth after hydration; applying vars must be **idempotent** (same values, no visible jump).
3. CSS: `.cw-market, .cw-market *` should **not** transition `*` (too expensive). Transition only `background-color`, `color`, `border-color`, `fill`, `stroke` on chrome + cards (~0.35s ease). No opacity:0 → 1 “theme load” animation.
4. Suspense fallback in marketplace layout must use **the same CSS vars** (`var(--ys-paper)`) already set on html, not a hardcoded mahogany that fights the stored palette.
5. If `MarketplaceShell` unmounts/remounts per route, that is a defect — shell should persist across market child routes (layout already wraps; do not move PaletteProvider into page files).

## Contrast contract

Existing gate: `tests/marketplace-palette-contrast.test.ts` — WCAG AA **4.5:1** for body text.

You must:

1. Run that test; **expand it** so every palette token pair actually used in UI is covered:
   - Dark surfaces (`paper`, `paper2`, `paper3`, `footer`) × `onPaper` **and** `onPaperSoft` (if onPaperSoft fails AA, **darken/lighten the token**, do not leave faded copy)
   - Light surfaces (`vellum`, `cream`) × `ink`, `inkMid`, `inkSoft`
   - Button/accent: `indigo`/`teal`/`brick` text on those fills
2. Hunt **hardcoded** colors in market components (`#fff`, `rgba(...,0.4)`, `opacity: 0.5` on text, Tailwind `text-white/40`, `color: inherit` on dark paper with ink). Replace with tokens.
3. **Muted text** is allowed only if it still meets **≥ 4.5:1** for normal text (or ≥ 3:1 only for large ≥18px/14px bold — document exceptions in the test). Prefer raising contrast over deleting copy.
4. Placeholder / disabled: if the control is usable, text must still be readable. True disabled can stay dimmer but must not look like a rendering bug.
5. Walk every market page in code (and Playwright against `http://localhost:3000` **or** production `market.yousafeconsultancy.com` if local is hard): screenshot is optional; **contrast assertions in tests are required**.

## Pages GLM must explicitly tick

For each palette in `PALETTES` (not just mahogany):

- [ ] Landing
- [ ] Gig detail
- [ ] Categories list + one category
- [ ] Providers list + one profile
- [ ] Templates list + one template
- [ ] Cart
- [ ] Order success
- [ ] Shop layout pages that reuse the shell

Check header, search, category chips, cards, prices, ratings, body copy, links, footer, drawer, empty states, error states.

## Tests

- Expand `tests/marketplace-palette-contrast.test.ts`
- Add a small test that `applyPaletteCssVars` writes the expected `--ys-*` keys
- If you add an inline boot script, extract the token map to a **shared module** so the script string and React palettes cannot drift
- `npx jest tests/marketplace-palette-contrast.test.ts --no-coverage`
- `npx tsc --noEmit`

Optional Playwright: navigate two market routes without full reload if the app does client transitions; assert computed `--ys-paper` does not change mid-navigation unless the user changed palette.

## Do not

- Replace landing content or gig inventory
- Touch portal-themes for dashboard
- Commit / push / deploy
- Invent a CSS-in-JS theme besides existing `--ys-*` tokens

## Report back

PROJECT: YouSafe
TASK: market palette contrast + no flash
FILES CHANGED: …
IMPLEMENTATION: …
TESTS / RESULTS: …
KNOWN ISSUES: …
UNCERTAINTY: …

Be thorough. Quality over speed.
