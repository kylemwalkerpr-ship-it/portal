# Brief 45 — Marketplace polish round + live case briefs ACL

**Owner:** Kimi. Single agent. Pre-empts brief 41 (theme picker) — brief 41 resumes after this ships.
**Repo:** `yousafe-portal` (no cross-repo work).
**Deploy host:** `market.yousafeconsultancy.com` + `portal.yousafeconsultancy.com` (same worker).

This brief carries four discrete fixes. Ship as **a single commit** at the end, after all four phases are locally green. Worktree-only.

---

## §1 — Phase A · Messenger bubble alignment in marketplace context

**Symptom (user report):** When the messenger renders inside `MarketplaceShell` (i.e. when a client opens `/marketplace?view=messages&thread=…`), outgoing bubbles do not affix to the right edge of the chat pane and incoming bubbles do not affix to the left. They cluster in a centered column with dead space on either side. The **dashboard-embedded** messenger (`/dashboard?page=messages`) looks correct — do **not** touch that view.

**Root cause:** `components/messaging/ChatScreen.tsx` line ~120 caps the messages container at `maxWidth: 760, margin: '0 auto'` via inline style. Inside the marketplace shell the visible chat pane is much wider than 760px, so the cap creates the centered-column look. Inside the dashboard the chat pane is roughly the same width as 760px, so the cap is invisible.

**Fix:**

1. Open `components/messaging/ChatScreen.tsx`. Remove the inline `maxWidth: 760` + `margin: '0 auto'` from the inner messages wrapper (the `<div>` directly inside `data-chat-canvas` at the line currently reading
   ```tsx
   <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 18px', position: 'relative', zIndex: 2 }}>
   ```
   ). Replace with a class:
   ```tsx
   <div className="cv-canvas-inner" style={{ padding: '14px 18px', position: 'relative', zIndex: 2 }}>
   ```

2. Open `components/messaging/messenger-tokens.css`. Add two rules at the end of the file (before any media-query block):

   ```css
   /* Default (dashboard-embedded): keep the legacy centered column. */
   .yousafe-messenger .cv-canvas-inner {
     max-width: 760px;
     margin: 0 auto;
   }
   /* Marketplace shell context: let bubbles affix to the pane edges. */
   .cw-market .yousafe-messenger .cv-canvas-inner {
     max-width: none;
     margin: 0;
   }
   ```

3. The `.bubrow.mine` / `.bubrow.theirs` rules at lines ~475–476 of `messenger-tokens.css` already use `justify-content: flex-end / flex-start`. Do not change them. Once the outer cap is removed in marketplace, those rules will affix bubbles to the actual pane edges.

4. Individual bubbles already have `max-width: 75%` on their inner `.bub` (line ~1116 / 1137 of `UnifiedInbox.tsx`). Do not change. That cap is what prevents a very long message from spanning the whole pane.

**Acceptance for §1:**
- Visual: in `market.yousafeconsultancy.com/?view=messages&thread=<any>`, outgoing bubbles touch the right edge of the chat pane (modulo the 60px row padding on the opposite side) and incoming bubbles touch the left edge.
- Visual: in `portal.yousafeconsultancy.com/dashboard?page=messages`, bubbles still appear in the 760px-capped centered column — unchanged from today.
- `grep -n "maxWidth: 760" components/messaging/ChatScreen.tsx` returns zero matches.

---

## §2 — Phase B · Live case briefs ACL (`/api/statuses` + `MarketplaceFeed`)

**Visibility rules (verbatim from the user):**

| Viewer | Sees live briefs? |
|---|---|
| Anonymous (no session) | **No** — section must not render at all. |
| Authenticated client / student | **Only briefs they themselves authored.** Not other students'. |
| Authenticated attorney | **All briefs in the 24h window.** |
| Authenticated consultant | **No.** Brief broadcasts are legal-domain artefacts. |
| Authenticated admin / support | **No.** Out of scope for moderation here. |

**Fix:**

1. **Server-side filter in `app/api/statuses/route.ts`.** The route currently does `requirePortalUser()` (good — already blocks anon with 401) then returns every active row. Add a role-aware filter immediately after the auth check:

   ```ts
   const auth = await requirePortalUser()
   if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

   const role = auth.role
   const isAttorney = role === 'attorney'
   const isAuthorRole = role === 'client' || role === 'student'
   if (!isAttorney && !isAuthorRole) {
     // Consultants / admins / support — no access.
     return Response.json({ statuses: [] })
   }
   ```

   Then when building the `.from('inquiry_statuses')` query, scope it for client/student callers:

   ```ts
   let query = auth.db
     .from('inquiry_statuses')
     .select('id, person_id, inquiry_id, payload, created_at, expires_at')
     .gt('expires_at', nowIso)
     .gt('created_at', twentyFourHoursAgo)
     .order('created_at', { ascending: false })
     .limit(100)

   if (!isAttorney) {
     // Author-only view for clients/students.
     query = query.eq('person_id', auth.profileId)
   }

   const { data: rows, error } = await query
   ```

   No other changes to the route.

2. **Client-side gating in `components/marketplace/MarketplaceFeed.tsx`.** Today it fetches `/api/statuses` unconditionally, swallows the 401, and still renders an empty card with the heading "Live case briefs". For anon viewers we should not render the section at all (the heading is itself the leak). At the top of the component:

   ```tsx
   const [authorised, setAuthorised] = React.useState<boolean | null>(null)

   React.useEffect(() => {
     fetch('/api/profile', { credentials: 'same-origin' })
       .then((r) => (r.ok ? r.json() : null))
       .then((d) => {
         const role = d?.profile?.role
         const ok = role === 'attorney' || role === 'client' || role === 'student'
         setAuthorised(Boolean(ok))
       })
       .catch(() => setAuthorised(false))
   }, [])

   // Render nothing until we know, and nothing at all if the viewer
   // isn't entitled to see the section.
   if (authorised === null) return null
   if (authorised === false) return null
   ```

   Then gate the `fetch('/api/statuses')` effect on `authorised === true` so anon viewers never even attempt the call.

3. The realtime subscription (`subscribeToTable('inquiry_statuses', …)`) inside `MarketplaceFeed` must also be gated on `authorised === true` — wrap the existing effect's body in `if (!authorised) return` at the top.

4. For client/student viewers, when realtime delivers a new row, **only accept it if `row.person_id === <own profile id>`** (otherwise other clients' status broadcasts would leak through the subscription even though the GET is filtered). The component does not currently know its own profile id; fetch it once on mount from `/api/profile` (you already need that call for the role check) and store it in state alongside `authorised`.

**Acceptance for §2:**
- Anon viewer: section is **not** in the DOM at all (no "Live case briefs" heading).
- Signed-in client/student: section renders with only their own broadcasts. Confirm by signing in as a client who has not posted any status — section renders with the "No active briefs right now" empty state.
- Signed-in attorney: section renders with every active broadcast in the 24h window (current behaviour, preserved).
- `curl /api/statuses` with a consultant session returns `{ statuses: [] }`.
- `curl /api/statuses` with no session returns 401 (unchanged).

---

## §3 — Phase C · Marketplace chrome refinement

Three sub-changes, all in `components/marketplace/MarketplaceShell.tsx` and `components/marketplace/MarketplaceFooter.tsx`.

### §3.1 — Remove the redundant top-nav search

The TopNav `<form className="nav-search">` block (currently rendered when `!role || role === 'client'`, lines ~305–321 of `MarketplaceShell.tsx`) is redundant with the hero search bar in `PublicMarketplaceLanding.tsx`. Delete the entire `<form>` block — including the surrounding gating condition.

### §3.2 — Make the marketplace header more substantial

Brief 44 set the bar at 56px. The user finds it too compact. Raise it.

- TopNav outer container `height` changes from `56` → **`72`**.
- Inner padding bumps from `0 20px` → **`0 28px`**.
- Brand cell — for the anon branch (single-line variant from brief 44), bump the brand text from 17px → **19px** and the leading "Y" mark from 22×22 → **26×26** (with internal font from 13 → 14).
- Nav button font size from 12.5px → **13.5px**, padding from `0 16px` → **`0 18px`**.
- Auth nav pills (`Sign in`, `Open portal`): bump padding from `8px 14px` / `8px 16px` → **`10px 16px` / `10px 18px`**, font from 13 → **14**.
- Sub-nav row (the `country-bar` for signed-in viewers): bump internal vertical padding from `8px 0` → **`10px 0`** and the maximum row gap from `8px` → **`10px`**.

The bar stays **sticky** at `top: 0` with `position: sticky` — do not change to `position: fixed`. "Static" in the user's prose means "more substantial / not visually disappearing" — sticky behaviour is correct.

### §3.3 — Make the footer more robust

In `components/marketplace/MarketplaceFooter.tsx`:

- Increase the `.cw-mkt-footer-wrap` vertical padding from whatever the current value is to **`44px 0`** (audit the current rule and raise it accordingly).
- The single-row `NAV_LINKS` rule: increase font from current → **14px**, line-height to **1.6**, gap between links to **22px**.
- Add a `<div>` row **above** the existing nav-links row containing the brand mark + tagline (re-use `MarketplaceShell`'s anon brand style: 26×26 indigo "Y" mark + "YouSafe Marketplace" 18px Lora 600) and a one-line tagline reading: `Fixed-fee, escrowed legal briefs across US, UK & CA.`
- Keep the legal links row + copyright line below the nav row — unchanged in structure.

**Acceptance for §3:**
- Visual: `grep -n "nav-search" components/marketplace/MarketplaceShell.tsx` returns zero matches.
- Visual: TopNav reads taller and more substantial; sticky behaviour preserved.
- Visual: Footer reads taller and more brand-anchored.

---

## §4 — Phase D · Hero featured "case file" → cross-jurisdiction slideshow

Today the hero right-side card (`caseFileToShow` in `app/marketplace/PublicMarketplaceLanding.tsx` line ~839) shows a single gig — either the active jurisdiction's top brief or a global fallback. The user wants:

- If **multiple jurisdictions** have a live featured case file, render a slideshow cycling through them. One per jurisdiction (US, UK, CA), in that order, skipping any without a live entry.
- If **only one** jurisdiction has a live featured case file, render the existing static card (no slideshow chrome).
- The section must read **compacted** — tighten its vertical breathing room so the new slideshow controls don't push the page taller.

**Implementation:**

1. In `app/marketplace/PublicMarketplaceLanding.tsx`, immediately below the existing `caseFileToShow` / `caseFileIsFallback` derivation (line ~840), build an array:

   ```ts
   const jurisdictionCases: Array<{ jx: JxCode; entry: NonNullable<Slice['caseFile']> }> = []
   for (const jx of ['us', 'uk', 'ca'] as const) {
     const entry = data.slices[jx].caseFile
     if (entry) jurisdictionCases.push({ jx, entry })
   }
   ```

2. Replace the existing `{caseFileToShow ? (<a className="hero-card-link">…</a>) : null}` block with a new component invocation:

   ```tsx
   <HeroCaseFileSlideshow
     entries={jurisdictionCases.length > 0 ? jurisdictionCases : (caseFileToShow ? [{ jx: caseFileToShow.jx ?? 'us', entry: caseFileToShow }] : [])}
     fallback={caseFileIsFallback}
     formatPrice={formatPrice}
     initialsOf={initialsOf}
     currencyByJx={{ us: 'USD', uk: 'GBP', ca: 'CAD' }}
   />
   ```

3. Create a new component file `components/marketplace/HeroCaseFileSlideshow.tsx` — a client component (`'use client'`) — that:

   - Renders the existing card chrome verbatim when `entries.length === 1` (no controls, no dots, no auto-advance).
   - When `entries.length >= 2`, renders the card with:
     - The same outer link wrapper + card body, but the active entry rotates every **5500 ms** via `setInterval` driving a React state index.
     - A row of **dot indicators** beneath the tier list (one dot per entry). Active dot is `T.indigo`, inactive is `T.rule`. Clicking a dot stops auto-advance, switches to that entry, and resumes after 12 s of no user input.
     - Left + right chevron buttons (`‹` `›`) positioned absolutely at the vertical centre of the card (44×44 buttons, transparent background, ink-soft color, indigo on hover). Pressing them advances / rewinds and triggers the same "pause auto-advance" behaviour as the dots.
     - A jurisdiction badge in the top-right of the card area showing the active entry's flag + 2-letter code (e.g. `🇺🇸 US`). Replace the existing "MOST POPULAR" / "GLOBAL · TOP BRIEF" sticker for the slideshow variant — the badge serves the same role.
     - `prefers-reduced-motion` query: when matched, disable auto-advance entirely.
   - Accepts the prop types named above (`entries`, `fallback`, `formatPrice`, `initialsOf`, `currencyByJx`).
   - Uses `T` / `F` tokens. Import them from `./tokens`.

4. Tighten the hero section spacing: in `PublicMarketplaceLanding.tsx` CSS, find the `.hero` rule (search for `.hero {`) and reduce its `padding` block by ~16px top + ~16px bottom (audit current values). Reduce `.hero-grid` `gap` by ~12px. Goal: the slideshow card with dots + chevrons fits in the same vertical envelope as the previous static card.

**Acceptance for §4:**
- Visual with one jurisdiction live: identical to today (no controls).
- Visual with two or more jurisdictions live: dots + chevrons + auto-advance + jurisdiction badge.
- `prefers-reduced-motion: reduce` → no auto-advance.
- `grep -n "HeroCaseFileSlideshow" app/marketplace/PublicMarketplaceLanding.tsx` returns the invocation site.
- `grep -rn "// @ts-nocheck" components/marketplace/HeroCaseFileSlideshow.tsx` returns nothing.

---

## §5 — Hard fences

1. Do **not** touch `app/marketplace/page.tsx`, `middleware.ts`, `lib/portalAuth.ts`, `lib/roleLanes.ts`, or `lib/auth.ts`.
2. Do **not** touch the dashboard messenger view (`app/dashboard/*`, `components/design/student.jsx` messages branch). Marketplace context only for §1.
3. Do **not** re-introduce `// @ts-nocheck` anywhere. New files must be TypeScript-clean from the start.
4. Do **not** add dependencies. Reuse `T` / `F` from `components/marketplace/tokens.ts` and existing CSS variables.
5. Do **not** touch any SQL — `inquiry_statuses` schema is final. The ACL is enforced in the route handler and in the realtime filter, not in RLS.
6. Do **not** touch any file under `components/messaging/` beyond `ChatScreen.tsx` + `messenger-tokens.css` (the two §1 touchpoints).
7. Do **not** rename, re-export, or move any existing component. New components only land at `components/marketplace/HeroCaseFileSlideshow.tsx`.
8. Do **not** restyle the hero card body, tier list, file metadata block, or the attorney avatar/name block. Those are unchanged. Only the *outer slideshow chrome* (controls, dots, badge, auto-advance) is new.

---

## §6 — Acceptance gates (run all four phases together at the end)

| # | Gate | Expected |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0 |
| 2 | `grep -n "maxWidth: 760" components/messaging/ChatScreen.tsx` | zero matches |
| 3 | `grep -n "nav-search" components/marketplace/MarketplaceShell.tsx` | zero matches |
| 4 | Manual: anon visitor on `market.yousafeconsultancy.com/` → no "Live case briefs" heading in the DOM | confirmed |
| 5 | Manual: signed-in client → "Live case briefs" shows only their own statuses | confirmed |
| 6 | Manual: signed-in attorney → "Live case briefs" shows all statuses in 24h window | confirmed |
| 7 | Manual: `market.yousafeconsultancy.com/?view=messages&thread=…` → outgoing bubbles touch right edge of chat pane | confirmed |
| 8 | Manual: `portal.yousafeconsultancy.com/dashboard?page=messages` → bubbles unchanged (760px centered column) | confirmed |
| 9 | Manual: hero card slideshow advances when ≥2 jurisdictions live; static when 1 | confirmed |
| 10 | `grep -rn "// @ts-nocheck" components/marketplace/HeroCaseFileSlideshow.tsx components/messaging/ChatScreen.tsx` | zero |

---

## §7 — Hand-off rhythm

Single agent, single commit, worktree only. Return one standing-schema handoff once all four phases are locally green. Claude reviews, runs the gates, then commits + pushes with this pre-authored message:

```
fix(marketplace): bubble alignment + briefs ACL + chrome polish + hero slideshow

Brief 45. Four connected fixes — one commit so the marketplace polish
round ships atomically.

  A. Messenger bubble alignment in marketplace context. The 760px
     centered-column cap on ChatScreen's messages wrapper was correct
     for the dashboard-embedded view but created dead space on either
     side of the marketplace chat pane (which is much wider). Move the
     cap from an inline style to a class (.cv-canvas-inner) and add a
     .cw-market override that drops the cap. Dashboard view is byte-
     identical to today; marketplace bubbles now affix to the pane
     edges as WhatsApp does.

  B. Live case briefs ACL. /api/statuses now filters server-side:
     attorneys see every active broadcast, clients/students see only
     their own, consultants/admins/support see none, anonymous
     callers continue to 401. MarketplaceFeed gates its render on
     /api/profile and refuses to mount the section at all for anon
     viewers — the heading itself was a leak. Realtime subscription
     gets the same author-filter so client/student viewers can't
     receive other clients' broadcasts through the live channel.

  C. Marketplace chrome refinement. (1) Drop the redundant top-nav
     search — it duplicated the hero search bar. (2) Bump TopNav from
     56px to 72px, with proportionate increases to brand mark, nav
     button padding, and auth pill sizing. (3) Bump MarketplaceFooter
     padding + add a brand row above the nav-links row so the footer
     reads as anchored rather than tacked-on.

  D. Hero "case file" card. When two or more jurisdictions have a
     live featured brief, render HeroCaseFileSlideshow — auto-advance
     every 5.5s, dot indicators, chevron buttons, jurisdiction badge,
     prefers-reduced-motion respected. With one jurisdiction live the
     card stays static (no controls). Hero section padding tightened
     so the slideshow chrome fits in the same vertical envelope.

No schema, API surface, or dependency changes beyond the new
HeroCaseFileSlideshow component file. npx tsc --noEmit clean.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

---

## §8 — Voice module

Engineering prose. Strict, plain, terse, professional. Second-person imperatives. Match the register of briefs 30 / 36–44 exactly. Commit message in §7 is pre-authored; do not change it.

---

## §9 — Standing role boundary

Per the persistent collaboration memory: you write source code in the worktree only. No `git`, no Supabase Management API, no deploy. Return one standing-schema handoff with the literal line `"Worktree-ready for Claude review."` and stop. Two prior breaches on record; the next unauthorized git op gets the commit reverted on sight.
