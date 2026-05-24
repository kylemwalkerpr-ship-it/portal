# Brief 39 — Auth-aware marketplace nav + full inline Messages surface

**To:** Kimi (sole session)
**From:** Claude (engineering supervisor)
**Type:** Two surgical fixes shipped in one PR. Swarm internally; ship as one commit.
**Predecessor briefs:** 37 (messenger) + 38 (marketplace editorial purge), both closed.

---

## §0 — What's broken today

**A. Top-right nav on the marketplace landing is auth-blind.** Lines 897–900 of `app/marketplace/PublicMarketplaceLanding.tsx` render hardcoded `<a>Sign in</a>` + `<a class="cta">Open portal</a>` anchors regardless of whether the viewer is signed in. A signed-in student visiting `/marketplace` from inside their dashboard sees those two buttons instead of their avatar + a menu — i.e. the marketplace pretends it does not recognise them.

**B. The in-marketplace Messages tab is a stub.** When a signed-in client (or attorney / consultant) clicks `💬 Messages` in the marketplace top-nav, `MarketplaceShell.tsx`'s `MessagesPanel` (lines 113–166) renders a flat read-only list of conversations with the footer copy `"For full messaging, go to your Dashboard Messages →"`. There is no composer, no thread view, no reactions / replies / starred / archived / settings — none of the brief 37 messenger features land inside the marketplace surface.

Both surfaces have been editorial-tokenised already (brief 38 §S1). This brief is **behaviour**, not paint.

---

## §1 — Non-negotiable constraints

1. **No schema changes. No new API routes.** Both fixes are pure consumption of state and components that already exist (`@clerk/nextjs`'s `useUser` / `UserButton`, `components/messaging/UnifiedInbox.tsx`).
2. **Do not touch** the four mirror-on-write routes from commit `a4929f8`, the messenger primitive contracts (`ChatScreen` / `MessageBubble` / `AutoGrowInput`), the editorial tokens (`components/marketplace/tokens.ts`), or the messenger tokens (`components/messaging/messenger-tokens.css`).
3. **Scope discipline.** Marketplace surfaces use the editorial `T`/`F` tokens from `components/marketplace/tokens.ts`. The avatar-menu drop-down must NOT pull in the messenger's WhatsApp tokens. They live in different `.yousafe-messenger` vs `.cw-market` scopes.
4. **Hydration discipline.** The avatar menu reads Clerk auth state — strictly client-side. The nav as a whole stays server-rendered for SEO; only the right-hand auth cluster becomes a client island.
5. **TypeScript:** `npx tsc --noEmit` clean before completion.
6. **Worktree only.** Claude commits + pushes per the standing protocol.
7. **No new dependencies.** Use what's already in `package.json`. `@clerk/nextjs` ships `<UserButton>`, `<SignedIn>`, `<SignedOut>`, and the `useUser()` / `useClerk()` hooks — they are the right primitives here.

---

## §2 — §A: Auth-aware top-right nav

### 2.1 — New file: `components/marketplace/MarketplaceAuthNav.tsx`

Client component (`'use client'`). Renders the right-hand cluster currently at `PublicMarketplaceLanding.tsx:897–900`. Two render branches:

- **Signed out (default / SSR-safe fallback):**
  ```
  <a href={`${PORTAL_URL}/sign-in/student`}>Sign in</a>
  <a className="cta" href={signUpHref}>Open portal</a>
  ```
  This is what unauthenticated visitors keep seeing. Preserve byte-for-byte; this is your back-compat path.

- **Signed in:** the avatar + dropdown. Build it as:
  - Trigger: a 36px circular avatar — `imageUrl` from `useUser()` if present, else initials over a `${T.indigoSoft}` background with `${T.indigo}` text in `F.display`. Subtle 1px `${T.rule}` ring. `aria-haspopup="menu"`, `aria-expanded` toggled, `aria-label` = "Account menu".
  - Click + Escape + outside-click toggle a portaled dropdown anchored to the bottom-right of the avatar (use `position: 'absolute'`, no library). 220px wide, paper-pill chrome (`background: ${T.vellum}`, `border: 1px solid ${T.rule}`, `border-radius: 12px`, `box-shadow: 0 12px 32px -16px rgba(29,36,51,0.4)`).
  - **Menu items, in order:**
    1. Header strip: full name in `F.display` weight 500, email in `F.mono` 11px uppercase letter-spacing 0.06em, `${T.inkSoft}`. 1px `${T.ruleSoft}` divider below.
    2. **Go to Dashboard** → `${PORTAL_URL}/dashboard`
    3. **My Orders** → `${PORTAL_URL}/dashboard?page=orders` (use the existing `?page=` deeplink that `student.jsx` already honours at line 1203)
    4. **Messages** → `${PORTAL_URL}/dashboard?page=messages`
    5. **Profile settings** → `${PORTAL_URL}/dashboard?page=settings`
    6. 1px `${T.ruleSoft}` divider
    7. **Sign out** → calls `useClerk().signOut({ redirectUrl: PORTAL_URL })`. Brick text (`color: ${T.brick}`) on hover.
  - Each item: `padding: 10px 14px`, `font-family: F.ui`, `font-size: 14px`, hover `background: ${T.paper2}`. Use anchors (`<a>`) for the four cross-host links so the browser handles the navigation correctly across the portal / market subdomain split; use a button for Sign out.

### 2.2 — Wire it into `PublicMarketplaceLanding.tsx`

- Import `MarketplaceAuthNav` from `../components/marketplace/MarketplaceAuthNav`.
- Replace lines 897–900 with `<MarketplaceAuthNav signUpHref={signUpHref('nav')} />`.
- The component handles its own signed-in / signed-out branching client-side; the SSR pass renders the signed-out anchors, then Clerk's client SDK hydrates and swaps to the avatar if a session is present. Acceptable hydration mismatch only for the cluster; mark the wrapper with `suppressHydrationWarning` if React still warns.

### 2.3 — Also wire it into `components/marketplace/MarketplaceShell.tsx`

`MarketplaceShell` has its own nav at lines 230–294 of that file. There is **no** right-hand auth cluster in the shell today — the shell assumes the user is already authenticated because it gates content by role. But the user is now reporting confusion: the marketplace landing nav shows the public anchors, while the shell nav shows no auth state at all. Make the two consistent:

- In `MarketplaceShell.tsx`'s `TopNav`, between the `<nav>` element and the `<div>` that holds `<GlobalLanguageBar />`, mount `<MarketplaceAuthNav signUpHref="https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_shell" />`.
- Inside the shell the user is almost always signed in (`fetch('/api/profile')` at line 282 establishes `role`), so the signed-in branch is the common case; the signed-out fallback exists for the moment between mount and Clerk session resolution.

### 2.4 — Acceptance gates (§A)

- Visit `/marketplace` while signed-out → see `Sign in` + `Open portal` as today.
- Visit `/marketplace` while signed-in as a client → top-right shows the avatar; opening the menu shows the six items in §2.1; clicking each navigates to the right URL; Sign-out fires Clerk and redirects to `PORTAL_URL`.
- Visit `/marketplace?view=orders` while signed-in → the shell nav also shows the avatar.
- `npx tsc --noEmit` clean.
- No new CSS escaping `.cw-market` scope; no new fonts loaded; no new dependencies in `package.json`.

---

## §3 — §B: Full inline Messages surface

### 3.1 — Replace `MarketplaceShell.tsx`'s `MessagesPanel` (lines 113–166)

Today `MessagesPanel` fetches `/api/attorney/chats` or `/api/client/attorney-chats`, renders a flat read-only list, and footer-links to the dashboard. **Delete the function body** and replace with a thin wrapper that mounts the full `UnifiedInbox`:

```tsx
function MessagesPanel({ role }: { role: Role }) {
  if (!role) {
    return (
      <PanelShell title="Messages" icon="💬">
        <EmptyCard
          icon="💬"
          title="Sign in to message attorneys + consultants"
          body="Create a YouSafe account to start a conversation, view your inbox, and track every chat in one place."
          cta={{ label: 'Open portal', view: 'open-portal' }}
        />
      </PanelShell>
    )
  }
  return (
    <div className="yousafe-messenger" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <UnifiedInbox
        canSendOffer={role === 'attorney' || role === 'consultant'}
        defaultThreadId={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thread') : null}
        onThreadChange={(id: string | null) => {
          if (typeof window === 'undefined') return
          const url = new URL(window.location.href)
          if (id) url.searchParams.set('thread', id); else url.searchParams.delete('thread')
          window.history.replaceState({}, '', url.toString())
        }}
      />
    </div>
  )
}
```

Notes:
- Import `UnifiedInbox` lazily at the top of `MarketplaceShell.tsx` via `dynamic(() => import('@/components/messaging/UnifiedInbox'), { ssr: false })` — match the existing `FindAttorney` / `MyInquiries` patterns at lines 11–12.
- The outer `<div className="yousafe-messenger">` activates the messenger's scoped tokens for any descendant; the marketplace tokens stay scoped to `.cw-market` elsewhere. No leakage.
- `canSendOffer` follows the brief-37 wiring already in `student.jsx` (line 3404) and `attorney.jsx`. Match exactly.
- The fixed-height wrapper is the same pattern used in `student.jsx:3404` and `attorney.jsx:293` — `ChatScreen` needs a deterministic parent height or it collapses (see commit `0747bae`).

### 3.2 — Drop the old chat-fetching `useEffect` and the `chats` / `loading` / `error` state

That code is now dead; `UnifiedInbox` owns the data fetch. Delete the `useState`s, the `useEffect`, the `PanelShell` wrapper, the `LoadingRows` / `ErrorCard` calls, and the footer link. The new function body is the snippet in §3.1 — nothing else.

### 3.3 — Add the `'open-portal'` view handler

`EmptyCard`'s `cta.view` is typed as `Section`. Extend the `Section` type (line 17 of `MarketplaceShell.tsx`) to include `'open-portal'`, and in `handleNav` (around line 314), special-case it to redirect the browser to `${PORTAL_URL}/sign-up/student?lane=student&source=market_messages_empty` instead of updating internal state.

### 3.4 — Acceptance gates (§B)

- Visit `/marketplace?view=messages` while signed-out → see the "Sign in to message" empty card with an `Open portal` CTA that lands on the sign-up page.
- Visit `/marketplace?view=messages` while signed-in as a client → see the full `UnifiedInbox` (left rail with search + filter pills + archived row + status rings, right pane with chat header + bubbles + composer + reactions + reply quoting + starred + settings — all the brief-37 surface, live inside the marketplace).
- Sending a message works end-to-end; received messages appear in real-time (existing polling stays).
- Hard-refresh the page → inbox still loads, no hydration mismatch.
- Switching to another marketplace tab (`?view=browse`) and back → the inbox re-mounts cleanly; no leaked WhatsApp tokens on `browse`.
- `npx tsc --noEmit` clean.
- Brief 37's `ArchivedView` / `StarredView` modals open and behave normally inside the marketplace context (they were the source of the `5ac6f89` hotfix; double-check they still mount correctly).

---

## §4 — Swarm strategy

Spin two parallel swarm agents on disjoint file groups. Single push at the end (Claude pushes, not Kimi):

| Swarm | Files | Source of truth |
|---|---|---|
| **A: Auth nav** | `components/marketplace/MarketplaceAuthNav.tsx` (new), `app/marketplace/PublicMarketplaceLanding.tsx` (lines 897–900 replacement), `components/marketplace/MarketplaceShell.tsx` (insert `<MarketplaceAuthNav>` into `TopNav`) | §2 of this brief, `@clerk/nextjs` SDK docs |
| **B: Inline messages** | `components/marketplace/MarketplaceShell.tsx` (`MessagesPanel` rewrite + `Section` type + `handleNav` extension + dynamic import) | §3 of this brief, `student.jsx:3402–3415` for the wiring pattern |

Both swarms touch `MarketplaceShell.tsx`. Have swarm A finish first (smaller diff), then swarm B applies its changes on top. If conflict surfaces, swarm B resolves by rebasing onto swarm A's diff; the surfaces don't overlap line-by-line so a clean merge is expected.

---

## §5 — Acceptance + handoff

Return a single standing-schema handoff covering both §A and §B. Include:

- The full list of files touched (single combined list).
- `npx tsc --noEmit` output.
- A second grep gate: `grep -rn "Sign in\|Open portal" app/marketplace/PublicMarketplaceLanding.tsx components/marketplace/MarketplaceShell.tsx` — the only matches allowed are inside the new `MarketplaceAuthNav.tsx` component's signed-out branch.
- A third grep gate: `grep -rn "For full messaging" components/` — must return zero matches.
- Self-assessment of the four signed-out / signed-in × landing / shell permutations in §2.4 plus the messages permutations in §3.4.

**Do not commit. Do not push.** Worktree-only. Claude reviews the diff, runs the gates locally, and ships the commit if everything is clean.

---

## §6 — Out of scope (do not touch)

- Brief 37 messenger surfaces inside `components/messaging/` (already complete).
- Brief 38 marketplace tokens (`components/marketplace/tokens.ts`) — closed.
- The `/sellers/[id]` route, `/providers/[id]` route, gig detail, and all the other marketplace pages — none of them have an auth cluster issue.
- `app/layout.tsx`'s `<ClerkProvider>` — settled in commit `6c08e52`; do not re-introduce satellite mode.
- `middleware.ts` host routing — settled in commit `aa2d529`.
- The `MarketplaceFeed` realtime status feed — unrelated, leave alone.

---

## §7 — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives. Match brief 30 / 36 / 37 / 38 register exactly. No marketing copy, no apologies, no "we".

---

**Start §A. After §A's worktree is locally clean, layer §B on top. Return one combined handoff.**
