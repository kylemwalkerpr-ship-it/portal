# Brief 38 — Purge the legacy navy/paper marketplace skin

**To:** Kimi (+ your swarm)
**From:** Claude (engineering supervisor)
**Type:** Visual refactor — finish the editorial-skin job that briefs 36 + my agent in commit `ef1e058` left half-done.
**Sibling briefs:**
- Brief 36 (`36_KIMI_MARKETPLACE_DESIGN_ADOPTION.md`) re-skinned `PublicMarketplaceLanding`.
- Commit `ef1e058` re-skinned `GigDetailPage`, `GigDetailComponents`, `ReviewComponents`, and the `ChatSidePane` chrome to the editorial tokens.
- Everything else under `components/marketplace/` and **`MarketplaceShell` itself** is still on the legacy navy/paper palette. That is why `https://market.yousafeconsultancy.com/gigs/<slug>` looks old — the dark navy header bar in `MarketplaceShell` wraps every editorial inner column.

Your job in 38 is to finish the purge. **Nothing visible under the `market.yousafeconsultancy.com` host should be on the legacy palette after this brief lands.**

---

## §0 — Read first

| File | Purpose |
|---|---|
| `components/marketplace/tokens.ts` | The editorial `T` + `F` token objects. Import these. Do not redefine. |
| `app/marketplace/PublicMarketplaceLanding.tsx` | Reference implementation of the editorial visual language end-to-end (palette + typography + spacing + chrome). Match this. |
| `components/marketplace/GigDetailPage.tsx` + `GigDetailComponents.tsx` + `ReviewComponents.tsx` (commit `ef1e058`) | Reference implementation of the per-token mapping (`C.cyan → T.indigo`, etc.). Pattern-match. |
| `docs/seo-briefs/36_KIMI_MARKETPLACE_DESIGN_ADOPTION.md` §§1–2 | Token system spec. Authoritative. |

---

## §1 — Non-negotiable constraints

1. **No new design tokens.** Use `T` + `F` from `components/marketplace/tokens.ts` exactly as exported. If a value you need isn't in `T`, derive it from existing tokens (rgba/alpha, mix, etc.) — do not add new top-level keys.
2. **Scope locks.** All restyled surfaces are under `/marketplace` only. The portal dashboards (`/dashboard`), the messenger (`.yousafe-messenger`), legal/checkout subdomains, and `caseworks` are out of bounds.
3. **No logic changes.** Every hook, fetch, mutation, useEffect, useGatedAction, useCart, useSearchParams, prop shape — untouched. This is a **paint job**, not a refactor.
4. **No data churn.** No new API routes, no schema migrations, no `Supabase` writes. Reading the same fields you read today.
5. **`Btn`, `Card`, `LoadingState`, `ErrorState`, `EmptyState` from `components/design/shared.jsx`** stay imported. Their internals are not in scope. Where a custom inline button uses `C.cyan` directly, swap to `T.indigo` (pill, white-on-indigo, `T.indigoDeep` on hover).
6. **`C` palette is forbidden inside `components/marketplace/`** after this brief lands. Run `grep -rn "from '../design/shared'" components/marketplace/` post-edit — every match must import only `Btn`/`Card`/`LoadingState`/`ErrorState`/`EmptyState`, never `C`. Same with any inline use of `C.cyan` / `C.navy` / `C.bg` / `C.surface*` / `C.text*` — all must be gone.
7. **No mock or hardcoded data.** If a surface has no real data, render its real empty state. Don't filler-fill.
8. **TypeScript:** `npx tsc --noEmit` clean before every commit.
9. **Deploy:** `git push origin main` only. No `wrangler deploy`.
10. **Messaging surfaces are out of scope.** Brief 37 owns the messenger. `ChatSidePane`'s chat **body** (ChatScreen + MessageBubble) was deliberately left alone in `ef1e058`; do not touch it here either. The chrome around the body was already restyled.

---

## §2 — Token mapping (binding rules)

Apply this mapping verbatim in every file. When in doubt, look at commit `ef1e058` for the worked example.

| Legacy | Editorial |
|---|---|
| `C.bg`                              | `T.paper` |
| `C.surface` / `C.surface2` / `C.surface3` | `T.vellum` / `T.paper2` / `T.paper3` |
| `C.border` / `C.borderSoft` / `C.border2` | `T.rule` / `T.ruleSoft` / `T.ruleSoft` |
| `C.text`                            | `T.ink` |
| `C.textMuted`                       | `T.inkMid` |
| `C.textDim`                         | `T.inkSoft` |
| `C.cyan` (primary brand)            | `T.indigo` (hover: `T.indigoDeep`) |
| `C.red` / brand-red                 | `T.brick` |
| `C.gold` / `#FFD700`-ish            | `T.gold` |
| hardcoded `#1B2D4F` (legacy navy)   | `T.indigo` for buttons/links/CTAs; `T.ink` for body text on light bg |
| hardcoded `#F7F5F0`                 | `T.paper` |
| hardcoded `#FFFFFF` surface         | `T.vellum` (off-white surface) — but `#fff` stays for pure-white text **on** indigo |
| Star fill / rating yellow           | `T.star` (`#C68B27`) |

Typography:
- Display (h1/h2 page titles, section heads, hero copy): `fontFamily: F.display`, weight 500, `letter-spacing: -0.01em` on large sizes.
- Body / UI: `fontFamily: F.ui`.
- Eyebrow labels, metadata, small caps, monospace: `fontFamily: F.mono`, uppercase, `letter-spacing: 0.12em`, 10.5–11px.

Buttons:
- Primary CTA: indigo pill (`background: T.indigo`, `color: '#fff'`, `border-radius: 999px`, `padding: '10px 18px'`, hover `T.indigoDeep`, optional `box-shadow: 0 10px 22px -10px rgba(60,59,110,0.55)`).
- Secondary: paper pill (`background: T.paper2`, `color: T.ink`, `border: 1px solid T.rule`, hover `T.paper3`).
- Tertiary / link: text-only, `color: T.indigo`, hover underline.

Card chrome:
- Background `T.vellum`, `border: 1px solid T.rule`, `border-radius: 10–14px`, no heavy box-shadow unless it's a primary CTA card.

Rules:
- Section dividers: `1px solid T.rule` for hard, `1px solid T.ruleSoft` for soft.

---

## §3 — Files to restyle (the punch list)

### 3.1 — `components/marketplace/MarketplaceShell.tsx` **(highest priority — load-bearing wrapper)**

Currently:
- Sticky header background: hardcoded `#1B2D4F` → **`T.indigo`**
- Body wrapper background: hardcoded `#F7F5F0` → **`T.paper`**
- Header wordmark color: hardcoded `#F7F5F0` → keep `#fff` (it's on indigo)
- Nav link text: hardcoded `#1B2D4F` on light + various greys → switch the active link to `T.gold` underline, inactive to `rgba(255,255,255,0.8)` (still on indigo header)
- Subtle bottom border on the header: `T.indigoDeep` or `T.indigoSoft`
- Section titles inside the shell (lines 99–102, 179, 210): switch the inline `serif`/`sans` constants to `F.display` / `F.ui`; switch hardcoded `#1B2D4F` color to `T.ink` for body and `T.indigo` for accents
- "Back to marketplace" button (line 213): swap to the indigo pill spec from §2
- The placeholder/empty-state copy + chrome (lines 176–230): editorial paper card with rule border

Keep the sticky positioning, the scroll-shadow detection, the routing, the cart state, the language bar, and the auth-aware menu logic untouched. Pure paint job.

### 3.2 — `components/marketplace/MarketplacePage.tsx`

This file is **dead code** after commit `8a0d7cc` (no live route renders it). **Delete it**, then `grep -rn 'MarketplacePage' app/ components/` to confirm no imports remain; remove any that do.

### 3.3 — `components/marketplace/GigDiscoveryPage.tsx`

The full discovery results page — accessed via `?q=`, `?category=`, `?sort=` on `/marketplace`, or under `/marketplace/categories/[categoryId]`.
- Title + sub-eyebrow → `F.display` + `F.mono` per §2.
- Filter rail, sort dropdown, result-count line → editorial paper chrome.
- Result card grid → `T.vellum` cards with `T.rule` borders, Lora titles, mono provider line, indigo "From" price, `T.star` rating glyphs (match `GigDetailComponents.tsx`'s `SimilarGigs` worked example).
- Empty state → editorial paper card centered with `T.inkSoft` copy.

### 3.4 — `components/marketplace/MarketplaceCategoriesIndex.tsx`

Categories landing (the directory of category tiles).
- Page chrome: `T.paper` background, breadcrumb in `F.mono` uppercase, page title in `F.display`.
- Category tiles: `T.vellum` cards with `T.rule` borders, hover lifts to `T.paper2`, title in `F.display` weight 500, gig-count tag in `F.mono` uppercase.

### 3.5 — `components/marketplace/MarketplaceProvidersIndex.tsx`

The attorneys / consultants directory accessible from the landing's `Find an attorney` toggle and from `/marketplace/providers`.
- Side-pane preview already exists from earlier work — keep its data flow.
- Restyle: card chrome, filter row, side-pane chrome all to editorial tokens.

### 3.6 — `components/marketplace/SellerDirectoryPage.tsx`

If this is a separate seller-directory entry (verify by reading the file before touching), same treatment as 3.5.

### 3.7 — `components/marketplace/SellerProfilePage.tsx` + `SellerProfileComponents.tsx`

A seller profile (attorney or consultant) rendered when a buyer clicks a provider.
- Page hero: indigo cover band or paper hero with a single editorial photo (whatever real data exists — no placeholders).
- Avatar + name + credential line (`F.display` for the name, `F.mono` for the credential).
- Tabs (Services, About, Reviews): editorial pill tab bar, active tab dark-pill (`T.ink` background, `#fff` text), inactive ghost.
- Services grid: same `SimilarGigs` worked example from `GigDetailComponents.tsx`.
- Reviews block: `ReviewComponents.tsx` already restyled — confirm it slots in cleanly.

### 3.8 — `components/marketplace/MarketplaceHero.tsx`

If still referenced anywhere (check imports — it may be dead code now that `PublicMarketplaceLanding` owns the hero), either restyle or delete per dead-code rule.

### 3.9 — `components/marketplace/FilterControls.tsx` + `FilterSidebar.tsx`

Filter chrome reused across discovery and provider directory. Restyle to editorial: pill sort dropdown, `T.vellum` sidebar with `T.rule` border, mono uppercase section headers, indigo accent on active filter chips.

### 3.10 — `components/marketplace/ReviewForm.tsx`

Star input + textarea + submit. Stars on `T.star`, textarea inside a `T.vellum` card with `T.rule` border, submit is the indigo pill.

### 3.11 — `components/marketplace/GigBuilderWizard.tsx` + `GigBuilderWizardClient.tsx`

Provider-facing gig creation wizard. Restyle to editorial: stepper rail in `F.mono` uppercase, step titles in `F.display`, primary CTAs indigo pill, paper card sections with rule borders, monospace metadata.

The wizard's logic is untouched — only paint.

---

## §4 — Swarm strategy

Spin **four parallel swarm agents** on disjoint file groups. Single push per swarm (so the user gets four reviewable commits, not one mega-commit).

| Swarm | Files | Commit |
|---|---|---|
| **S1: Shell + dead-code purge** | 3.1, 3.2, 3.8 | `fix(marketplace): editorial shell + drop dead MarketplacePage` |
| **S2: Discovery + categories + providers** | 3.3, 3.4, 3.5, 3.6 | `fix(marketplace): editorial discovery, categories, providers index` |
| **S3: Seller profile + reviews form** | 3.7, 3.10 | `fix(marketplace): editorial seller profile + review form` |
| **S4: Filters + builder wizard** | 3.9, 3.11 | `fix(marketplace): editorial filter chrome + gig builder` |

Each swarm:
1. Pulls the latest `main` first.
2. Runs `npx tsc --noEmit` after edits — must pass.
3. Runs `grep -rn "C\.\(cyan\|navy\|bg\|surface\|border\|text\|red\|gold\)" <its files>` — must return zero matches that reference the legacy `C` palette (matches inside imported components like `Btn`/`Card` are fine; we only care about consumers).
4. Commits + pushes to `main`. Cloudflare deploy fires automatically.

S1 is the user-visible win and must ship **first**. Don't start S2-S4 until S1 is approved.

---

## §5 — Acceptance checklist (Claude reviews per swarm)

### S1
- [ ] `https://market.yousafeconsultancy.com/gigs/study-review-1b47ef62` — header bar is editorial indigo (`T.indigo`), body is `T.paper`, no dark-navy chrome.
- [ ] `MarketplacePage.tsx` deleted; `grep -rn 'MarketplacePage' app/ components/` finds no imports.
- [ ] `MarketplaceHero` either deleted or restyled (state which in the commit body).
- [ ] All header nav links use Inter, indigo pill chrome where appropriate.

### S2
- [ ] `https://market.yousafeconsultancy.com/?q=passport` and `/categories/<id>` — full editorial chrome including filter rail.
- [ ] `https://market.yousafeconsultancy.com/providers` — editorial card grid + side-pane preview.

### S3
- [ ] `https://market.yousafeconsultancy.com/providers/<id>` — editorial hero, tabs, services grid, reviews.
- [ ] Submitting a review uses the indigo pill CTA, stars are `T.star`.

### S4
- [ ] `/dashboard/gigs/new` (provider-facing) — wizard chrome editorial top to bottom.
- [ ] Filter sidebars (discovery + providers) editorial chrome.

### Cross-cutting
- [ ] `grep -rn "#1B2D4F\|#F7F5F0\|C\.cyan\|C\.navy" components/marketplace/` — every match is either inside a token-derivation file (`tokens.ts`) or inside the deliberately-untouched ChatScreen/MessageBubble bodies. No others.
- [ ] No regression on `PublicMarketplaceLanding`, `GigDetailPage`, `GigDetailComponents`, `ReviewComponents`, `ChatSidePane` (already editorial — your changes must not touch them visually).
- [ ] No CSS leakage onto `/dashboard`, `/sign-in`, `/sign-up`, the messenger.

---

## §6 — What you absolutely do not touch

- `app/marketplace/PublicMarketplaceLanding.tsx` (already done in brief 36)
- `app/marketplace/page.tsx` (routing — settled in commit `8a0d7cc`)
- `app/marketplace/layout.tsx` (the Suspense wrapper — fine as-is)
- `components/marketplace/GigDetailPage.tsx` + `GigDetailComponents.tsx` + `ReviewComponents.tsx` + the **chrome** of `ChatSidePane.tsx` (all done in `ef1e058`)
- The four mirror-on-write routes from commit `a4929f8` (auth/messaging logic — unrelated)
- Brief 37's messenger work (separate domain — `.yousafe-messenger` scope)
- `middleware.ts`, Clerk config, satellite domains (off-limits per brief 37 §1.4–5)

---

## §7 — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives ("Replace…", "Delete…", "Do not…"). Match the existing brief 30 / 36 / 37 register exactly. The commit message and the body of every PR comment uses this voice.

---

**Start with S1. Push, ping Claude for review. Do not start S2 until S1 is approved.**
