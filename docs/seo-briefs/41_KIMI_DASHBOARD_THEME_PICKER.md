# Brief 41 — Per-user dashboard theme picker (5 named views)

**To:** Kimi (sole session)
**From:** Claude (engineering supervisor)
**Type:** Foundation refactor + cross-repo per-role wiring. Two parts (A foundation, B per-role swarms).
**Predecessor briefs:** 40 (palette + messenger polish). **Do not start brief 41 until brief 40 is fully closed.** The keystone files brief 40 settled (`components/design/shared.jsx`'s `C`, `components/messaging/messenger-tokens.css`'s scoped `:root`) are the *exact* surfaces brief 41 re-refactors. Running them in parallel would corrupt both.

---

## §0 — What this is

The user wants signed-in users to pick a colour theme for their dashboard. Five named themes, each with a distinct neutral foundation + accent character:

| Theme | Vibe | Accent |
|---|---|---|
| **Mountain View** | Cool slate (current default — what brief 40 Part A shipped) | Indigo `#3C3B6E` |
| **Lake View**     | Cool blue-grays | Lake blue `#2E6B9F` |
| **Ocean View**    | Deep ocean + crisp panels | Teal `#0E7C8E` |
| **Forest View**   | Warm cream + earth | Moss `#4F6B3A` |
| **Desert View**   | Sand + terracotta | Terracotta `#B8623E` |

The picker lives in each role's Settings panel. The choice persists per-user (Supabase `profiles.theme_preference` + `localStorage` mirror) and applies to **both** the dashboard chrome **and** the messenger surface so the experience stays cohesive. The marketplace public landing + gig surfaces stay on Mountain View regardless of viewer (SEO + public consistency).

Scope spans **two repos**:
- `yousafe-portal` (this repo) — student, attorney, consultant, admin dashboards.
- `yousafe-saas` (sibling repo at `/Users/phantomdarne/Documents/GitHub/yousafe-saas`) — support dashboard.

---

## §1 — Non-negotiable constraints

1. **No breaking changes to existing surface logic.** This is a values-and-vars refactor + one new picker UI + one new persistence path. Hooks, fetches, mutations, routes, middleware — untouched.
2. **The marketplace public landing + gig pages + provider profile pages stay on Mountain View.** They are auth-agnostic (signed-out visitors must see one consistent brand) and SEO-load-bearing. Do not pipe the user theme into anything under `app/marketplace/` (except the inline `/marketplace?view=messages` mount, which inherits from the messenger root — see §A.4).
3. **The accent triplet stays per-theme but the danger / star / gold semantics stay constant across all themes.** Brick `#B22234` is always destructive. Star `#C68B27` is always rating. Gold `#C4A45A` is always highlight. These three encode meaning, not theme.
4. **No new dependencies.** Use what's in `package.json` today.
5. **TypeScript:** `npx tsc --noEmit` clean before completion in **both** repos. No `// @ts-nocheck` re-introductions.
6. **Worktree only.** Claude commits + pushes per the standing protocol. Cross-repo: Claude commits + pushes in each repo separately.
7. **SQL migrations are Kimi-authored, Claude-applied.** Never run SQL yourself.
8. **Brief 40 must be fully closed before Part A starts.** If brief 40 is still open when you read this, finish it first and then come back.

---

## §2 — The five theme palettes (binding hex values)

Every theme exposes the same set of token slots. Only the values change per theme. The token names are stable — consumers read `var(--portal-bg)` and the active theme decides what hex it resolves to.

### Mountain View (default)

```
--portal-bg:           #F7F8FA   /* paper — cool off-white */
--portal-surface:      #FFFFFF   /* vellum */
--portal-surface-2:    #EEF1F6   /* paper-2 */
--portal-surface-3:    #DDE3EA   /* paper-3 */
--portal-ink:          #0F172A   /* slate-900 */
--portal-ink-mid:      #334155   /* slate-700 */
--portal-ink-soft:     #64748B   /* slate-500 */
--portal-rule:         #E2E8F0   /* slate-200 */
--portal-rule-soft:    #F1F5F9   /* slate-100 */
--portal-accent:       #3C3B6E   /* indigo */
--portal-accent-deep:  #2A2A55
--portal-accent-soft:  rgba(60,59,110,0.08)
```

### Lake View

```
--portal-bg:           #F0F5FA
--portal-surface:      #FFFFFF
--portal-surface-2:    #E0EAF3
--portal-surface-3:    #C9DBEC
--portal-ink:          #0F2433
--portal-ink-mid:      #2F4A6B
--portal-ink-soft:     #5F779A
--portal-rule:         #D8E3EF
--portal-rule-soft:    #EAF1F8
--portal-accent:       #2E6B9F   /* lake blue */
--portal-accent-deep:  #1E4E78
--portal-accent-soft:  rgba(46,107,159,0.08)
```

### Ocean View

```
--portal-bg:           #EEF6F8
--portal-surface:      #FFFFFF
--portal-surface-2:    #DCEEF2
--portal-surface-3:    #C0E0E7
--portal-ink:          #0A1F2E
--portal-ink-mid:      #2E4B5C
--portal-ink-soft:     #5E7E91
--portal-rule:         #D7E5EB
--portal-rule-soft:    #EBF3F6
--portal-accent:       #0E7C8E   /* teal */
--portal-accent-deep:  #08596A
--portal-accent-soft:  rgba(14,124,142,0.08)
```

### Forest View

```
--portal-bg:           #F5F4EC
--portal-surface:      #FFFFFF
--portal-surface-2:    #EAE8D4
--portal-surface-3:    #DBD8BA
--portal-ink:          #1F2516
--portal-ink-mid:      #3D4A2E
--portal-ink-soft:     #6B7A57
--portal-rule:         #E0DDC9
--portal-rule-soft:    #EFEDDB
--portal-accent:       #4F6B3A   /* moss */
--portal-accent-deep:  #34481F
--portal-accent-soft:  rgba(79,107,58,0.08)
```

### Desert View

```
--portal-bg:           #FBF6EE
--portal-surface:      #FFFFFF
--portal-surface-2:    #F5EBD8
--portal-surface-3:    #EDDDBE
--portal-ink:          #2A1F12
--portal-ink-mid:      #4F3A24
--portal-ink-soft:     #856A4F
--portal-rule:         #ECE0CC
--portal-rule-soft:    #F5EEDC
--portal-accent:       #B8623E   /* terracotta */
--portal-accent-deep:  #8A4424
--portal-accent-soft:  rgba(184,98,62,0.08)
```

### Constants across every theme

```
--portal-brick:        #B22234   /* destructive / error — never re-themed */
--portal-gold:         #C4A45A   /* highlight — never re-themed */
--portal-star:         #C68B27   /* rating — never re-themed */
--portal-moss:         #5F6B3A   /* "verified" affordance — never re-themed */
```

---

# PART A — Foundation (single Kimi agent, must complete first)

## §A.1 — New file: `lib/portalThemes.ts`

Export a typed map of every theme + a `THEME_IDS` const + a `DEFAULT_THEME = 'mountain-view'`. Shape:

```ts
export type PortalThemeId =
  | 'mountain-view'
  | 'lake-view'
  | 'ocean-view'
  | 'forest-view'
  | 'desert-view'

export const THEME_IDS: PortalThemeId[] = [
  'mountain-view', 'lake-view', 'ocean-view', 'forest-view', 'desert-view',
]

export const DEFAULT_THEME: PortalThemeId = 'mountain-view'

export interface PortalThemeMeta {
  id: PortalThemeId
  name: string                // 'Mountain View'
  description: string         // short tagline
  swatch: { bg: string; ink: string; accent: string }   // preview tile
}

export const PORTAL_THEMES: Record<PortalThemeId, PortalThemeMeta> = { ... }
```

Use this from the picker UI and from the API route. Do **not** put hex values from §2 in this file — those live in CSS variables only (§A.2). This file holds metadata only.

## §A.2 — New file: `app/portal-themes.css` (or extend `app/globals.css`)

Author a CSS file (or extend `globals.css`) with `:root` defaults set to **Mountain View** and five `[data-portal-theme="<id>"]` overrides. Each override defines the full token set from §2.

Scope: apply to **any element with `data-portal-theme` set on itself or any ancestor**. The user's role-shell root will set the attribute (§B), so the CSS cascade does the rest.

Import the new stylesheet once in `app/layout.tsx` so it loads globally.

## §A.3 — Refactor `components/design/shared.jsx`'s `C` palette

Currently `C` is an object of literal hex values (post brief 40 Part A: Mountain View hex literals). Refactor each themed slot to read from the CSS variable:

```js
export const C = {
  bg:        'var(--portal-bg)',
  surface:   'var(--portal-surface)',
  surface2:  'var(--portal-surface-2)',
  surface3:  'var(--portal-surface-3)',
  border:    'var(--portal-rule)',
  border2:   'var(--portal-rule-soft)',
  borderSoft:'var(--portal-rule-soft)',
  text:      'var(--portal-ink)',
  textMuted: 'var(--portal-ink-mid)',
  textDim:   'var(--portal-ink-soft)',
  cyan:      'var(--portal-accent)',         // unified accent — themed
  cyanDark:  'var(--portal-accent-deep)',
  navy:      'var(--portal-ink)',
  red:       'var(--portal-brick)',           // semantic — never re-themed
  gold:      'var(--portal-gold)',
  green:     'var(--portal-moss)',
  amber:     '#D97706',                       // warning — keep literal for now
  // any other keys: map to nearest unified token per brief 40 §A.1
}
```

Existing consumers (`student.jsx`, `attorney.jsx`, `consultant.jsx`, `admin.jsx`, and the dozens of `design/*.jsx` files) continue reading `C.cyan` etc. — they now resolve to whatever the active `[data-portal-theme]` ancestor specifies. **No consumer changes needed in Part A.**

## §A.4 — Refactor `components/messaging/messenger-tokens.css`

The messenger should follow the user's theme so the experience is cohesive across surfaces. Re-write the scoped neutral block under `.yousafe-messenger {` so the local CSS vars (`--paper`, `--ink`, `--rule`, etc.) **inherit from the portal vars**:

```css
.yousafe-messenger {
  --paper:        var(--portal-bg);
  --paper-2:      var(--portal-surface-2);
  --paper-3:      var(--portal-surface-3);
  --vellum:       var(--portal-surface);
  --ink:          var(--portal-ink);
  --ink-mid:      var(--portal-ink-mid);
  --ink-soft:     var(--portal-ink-soft);
  --rule:         var(--portal-rule);
  --rule-soft:    var(--portal-rule-soft);
  --indigo:       var(--portal-accent);
  --indigo-deep:  var(--portal-accent-deep);
  --indigo-soft:  var(--portal-accent-soft);
  --brick:        var(--portal-brick);
  --gold:         var(--portal-gold);
  --star:         var(--portal-star);
  --moss:         var(--portal-moss);

  /* WhatsApp identity tokens stay byte-identical, themed by --portal */
  --wa-green:     #00A884;
  --wa-green-d:   #008069;
  --wa-tick-blue: #53BDEB;
  --chat-bg:      #ECE5DD;
  --bub-out:      #D9FDD3;
  --bub-in:       #FFFFFF;
  --bub-link:     #027EB5;
  --bub-shadow:   0 1px 0.5px rgba(11,20,26,0.13);

  /* Resolved derived theme vars */
  --bg:           var(--portal-bg);
  --panel:        var(--portal-surface);
  --panel-2:      var(--portal-surface-2);
  --hover:        rgba(15,23,42,0.045);
  --border:       var(--portal-rule);
  --border-soft:  var(--portal-rule-soft);
  --text:         var(--portal-ink);
  --text-mid:     var(--portal-ink-mid);
  --text-soft:    var(--portal-ink-soft);
  --dim:          #98A2B3;
  /* msg-font-size, etc. unchanged */
}
```

WhatsApp identity tokens stay byte-identical (per the standing fence). `[data-theme="dark"]` block stays untouched.

## §A.5 — Marketplace tokens stay literal

`components/marketplace/tokens.ts`'s `T` object stays on Mountain View **literal hex values** (the brief 40 Part A values). The public marketplace landing, gig detail, provider profile, and discovery pages render the same way for everyone regardless of who is signed in. **Do not refactor marketplace tokens to `var(--portal-*)`.**

The inline messages tab at `/marketplace?view=messages` inherits theming via the `.yousafe-messenger` root in `MarketplaceShell.tsx` (§B in brief 39). When the user has a theme set, `[data-portal-theme]` propagates through the DOM and the messenger picks it up. The marketplace chrome surrounding it stays Mountain View.

## §A.6 — New API route: `app/api/profile/theme/route.ts`

- `GET` — returns `{ theme: PortalThemeId }` for the signed-in user. Reads `profiles.theme_preference` via the admin client. Falls back to `'mountain-view'` if null. Auth via `requirePortalUser`.
- `PATCH` — body `{ theme: PortalThemeId }`. Validates against `THEME_IDS`. Writes to `profiles.theme_preference`. Returns `{ ok: true, theme }`.

Mirror the existing `/api/profile/*` route shape.

## §A.7 — SQL migration: `supabase/portal_theme_preference.sql`

Author the migration (Kimi authors, Claude applies):

```sql
-- Per-user dashboard theme preference. Default 'mountain-view' so
-- existing rows pick up the new column without breaking.
alter table public.profiles
  add column if not exists theme_preference text
    not null default 'mountain-view'
    check (theme_preference in (
      'mountain-view', 'lake-view', 'ocean-view', 'forest-view', 'desert-view'
    ));

comment on column public.profiles.theme_preference is
  'Per-user dashboard theme. Set via PATCH /api/profile/theme. Drives the [data-portal-theme] attribute on the role-shell root.';
```

## §A.8 — New shared component: `components/design/ThemePicker.tsx`

Client component. Props: `currentTheme: PortalThemeId`, `onChange: (id: PortalThemeId) => void`.

Render: a 5-column grid of cards (2 rows on mobile). Each card shows:
- A small preview tile (24px) split into three swatches: `bg`, `ink`, `accent` (read from `PORTAL_THEMES[id].swatch`).
- The theme name in `F.display` (using the marketplace font tokens — `import { F } from '@/components/marketplace/tokens'`).
- A one-line description in `F.mono` uppercase letter-spaced.
- An active checkmark on the currently-selected card.

On click: optimistic `setActive(id)` → PATCH `/api/profile/theme` → on success persist to `localStorage.yousafe.portal.theme` → set `document.documentElement.setAttribute('data-portal-theme', id)`. On failure: revert state + show a brick-coloured inline error.

The component is presentational; the role shells (§B) wire it into their Settings pages.

## §A.9 — Hydration helper: `components/design/usePortalTheme.ts`

A tiny hook every role shell can call to apply the active theme to the shell root on mount:

```ts
'use client'
import { useEffect, useState } from 'react'
import { PortalThemeId, DEFAULT_THEME, THEME_IDS } from '@/lib/portalThemes'

const STORAGE_KEY = 'yousafe.portal.theme'

export function usePortalTheme(): [PortalThemeId, (next: PortalThemeId) => void] {
  const [theme, setTheme] = useState<PortalThemeId>(DEFAULT_THEME)

  useEffect(() => {
    // 1. Read localStorage first (instant — no flash).
    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached && (THEME_IDS as string[]).includes(cached)) {
      setTheme(cached as PortalThemeId)
      document.documentElement.setAttribute('data-portal-theme', cached)
    }
    // 2. Reconcile with server in the background.
    fetch('/api/profile/theme', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const server = d?.theme
        if (server && server !== cached) {
          localStorage.setItem(STORAGE_KEY, server)
          setTheme(server)
          document.documentElement.setAttribute('data-portal-theme', server)
        }
      })
      .catch(() => {})
  }, [])

  const apply = (next: PortalThemeId) => {
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.setAttribute('data-portal-theme', next)
    fetch('/api/profile/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ theme: next }),
    }).catch(() => {})
  }

  return [theme, apply]
}
```

The hook reads from `localStorage` synchronously inside the effect (no flash on subsequent loads), then reconciles with the server in the background.

## §A.10 — Part A acceptance gates

- `npx tsc --noEmit` clean in `yousafe-portal`.
- New files exist: `lib/portalThemes.ts`, `components/design/ThemePicker.tsx`, `components/design/usePortalTheme.ts`, `app/api/profile/theme/route.ts`, `supabase/portal_theme_preference.sql`, the new theme CSS file (imported in `app/layout.tsx`).
- `C` palette in `shared.jsx` reads `var(--portal-*)` for themed slots; brick / gold / star / moss read their constants.
- Messenger neutrals in `messenger-tokens.css` derive from `--portal-*`; WhatsApp identity tokens byte-identical.
- Marketplace tokens unchanged.
- Smoke test: temporarily set `document.documentElement.setAttribute('data-portal-theme', 'forest-view')` in DevTools — the dashboard chrome shifts to cream/moss, the messenger picks up cream/moss, the marketplace stays Mountain View.

Return a single standing-schema handoff. Include the SQL body verbatim. **Do not commit. Do not push. Do not apply the SQL.** Claude does all three.

---

# PART B — Per-role wiring (5 parallel swarm agents, only after Part A is APPROVED)

Once Claude posts the literal line **"BRIEF 41 PART A APPROVED — proceed to PART B"**, spin five parallel swarm agents. Each one owns a single role. The file sets are disjoint per role so there are no merge conflicts.

## §B.1 — S1: Student dashboard (yousafe-portal)

Files:
- `components/design/student.jsx` — mount `usePortalTheme()` at the top of `StudentApp`; spread `data-portal-theme={theme}` onto the outermost `<div className="yousafe-dashboard-shell">` element (≈ line 3352).
- `components/design/student-settings.jsx` — add a "Appearance" section above or below the existing notification settings. Render `<ThemePicker currentTheme={theme} onChange={apply} />`.

Per-role nuance for students: the picker copy reads "Choose your view — your saved theme follows you on every device."

## §B.2 — S2: Attorney dashboard (yousafe-portal)

Files:
- `components/design/attorney.jsx` — mount `usePortalTheme()` in `AttorneyApp`; spread `data-portal-theme={theme}` onto the outermost `<div className="yousafe-dashboard-shell">` (≈ line 257).
- `components/design/attorney-settings.jsx` — add the "Appearance" section + `<ThemePicker>`. Place it above the existing Notifications block.

## §B.3 — S3: Consultant dashboard (yousafe-portal)

Files:
- `components/design/consultant.jsx` — mount `usePortalTheme()` in `ConsultantApp`; spread `data-portal-theme={theme}` onto the outermost `<div className="yousafe-dashboard-shell">` (≈ line 1399).
- Consultant settings live inline at `consultant.jsx`'s `Settings = ...` block (≈ line 1380). Add the "Appearance" section + `<ThemePicker>` there.

## §B.4 — S4: Admin dashboard (yousafe-portal)

Files:
- `components/design/admin.jsx` — mount `usePortalTheme()` in `AdminApp`; spread `data-portal-theme={theme}` onto the outermost shell.
- Admin settings page (find by greppping `page === 'settings'` in `admin.jsx`). Add the "Appearance" section + `<ThemePicker>`.

## §B.5 — S5: Support dashboard (cross-repo: yousafe-saas)

Working directory: `/Users/phantomdarne/Documents/GitHub/yousafe-saas`. Switch repos for this swarm.

Foundation work must be **re-applied** in the SaaS repo because it does not share the portal's `app/portal-themes.css`. Specifically:

1. Copy the new `app/portal-themes.css` (or equivalent — match whatever Next root the SaaS app uses) into the SaaS repo. Import it once globally.
2. Copy `lib/portalThemes.ts` and `components/design/usePortalTheme.ts` and `components/design/ThemePicker.tsx` into the SaaS repo. Match the SaaS repo's existing folder convention.
3. Author a thin theme API in the SaaS repo: `app/api/support/theme/route.ts` (GET + PATCH against the same `profiles.theme_preference` column — the SaaS app shares the production Supabase). Mirror the auth pattern the rest of the SaaS support-side uses.
4. Mount `usePortalTheme()` in the Support app shell + spread `data-portal-theme` onto its root.
5. Add the "Appearance" section + `<ThemePicker>` in the Support settings page.

No new schema in the SaaS repo — the column was created in the portal's `supabase/portal_theme_preference.sql` and is shared across both apps' Supabase access.

## §B.6 — Part B acceptance gates (per swarm)

- `npx tsc --noEmit` clean in whichever repo the swarm touched.
- Hard-refresh the role's dashboard → picker visible in settings, switches theme in real-time, persists after refresh, persists across devices.
- The role's existing settings (notifications, profile, etc.) still save correctly — picker is additive, not replacing.
- No CSS leakage onto the marketplace public landing (Mountain View locked).
- Messenger inside the dashboard picks up the same theme.

Return one standing-schema handoff per swarm — five in total. Claude reviews each and commits + pushes (cross-repo: two pushes, one per repo).

## §B.7 — Swarm coordination

The five Part B swarms run **in parallel** because they touch disjoint files. Each swarm:
1. Pulls the latest `main` from its repo.
2. Confirms the foundation files from Part A exist (in `yousafe-portal` they do; S5 has to create them in `yousafe-saas`).
3. Works in its own worktree.
4. Returns its handoff independently.

Claude commits each swarm's work as a focused commit:
- `feat(theme): wire theme picker into student dashboard`
- `feat(theme): wire theme picker into attorney dashboard`
- `feat(theme): wire theme picker into consultant dashboard`
- `feat(theme): wire theme picker into admin dashboard`
- `feat(theme): wire theme picker into support dashboard (saas repo)`

---

## §C — Out of scope

- Dark-mode tuning within each theme (current `[data-theme="dark"]` in `messenger-tokens.css` stays untouched).
- Per-theme dashboard logo / icon variations (the YouSafe wordmark stays one colour across all themes).
- Marketplace public landing theming (locked to Mountain View, by design).
- Custom-palette upload (users can only pick from the five).
- Theme preview before commit (the picker applies immediately; users revert by re-picking).
- Per-theme custom email templates.

## §D — Hard fences

- No new dependencies.
- No new schema beyond §A.7's `profiles.theme_preference` column.
- No touching `middleware.ts`, Clerk config, satellite domains.
- No touching the four mirror-on-write routes from `a4929f8`.
- No touching brief 37's messenger primitives (`ChatScreen`, `MessageBubble`, etc.) — those consume CSS vars; the theme switches at the CSS-var layer.
- No touching brief 38's marketplace tokens (`components/marketplace/tokens.ts`) — they stay literal Mountain View.
- No re-introducing `// @ts-nocheck`.

## §E — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives. Match brief 30 / 36 / 37 / 38 / 39 / 40 register exactly. Pre-authored commit messages in §B.7 — do not change them.

---

**Start with PART A. Single agent. Return a worktree-ready handoff with the SQL body verbatim. Claude reviews, applies SQL, commits + pushes the foundation. Then five parallel swarms for PART B.**
