# Brief 44 — Marketplace anon chrome polish (Fiverr-clean single bar)

**Owner:** Kimi. Single agent, single commit, worktree only.
**Repo:** `yousafe-portal`
**Deploy host:** `market.yousafeconsultancy.com`
**Sequencing:** 43 has shipped (`d8ec8d3`). 44 ships next. 41 (theme picker) follows 44.

---

## §1 — The problem (verbatim user evidence)

The marketplace anon viewer currently renders two stacked nav rows:

```
Row 1: YouSafe MARKETPLACE | Browse | Find Attorney | (search) | Sign in | Open portal | EN
Row 2: Categories ▼ | All | United States | United Kingdom | Canada
```

The user wants the anon chrome to match Fiverr's single-bar register:

```
fiverr. | Fiverr Pro ▼ | Explore ▼ | EN | Become a Seller | Sign in | Join
```

Single horizontal bar. No second row. Tight, sleek, commerce-grade.

This is a chrome polish only. No route changes. No auth changes. No content
reflows below the chrome.

---

## §2 — Hard fences

1. Do **not** touch `app/marketplace/page.tsx` (route gates were just fixed by
   Claude at `15b9d43`; the role check accepts `client` + `student` now).
2. Do **not** touch `middleware.ts`. Cross-host routing is correct.
3. Do **not** touch `components/marketplace/MarketplaceAuthNav.tsx` beyond
   trivial style tweaks if needed. Auth state surfacing is correct.
4. Do **not** re-introduce `// @ts-nocheck` anywhere.
5. Do **not** add dependencies. Use existing tokens (`T` / `F` from
   `components/marketplace/tokens.ts`) and existing primitives
   (`CategoriesMenu`, `CountryTabs`, `GlobalLanguageBar`).
6. Do **not** widen scope to authenticated viewers' nav. They get their own
   per-role NAV configs and those are out of scope.
7. Do **not** touch any file under `components/messaging/` or `lib/`. This
   brief is chrome-only and lives entirely in `components/marketplace/`.
8. Do **not** touch the hero, featured, jurisdictions, FAQ, footer, or any
   section of `app/marketplace/PublicMarketplaceLanding.tsx` below the
   chrome.
9. No SQL. No API routes. No schema. No env. No deploy commands.
10. Do **not** rename component exports. `MarketplaceShell` and `TopNav`
    keep their current names + signatures.

---

## §3 — Target chrome (single bar — anon viewer only)

Final anon layout — **one row, 56px tall**, sticky, blurred background:

```
[ Y YouSafe ]  [ Categories ▼ ]  [ ⚖ Find Attorney ]  [ ──── search ──── ]  [ Sign in ]  [ Open portal ]  [ 🌐 EN ▾ ]
```

Spacing rules:

- Brand cell width: auto (no border-right separator). Sits at far left.
- Categories dropdown: button styled identically to a nav tab. Opens the
  existing `CategoriesMenu` panel (already built). No new dropdown work.
- Find Attorney: nav tab, button styled.
- Search: takes remaining flex space, max-width 520px, pill shape.
- Sign in: text link.
- Open portal: solid CTA pill, indigo `T.indigo` background, white text.
- Language picker: `GlobalLanguageBar`, no border-left separator. Just a
  16px gap from the Open portal CTA.

**The `country-bar` second row is removed from chrome entirely** for anon
viewers. Jurisdiction switching lives in the hero `CountryPicker` (already
in `PublicMarketplaceLanding`) and the existing query-string flow.

---

## §4 — Authenticated viewers keep their current chrome shape

Brief 42 added per-role NAV configs (`CLIENT_NAV`, `ATTORNEY_NAV`,
`CONSULTANT_NAV`) and a sub-nav row gated on `section === 'browse'`. Do
not change those branches. Only the **anon branch** (role === null after
`roleLoaded` flips true) gets the new chrome.

After this brief, the rules are:

| Viewer state | Row 1 | Row 2 |
|---|---|---|
| Anon (`role === null`) | Brand · Categories ▼ · Find Attorney · Search · Sign in · Open portal · 🌐 | **none** |
| Client (`role === 'client'`) | Brand · Browse · My Orders · Find Attorney · Inquiries · Messages · 🌐 · Avatar | Categories · CountryTabs (browse only — unchanged) |
| Attorney | Brand · Marketplace · Inquiry Queue · My Inquiries · Active Orders · Messages · 🌐 · Avatar | Categories · CountryTabs (browse only — unchanged) |
| Consultant | Brand · Marketplace · Orders · Messages · 🌐 · Avatar | Categories · CountryTabs (browse only — unchanged) |

The sub-nav `country-bar` block in `MarketplaceShell` already renders only
when `section === 'browse'`. After this brief it must additionally render
only when **`role !== null`** (any signed-in role). Anon viewers never see
it.

---

## §5 — File-by-file edits

### `components/marketplace/MarketplaceShell.tsx`

1. **TopNav component** — the brand cell currently shows a two-line stack
   (`YouSafe` + subtitle like `Marketplace` / `Attorney Portal`). For anon
   viewers (`role === null`), render a **single-line brand**:

   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
     <span style={{
       width: 22, height: 22, borderRadius: 4,
       background: T.indigo, color: '#fff',
       display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
       fontFamily: F.display, fontWeight: 600, fontSize: 13,
     }}>Y</span>
     <span style={{
       fontFamily: F.display, fontSize: 17, fontWeight: 600,
       color: T.ink, letterSpacing: '0.005em',
     }}>YouSafe</span>
   </div>
   ```

   Signed-in viewers keep the two-line stack with their role-aware
   subtitle.

2. **Top bar height** — set the outer `<div>` (children container) `height`
   to **56px** and align children with `alignItems: 'center'` rather than
   the current `alignItems: 'stretch'` + per-cell `height: 48px`. The
   per-cell `height` props on the brand link, nav buttons, search form,
   and auth nav must all be removed. The bar is one height.

3. **Insert a Categories tab into the anon nav** — `navLinksForRole(null)`
   currently returns `[Browse, Find Attorney]`. Replace it with
   `[Categories, Find Attorney]` and render the Categories entry as a
   trigger that opens the existing `CategoriesMenu` dropdown rather than
   calling `onNav`. Implementation hint:

   ```tsx
   const isCategoriesTrigger = link.view === 'categories'
   if (isCategoriesTrigger) {
     return (
       <div key="categories" style={{ display: 'flex', alignItems: 'center' }}>
         <CategoriesMenu country={country} />
       </div>
     )
   }
   ```

   `CategoriesMenu` already renders its own button + panel. Re-style its
   trigger button (inside `CategoriesMenu.tsx`) to match the existing
   nav-tab register: `padding: '0 14px'`, `height: 32px`, `fontSize: 13`,
   `fontWeight: 500`, `color: T.inkSoft`, `background: 'transparent'`,
   `border: 'none'`. Same hover/active treatment as other nav buttons.

4. **Remove the static `Browse` tab from the anon list** — Categories
   covers it. Authenticated nav lists are unchanged.

5. **Remove the brand link's border-right** (`borderRight: \`1px solid ${T.ruleSoft}\``).
   Keep brand as a Link to portal dashboard for signed-in viewers, but
   for **anon viewers** the brand should link to `/marketplace` (the
   current page — i.e., `<Link href="/marketplace">`). Branching
   condition: `role === null` → `/marketplace`, else portal dashboard.

6. **Remove the language-bar separator** (`borderLeft: \`1px solid ${T.ruleSoft}\``).
   Keep the existing `paddingLeft: 12` so there's still visual
   separation, but no rule line.

7. **`MarketplaceAuthNav` separator** — same treatment. Remove the
   `borderLeft` on the wrapping div at the existing line. Keep the
   leading padding.

8. **Sub-nav gating** — the existing block at line ~379 gates on
   `roleLoaded && section === 'browse'`. Change to
   `roleLoaded && role !== null && section === 'browse'`. Anon viewers
   never see the country bar in chrome.

### `components/marketplace/CategoriesMenu.tsx`

Re-style the trigger button so it visually reads as a nav tab rather
than a pill on a pill row. Match the same height (32px), font size, and
hover treatment as the other nav buttons in `TopNav`. The dropdown panel
itself (categories list, jurisdiction count column, etc.) is unchanged.

### `components/marketplace/MarketplaceAuthNav.tsx`

Anon branch already returns:

```tsx
<nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <a href={`${PORTAL_URL}/sign-in/student`}>Sign in</a>
  <a className="cta" href={signUpHref}>Open portal</a>
</nav>
```

Apply explicit inline styles so the rendering doesn't depend on the
parent stylesheet:

```tsx
<a
  href={`${PORTAL_URL}/sign-in/student`}
  style={{
    fontFamily: F.ui, fontSize: 13, fontWeight: 500,
    color: T.ink, textDecoration: 'none',
    padding: '8px 14px', borderRadius: 999,
  }}
>Sign in</a>
<a
  href={signUpHref}
  style={{
    fontFamily: F.ui, fontSize: 13, fontWeight: 600,
    color: '#fff', textDecoration: 'none',
    background: T.indigo, padding: '8px 16px', borderRadius: 999,
  }}
>Open portal</a>
```

Avatar/menu branch (signed-in) is unchanged.

### `app/marketplace/PublicMarketplaceLanding.tsx`

No chrome edits remain in this file after brief 42. Leave untouched.
The `CountryPicker` inside the hero stays — it's the canonical
jurisdiction switcher for anon viewers now that the country-bar is
removed from chrome.

---

## §6 — Acceptance gates

Run all five locally. All must pass before handoff.

| # | Command / check | Expected |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0 |
| 2 | Visually load `market.yousafeconsultancy.com/` while signed out (or use an incognito window against the dev server) — single 56px bar, no second row. | matches §3 layout |
| 3 | `grep -n "country-bar" components/marketplace/MarketplaceShell.tsx` — anon should never render this block. | gated behind `role !== null` |
| 4 | `grep -rn "// @ts-nocheck" components/marketplace/` | unchanged from baseline (no new instances) |
| 5 | Load `/marketplace` while signed in as a client — confirm Row 2 (Categories + CountryTabs) still renders for the browse view. | sub-nav visible |

---

## §7 — Hand-off rhythm

Single agent, single commit, worktree only. Return one standing-schema
handoff once all five gates are locally green. Claude reviews the
worktree diff, runs the gates, then commits + pushes with this
pre-authored message:

```
fix(marketplace): single-bar anon chrome (Fiverr-clean register)

Brief 44. The anon marketplace chrome rendered two stacked rows — a
top nav plus a country/categories sub-row — which read heavier than
the commerce reference (Fiverr's single sleek bar). For anon viewers
only:

  1. Collapse to one 56px sticky bar. Brand, Categories dropdown,
     Find Attorney, search, Sign in, Open portal, language picker —
     left to right, single line.
  2. Drop the second-row country-bar from chrome. Jurisdiction
     switching already lives in the hero CountryPicker and the
     ?country= query-string flow.
  3. Single-line brand cell — drop the role-aware subtitle on the
     anon branch (subtitle was 'Marketplace' which doubled the
     brand name anyway).
  4. Categories becomes a first-class nav trigger (replacing the
     standalone Browse tab — Categories covers browse).
  5. Inline-style the signed-out auth links so Sign in renders as a
     plain text link and Open portal renders as a solid indigo CTA
     pill regardless of stylesheet load order.

Authenticated viewers (client / attorney / consultant) keep their
existing two-row chrome with per-role NAV configs and the browse-
gated sub-nav. The sub-nav is now additionally gated on role !== null
so the country-bar can never bleed into anon view.

No schema, API, or dependency changes. npx tsc --noEmit clean.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

---

## §8 — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person
imperatives ("Replace…", "Add…", "Do not…"). Match brief 30 / 36 / 37 /
38 / 39 / 40 / 41 / 42 / 43 register exactly. The commit message in §7
is pre-authored; do not change it.

---

## §9 — Role boundary reminder

**You write source code in the worktree only.** You do **not** run
`git add`, `git commit`, `git push`, `git stash`, `git merge`,
`git rebase`, any Supabase Management API call, or any deploy command.
You do **not** apply SQL (this brief has none anyway). You return one
standing-schema handoff with the literal line "Worktree-ready for
Claude review." and stop there.

Two prior sequencing breaches on record. The next unauthorized git
operation gets the offending commit reverted on sight regardless of
substance.

Claude reviews, commits with the §7 message verbatim, pushes, and
posts an APPROVED verdict before brief 41 begins.
