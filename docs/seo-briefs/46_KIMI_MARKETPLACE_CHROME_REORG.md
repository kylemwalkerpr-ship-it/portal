# Brief 46 — Marketplace Chrome Reorg (jurisdiction → top bar, categories spread)

**Owner:** Kimi  •  **Reviewer:** Claude  •  **Repo:** yousafe-portal
**Status:** Worktree-ready
**Predecessor commits:** 45 (`9d32955`), 45-hotfix (`42bc765`), 44 (`2a55feb`)

---

## 0. Goal

Restructure the marketplace chrome so:

1. **Signed-in users** — jurisdiction selector (All / US / UK / CA) **moves up to the top header row** behind a single **"Select jurisdiction ▼"** dropdown trigger. The second row becomes a **category bar** with each category rendered as its own top-level item with a subcategory mega-dropdown (no single "Categories ▼" wrapper).
2. **Anonymous users** — same category bar treatment (categories spread across as separate top-level items with subcategory dropdowns).
3. **Fix the live regression:** the anon "Categories ▼" trigger currently opens the panel but the panel is **clipped by `overflow-x: auto` on the parent `<nav>`**, making it look broken. The new structure removes the clipping problem entirely. Also covered: ensure the new category dropdowns can never be clipped again (render via portal, see §2.4).

You must touch:

- `components/marketplace/MarketplaceShell.tsx`
- `components/marketplace/CategoriesMenu.tsx` (will be replaced by two new components — see §2)
- New: `components/marketplace/JurisdictionDropdown.tsx`
- New: `components/marketplace/CategoryBar.tsx`
- New: `components/marketplace/CategoryMegaDropdown.tsx`

Do **not** touch:
- `components/marketplace/MarketplaceAuthNav.tsx` (Brief 44, frozen)
- `components/marketplace/MarketplaceFooter.tsx` (Brief 45, frozen)
- `components/marketplace/HeroCaseFileSlideshow.tsx` (Brief 45 hotfix, frozen)
- `components/marketplace/CountryTabs.tsx` — keep the file (`CountryPicker` is still used by `PublicMarketplaceLanding`'s hero search). Drop the `CountryTabs` export only if it has zero remaining callers after this brief. Run `git grep "CountryTabs"` to verify before removing.
- `app/marketplace/PublicMarketplaceLanding.tsx` (hero, FAQs, JSON-LD all stay)
- `lib/categories.ts` (data contract is frozen — eight categories with `id`, `name`, `icon`, `description`, `subcategories`)
- `components/marketplace/tokens.ts` (`T` and `F` are the design tokens — read only)

---

## 1. Information you need before you start

Run these so you understand the current code surface:

```
git log --oneline -8
cat components/marketplace/MarketplaceShell.tsx
cat components/marketplace/CategoriesMenu.tsx
cat components/marketplace/CountryTabs.tsx
cat lib/categories.ts | head -100
```

Key facts (do not re-derive — trust this):

- `MarketplaceShell.tsx` renders **two rows of chrome**:
  - Row 1 (`<TopNav>`): logo + role-based nav links + auth nav + language bar. Height **72px**. Nav links are inside `<nav style={{ overflowX: 'auto' }}>`. **This `overflowX: 'auto'` is what clips the current anon CategoriesMenu dropdown — root cause of the "doesn't expand" bug.**
  - Row 2 (`.country-bar`): only rendered when `roleLoaded && role !== null && section === 'browse'`. Currently contains `<CategoriesMenu>` + `<CountryTabs>`.
- The anon flow puts `CategoriesMenu` *inside* `<TopNav>`'s `<nav>` (lines 270-276 of current `MarketplaceShell.tsx`). That's where the clip occurs.
- `CountryTabs` is used in `MarketplaceShell.tsx` Row 2 today. `CountryPicker` (different export from same file) is used in `PublicMarketplaceLanding.tsx`'s hero search and stays.
- `CATEGORIES` from `lib/categories.ts` is an array of **8** categories in this order: `immigration`, `education`, `legal`, `settlement`, `career`, `business`, `credentials`, `mentorship`. Each has `id`, `name` (with " Services" suffix on some), `icon` (emoji), `description`, `subcategories[]` where each sub has `id` and `name`.
- The `country` URL param values are `'all' | 'us' | 'uk' | 'ca'`. Hash `#jurisdictions` is used today for scroll anchoring — preserve it on the new dropdown's apply if you want, but you don't have to; the new dropdown changes the URL via `router.push` without scroll.
- CSS classes `.cw-cat-panel`, `.cw-cat-list`, `.cw-cat-detail`, `.cw-cat-sublist`, `.cw-cat-detail-eyebrow`, `.cw-cat-detail-desc`, `.cw-cat-detail-cta`, `.cw-cat-icon`, `.cw-cat-name`, `.cw-cat-count`, `.cw-cat-arrow`, `.cw-cat-trigger` are **defined in `app/marketplace/PublicMarketplaceLanding.tsx`** inside the `CSS` string. They only apply on the anon landing page (the CSS is scoped to `.cw-market`). The signed-in shell does not pull in that stylesheet. **This is why your new dropdown must NOT rely on those legacy classes** — inline the styles you need on every new component so they work in both contexts.

---

## 2. Build steps

### 2.1 — New component: `components/marketplace/JurisdictionDropdown.tsx`

Self-contained client component. Inline styles only (no class hooks).

**Behavior:**
- Trigger button reads: `🌐 <active label> ▼` where `<active label>` is `"All jurisdictions"`, `"United States"`, `"United Kingdom"`, or `"Canada"`.
- Click toggles a panel anchored beneath the trigger.
- Panel lists four options vertically:
  - `All jurisdictions`
  - `United States`
  - `United Kingdom`
  - `Canada`
- Click an option → `router.push(<pathname>?<params>)` with `country=` set (omitted for `all`). Use `usePathname` + `useSearchParams` (preserve other params; if `category=` or `subcategory=` were set, keep them).
- Active option is bolded + indigo check (✓) glyph on the right.
- Closes on: outside click (mousedown), Escape, option select.
- Width: trigger ~180px, panel 220px.
- Same design register as the current top nav buttons: pill-shaped trigger, white background, 1px rule border, 32px height, fontSize 13, fontWeight 500, color `T.inkSoft` resting → `T.ink` hover. Use the same indigo (`T.indigo`) for the active check mark.

**Props:**
```ts
interface Props {
  active: 'all' | 'us' | 'uk' | 'ca'
}
```

**Inline-style spec (must match — do not improvise):**
- Trigger: `display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: 999px; border: 1px solid ${T.rule}; background: ${T.vellum}; font-family: ${F.ui}; font-size: 13px; font-weight: 500; color: ${T.inkSoft}; cursor: pointer; transition: all 0.12s;`
- Trigger hover: `color: ${T.ink}; border-color: ${T.inkMid};`
- Trigger when panel open: `background: ${T.ink}; color: #fff; border-color: ${T.ink};`
- Panel: `position: absolute; top: calc(100% + 6px); right: 0; z-index: 220; min-width: 220px; background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 12px; box-shadow: 0 20px 40px -16px rgba(15,23,42,0.18); padding: 6px; font-family: ${F.ui};`
- Option row: `display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-radius: 8px; font-size: 13px; color: ${T.ink}; cursor: pointer;`
- Option hover: `background: ${T.paper2};`
- Active check: `color: ${T.indigo}; font-weight: 600;`

### 2.2 — New component: `components/marketplace/CategoryMegaDropdown.tsx`

Renders the subcategory panel for a single category. Used by `CategoryBar`.

**Props:**
```ts
import type { Category } from '@/lib/categories'

interface Props {
  category: Category
  country: 'all' | 'us' | 'uk' | 'ca'
  anchorRect: DOMRect | null   // absolute position from the trigger
  onClose: () => void
  onNavigate: () => void        // called after a link click, triggers parent close
}
```

**Behavior:**
- Returns `null` if `anchorRect` is null.
- Renders via `createPortal(node, document.body)` into a `<div>` appended to `document.body`. This is the critical fix that prevents the panel from being clipped by `overflow-x: auto` ancestors. Portal-mount on `useEffect`, cleanup on unmount.
- Panel position: `position: fixed; top: ${anchorRect.bottom + 8}px; left: ${anchorRect.left}px;` clamped so right edge stays within viewport (right margin ≥ 16px).
- Panel content: **single-column** (NOT the two-column legacy layout — keep it lighter):
  - Header: category icon + name (no " Services" suffix) + one-line description in `T.inkSoft`
  - Subcategory grid: 2 columns × up to 6 rows = max 12 subcategories. Use `category.subcategories.slice(0, 12)`.
  - Footer link: `See all {name} →` linking to `/marketplace?category={id}&country={country if !== all}`
- Each link uses `next/link`. URLs follow this exact format:
  - Top header link: `/marketplace?category=${cat.id}` + `&country=${country}` when `country !== 'all'`
  - Subcategory link: `/marketplace?category=${cat.id}&subcategory=${sub.id}` + `&country=${country}` when `country !== 'all'`
- Click anywhere outside the panel OR press Escape → call `onClose()`. Click any link → call `onNavigate()`.
- Width: 380px. Panel padding: 22px. Border-radius: 14px. Same shadow tier as JurisdictionDropdown.

**Style spec:**
- Container: `background: ${T.vellum}; border: 1px solid ${T.rule}; border-radius: 14px; padding: 22px 24px; box-shadow: 0 30px 60px -20px rgba(15,23,42,0.25); width: 380px; max-width: calc(100vw - 32px); font-family: ${F.ui};`
- Header eyebrow: `font-family: ${F.display}; font-size: 19px; font-weight: 500; color: ${T.ink}; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;`
- Header description: `font-size: 13px; line-height: 1.5; color: ${T.inkMid}; margin: 0 0 14px;`
- Sublist: `list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px;`
- Sublist link: `display: block; padding: 5px 0; font-size: 13px; color: ${T.inkMid}; border-bottom: 1px dashed transparent;`
- Sublist link hover: `color: ${T.ink}; border-bottom-color: ${T.rule};`
- Footer CTA: `display: block; margin-top: 14px; padding-top: 10px; border-top: 1px solid ${T.rule}; font-family: ${F.mono}; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${T.indigo};`
- Footer CTA hover: `color: ${T.indigoDeep};`

### 2.3 — New component: `components/marketplace/CategoryBar.tsx`

The new horizontal category navigation row. Replaces both the old `CategoriesMenu` trigger and the old `.country-bar` in `MarketplaceShell`.

**Props:**
```ts
interface Props {
  country: 'all' | 'us' | 'uk' | 'ca'
}
```

**Behavior:**
- Renders **all 8 categories from `CATEGORIES`** as horizontal items in source order.
- Each item is a trigger button: `<category.icon> {category.name.replace(' Services', '')} ▼`. Hovering or clicking opens that category's `CategoryMegaDropdown`. Use **click-to-open** (not hover-to-open) for accessibility — hover-only menus break touch and keyboard nav.
- At most one dropdown open at a time. Opening another category closes the previous.
- Tracks anchor `DOMRect` via `useRef` + `getBoundingClientRect()` at open time. Re-measure on `resize` (debounce 100ms).
- On narrow viewports (`max-width: 900px`), allow horizontal scroll: `overflow-x: auto; scrollbar-width: none;` on the bar inner. **Important:** the dropdowns themselves are portaled to `document.body`, so they are immune to this scroll container's clipping (the fix).
- Active state: if the URL's `?category=` matches a category, that trigger gets the active treatment (indigo underline 2px below).

**Style spec:**
- Container (row): `border-bottom: 1px solid ${T.rule}; background: ${T.vellum};`
- Inner: `max-width: 1280px; margin: 0 auto; padding: 0 28px; display: flex; align-items: center; gap: 4px; height: 52px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none;` + hide WebKit scrollbar via inline `::-webkit-scrollbar` won't apply inline — accept the native scrollbar on WebKit, it's hidden by `scrollbar-width: none` on Firefox and fine elsewhere on mobile.
- Trigger button: `display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; height: 36px; border-radius: 999px; border: 1px solid transparent; background: transparent; font-family: ${F.ui}; font-size: 13.5px; font-weight: 500; color: ${T.inkMid}; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: all 0.12s;`
- Trigger hover: `color: ${T.ink}; background: ${T.paper2};`
- Trigger active (URL category matches): `color: ${T.ink}; font-weight: 600; border-bottom: 2px solid ${T.indigo}; border-radius: 0; padding-bottom: 0;` — use a wrapper div instead of relying on border-radius collision if cleaner.
- Trigger when its dropdown is open: `background: ${T.ink}; color: #fff;`
- Caret glyph (▼): inline SVG, 10×10, `stroke="currentColor"`, opacity 0.7.

### 2.4 — Update: `components/marketplace/MarketplaceShell.tsx`

This is the big restructure. Make these exact edits:

**A. Imports**

Replace:
```tsx
import { CategoriesMenu } from './CategoriesMenu'
import { CountryTabs } from './CountryTabs'
```
with:
```tsx
import { JurisdictionDropdown } from './JurisdictionDropdown'
import { CategoryBar } from './CategoryBar'
```

**B. Anon `navLinksForRole(null)` — remove the inline "Categories" pseudo-link**

Change from:
```tsx
return [
  { icon: '', label: 'Categories', view: 'categories' },
  { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
]
```
to:
```tsx
return [
  { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
]
```

(The categories now live in the new `CategoryBar` row underneath the top nav, for both anon and signed-in.)

**C. `TopNav` body — remove the special `'categories'` branch, add `JurisdictionDropdown` for signed-in users**

In the `links.map(...)` loop, **delete** the entire `if (link.view === 'categories')` branch (~6 lines).

Then, before the `<MarketplaceAuthNav>` block, insert (only for signed-in users):
```tsx
{role !== null && (
  <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
    <JurisdictionDropdown active={country} />
  </div>
)}
```

`country` needs to be passed into `TopNav`. It's already a prop — keep it.

**D. Sub-nav row — replace the old country-bar with `CategoryBar`**

Replace this block (currently lines ~376-387):
```tsx
{roleLoaded && role !== null && section === 'browse' && (
  <div className="country-bar" id="jurisdictions" style={{ borderBottom: `1px solid ${T.rule}`, background: T.vellum }}>
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px' }}>
      <div className="country-bar-inner" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', flexWrap: 'wrap' }}>
        <CategoriesMenu country={country} />
        <div className="divider" style={{ height: '18px', width: '1px', background: T.rule, margin: '0 6px' }} />
        <CountryTabs active={country} />
      </div>
    </div>
  </div>
)}
```

with:
```tsx
{roleLoaded && section === 'browse' && (
  <CategoryBar country={country} />
)}
```

Note the conditional change: `role !== null` is **removed**. The category bar shows for both anon AND signed-in users when on the browse view.

**E. Anon top-row: add the JurisdictionDropdown for anon too**

Re-read part C: the `{role !== null && (...)}` guard was deliberate — anon does NOT show JurisdictionDropdown in the top header. Anon's jurisdiction selection happens entirely via the hero search's `CountryPicker` and via the new `CategoryBar` carrying the active country through deep links. Confirm: anon top header stays clean (logo + Find Attorney + Sign in + Open portal + Lang). Do not add a JurisdictionDropdown for anon.

### 2.5 — Delete: `components/marketplace/CategoriesMenu.tsx`

Once `MarketplaceShell.tsx` no longer imports `CategoriesMenu`, run `git grep "CategoriesMenu"` to confirm zero remaining callers, then delete the file. If anything still imports it, fix that caller first.

Do **not** touch the related `.cw-cat-*` CSS in `PublicMarketplaceLanding.tsx` — that CSS now becomes dead, but removing it is out of scope for this brief and removing it risks side effects in the hero. Leave it.

---

## 3. Acceptance gates

Before handoff, verify each of these. Anything that fails → fix before handoff.

1. **TypeScript clean.** `npx tsc --noEmit` returns no errors.
2. **Anon view (`market.yousafeconsultancy.com`, signed out):**
   - Top header row: logo + "Find Attorney" + "Sign in" + "Open portal" + 🌐 EN. No JurisdictionDropdown. No "Categories ▼" trigger.
   - Second row: `CategoryBar` showing all 8 categories spread horizontally. Each opens a single-column mega-dropdown when clicked. **Dropdown is fully visible — no clipping.** (This is the regression fix — confirm by clicking each category trigger in turn.)
   - Subcategory link click → navigates to `/marketplace?category=X&subcategory=Y`. URL has no `country=` param (anon defaults to "all").
3. **Signed-in view (any role) on browse:**
   - Top header row: logo + nav buttons + **🌐 active-label ▼** (JurisdictionDropdown) + avatar/auth nav + Lang.
   - Clicking the JurisdictionDropdown opens a 4-option panel. Clicking an option updates the URL with `?country=X` (or removes it for "all") and the page reflows.
   - Second row: same `CategoryBar` as anon. All 8 categories.
   - Category dropdown links carry `&country=X` through to the URL.
4. **Mobile narrow (≤900px):** `CategoryBar` scrolls horizontally; dropdowns still open above all overflow boundaries thanks to the portal.
5. **Resize / scroll:** dropdown stays anchored beneath its trigger (re-measure `getBoundingClientRect` on `resize`; if the page scrolls while a dropdown is open, either re-anchor or close — closing on scroll is acceptable and simpler).
6. **A11y:** triggers have `aria-haspopup="true"` and `aria-expanded`. Panels close on Escape. Focus does not get trapped.
7. **No regressions:**
   - WhatsApp identity tokens in messenger are byte-identical (this brief doesn't touch messenger — confirm by `git diff components/messaging/`).
   - Brief 41 Part A theme system still works (the chrome row uses `T.vellum` / `T.ink` / etc., not `var(--portal-*)` — that's correct; the marketplace public chrome is intentionally NOT themed).
   - `PublicMarketplaceLanding.tsx` hero + featured + reviews + payments + FAQs all still render.
   - Brand link href (`role === null ? '/marketplace' : 'https://portal.yousafeconsultancy.com/dashboard'`) is unchanged.

---

## 4. ROLE BOUNDARY — non-negotiable

- Worktree only. **Do not** run `git add`, `git commit`, `git push`, `git stash`, `git rebase`, `git merge`, or any branch operation.
- Do not run any deploy, wrangler, or Cloudflare command.
- Do not run any Supabase Management API call (this brief has no SQL — `lib/categories.ts` is the data source).
- Do not edit files outside the list in §0.
- End your handoff with: **"Worktree-ready for Claude review."** and stop.

Two prior sequencing breaches are on record. Next unauthorized git op gets the commit reverted on sight regardless of substance.

---

## 5. Handoff schema (standing — return exactly this format)

```
## Brief 46 — Marketplace Chrome Reorg — handoff

### Files changed
- [list every file with one-line note]

### Files created
- [list every new file]

### Files deleted
- [list, or "none"]

### TypeScript
- npx tsc --noEmit → [clean | errors below]

### Acceptance gates
- 3.1 tsc clean: [yes | no]
- 3.2 anon top row clean (no JurisdictionDropdown, no Categories trigger): [yes | no]
- 3.2 anon CategoryBar renders 8 categories: [yes | no]
- 3.2 anon dropdown NOT clipped (portal verified): [yes | no]
- 3.3 signed-in JurisdictionDropdown visible + functional: [yes | no]
- 3.3 signed-in CategoryBar replaces old country-bar: [yes | no]
- 3.4 mobile narrow horizontal scroll + dropdown visible: [yes | no]
- 3.6 a11y attrs + Escape close: [yes | no]
- 3.7 zero unrelated diffs: [yes | no]

### Notes / deviations
- [anything you had to decide that wasn't explicitly specified]

Worktree-ready for Claude review.
```

---

## 6. Pre-authored commit message (Claude uses this verbatim)

```
feat(marketplace): reorg chrome — jurisdiction dropdown + category bar

Moves jurisdiction (All/US/UK/CA) from the second-row pills to a single
dropdown in the top header (signed-in only). Replaces the old
"Categories ▼" trigger with a horizontal CategoryBar that spreads all
8 categories across as top-level items, each opening a portaled
subcategory mega-dropdown.

Fixes the anon "Categories doesn't expand" regression — the legacy
CategoriesMenu panel was being clipped by overflow-x: auto on its
parent <nav>. The new CategoryMegaDropdown renders via createPortal
into document.body, immune to ancestor overflow clipping.

Files:
- new: components/marketplace/JurisdictionDropdown.tsx
- new: components/marketplace/CategoryBar.tsx
- new: components/marketplace/CategoryMegaDropdown.tsx
- mod: components/marketplace/MarketplaceShell.tsx
- del: components/marketplace/CategoriesMenu.tsx (zero callers)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```
