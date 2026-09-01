# Flash — market nav lag (palette then content)

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`. No commit/push. No secrets.
Do NOT restyle palettes or rewrite copy. Reads ≤80 lines.

Symptom: click a gig (or any market route) → delay, then palette, then sections pop in. Boot script already exists for first paint; **client navigations still flash**.

## Causes to fix (prove, then patch)

1. `MarketplaceShell` is `'use client'` + `useSearchParams()` → layout **Suspense fallback** (`minHeight 100vh` empty paper) **unmounts the whole shell + children** on every navigation. That is the lag. Fix: do **not** wrap the entire shell in Suspense. Isolate `useSearchParams` in a tiny inner component with its own Suspense, or pass search via `window`/`usePathname` only so the layout never suspends the page tree.
2. `PaletteProvider` `useEffect` + `rAF` re-applies vars after every mount. After boot script, **do not** re-apply on mount unless `data-ys-palette` differs. Never clear `document.body.style.backgroundColor` on inner navigations (cleanup on unmount of layout only).
3. `refreshRole` `fetch('/api/profile')` on **every pathname change** — do not block painting chrome/children on `roleLoaded`. Render children immediately; hide only auth-only nav until role returns. Cache role in sessionStorage for ~60s.
4. 0.35s `transition` on `background-color`/`color` for `.cw-market` chrome makes tokens *look* like they load. **Disable transitions on first paint / route change** (`data-ys-palette-ready` after 1 frame, or `@media (prefers-reduced-motion)` plus skip transition for 100ms after navigation).
5. Gig detail and other pages that wait on data: keep **server-rendered** skeleton using `--ys-paper` / `--ys-onPaper` already on `html`. No empty white. No client-only full-page gate.

Scope: `app/marketplace/layout.tsx`, `app/shop/layout.tsx`, `MarketplaceShell.tsx`, `palette-context.tsx`, gig detail if it client-gates content.

```
npx tsc --noEmit
```

Optional: grep that layout Suspense no longer wraps `MarketplaceShell` whole tree.

Report FILES / what caused lag / TESTS. Stop at 25 min.
