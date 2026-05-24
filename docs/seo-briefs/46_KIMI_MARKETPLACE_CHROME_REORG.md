# Brief 46 — Marketplace Chrome Reorg + Auth Nav Swap + Footer Cleanup

**Owner:** Kimi  •  **Reviewer:** Claude  •  **Repo:** yousafe-portal
**Status:** Worktree-ready
**Predecessor commits:** 45 (`9d32955`), 45-hotfix (`42bc765`), 44 (`2a55feb`)

---

## 0. Goal

Three independent streams of work, **runnable in parallel as three disjoint swarms** (A, B, C). Disjoint file sets → genuinely parallel → one focused commit per swarm.

| Swarm | Theme | Files touched |
|---|---|---|
| **A** | Chrome reorg (jurisdiction → top header dropdown; categories → horizontal bar with portaled mega-dropdowns) | `MarketplaceShell.tsx`, new `JurisdictionDropdown.tsx`, new `CategoryBar.tsx`, new `CategoryMegaDropdown.tsx`, **delete** `CategoriesMenu.tsx` |
| **B** | Auth nav swap (replace "Open portal" with "Join Panel" → attorney lane modal; move "Sign in" to last → student lane modal; both open Clerk in-place via `clerk.openSignUp` / `clerk.openSignIn`) | `MarketplaceAuthNav.tsx` (anon branch only — signed-in avatar menu untouched) |
| **C** | Footer cleanup (remove orphan "For attorneys & consultants ┃ Help" utility row above footer; collapse duplicate brand inside `MarketplaceFooter`; absorb "Help" into footer nav) | `MarketplaceFooter.tsx`, surgical 5-line removal in `PublicMarketplaceLanding.tsx` |

**File overlap check (must remain disjoint):**
- Swarm A touches `MarketplaceShell.tsx`. Swarm B does **not** touch the shell — only `MarketplaceAuthNav.tsx`. Swarm C does **not** touch the shell.
- Swarm B touches `MarketplaceAuthNav.tsx`. Swarms A and C don't.
- Swarm C touches `MarketplaceFooter.tsx` + a 5-line removal in `PublicMarketplaceLanding.tsx`. Swarm A explicitly does NOT touch `PublicMarketplaceLanding.tsx`. No overlap.

Spawn three parallel sub-agents in your worktree, one per swarm. Each returns its own handoff (see §5). I will commit each as a focused commit per §6.

Do **not** touch outside the swarm's file list:
- `components/messaging/*` (any swarm)
- `lib/categories.ts` (any swarm — data contract is frozen)
- `components/marketplace/tokens.ts` (read only — that's the design-token source)
- `components/marketplace/HeroCaseFileSlideshow.tsx` (Brief 45 hotfix, frozen)
- `components/marketplace/CountryTabs.tsx` — keep the file (the `CountryPicker` export is still used by `PublicMarketplaceLanding`'s hero search). Only swarm A may delete it if `git grep "CountryTabs\b"` returns zero results AND `git grep "CountryPicker\b"` is the only export still used. Safer default: leave the file alone in swarm A.

---

## 1. Information you need before you start

Run these (all swarms benefit from reading):

```
git log --oneline -8
cat components/marketplace/MarketplaceShell.tsx
cat components/marketplace/MarketplaceAuthNav.tsx
cat components/marketplace/MarketplaceFooter.tsx
cat components/marketplace/CategoriesMenu.tsx
cat components/marketplace/CountryTabs.tsx
cat lib/categories.ts | head -100
grep -n "EstateFooter\|MarketplaceFooter\|For attorneys &amp; consultants" app/marketplace/PublicMarketplaceLanding.tsx | head -20
grep -n "lane\|unsafeMetadata" app/sign-up/\[\[...rest\]\]/SignUpClient.tsx | head -10
```

Key facts (trust these — do not re-derive):

- `MarketplaceShell.tsx` renders two rows of chrome. Row 1 (`<TopNav>`): logo + role-based nav links + auth nav + lang. Height **72px** (Brief 45). Nav links wrapped in `<nav style={{ overflowX: 'auto' }}>`. **That overflowX is what clips the current anon `CategoriesMenu` dropdown — root cause of the "doesn't expand" bug.** Row 2 (`.country-bar`): rendered when `roleLoaded && role !== null && section === 'browse'`. Currently contains `<CategoriesMenu>` + `<CountryTabs>`.
- The anon flow puts `CategoriesMenu` *inside* `<TopNav>`'s `<nav>`. That's where the clip occurs.
- `CountryPicker` (a separate export inside `CountryTabs.tsx`) is used inside `PublicMarketplaceLanding`'s hero search and **must keep working**.
- `CATEGORIES` from `lib/categories.ts` has **8** entries in source order: `immigration`, `education`, `legal`, `settlement`, `career`, `business`, `credentials`, `mentorship`. Each has `id`, `name` (with " Services" suffix on some), `icon` (emoji), `description`, `subcategories[]` where each sub has `id` and `name`.
- The `country` URL param values are `'all' | 'us' | 'uk' | 'ca'`. Hash `#jurisdictions` is used today for scroll anchoring — you do not need to preserve the hash on the new dropdown.
- The `.cw-cat-*` and `.cw-cat-trigger` CSS classes live inside the `CSS` string in `PublicMarketplaceLanding.tsx` (scoped to `.cw-market`). The signed-in shell does not pull in that stylesheet. **Do NOT rely on those legacy classes in new components — inline every style.**
- The auth lane mechanism: the sign-up Clerk component is `<SignUp ... unsafeMetadata={{ requestedRole: lane, signupSource: source }} forceRedirectUrl={redirectUrl} />`. Lane comes from URL path segment in the dedicated `/sign-up/<lane>` route. For modal mode, `clerk.openSignUp({ unsafeMetadata: { requestedRole: 'attorney', signupSource: 'marketplace_join_panel' } })` plumbs the same metadata.
- Clerk modal mode is supported via `clerk.openSignUp(...)` and `clerk.openSignIn(...)` from `useClerk()`. The existing component already imports `useClerk`. No new dependencies.
- The footer renders inside `PublicMarketplaceLanding.tsx` at line 1176 (`<MarketplaceFooter />`). The orphan utility row immediately above (lines 1170-1174) is the source of the disconnected "For attorneys & consultants ┃ Help" floating above the gradient stripe in the screenshot. That row is leftover — it predates `MarketplaceFooter` having a "For attorneys" link.

---

## 2. Build steps

### ──────────────────────────────────────────────────────────────────────
### SWARM A — Chrome reorg
### ──────────────────────────────────────────────────────────────────────

#### A.1 — New component: `components/marketplace/JurisdictionDropdown.tsx`

Self-contained client component. Inline styles only.

**Behavior:**
- Trigger reads: `🌐 <active label> ▼` where `<active label>` is one of `"All jurisdictions"`, `"United States"`, `"United Kingdom"`, `"Canada"`.
- Click toggles a panel anchored beneath the trigger.
- Panel lists four options vertically. Click → `router.push(<pathname>?<params>)` with `country=` set (omitted for `all`). Preserve other params (`category`, `subcategory`, `view`).
- Active option is bolded + indigo `✓` glyph on the right.
- Closes on outside mousedown, Escape, option select.
- Trigger ~180px wide, panel 220px.

**Props:**
```ts
interface Props {
  active: 'all' | 'us' | 'uk' | 'ca'
}
```

**Inline-style spec (match exactly):**
- Trigger: `display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: 999px; border: 1px solid ${T.rule}; background: ${T.vellum}; font-family: ${F.ui}; font-size: 13px; font-weight: 500; color: ${T.inkSoft}; cursor: pointer; transition: all 0.12s;`
- Trigger hover: `color: ${T.ink}; border-color: ${T.inkMid};`
- Trigger when open: `background: ${T.ink}; color: #fff; border-color: ${T.ink};`
- Panel: `position: absolute; top: calc(100% + 6px); right: 0; z-index: 220; min-width: 220px; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 12px; box-shadow: 0 20px 40px -16px rgba(15,23,42,0.18); padding: 6px; font-family: ${F.ui};`
- Option row: `display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-radius: 8px; font-size: 13px; color: ${T.ink}; cursor: pointer;`
- Option hover: `background: ${T.paper2};`
- Active check: `color: ${T.indigo}; font-weight: 600;`

#### A.2 — New component: `components/marketplace/CategoryMegaDropdown.tsx`

Renders the subcategory panel for one category. Used by `CategoryBar`.

**Props:**
```ts
import type { Category } from '@/lib/categories'

interface Props {
  category: Category
  country: 'all' | 'us' | 'uk' | 'ca'
  anchorRect: DOMRect | null
  onClose: () => void
  onNavigate: () => void
}
```

**Behavior:**
- Returns `null` if `anchorRect` is null.
- **Renders via `createPortal(node, document.body)`.** Mount the portal target in `useEffect`, clean up on unmount. This is the critical fix that prevents the panel from being clipped by any `overflow-x: auto` ancestor (the root cause of the legacy anon "doesn't expand" bug).
- Panel position: `position: fixed; top: ${anchorRect.bottom + 8}px; left: ${anchorRect.left}px;` — clamp `left` so the right edge stays within `window.innerWidth - 16`.
- Panel content (single-column, lighter than legacy two-column):
  - Header: `<icon> <name without ' Services'>` (display font, 19px) + one-line description (`T.inkSoft`, 13px)
  - Subcategory grid: 2 columns × up to 6 rows = max 12 subs. Use `category.subcategories.slice(0, 12)`.
  - Footer link: `See all {name} →` to `/marketplace?category={id}` + `&country={country}` when `country !== 'all'`.
- URL format:
  - Top header link: `/marketplace?category=${cat.id}` + `&country=${country}` when `country !== 'all'`
  - Sub link: `/marketplace?category=${cat.id}&subcategory=${sub.id}` + `&country=${country}` when `country !== 'all'`
- Outside mousedown or Escape → `onClose()`. Any link click → `onNavigate()`.
- Width 380px. Padding 22px. Border-radius 14px.

**Style spec:**
- Container: `background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 14px; padding: 22px 24px; box-shadow: 0 30px 60px -20px rgba(15,23,42,0.25); width: 380px; max-width: calc(100vw - 32px); font-family: ${F.ui}; z-index: 240;`
- Header eyebrow: `font-family: ${F.display}; font-size: 19px; font-weight: 500; color: ${T.ink}; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;`
- Header description: `font-size: 13px; line-height: 1.5; color: ${T.inkMid}; margin: 0 0 14px;`
- Sublist: `list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px;`
- Sublist link: `display: block; padding: 5px 0; font-size: 13px; color: ${T.inkMid}; border-bottom: 1px dashed transparent;`
- Sublist link hover: `color: ${T.ink}; border-bottom-color: ${T.rule};`
- Footer CTA: `display: block; margin-top: 14px; padding-top: 10px; border-top: 1px solid ${T.rule}; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.indigo};`
- Footer CTA hover: `color: ${T.indigoDeep};`

#### A.3 — New component: `components/marketplace/CategoryBar.tsx`

Horizontal category row. Replaces both the old `CategoriesMenu` trigger and the old `.country-bar` section.

**Props:**
```ts
interface Props {
  country: 'all' | 'us' | 'uk' | 'ca'
}
```

**Behavior:**
- Renders all 8 `CATEGORIES` in source order as horizontal triggers.
- Trigger label: `{icon} {name.replace(' Services', '')} ▼`.
- **Click-to-open** (not hover). Only one dropdown open at a time. Reopening the same trigger toggles closed.
- Track anchor `DOMRect` via `useRef` + `getBoundingClientRect()` at open time. Re-measure on `window.resize` (debounced 100ms). Close on `window.scroll` (simpler than re-anchoring).
- Mobile narrow (`max-width: 900px`): allow horizontal scroll on the bar — `overflow-x: auto; scrollbar-width: none;`. Dropdowns are portaled to `document.body`, so they're immune to this scroll container's clipping (the fix).
- Active state: when URL `?category=` matches a trigger, the trigger renders with `color: T.ink; font-weight: 600;` and a 2px `T.indigo` underline below.

**Style spec:**
- Container (row): `border-bottom: 1px solid ${T.rule}; background: ${T.vellum};`
- Inner: `max-width: 1280px; margin: 0 auto; padding: 0 28px; display: flex; align-items: center; gap: 4px; height: 52px; overflow-x: auto; scrollbar-width: none;`
- Trigger button: `display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; height: 36px; border-radius: 999px; border: 1px solid transparent; background: transparent; font-family: ${F.ui}; font-size: 13.5px; font-weight: 500; color: ${T.inkMid}; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.12s;`
- Trigger hover: `color: ${T.ink}; background: ${T.paper2};`
- Trigger when its dropdown is open: `background: ${T.ink}; color: #fff;`
- Trigger active (URL category matches): rendered with an underline sibling div: 2px high, `${T.indigo}` background, full-width inside a `position: relative` wrapper.
- Caret glyph (▼): inline SVG, 10×10, `stroke="currentColor"`, opacity 0.7.

#### A.4 — Update: `components/marketplace/MarketplaceShell.tsx`

**A. Imports** — replace:
```tsx
import { CategoriesMenu } from './CategoriesMenu'
import { CountryTabs } from './CountryTabs'
```
with:
```tsx
import { JurisdictionDropdown } from './JurisdictionDropdown'
import { CategoryBar } from './CategoryBar'
```

**B. Anon `navLinksForRole(null)` — remove the inline "Categories" pseudo-link.**
Change to:
```tsx
return [
  { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
]
```

**C. `TopNav` body — remove the `'categories'` branch + add `JurisdictionDropdown` for signed-in users.**

Delete the entire `if (link.view === 'categories')` branch inside `links.map(...)`.

Before the `<MarketplaceAuthNav>` block, insert (signed-in only):
```tsx
{role !== null && (
  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
    <JurisdictionDropdown active={country} />
  </div>
)}
```

`country` is already passed into `TopNav`. Keep it.

**D. Sub-nav row — replace old country-bar with `CategoryBar`.**

Replace the existing `{roleLoaded && role !== null && section === 'browse' && (...)}` block (currently with `.country-bar` + `CategoriesMenu` + `CountryTabs`) with:
```tsx
{roleLoaded && section === 'browse' && (
  <CategoryBar country={country} />
)}
```

Note: the `role !== null` guard is **removed** — `CategoryBar` shows for both anon AND signed-in.

**E. Anon top-row stays clean.** Do NOT add `JurisdictionDropdown` to the anon top row. Anon's jurisdiction selection happens via the hero `CountryPicker` and via the new `CategoryBar` carrying the active country through deep links. Anon top row remains: logo + Find Attorney + (Swarm B's Join Panel + Sign in) + Lang.

#### A.5 — Delete: `components/marketplace/CategoriesMenu.tsx`

After Swarm A's `MarketplaceShell.tsx` edits land, run `git grep "CategoriesMenu\b"` to confirm zero remaining callers. If clean, delete the file. If anything still imports it, fix that caller first.

Do NOT touch the `.cw-cat-*` CSS inside `PublicMarketplaceLanding.tsx` — that CSS becomes dead but removing it risks side effects in the hero panel of the landing. Leave it.

### ──────────────────────────────────────────────────────────────────────
### SWARM B — Auth nav swap (Open portal → Join Panel; Sign in → last; both modal)
### ──────────────────────────────────────────────────────────────────────

Touch only `components/marketplace/MarketplaceAuthNav.tsx`. Anon branch (`!isSignedIn`) only — signed-in avatar dropdown is unchanged.

#### B.1 — Restructure the anon branch

Current order: `[Sign in (text)] [Open portal (indigo pill)]`.
Target order: `[Join Panel (indigo pill)] [Sign in (text)]` — Sign in becomes the rightmost item.

Replace the inline `<a href={...}>Sign in</a>` + `<a href={signUpHref}>Open portal</a>` with two buttons:

```tsx
<nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }} suppressHydrationWarning>
  <button
    type="button"
    onClick={() => clerk.openSignUp({
      unsafeMetadata: { requestedRole: 'attorney', signupSource: 'marketplace_join_panel' },
      afterSignUpUrl: `${PORTAL_URL}/dashboard`,
      afterSignInUrl: `${PORTAL_URL}/dashboard`,
      signInUrl: `${PORTAL_URL}/sign-in/attorney`,
    })}
    style={{
      fontFamily: F.ui, fontSize: 13, fontWeight: 600,
      color: '#fff', background: T.indigo,
      padding: '8px 16px', borderRadius: 999,
      border: 'none', cursor: 'pointer',
    }}
  >Join Panel</button>
  <button
    type="button"
    onClick={() => clerk.openSignIn({
      afterSignInUrl: `${PORTAL_URL}/dashboard`,
      signUpUrl: `${PORTAL_URL}/sign-up/student`,
    })}
    style={{
      fontFamily: F.ui, fontSize: 13, fontWeight: 500,
      color: T.ink, background: 'transparent',
      padding: '8px 14px', borderRadius: 999,
      border: 'none', cursor: 'pointer',
    }}
  >Sign in</button>
</nav>
```

**Key behaviors:**
- "Join Panel" opens the Clerk **sign-up modal** in-place via `clerk.openSignUp(...)`. `unsafeMetadata: { requestedRole: 'attorney', signupSource: 'marketplace_join_panel' }` plumbs the attorney lane through Clerk's metadata, exactly matching the mechanism used by the existing `/sign-up/attorney` route (`app/sign-up/[[...rest]]/SignUpClient.tsx` reads `unsafeMetadata.requestedRole` to set lane). The `signInUrl` fallback points to the attorney sign-in route in case the user already has an account.
- "Sign in" opens the Clerk **sign-in modal** in-place via `clerk.openSignIn(...)`. `signUpUrl` fallback routes them to the student sign-up route if they need to create an account from inside the modal — matching the "Sign in is for students" intent.
- Both methods come from the `useClerk()` hook that's already imported at the top of the file. No new imports required.
- The `signUpHref` prop is now unused inside the component, but **keep accepting it** to avoid changing the props contract. Add a comment: `// signUpHref is preserved for backward compat; modal flow uses Clerk methods directly.`

#### B.2 — Acceptance points for Swarm B

- The anon nav order on the marketplace top header reads (left→right): logo, Find Attorney (from shell), `Join Panel` (indigo button), `Sign in` (text), 🌐 EN.
- Clicking `Join Panel` opens the Clerk sign-up modal **in-place** — no full-page redirect. Closing the modal returns to the marketplace landing intact.
- Clicking `Sign in` opens the Clerk sign-in modal in-place.
- After successful sign-up via Join Panel, user lands at `${PORTAL_URL}/dashboard` with attorney lane set up via `unsafeMetadata.requestedRole`.
- The signed-in branch (avatar + dropdown menu) is **byte-identical** to before — no diff there.
- `npx tsc --noEmit` clean.

### ──────────────────────────────────────────────────────────────────────
### SWARM C — Footer cleanup
### ──────────────────────────────────────────────────────────────────────

Touch `components/marketplace/MarketplaceFooter.tsx` + a 5-line removal in `app/marketplace/PublicMarketplaceLanding.tsx`.

#### C.1 — Remove orphan utility row in `PublicMarketplaceLanding.tsx`

Locate (currently lines 1170-1174):

```tsx
{/* Footer utility links */}
<div className="wrap" style={{ display: 'flex', justifyContent: 'center', gap: '24px', padding: '24px 20px 8px', fontSize: '13px', color: T.inkSoft }}>
  <a href={`${PORTAL_URL}/sign-up/attorney`} style={{ color: 'inherit', textDecoration: 'none' }}>For attorneys &amp; consultants</a>
  <a href="#faq" style={{ color: 'inherit', textDecoration: 'none' }}>Help</a>
</div>
```

**Delete this entire block.** It's the orphan row floating above the footer gradient stripe in the screenshot. Its replacements are folded into the footer nav by §C.2.

After deletion, the file should go directly from the FAQ section's closing `</section>` to `<MarketplaceFooter />`.

#### C.2 — Restructure `MarketplaceFooter.tsx`

Make these exact changes:

**A. NAV_LINKS array** — fold in "Help" + restate consolidated link list. Replace:
```ts
const NAV_LINKS: FooterLink[] = [
  { label: 'Browse', href: '/marketplace' },
  { label: 'Categories', href: '/marketplace/categories' },
  { label: 'For attorneys', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' },
  { label: 'For consultants', href: 'https://portal.yousafeconsultancy.com/sign-up/consultant' },
  { label: 'Open portal', href: 'https://portal.yousafeconsultancy.com/' },
]
```
with:
```ts
const NAV_LINKS: FooterLink[] = [
  { label: 'Browse', href: '/marketplace' },
  { label: 'Categories', href: '/marketplace/categories' },
  { label: 'For attorneys', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' },
  { label: 'For consultants', href: 'https://portal.yousafeconsultancy.com/sign-up/consultant' },
  { label: 'Open portal', href: 'https://portal.yousafeconsultancy.com/' },
  { label: 'Help', href: '#faq' },
]
```

**B. Remove the duplicate brand block.** The footer currently renders both:
1. `<div className="cw-mkt-footer-brand-row">` at the top (Y mark + "YouSafe Marketplace" + tagline) — line 146-150
2. `<a className="cw-mkt-brand">` inside `cw-mkt-footer-wrap` (smaller Y mark + "YouSafe Marketplace") — line 152-155

Keep #1 (the prominent block with the tagline). **Delete #2** (the small brand inside the wrap). Update `cw-mkt-footer-wrap`'s grid template:
```css
grid-template-columns: minmax(0, auto) 1fr minmax(0, auto);
```
becomes:
```css
grid-template-columns: 1fr minmax(0, auto);
```
And the mobile rule stays at `grid-template-columns: 1fr;`.

So `cw-mkt-footer-wrap` now contains exactly two children:
1. `<nav className="cw-mkt-nav">{NAV_LINKS}</nav>`
2. `<div className="cw-mkt-footer-legal-row">© year · Privacy · Terms · Refund policy · Disclaimer</div>`

**C. Reduce vertical padding** that creates excess whitespace between the brand-row and the nav-row.

Change:
```css
.cw-mkt-footer-wrap {
  ...
  padding: 44px 0 16px;
  ...
}
```
to:
```css
.cw-mkt-footer-wrap {
  ...
  padding: 18px 0 16px;
  ...
}
```

And change:
```css
.cw-mkt-footer-brand-row {
  ...
  padding: 0 0 20px;
  ...
}
```
to:
```css
.cw-mkt-footer-brand-row {
  ...
  padding: 28px 0 14px;
  ...
}
```

The brand-row gets top padding so it sits a comfortable distance below the gradient stripe. The wrap loses the redundant 44px top padding.

**D. The other CSS (`.cw-mkt-brand`, `.cw-mkt-brand-mark`, `.cw-mkt-brand-name`)** becomes unused. Delete those three rules from the `<style>` block to keep the file tidy. Confirm by `grep "cw-mkt-brand"` returning only the brand-row references (which are different class names: `.cw-mkt-footer-brand-row .mark`, `.cw-mkt-footer-brand-row .wordmark`).

#### C.3 — Acceptance points for Swarm C

- The orphan "For attorneys & consultants ┃ Help" row above the gradient stripe is gone.
- The footer renders exactly one brand block (with tagline) at the top, followed by a single tight row of: nav links centered + legal links right-aligned.
- "Help" link is in the nav row, jumps to `#faq` (the FAQ section on the same page).
- Disclaimer paragraph at the bottom is unchanged.
- Vertical whitespace inside the footer feels tight, not airy.
- `npx tsc --noEmit` clean.

---

## 3. Acceptance gates (all swarms — verify before any handoff)

1. **TypeScript clean.** `npx tsc --noEmit` returns no errors across all three swarms' diffs.
2. **Anon view (`market.yousafeconsultancy.com`, signed out):**
   - Top header row left→right: logo, Find Attorney, `Join Panel` (indigo button), `Sign in` (text link), 🌐 EN.
   - Clicking `Join Panel` opens Clerk's **sign-up modal in-place** (no redirect). Modal sign-up carries `unsafeMetadata.requestedRole = 'attorney'`.
   - Clicking `Sign in` opens Clerk's **sign-in modal in-place**.
   - Second row: `CategoryBar` showing all 8 categories spread horizontally. Each opens a single-column mega-dropdown via portal. **No clipping** — verify all 8.
   - Subcategory click → navigates to `/marketplace?category=X&subcategory=Y`.
   - Footer: gradient stripe → brand-row with tagline → tight nav row (Browse · Categories · For attorneys · For consultants · Open portal · Help) + legal row (© year · Privacy · Terms · Refund policy · Disclaimer) → disclaimer paragraph. No orphan utility row.
3. **Signed-in view (any role) on browse:**
   - Top header row: logo, role nav buttons, **🌐 active-label ▼** (JurisdictionDropdown), avatar/auth menu, 🌐 EN.
   - Clicking JurisdictionDropdown opens a 4-option panel. Selecting updates URL `?country=X`.
   - Second row: same `CategoryBar` as anon. All 8 categories. Category dropdown deep links carry `&country=X`.
4. **Mobile narrow (≤900px):** `CategoryBar` scrolls horizontally. Mega-dropdowns still fully visible (portal guarantees this).
5. **Resize / scroll:** dropdown stays anchored beneath its trigger on resize (debounced re-measure). On window scroll while a dropdown is open, close it.
6. **A11y:** triggers have `aria-haspopup="true"` + `aria-expanded`. Panels close on Escape. Focus is not trapped.
7. **No regressions:**
   - WhatsApp identity tokens in messenger byte-identical (no diff under `components/messaging/`).
   - Brief 41 Part A theme system unaffected.
   - `PublicMarketplaceLanding.tsx` hero, featured grid, trust bar, jurisdiction rail, how-it-works, quotes, seller CTA, payments, FAQ all still render. Only the orphan footer utility row is removed.
   - Brand link href unchanged.
   - Signed-in avatar dropdown (auth nav signed-in branch) byte-identical.

---

## 4. ROLE BOUNDARY — non-negotiable (all swarms)

- Worktree only. **Do not** run `git add`, `git commit`, `git push`, `git stash`, `git rebase`, `git merge`, or any branch op.
- Do not run deploy / wrangler / Cloudflare commands.
- Do not run Supabase Management API calls (no SQL in this brief).
- Do not edit files outside each swarm's stated file list.
- Each swarm sub-agent ends its return with `"Worktree-ready for Claude review."` and stops.

Two prior sequencing breaches are on record. The next unauthorized git op gets the commit reverted on sight regardless of substance.

---

## 5. Handoff schema (return one block per swarm — A, B, C)

```
## Brief 46 — Swarm A (Chrome reorg) — handoff

### Files changed
- [path] — one-line note

### Files created
- [path]

### Files deleted
- [path or "none"]

### TypeScript
- npx tsc --noEmit → [clean | errors below]

### Acceptance gates (Swarm A subset of §3)
- 3.1 tsc clean: [yes|no]
- 3.2 anon CategoryBar renders 8 cats + portaled dropdown not clipped: [yes|no]
- 3.3 signed-in JurisdictionDropdown + CategoryBar: [yes|no]
- 3.4 mobile narrow scroll + dropdown visible: [yes|no]
- 3.6 a11y attrs: [yes|no]
- 3.7 zero unrelated diffs: [yes|no]

### Notes / deviations
- [anything]

Worktree-ready for Claude review.
```

```
## Brief 46 — Swarm B (Auth nav swap) — handoff

### Files changed
- components/marketplace/MarketplaceAuthNav.tsx — one-line note

### TypeScript
- npx tsc --noEmit → [clean | errors below]

### Acceptance gates (Swarm B subset of §3)
- 3.1 tsc clean: [yes|no]
- 3.2 Join Panel + Sign in order, modals open in-place: [yes|no]
- 3.2 unsafeMetadata.requestedRole='attorney' set on Join Panel: [yes|no]
- 3.7 signed-in avatar branch byte-identical: [yes|no]

### Notes / deviations
- [anything]

Worktree-ready for Claude review.
```

```
## Brief 46 — Swarm C (Footer cleanup) — handoff

### Files changed
- components/marketplace/MarketplaceFooter.tsx — one-line note
- app/marketplace/PublicMarketplaceLanding.tsx — 5-line removal of orphan utility row

### TypeScript
- npx tsc --noEmit → [clean | errors below]

### Acceptance gates (Swarm C subset of §3)
- 3.1 tsc clean: [yes|no]
- 3.2 orphan row gone, footer tight, Help link in nav row: [yes|no]
- 3.7 disclaimer paragraph unchanged: [yes|no]

### Notes / deviations
- [anything]

Worktree-ready for Claude review.
```

---

## 6. Pre-authored commit messages (Claude uses each verbatim, one per swarm)

**Swarm A:**
```
feat(marketplace): reorg chrome — jurisdiction dropdown + category bar

Moves jurisdiction (All/US/UK/CA) from second-row pills to a single
dropdown in the top header (signed-in only). Replaces "Categories ▼"
trigger with a horizontal CategoryBar that spreads all 8 categories
as top-level items, each opening a portaled subcategory mega-dropdown.

Fixes the anon "Categories doesn't expand" regression — the legacy
CategoriesMenu panel was being clipped by overflow-x: auto on its
parent <nav>. CategoryMegaDropdown renders via createPortal into
document.body, immune to ancestor overflow clipping.

Files:
- new: components/marketplace/JurisdictionDropdown.tsx
- new: components/marketplace/CategoryBar.tsx
- new: components/marketplace/CategoryMegaDropdown.tsx
- mod: components/marketplace/MarketplaceShell.tsx
- del: components/marketplace/CategoriesMenu.tsx (zero callers)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm B:**
```
feat(marketplace): join panel + in-place clerk modal sign-in

Anon nav order swaps: "Open portal" becomes "Join Panel" (indigo CTA,
attorney lane) and moves left; "Sign in" (student lane) moves to the
rightmost slot. Both buttons now open Clerk's modal in-place via
clerk.openSignUp / clerk.openSignIn instead of redirecting to the
hosted sign-up/sign-in pages. unsafeMetadata.requestedRole plumbs
the lane through to the existing post-signup lane setup.

Signed-in avatar branch unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**Swarm C:**
```
fix(marketplace): footer cleanup — drop orphan utility row, dedupe brand

Removes the floating "For attorneys & consultants ┃ Help" row that was
rendering between the FAQ section and MarketplaceFooter, visually
disconnected from the footer's gradient stripe. The two links are
absorbed into the footer nav (For attorneys remains; Help is added
pointing at #faq).

Also removes the duplicate brand block inside cw-mkt-footer-wrap
(the prominent brand-row with tagline at the top stays). Tightens
vertical padding to remove excess whitespace.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```
