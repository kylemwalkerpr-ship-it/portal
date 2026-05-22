# Kimi Brief 34 — WhatsApp-Style Chat Layout, Applied Everywhere

**Supervisor:** Claude. **Executor:** Kimi.
**Repos:** `yousafe-portal` (primary) and `yousafe-saas` (secondary). Both repos are siblings on disk:

- `~/Documents/GitHub/yousafe-portal`
- `~/Documents/GitHub/yousafe-saas`

**Prerequisites:** brief 31 merged — `components/messaging/UnifiedInbox.tsx` already has WhatsApp-style bubbles, date separators, and an auto-grow composer. Read brief 31 and the current state of:

**Portal**
- `components/messaging/UnifiedInbox.tsx` — full-page inbox (the one brief 31 redesigned).
- `components/marketplace/ChatSidePane.tsx` — floating chat dock used from gig pages and seller profiles.
- `components/ChatWidget.tsx` — global chat widget mounted in the portal shell.
- `components/marketplace/MessageOfferCard.tsx` — offer card rendered inside a chat thread.
- `components/messaging/OfferComposerInline.tsx`, `components/messaging/OfferPaymentModal.tsx` — referenced from chat threads.
- `components/design/student.jsx` — has an inline attorney-chat block around line ~3325-3375 (`ChatBubble`s) **separate from** UnifiedInbox.
- `components/design/attorney.jsx` — uses UnifiedInbox at line ~291; also renders `InquiryThread` at line ~778.
- `components/design/consultant.jsx` — has its own Messages view around line ~1372 and an inline order-chat block around line ~990. Does **not** use UnifiedInbox.
- `components/design/attorney-messages.jsx` — secondary attorney messages view that hosts `InquiryThread`.
- `components/design/student-conversation-list.jsx` — list view feeding a chat surface.

**SaaS** (`yousafe-saas`)
- `components/chat/customer-chat-widget.tsx` — public-facing widget on marketing pages.
- `components/chat/support-dashboard.tsx` — staff-facing live agent inbox under `/app/(dashboard)`.

---

## Goal

The WhatsApp-style chat that brief 31 introduced into `UnifiedInbox` is the **only** chat experience we want, used everywhere any user (student, attorney, consultant, admin, customer support agent, public visitor) reads or sends a message. Today it only lives in one surface; every other chat in the estate is still a long unconstrained sheet. This brief unifies the experience.

The core UX contract (this is the non-negotiable spec):

> **The chat occupies a fixed window. The page does not scroll. Only the message list scrolls — header pinned on top, composer pinned on bottom, like WhatsApp Web.**

Where the chat lives inside a full route (`/dashboard?goto=messages`, SaaS staff inbox), the window fills the available viewport below the global nav. Where it lives inside a floating panel (ChatSidePane, ChatWidget), the panel is the window. Either way: the message list is the only scrollable region, and it scrolls inside the chat — never the page.

---

## §1 — `ChatScreen` (shared canonical primitive)

Create `components/messaging/ChatScreen.tsx` in **both** repos (same file, byte-for-byte identical; we are not introducing a shared package — that's overkill for two files). The component is the only chat layout primitive allowed; every chat surface composes it.

API:

```ts
type ChatScreenProps = {
  // Mandatory regions
  header: React.ReactNode      // sticky top bar: avatar, name, presence, actions
  messages: React.ReactNode    // the scrollable list (bubbles, date separators, system rows)
  composer: React.ReactNode    // sticky bottom bar: attach, input, send

  // Optional regions (rendered when present)
  banner?: React.ReactNode     // optional non-scrolling band between header and messages (e.g., "Offer pending" status strip)
  sidebar?: React.ReactNode    // optional left rail (conversation list); shown only when chat is in 'split' mode

  // Behavior
  mode?: 'fill' | 'panel' | 'split'
  //   'fill'  → fills the parent (used by full-page chat routes)
  //   'panel' → fills a floating panel (used by ChatSidePane, ChatWidget)
  //   'split' → 2-column: sidebar (340px) + chat region (the rest); used by UnifiedInbox and SaaS support-dashboard

  unreadDivider?: { afterMessageId: string } | null
  //   when set, ChatScreen renders an "Unread messages" pill above the matching list item

  className?: string
  style?: React.CSSProperties
}
```

Internal layout (use Tailwind utilities where the host file allows; otherwise inline style. Both are acceptable, but the layout values below are mandatory):

```
ChatScreen
└── outer: flex flex-col, height = 100% of parent
    ├── header band   — flex-shrink: 0
    ├── optional banner — flex-shrink: 0
    ├── messages region — flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden
    │   └── inner column max-width 760px on desktop, full-width on mobile
    └── composer band  — flex-shrink: 0
```

The single most important rule is `min-height: 0` on the messages region's flex container so the scroll actually works inside a flex column. Without that, the region grows beyond its parent and pushes the composer off-screen. This was the brief 31 regression that didn't propagate to other surfaces — be explicit.

Auto-scroll behavior:

- On mount and on `messages` content change, if the user is within ~120px of the bottom, scroll to bottom smoothly. If the user has scrolled up, do **not** force-scroll — show a small "↓ New message" pill in the bottom-right that scrolls on click.
- Implement via a `useEffect` watching the messages region's `scrollHeight`. Persist the "near-bottom" check via a ref so we don't re-render the world.

Visual tokens, applied uniformly:

- Chat background `#ECE7DF` (WhatsApp paper warm).
- Bubble (mine) `#1B2D4F` text white; (theirs) `#FFFFFF` text ink; (system) transparent, muted ink centered.
- Bubble corner radius 16px with a 4px tail on the appropriate corner of the last-in-group bubble (mine → bottom-right; theirs → bottom-left).
- Date separator: muted ink, mono uppercase 10px, on a horizontal hairline, with the date pill ("Today", "Yesterday", "MMM D") centered.
- Composer: white pill input, 40-120px auto-grow, send button right side.
- Avatars: 32px circle with initials fallback (existing `Avatar` component if available; if not, a local primitive).

These values are already in `UnifiedInbox` post brief 31; lift them into `ChatScreen` so they live in one place. After `ChatScreen` exists, `UnifiedInbox` must compose it rather than re-implement.

---

## §2 — Migration: portal surfaces

For each surface listed below, replace the existing layout with a `<ChatScreen>` composition. Preserve every existing feature — file upload, offers, presence dots, unread counts, read receipts, in-thread offer cards, payment modal triggers, typing indicators if present.

### 2.1 `components/messaging/UnifiedInbox.tsx`
- **Mode:** `'split'` (conversation list left, chat right).
- Refactor the brief-31 layout to compose `<ChatScreen mode="split" sidebar={…} header={…} messages={…} composer={…} />` instead of inlining.
- The sidebar (conversation list) keeps its current data, search, filters; styled to match WhatsApp Web list pane (avatar + name + last-message snippet + timestamp + unread badge). Selected row highlight.
- The two-column split is `340px sidebar` + `flex: 1 chat region`.
- On mobile (<lg): the sidebar takes full width and the chat region replaces it when a conversation is selected; a back-arrow in the chat header returns to the list. Use a single state variable, no router push.
- Where `UnifiedInbox` is rendered inside the dashboard route (student.jsx line ~3473, attorney.jsx line ~291), the outer container must constrain `UnifiedInbox` to `height: calc(100vh - <header-height>)` — pass the actual sticky-nav height (already computable in those files; if not, hardcode 64px). The dashboard nav is itself sticky; the chat fills below it.

### 2.2 `components/design/student.jsx` — inline attorney-chat block (lines ~3325-3400)
- Replace the inline header / `ChatBubble` map / composer block with `<ChatScreen mode="fill" header={…} messages={…} composer={…} />`.
- The current `ChatBubble` component should be **moved into** `components/messaging/MessageBubble.tsx` and reused by `ChatScreen` internally. After this brief, `MessageBubble` is the canonical bubble; no other bubble implementation may exist in either repo.
- Preserve file attachment input, presence indicator on the attorney avatar, "Online"/"Last seen" status text. Use the existing send action verbatim.
- The container must be a fixed-height frame; the dashboard's `Page` shell that hosts Messages should give this section `height: calc(100vh - 64px)` (or the actual nav offset). Do not let the page scroll behind it.

### 2.3 `components/design/consultant.jsx` — Messages view (~line 1372) and order-chat (~line 990)
- Same treatment as 2.2. Both blocks compose `<ChatScreen>`.
- The order-chat ("Chat with {student}") at ~line 990 is a panel inside the order detail; use `mode="panel"` with the existing card container as its parent (set the parent to a fixed height; recommended 540px desktop, 100% mobile).
- Consultant inbox does not currently use UnifiedInbox; after this brief it composes `<ChatScreen mode="split">` directly. **Do not** introduce a copy of UnifiedInbox just to wrap it; consultant.jsx can render `<ChatScreen>` with its own conversation-list and data hooks. (The data layer is intentionally not touched; only the layout/UI.)

### 2.4 `components/design/attorney.jsx` — InquiryThread (~line 778) + `attorney-messages.jsx`
- `InquiryThread` is shared by `attorney.jsx` and `attorney-messages.jsx`. Refactor `InquiryThread` itself to compose `<ChatScreen mode="fill">`. Both call sites automatically get the new layout.
- Preserve the `ClientBanner` (line ~902) by passing it as `<ChatScreen banner={<ClientBanner ... />} ...>` — it sits between header and messages, does not scroll.
- The status badge logic at line 1848 stays in the header region.

### 2.5 `components/marketplace/ChatSidePane.tsx`
- **Mode:** `'panel'`.
- The pane today is 308 lines and includes its own layout. Replace its layout shell with `<ChatScreen mode="panel" ... />`. Preserve the conversation start logic, the "Open in Messages →" link (already converted to absolute portal URL in the bug-fix push), and the close behavior.
- Fixed height: 560px desktop, full-screen drawer on mobile (slide-up from bottom, close on backdrop).

### 2.6 `components/ChatWidget.tsx`
- This is the global support widget (678 lines).
- **Mode:** `'panel'`.
- Replace the widget's internal layout. Keep the bubble launcher button, the open/close animation, the AI/agent state copy.
- Fixed height: 540px desktop, full-screen on mobile.

### 2.7 `components/messaging/OfferComposerInline.tsx` and `MessageOfferCard.tsx`
- No layout change. These render **inside** the messages region as message-type variants. Wire them through `MessageBubble` so they pick up the consistent paper background and corner-tail rules. An offer card rendered "as me" should sit on the right with the navy frame; as them, on the left with the white frame.

### 2.8 `components/design/student-conversation-list.jsx`
- This component already renders the list-side. Make it the sidebar input to `<ChatScreen mode="split" sidebar={<StudentConversationList ... />} ...>` when student.jsx renders the inbox at line ~3473. Do not duplicate list logic.

---

## §3 — Migration: SaaS surfaces (`yousafe-saas`)

Duplicate `ChatScreen.tsx` byte-for-byte into `yousafe-saas/components/messaging/ChatScreen.tsx`. Duplicate `MessageBubble.tsx` the same way. Both files become canonical there too.

### 3.1 `components/chat/customer-chat-widget.tsx`
- **Mode:** `'panel'`.
- Refactor the widget's body into `<ChatScreen mode="panel" header={…} messages={…} composer={…} />`. Preserve:
  - The launcher button visibility logic (hidden on staff routes — `pathname.startsWith('/admin')`, `/dashboard`, `/sign-in`, `/sign-up`).
  - `statusCopy` (AI online / queue position / agent assigned) in the header subtitle.
  - The `STORAGE_KEY` conversation persistence.
  - Bot/Headphones icons in messages indicate AI vs human sender.
- Fixed height: 560px desktop, full-screen drawer on mobile.

### 3.2 `components/chat/support-dashboard.tsx`
- **Mode:** `'split'`.
- Refactor to compose `<ChatScreen mode="split" sidebar={<QueueList ... />} header={…} messages={…} composer={…} />`. Preserve queue position, assignment actions, customer metadata, internal-note vs customer-reply toggle.
- Hosted at full-route height: `height: calc(100vh - <topnav>)`.

---

## §4 — Polish requirements (apply to every surface)

These are the "polished and professional" bits the user called out. They are mandatory across all migrations:

- **Avatars** with initials fallback (`{firstName[0]}{lastName[0]}`) on a deterministic muted background derived from the user id. The same avatar primitive lives in `components/messaging/Avatar.tsx` (create if not present).
- **Presence dot** on the avatar when sender_role is online (green) / offline (gray) / away (amber). Status text in the header ("Online", "Last seen 3 min ago").
- **Message grouping**: bubbles from the same sender within 5 minutes group with no avatar repetition; corner-tail only on the last bubble of the group; bubble margin tightens within a group.
- **In-bubble timestamp** on the last bubble of a group, muted, right-aligned for mine and left-aligned for theirs, 11px.
- **Date separators**: "Today", "Yesterday", or "MMM D" depending on the date diff. Brief 31's `dateLabel(s)` function lives in UnifiedInbox today; lift it into `lib/messaging/format.ts` and reuse.
- **Read receipts** if the data is available — single check (sent), double check (delivered), double check filled (read). If the API does not yet expose `read_at`, render the sent state only; do **not** fake the others.
- **Auto-grow composer**: textarea 40px → max 120px, then internal scroll inside the textarea. Existing `AutoGrowInput` in UnifiedInbox is the implementation; move to `components/messaging/AutoGrowInput.tsx` and reuse everywhere.
- **Attachment button** stays on the left side of the composer. Click opens a hidden file input. Existing per-surface file handlers stay wired to it; only the visual is unified.
- **Send button** disabled when the input is empty or only whitespace. `Enter` sends; `Shift+Enter` adds a newline.
- **Unread divider**: when the conversation has new messages since last view, ChatScreen renders an "Unread messages" pill on its own row above the first unread one.
- **Empty state**: when no conversation is selected (split mode) or no messages exist yet (other modes), render a centered editorial empty state — "Select a conversation" or "No messages yet" — with the WhatsApp-style watermark glyph.

---

## §5 — Fixed-window enforcement

For every chat surface, the parent container must:

- Have a deterministic height. Either `calc(100vh - <stickyHeader>)` for full-page routes, or a fixed pixel/percent height for panels.
- **Not** rely on the page's scroll. The `<body>` and the route layout below the navs must not scroll while a chat is the focal view. Where this conflicts with a dashboard shell that today uses page scroll for other content, the chat view's wrapper sets `overflow: hidden` on itself and constrains its own height.

Add a runtime guard inside `ChatScreen`'s effect:

```ts
useEffect(() => {
  const parent = containerRef.current?.parentElement
  if (!parent) return
  const cs = getComputedStyle(parent)
  // If the parent's height is not deterministic, the chat will not behave like WhatsApp.
  // Warn loudly in dev so the integrator sees the misuse.
  if (process.env.NODE_ENV !== 'production' && (cs.height === 'auto' || parent.clientHeight < 200)) {
    // eslint-disable-next-line no-console
    console.warn('[ChatScreen] Parent has non-deterministic height; chat will not scroll correctly. Set the parent height explicitly.')
  }
}, [])
```

This catches future regressions — any new chat surface that forgets to lock the parent height will surface the warning during development.

---

## §6 — Idempotency & safety

- No DB schema changes. No new API routes. No data-layer refactors.
- All existing per-surface data hooks stay (fetch loops, websocket subscriptions, presence pollers).
- `<ChatScreen>` is layout-only; it takes pre-rendered nodes for header, messages, composer. It does not own data.
- Two consecutive `pnpm build` runs (in each repo) produce byte-identical bundles for non-timestamped files.
- No third-party JS added.
- No analytics events removed or added.

Migration tactic: do the portal repo first, end-to-end, including the cross-cutting `MessageBubble`/`AutoGrowInput`/`Avatar` extraction. Then duplicate `ChatScreen.tsx`, `MessageBubble.tsx`, `AutoGrowInput.tsx`, `Avatar.tsx`, and `lib/messaging/format.ts` byte-for-byte into the SaaS repo, then migrate the two SaaS surfaces. Keep the two copies in sync; if a future change is needed, both must update.

---

## §7 — Verification

### Portal

```bash
cd /Users/phantomdarne/Documents/GitHub/yousafe-portal
pnpm build 2>&1 | tail -10
git status --short
git diff --check
```

Grep checks:

```bash
# Bubble implementations should be exactly ONE
rg -n "background.*'#1B2D4F'|borderRadius.*16" components/design components/marketplace components/messaging components/ChatWidget.tsx 2>&1 | wc -l
# Expect: only references inside MessageBubble.tsx (small count).

# Date-label duplication
rg -n "Yesterday|Today.*format|dateLabel" components lib --type ts 2>&1 | head
# Expect: only lib/messaging/format.ts and ChatScreen.tsx.

# Auto-grow duplication
rg -n "scrollHeight.*120|AutoGrowInput" components --type ts 2>&1 | head
# Expect: only components/messaging/AutoGrowInput.tsx + its usages.
```

Manual scenarios, signed in:

- Student `/dashboard?goto=messages` → chat fills viewport below nav; only message list scrolls; sending a message keeps the composer pinned.
- Attorney same.
- Consultant same (this is the regression most likely to surprise — consultant didn't have the WhatsApp UI at all).
- Student attorney-chat inline block (the `/dashboard` Messages tab routing to the attorney conversation) → WhatsApp layout.
- Marketplace gig page → click "Chat now" → ChatSidePane opens as a 560px fixed-height panel with the chat layout; backdrop close works.
- ChatWidget bubble → click launcher → 540px panel; close button works.

### SaaS

```bash
cd /Users/phantomdarne/Documents/GitHub/yousafe-saas
pnpm build 2>&1 | tail -10
git status --short
git diff --check
```

Manual scenarios:

- Public marketing page (e.g. `/`) → CustomerChatWidget bubble visible; open → panel uses ChatScreen layout; widget hidden on `/admin`, `/dashboard`, `/sign-in`, `/sign-up`.
- Staff `/dashboard` support inbox → split layout; queue sidebar left, conversation right; queue position visible in header.

### Cross-cutting

- Resize browser to 390px width: all chat surfaces collapse to mobile layout cleanly — sidebar replaces chat with back-arrow; panels become full-screen drawers; no horizontal scroll; composer remains reachable above the keyboard.
- Open DevTools, scroll a long thread to the middle: the page itself does not scroll; only the messages region does; "↓ New message" pill appears when a new message arrives while scrolled up.

---

## §8 — Reject Criteria

Reject the handoff if any of these are true:

- More than one bubble component exists in either repo. (Search for inline `background: '#1B2D4F'` and `borderRadius: 16` — should resolve to `MessageBubble.tsx` only.)
- Any chat surface allows the **page** to scroll while the chat is the focal view (other than mobile keyboard accommodations).
- Any chat surface omits the WhatsApp visual tokens (background, bubble colors, date separators, in-bubble timestamps, corner-tail radius).
- Consultant inbox still renders its old custom layout.
- `MessageBubble`, `AutoGrowInput`, `Avatar`, or `lib/messaging/format.ts` exists in only one of the two repos (must be in both, byte-identical for these specific files).
- `UnifiedInbox` re-implements layout instead of composing `<ChatScreen>`.
- Any preserved feature regressed: file upload, offer cards, presence, unread counts, AI-vs-agent status, conversation persistence (`STORAGE_KEY`).
- Build is not idempotent.
- New API routes, DB columns, or third-party libraries introduced.
- `useEffect` warning in §5 is missing.

---

## §9 — Handoff Report

Return:

1. One-line summary.
2. Files changed + files added per repo (full list with line counts).
3. Build output summary for each repo (success/fail, time, route count).
4. List of every chat surface migrated, with one screenshot path or DOM snippet per surface confirming the WhatsApp layout.
5. Confirmation that `MessageBubble`, `AutoGrowInput`, `Avatar`, `lib/messaging/format.ts`, and `ChatScreen.tsx` are byte-identical between the two repos (provide `md5` for each pair).
6. Manual scenario results from §7.
7. Risks & follow-ups.

Do **not** commit. Supervisor reviews and ships both repos in coordinated PRs.
