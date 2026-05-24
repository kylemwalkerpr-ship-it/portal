# Brief 42 — Marketplace nav consolidation + decluttering

**To:** Kimi (sole session)
**From:** Claude (engineering supervisor)
**Type:** Single-surface UI consolidation. **One agent. No swarm.** One commit.
**Predecessor briefs:** 39 (auth-aware nav + inline messages — `MarketplaceAuthNav.tsx` created). The MarketplaceAuthNav component stays — the bug is where it gets mounted and how it inherits CSS.

**This brief sits independently of brief 40 (palette/polish) and brief 41 (theme picker).** It touches only the marketplace top-of-page chrome and can be shipped in parallel with those. **However, do not start brief 42 until brief 40 Part D is approved**, because brief 40 Parts C/D still mutate `UnifiedInbox.tsx` and indirectly affect the shell's MessagesPanel mount.

---

## §0 — What's broken today

An unauthenticated visitor at `/marketplace` sees four stacked chrome rows:

```
[YouSafe CONSULTANT PORTAL] [Browse] [Find Attorney]   [Sign inOpen portal] [EN]   ← MarketplaceShell TopNav
[YOUSAFE · MARKETPLACE · ALL JURISDICTIONS] [1 briefs available now]   [For attorneys & consultants] [Help]   ← PublicMarketplaceLanding `.topbar`
[YouSafe Marketplace] [search box] [Search]   [Sign in] [Open portal]   ← PublicMarketplaceLanding `<header className="nav">`
[Categories ▾] [JURISDICTION] [All] [United States] [United Kingdom] [Canada]   [1 BRIEFS · USD]   ← PublicMarketplaceLanding `.country-bar`
```

Three distinct defects:

1. **Two brand marks stacked.** `MarketplaceShell.tsx`'s `TopNav` (lines 230–294 in that file) renders regardless of auth state because `{roleLoaded && <TopNav>}` evaluates true after `/api/profile` resolves to 401. `PublicMarketplaceLanding.tsx`'s own `<header className="nav">` block (lines ~876–902) then renders **inside** the shell, giving two navs.

2. **Misleading role label.** `MarketplaceShell.tsx:244` reads `role === 'client' ? 'Marketplace' : role === 'attorney' ? 'Attorney Portal' : 'Consultant Portal'`. The fallback for `role === null` is `'Consultant Portal'`, so anonymous visitors see "YouSafe CONSULTANT PORTAL" in the brand subtitle even though they are not consultants and aren't signed in.

3. **`MarketplaceAuthNav` signed-out anchors collide.** The component's signed-out branch renders `<nav className="nav-links">Sign in</a><a className="cta">Open portal</a></nav>`. The `.cw-market nav.nav-links { display: flex; gap: 6px }` rule that gives those anchors their spacing is **scoped to `.cw-market`** (the landing's root class). When `MarketplaceAuthNav` is mounted inside `MarketplaceShell`'s `TopNav` instead, there is no `.cw-market` ancestor, the rule doesn't apply, the anchors fall back to inline layout, and the text reads "Sign inOpen portal" with no whitespace.

Target — Fiverr-clean single-row nav (the second reference screenshot the user posted): one row, one brand mark, a single right-cluster of [globe-EN] [secondary link] [primary pill]. Generous whitespace. Sub-nav (categories + jurisdiction tabs) lives in **one** thin row immediately below — not four stacked strips.

---

## §1 — Non-negotiable constraints

1. **No new dependencies.** Use what's in `package.json`.
2. **No schema changes, no API changes, no SQL.** Pure UI consolidation.
3. **TypeScript:** `npx tsc --noEmit` clean before completion. No `// @ts-nocheck` re-introductions.
4. **Worktree only.** Claude commits + pushes per the standing protocol. One focused commit at the end.
5. **Brief 39's `MarketplaceAuthNav` component stays.** Don't rewrite it from scratch. The fix is at the mount site + a small style hardening (see §3).
6. **Brief 38's editorial tokens stay locked.** `T` + `F` from `components/marketplace/tokens.ts` are the visual source of truth. No new tokens.
7. **No regression on `/marketplace/gigs/<slug>`, `/marketplace/providers/<id>`, `/marketplace/categories/<id>`, `/marketplace?view=messages`.** These routes all wrap inside `MarketplaceShell` and inherit its nav. After this brief, they should all see **one** consolidated TopNav, not zero, not two.
8. **Signed-in client / attorney / consultant viewers still see the role-aware tabs** in the shell nav. Authenticated nav stays role-aware.
9. **Do not touch** `middleware.ts`, Clerk config, the four mirror-on-write routes from `a4929f8`, the messenger primitives (`ChatScreen` / `MessageBubble` / `AutoGrowInput`), or the brief-40 / brief-41 surfaces.

---

## §2 — Architecture decision (binding)

**The `MarketplaceShell` TopNav becomes the SOLE marketplace nav across every marketplace route — public landing included. The `PublicMarketplaceLanding`'s own `<header className="nav">` block is deleted, along with the redundant `.topbar` and the `country-bar` strips.**

Why this direction and not the reverse:
- The shell is mounted by `app/marketplace/layout.tsx` (via `MarketplaceShell`) and wraps **every** marketplace route. A signed-in client clicking from the landing into a gig detail and then into the seller's profile traverses the shell uninterrupted — only one nav across that journey.
- The landing's nav was designed for a standalone marketing surface before the marketplace ran on its own subdomain. Now that everything sits under `MarketplaceShell`, the landing's nav is double-counted.
- Brief 39's `MarketplaceAuthNav` already handles signed-in vs signed-out branching. Mounting it once inside the shell (already done in brief 39) is enough.

Sub-nav (categories dropdown + jurisdiction pills) survives as **one** thin row below the main TopNav, owned by the shell — not the landing.

---

## §3 — File-by-file changes

### 3.1 — `components/marketplace/MarketplaceShell.tsx`

#### 3.1.1 — Fix the brand subtitle (line 244)

Change:

```tsx
{role === 'client' ? 'Marketplace' : role === 'attorney' ? 'Attorney Portal' : 'Consultant Portal'}
```

to a function that handles every branch including `role === null`:

```tsx
{role === 'attorney' ? 'Attorney Portal' : role === 'consultant' ? 'Consultant Portal' : 'Marketplace'}
```

`role === null` (anonymous), `role === 'client'`, and `role === 'admin'` all fall through to `'Marketplace'`, which is the truthful default for an anonymous or buyer-side visitor.

#### 3.1.2 — Move the search input into the shell `TopNav`

The shell's `TopNav` currently has [brand] [nav tabs] [auth nav] [language bar]. Insert a centered search input between the nav tabs and the auth nav cluster. Use the existing `<form className="nav-search">` markup pattern from `PublicMarketplaceLanding.tsx:887–895` — paste verbatim, including the SVG magnifier and the `?country=` hidden input. The CSS rules at `PublicMarketplaceLanding.tsx:519–525` (`.cw-market .nav-search`) need to be **lifted out of the landing's `<style>` block** into the shell's wrapper element (see §3.1.4).

If the role tab strip is overflowing on narrow viewports, the search collapses to a magnifier icon button that opens a search overlay. Standard responsive marketplace pattern.

#### 3.1.3 — Add inline gap fallback to `MarketplaceAuthNav`'s signed-out branch

The CSS-scope fix below in §3.2 fully resolves the bug, but as a belt-and-braces guard against any future re-mounting outside `.cw-market`, edit `components/marketplace/MarketplaceAuthNav.tsx` so the signed-out branch's `<nav>` carries an inline `style={{ display: 'flex', alignItems: 'center', gap: 8 }}`. Five-character defensive edit.

#### 3.1.4 — Add the `cw-market` class to the shell's outermost wrapper

Wrap `MarketplaceShell`'s root `<div>` with `className="cw-market"` (or merge it with the existing className if one is set). This makes the landing's existing `.cw-market` CSS rules (nav-search, nav-links, country-bar, brand-name, brand-mark, pill-mini) usable from inside the shell without copy-paste.

`PublicMarketplaceLanding`'s `<div className="cw-market">` wrapper still nests inside, which is fine — CSS class duplication on nested elements is harmless.

#### 3.1.5 — Suppress shell TopNav when there is **no** nav to render

If the future asks for a chromeless landing, the gate is `{roleLoaded && (role === null || role !== null) && <TopNav>}` — which is just `{roleLoaded && <TopNav>}`, the current shape. **Keep it as-is.** The shell always renders the TopNav; the landing's own header is what we remove.

### 3.2 — `app/marketplace/PublicMarketplaceLanding.tsx`

Three discrete deletions plus two cleanups.

#### 3.2.1 — Delete the `.topbar` strip

Search for the `<div className="topbar">` block (somewhere around line 855–870 — the row containing the breadcrumb `YOUSAFE · MARKETPLACE · ALL JURISDICTIONS`, the `.pill-mini` "X briefs available now", and the "For attorneys & consultants" + Help links). Delete the entire block.

If anything inside that strip is genuinely load-bearing for SEO (likely the breadcrumb), preserve it as a `<nav aria-label="Breadcrumb">` element rendered at the very top of the page **content**, below the shell TopNav and below the sub-nav, but never inside the chrome.

The "For attorneys & consultants" link survives — move it to the **footer**, not the header. The Help link survives — move to footer too.

The "X briefs available now" pill — delete. It's marketing fluff.

#### 3.2.2 — Delete the `<header className="nav">` block

The block at lines ~876–902 (brand mark + `<form className="nav-search">` + `<nav className="nav-links">`) is now redundant — the shell TopNav handles all three. Delete the entire `<header>` element.

#### 3.2.3 — Move the `country-bar` into the shell as a sub-nav

The `country-bar` at lines ~903–920 (Categories dropdown + Jurisdiction pills + "X briefs · USD" right-aligned) is real navigation — keep it, but **move it into `MarketplaceShell`** so it renders below the consolidated TopNav across every marketplace route (not just the landing).

Concretely:
- Lift the JSX block out of `PublicMarketplaceLanding.tsx`.
- Inside `MarketplaceShell.tsx`, render a new `<SubNav country={country} categoryCounts={…} totalActive={…} />` component immediately after `<TopNav>`.
- The `country` value the SubNav cares about comes from `useSearchParams()`. The Categories dropdown reads from `lib/categories.ts` (already imported elsewhere). The counts can be fetched via the existing `/api/marketplace/categories?country=...` endpoint OR omitted (the brief authorises omitting them — they are decorative, not load-bearing).
- The "X briefs · USD" right-aligned strip — delete; it duplicates info already shown in the landing's hero.

Hide the SubNav on routes where category/jurisdiction navigation is irrelevant (`/marketplace?view=messages`, `/marketplace?view=orders`, `/marketplace?view=inquiries`). Gate on `section === 'browse'` inside the shell.

#### 3.2.4 — `T` / `F` token usage stays exactly as it is

No palette change. Brief 38's editorial tokens are the visual source of truth.

#### 3.2.5 — Preserve the `<style jsx>` block

`PublicMarketplaceLanding.tsx`'s long `<style jsx>` (or template-string-style) block ships dozens of CSS rules. Most stay. The ones that now belong to the shell (`.cw-market header.nav`, `.cw-market .nav-search`, `.cw-market nav.nav-links`, `.cw-market .country-bar`) keep working because §3.1.4 puts the `.cw-market` class on the shell's root. Don't delete them.

### 3.3 — Final composite (what the rendered nav looks like after)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  YouSafe                Browse  Find Attorney   ┌──🔍 Search ───┐    🌐EN  Sign in [Open portal] │
│  Marketplace                                    └────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ☰ Categories ▾   |  Jurisdiction:  [All] [United States] [United Kingdom] [Canada]            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
[page content — landing hero, gigs grid, etc.]
```

Two rows of chrome. One brand mark. One auth cluster. Sub-nav lives below — distinct, not stacked.

---

## §4 — Acceptance gates (Claude runs before committing)

- `npx tsc --noEmit` clean. No `// @ts-nocheck` introduced.
- Hard-refresh `/marketplace` while **signed-out** — exactly one nav row visible; brand subtitle reads "Marketplace" (not "Consultant Portal"); right cluster reads `🌐EN  Sign in  [Open portal]` with visible whitespace between every element. Sub-nav (categories + jurisdiction pills) renders below.
- Hard-refresh `/marketplace` while **signed-in as a client** — same single-row nav; the right cluster is the avatar + dropdown from brief 39; sub-nav present; role tabs (`Browse / Marketplace / My Orders / Find Attorney / Inquiries / Messages` per the existing CLIENT_NAV) live in the centre of the TopNav.
- Hard-refresh `/marketplace/gigs/<any-active-slug>` — one TopNav, no sub-nav (gig detail doesn't need categories/jurisdiction in chrome).
- Hard-refresh `/marketplace?view=messages` while signed-in — one TopNav, no sub-nav, the inline UnifiedInbox mounts under it.
- `grep -rn '<header className="nav">' app/marketplace/PublicMarketplaceLanding.tsx` returns zero matches.
- `grep -rn '\.topbar"' app/marketplace/PublicMarketplaceLanding.tsx` returns zero matches.
- `grep -rn "country-bar" app/marketplace/PublicMarketplaceLanding.tsx` returns zero matches (moved into shell).
- `grep -rn "Consultant Portal" components/marketplace/MarketplaceShell.tsx` returns zero matches.

---

## §5 — Hand-off rhythm

This is a single-agent, single-commit brief. Return one standing-schema handoff once the worktree is locally green. Claude reviews, commits, pushes, no SQL to apply.

**Pre-authored commit message (Claude uses verbatim):**

```
fix(marketplace): consolidate nav to one row + declutter the chrome

Brief 42. Move marketplace navigation onto a single MarketplaceShell
TopNav and delete the duplicate `<header className="nav">` plus the
redundant `.topbar` and `country-bar` strips that PublicMarketplaceLanding
was stacking on top. Anonymous visitors now see one brand mark, one
auth cluster (Sign in / Open portal with proper whitespace), and one
sub-nav (categories + jurisdiction pills) — not four stacked rows.

Specifically:
  - MarketplaceShell.tsx brand subtitle no longer mislabels anonymous
    visitors as "Consultant Portal"; defaults to "Marketplace" when
    role is null / client / admin.
  - Search input + nav-links CSS scope moved onto the shell's root via
    a className="cw-market" wrapper, so MarketplaceAuthNav's signed-out
    anchors inherit the .cw-market nav.nav-links gap rule and stop
    rendering as "Sign inOpen portal" stuck together. Inline flex+gap
    style added to the signed-out branch as belt-and-braces.
  - PublicMarketplaceLanding loses its <header className="nav">, its
    .topbar strip, and its inline country-bar — those are now the
    shell's responsibility. The Help and "For attorneys & consultants"
    links migrate to the footer; the "X briefs available now" pill is
    removed as marketing fluff.
  - Sub-nav (Categories dropdown + Jurisdiction pills) lifts into a
    new <SubNav> rendered by MarketplaceShell directly below TopNav,
    gated on section === 'browse' so gig detail / messages / orders
    don't carry it.

No schema, no API, no new dependencies. tsc clean with no @ts-nocheck
re-introductions.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

---

## §6 — Out of scope (do not touch in 42)

- Brief 40 Parts C/D (student status flow + profile preview drawer). Those layer on top of the messenger; they're not the marketplace chrome.
- Brief 41 (per-user theme picker). Different surface area.
- The marketplace footer chrome (`EstateFooter` / `MarketplaceFooter`).
- The auth flow itself.
- Search results UX inside the search overlay.
- The cart icon (`CartIcon` from `components/cart/CartIcon.tsx`) — if it's rendered anywhere in the nav today, keep it where it sits in the auth-cluster.

---

## §7 — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives. Match brief 30 / 36 / 37 / 38 / 39 / 40 / 41 register exactly. The commit message in §5 is pre-authored; do not change it.

---

**Single agent, single commit, worktree only. Return the standing-schema handoff with all five §4 acceptance gates run locally.**
