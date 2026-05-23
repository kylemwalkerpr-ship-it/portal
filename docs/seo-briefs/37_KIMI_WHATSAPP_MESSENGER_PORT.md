# Brief 37 — Port the WhatsApp messenger template to the production portal

**To:** Kimi (+ your swarm)
**From:** Claude (engineering supervisor)
**Type:** Visual + feature port. Two phases, both required. **Swarm aggressively.**
**Predecessor brief:** Brief 34 (`34_KIMI_WHATSAPP_CHAT_UNIFICATION.md`). 34 created the
`ChatScreen` / `MessageBubble` / `AutoGrowInput` primitives and the `UnifiedInbox` mount
point. 37 is the visual + feature parity pass on top of 34.

---

## §0 — What this is

The user uploaded a complete WhatsApp-style messenger prototype at
`docs/seo-briefs/37-messenger-template/` (verbatim copy of the original
`YOUSAF MESSAGES.zip`). It is a runnable vanilla React + Babel prototype backed by a
localStorage store with seeded data. Read **all** of these files before you write a single
line of code:

| File | Purpose |
|---|---|
| `HANDOFF.md`         | The designer's intent + mapping from prototype shapes to the production Supabase schema. Authoritative on column names, status enums, role names. |
| `messenger.css`      | 3,105-line design system. Tokens, themes, component styles, animations. **This is the visual source of truth.** |
| `ChatList.jsx`       | Left rail: search, filter pills, archive row, pinned section, row chrome + chevron menu. |
| `ChatView.jsx`       | Right pane: header strip, message list, info panel, orders pane. |
| `Bubble.jsx`         | All message-type renderers (text, image, offer, inquiry, system) + the per-message context menu. |
| `Composer.jsx`       | Input bar: text, emoji picker, attachments, voice, polls, offer composer. |
| `ChatView.jsx` + `Modals.jsx` | Image viewer, forward picker, starred view, archived view, settings panel, new chat modal, toast host. |
| `Inquiry.jsx`        | InquiryComposer (5-step), StatusRing, StatusViewer, MarketplaceFeed, InquiryBubble. |
| `Offers.jsx`         | OfferCard, OfferComposer (role-aware), OfferRequestCard, OrdersPane. |
| `Support.jsx`        | SupportShell, SupportConversationView, RefundTicketModal, AdminTicketsShell. |
| `store.jsx`          | Single source of truth for the prototype's state. **Every action documents its production endpoint in a comment.** |
| `data.js`, `inquiry-data.js` | Seed data. **Do not port. Production data only.** |
| `safety.js`          | Off-platform contact filter. Already ported to `lib/safety.ts` — do not duplicate. |

> **Adopt the look. Adopt the features. Keep the production data + API.**
> Do not invent shapes. Wherever the prototype names a column / endpoint / status, use
> exactly the production equivalent from §4 of `HANDOFF.md`.

---

## §1 — Non-negotiable constraints

These boundaries are load-bearing. Cross them and the deploy breaks.

1. **No schema changes to existing tables** (`conversations`, `conversation_messages`,
   `inquiries`, `inquiry_messages`, `orders`, `order_messages`, `attorney_offers`,
   `gig_offers`, `support_tickets`). If you need new persistent state, propose **one**
   migration file under `supabase/`, written defensively (`create table if not exists`,
   `add column if not exists`), and call it out at the top of the PR — do **not** silently
   add tables in feature commits.
2. **No new API endpoints in Phase 1.** Phase 2 may add endpoints under
   `app/api/messages/conversations/[id]/...` (pin, archive, mute, star), one route per
   feature, mirroring the existing `quick-offer` shape. Don't repurpose `quick-offer`.
3. **Do not touch** the four mirror-on-write fixes that just shipped (commit `a4929f8`)
   in `app/api/client/attorney-chats/[id]/messages/route.ts`,
   `app/api/attorney/chats/[id]/messages/route.ts`,
   `app/api/attorney/inquiries/[id]/messages/route.ts`,
   `app/api/consultant/messages/route.ts`. The unified inbox depends on those continuing
   to call `mirrorMessage()`.
4. **Do not touch** Clerk auth, `middleware.ts`, the marketplace host routing, or
   `app/marketplace/page.tsx`. The marketplace + portal subdomain split is settled.
5. **Do not introduce a Clerk satellite-domain config** of any kind. That was reverted in
   commit `6c08e52` because it deadlocked sign-in.
6. **Keep the `ChatScreen` / `MessageBubble` / `AutoGrowInput` component contracts.** You
   may add **new** props, but every existing prop on every existing consumer must keep
   working (`UnifiedInbox`, `my-inquiries.jsx`, `student.jsx`, `attorney.jsx`,
   `consultant.jsx`, `ChatSidePane`).
7. **No mock data.** The prototype's `data.js` is reference only. Every visible value
   reads from a real production source. If a surface has no real data yet, render the
   real empty state — don't filler-fill it.
8. **Scope all messenger CSS** to a `.yousafe-messenger` root class (or equivalent) so
   the WhatsApp-green tokens, beige chat backdrop, etc. cannot leak into the rest of the
   portal. The dashboard, marketplace, and gig surfaces stay on their existing palettes.
9. **TypeScript strictness:** `npx tsc --noEmit` must pass clean before every commit. The
   primitives in `components/messaging/*.tsx` are TypeScript — new components added there
   must be TypeScript. JSX files (the `design/` dashboards) stay `.jsx`; do not convert.
10. **Deploy mechanism:** `git push origin main`. Cloudflare workflow auto-fires. Do
    **not** suggest `wrangler deploy` or any local deploy path.

---

## §2 — Phase 1 — Visual parity (ship as one PR; swarm internally)

**Goal:** when a student / attorney / consultant clicks Messages, the surface visually
matches the prototype's `messenger.html` — beige chat backdrop, WhatsApp-green outgoing
bubbles with tails + ticks, white incoming bubbles, conversation-list rows with avatar +
name + last-message snippet + relative time + unread pip, search bar, filter pills, sticky
chat header strip with counterparty name + last-seen, composer with emoji + attachment +
mic affordances. **No feature behaviour beyond what works today** — the new affordances
can be present in the DOM but inert (Phase 2 wires them).

### 2.1 — Design tokens

Lift the entire `:root { … }` and theme-variable block from
`docs/seo-briefs/37-messenger-template/messenger.css` into a new file
`components/messaging/messenger-tokens.css`. Import it once at the top of
`components/messaging/UnifiedInbox.tsx`. Wrap **every** messenger surface in
`<div className="yousafe-messenger">` (or use a global root selector) so the tokens
scope-lock to the messenger and don't leak.

Re-resolve any prototype tokens that conflict with the portal's font setup (`var(--font-inter)`,
`var(--font-lora)`, `var(--font-plex-mono)` are already loaded in `app/layout.tsx` — use
those rather than re-loading Google Fonts).

### 2.2 — UnifiedInbox left rail

Replace the current `UnifiedInbox` left rail (currently a header strip + flat conversation
list) with the prototype's `ChatList` chrome:

- WhatsApp-green header bar (or the prototype's resolved variant).
- Search input with the prototype's pill shape and clear-button.
- Filter pill tabs: `All · Unread · Favourites · Groups`. **Wire `All` and `Unread` to the
  existing API filter param.** `Favourites` and `Groups` should be visible but
  click-disabled with a tiny "Coming in Phase 2" tooltip — never hide them.
- Archived row (always render, with the live archived-count from the API). Click is a
  Phase-2 stub.
- Conversation rows match `ChatList.jsx` exactly: 48px avatar, name, snippet, time,
  unread pip, pin glyph slot, mute glyph slot, double-tick read indicator for messages
  the viewer sent.
- The chevron menu (`⌄`) on hover is rendered but its menu opens an inert popover with
  the items disabled until Phase 2.

### 2.3 — ChatScreen chat-area backdrop

In `components/messaging/ChatScreen.tsx`, replace the current `CHAT_BG = '#ECE7DF'`
constant with the prototype's `var(--chat-bg)`. Keep the existing prop contract intact
(`mode`, `header`, `messages`, `composer`, `banner`, `sidebar`, `unreadDivider`).

Add the prototype's subtle WhatsApp-style pattern overlay (the `.chat-bg-pattern` rule in
`messenger.css`) as a `::before` pseudo-element on the messages region. Do **not** add a
toggle.

### 2.4 — MessageBubble

In `components/messaging/MessageBubble.tsx`, restyle to match `Bubble.jsx`'s text-message
renderer:

- `mine={true}` → WhatsApp green (`var(--bub-out)`, `#D9FDD3`), right-aligned, with the
  prototype's tail SVG on the `isLastInGroup` bubble only.
- `mine={false}` → white (`var(--bub-in)`), left-aligned, tail on `isLastInGroup` only.
- Timestamp in `var(--font-mono)`, 11px, ink-soft, rendered inside the bubble bottom-right
  for outgoing, bottom-left for incoming.
- Double-tick read indicator (`var(--wa-tick-blue)` for "seen", ink-soft for "delivered")
  on outgoing bubbles. Use the prototype's tick SVGs. If the message has no
  `read_at`/`delivered_at` data yet, render the "delivered" (grey) tick — never omit.
- Bubble box-shadow: `var(--bub-shadow)`.
- Body link colour: `var(--bub-link)`.

Keep `InquiryBubble.tsx` and `OfferRequestCard.tsx` intact — they were ported in commit
`0ae01d5`. Restyle their chrome to match the prototype's `Bubble.jsx` versions
(typography, colours, the small chips at the bottom).

### 2.5 — AutoGrowInput composer chrome

Replace the composer chrome in `components/messaging/AutoGrowInput.tsx` with the
prototype's `Composer.jsx` chrome:

- Pill input field, ink-on-paper, the prototype's box-shadow.
- Left-side cluster: emoji button, attachment button (both rendered, inert in Phase 1).
- Right-side cluster: send button (active when input has content), microphone button
  (rendered, inert).
- Keep the existing `onSubmit` semantics — Enter sends, Shift+Enter newlines.

### 2.6 — UnifiedInbox right-pane header

Replace the current right-pane chat header in `UnifiedInbox.tsx` with the prototype's
`ChatView` header strip: avatar + name + (presence/last-seen if known) + the three
right-aligned icon buttons (search-in-chat, video call, voice call — all inert in Phase 1).

The "+ Send offer" CTA that already exists for attorney/consultant viewers stays —
restyle it to the prototype's `Offer composer` opener, but its behaviour is unchanged.

### 2.7 — Swarm strategy for Phase 1

Spin **four parallel swarm agents**, one per file group. Each is independent because
they edit disjoint files. Single PR / single commit at the end after you merge their
worktrees.

| Swarm | Files | Source of truth |
|---|---|---|
| **S1: Tokens + UnifiedInbox left rail** | `components/messaging/messenger-tokens.css` (new), `components/messaging/UnifiedInbox.tsx` (left rail only — lines ~250–450) | `messenger.css` `:root` block, `ChatList.jsx` |
| **S2: ChatScreen + MessageBubble**       | `components/messaging/ChatScreen.tsx`, `components/messaging/MessageBubble.tsx` | `messenger.css` chat-bg + bubble rules, `Bubble.jsx` text renderer |
| **S3: AutoGrowInput composer**           | `components/messaging/AutoGrowInput.tsx` | `messenger.css` composer rules, `Composer.jsx` chrome |
| **S4: Right-pane header + InquiryBubble + OfferRequestCard chrome** | `components/messaging/InquiryBubble.tsx`, `components/messaging/OfferRequestCard.tsx`, the header section of `UnifiedInbox.tsx` (lines ~460–500) | `ChatView.jsx`, `Inquiry.jsx`, `Offers.jsx` |

Merge swarm worktrees into one branch, run `npx tsc --noEmit`, commit + push **once** with
this message:

```
feat(messenger): Phase-1 visual port — WhatsApp shell on UnifiedInbox

Adopt messenger.css tokens (scoped to .yousafe-messenger), restyle
UnifiedInbox left rail to match ChatList.jsx (search, filter pills,
archived row, row chrome), restyle ChatScreen + MessageBubble to the
prototype's beige backdrop + green/white bubble pair with tails and
read ticks, restyle AutoGrowInput to the prototype's composer chrome.
No behaviour beyond what works today — pin/archive/mute/favourites
chrome is present but inert (wired in Phase 2).

Brief: docs/seo-briefs/37_KIMI_WHATSAPP_MESSENGER_PORT.md §2.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

### 2.8 — Phase 1 acceptance checklist (Claude will review against this)

- [ ] `npx tsc --noEmit` passes clean.
- [ ] Hard-refresh `/dashboard` → Messages on a student account: visible match to the
      prototype `messenger.html` rendered side-by-side.
- [ ] No CSS leakage: open `/dashboard` (Dashboard tab), `/marketplace`, a gig detail
      page — none of them should pick up WhatsApp green, beige backdrop, or any
      `--bub-*` token. Verify with DevTools `getComputedStyle` on a few key elements.
- [ ] Existing conversations still render with their messages (the 4 backfilled inquiry
      messages should appear in WhatsApp-green / white bubbles).
- [ ] Sending a new message still works end-to-end from each of the four roles.
- [ ] All inert chrome (pin glyph, mute glyph, Favourites filter, Groups filter, Archived
      row click, emoji button, attachment button, mic button, video/voice icons) is
      present but does nothing — no console errors when clicked.
- [ ] Single commit, single push, single deploy.

---

## §3 — Phase 2 — Feature parity (ship as a series of focused PRs; swarm aggressively)

Each sub-phase is its own commit + push. Sub-phases are **independent** — swarm them in
parallel where the file sets don't overlap.

### 3.1 — Per-conversation actions (pin, archive, mute, delete)

New endpoints (one route per action, mirroring the `quick-offer` shape):

- `POST /api/messages/conversations/[id]/pin` — body `{ pinned: boolean }` — writes to a
  new `conversation_participants.pinned_at` column (migration §3.6).
- `POST /api/messages/conversations/[id]/archive` — body `{ archived: boolean }` — writes
  `conversation_participants.archived_at`.
- `POST /api/messages/conversations/[id]/mute` — body `{ muted_until: timestamptz | null }`.
- `DELETE /api/messages/conversations/[id]` — soft-delete (set `deleted_at`); the row
  hides from the deleter's inbox but the conversation persists for the counterparty.

Wire the chevron-menu items to these endpoints with optimistic UI + `loadList()` refresh.
Pin glyph + mute glyph in row chrome read from the new columns.

### 3.2 — Filter pills: Favourites, Groups

- `Favourites` filters to `conversation_participants.pinned_at IS NOT NULL` for the
  viewer. Backend filter added to `app/api/messages/conversations/route.ts`.
- `Groups` filters to `conversations.type = 'group'`. The portal does not have group chats
  today — leave the filter in but the result list is empty; render the prototype's empty
  state.

### 3.3 — Archived view

Clicking the `Archived` row opens an `<ArchivedView />` modal (per `Modals.jsx`) listing
archived conversations with an "Unarchive" action on each row.

### 3.4 — Status broadcasts (the 24h ring) — already partially ported

`components/messaging/StatusRing.tsx` already exists from Phase 4 of the messenger port.
`app/api/statuses/[id]/view/route.ts` already exists (POST view-receipt).
`components/marketplace/MarketplaceFeed.tsx` already exists.

What's missing:
- Wrap counterparty avatars in `UnifiedInbox` rows with `<StatusRing>` based on a
  `/api/statuses` lookup. **TASK 3 of Phase 4 in the messenger port was left undone — do
  it now.**
- Status viewer modal (full-screen, swipe-through). Port `Inquiry.jsx`'s `StatusViewer`
  verbatim against `app/api/statuses/[id]/view/route.ts`.
- Client-side 24h-window enforcement: hide statuses where
  `created_at < now() - interval '24 hours'` in the API filter.

### 3.5 — Reactions + reply-quoting

- Reactions: long-press / right-click a bubble → emoji picker → write to
  `conversation_message_reactions(id, message_id, profile_id, emoji, created_at)`. New
  migration §3.6.
- Reply quoting: tapping a message brings up "Reply" affordance; the composer renders the
  quoted snippet above the input; submit sets `conversation_messages.reply_to_id` (new
  column, migration §3.6); `MessageBubble` renders the quoted snippet inline.

### 3.6 — Single migration file: `supabase/messenger_phase2.sql`

```sql
-- All Phase-2 schema changes in one defensive migration. Run via Supabase SQL Editor.
begin;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  pinned_at       timestamptz,
  archived_at     timestamptz,
  muted_until     timestamptz,
  deleted_at      timestamptz,
  starred_message_ids uuid[] not null default '{}',
  primary key (conversation_id, profile_id)
);

create table if not exists public.conversation_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, profile_id, emoji)
);

alter table public.conversation_messages
  add column if not exists reply_to_id uuid references public.conversation_messages(id) on delete set null;

alter table public.conversations
  add column if not exists type text not null default 'dm' check (type in ('dm','group'));

commit;
```

The user runs this once via Supabase SQL Editor when you ship the Phase 2.1 PR. **Do not
attempt to apply via Management API — the PAT was rotated.**

### 3.7 — Starred messages

Tap a message → "Star". Writes to `conversation_participants.starred_message_ids` array.
Top-bar overflow → "Starred messages" → modal (per `Modals.jsx`) listing starred messages
with jump-to-message.

### 3.8 — Settings panel + theme switcher

Top-bar overflow → "Settings". Modal exposes:
- Theme: Light / Dark / System. Persist in `localStorage.yousafe.messenger.theme`. Toggle
  via `data-theme` attribute on the `.yousafe-messenger` root.
- Density: Comfortable / Compact.
- Wallpaper: WhatsApp default / Paper / None.
- Notifications: on/off per conversation.

### 3.9 — Phase 2 swarm strategy

| Swarm | Sub-phases | Files | Endpoints |
|---|---|---|---|
| **S5** | 3.1 + 3.2 | left-rail menu wiring, filter pill logic, `app/api/messages/conversations/route.ts`, new pin/archive/mute/delete routes | new |
| **S6** | 3.3 + 3.7 | `components/messaging/ArchivedView.tsx` (new), `StarredView.tsx` (new), top-bar overflow menu | none |
| **S7** | 3.4       | wrap UnifiedInbox avatars, `StatusViewer.tsx` (new) | reuse `/api/statuses` + `/api/statuses/[id]/view` |
| **S8** | 3.5       | message context menu, `MessageReactions.tsx` (new), composer reply-quote chrome | new reaction routes |
| **S9** | 3.8       | `MessengerSettings.tsx` (new), theme switcher | none |

Each swarm produces its **own** commit and push. Do **not** batch sub-phases. Commit
message pattern:

```
feat(messenger): Phase-2.N — <sub-phase title>

<3-5 line description>

Brief: docs/seo-briefs/37_KIMI_WHATSAPP_MESSENGER_PORT.md §3.N.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

### 3.10 — Phase 2 acceptance checklist (per sub-phase)

- [ ] `npx tsc --noEmit` passes clean.
- [ ] No regression on Phase 1 acceptance criteria.
- [ ] New API routes have the same auth shape as `quick-offer` (read `requirePortalUser`
      or its role-specific siblings).
- [ ] Migration was applied to prod before the feature PR ships (Claude will confirm with
      the user before merging).
- [ ] Each new modal / view renders the real empty state when there's no data — no mock
      filler.

---

## §4 — Out of scope (do not touch in 37)

- Voice notes (mic button stays inert; recording UI is future work).
- Polls (composer poll button stays inert).
- Image viewer enhancements beyond the prototype.
- Search-within-chat (the magnifier in the chat header stays inert).
- Video / voice calls (the icons in the chat header stay inert).
- Forward picker (already in `Modals.jsx`; treat as future work).
- New chat modal beyond what already exists.
- Anything in `app/api/admin/`, `app/api/support/` beyond what already exists.
- Anything in `middleware.ts`, Clerk config, satellite domains.
- Brief 36's editorial design tokens — those are scoped to `/marketplace` only; the
  messenger has its **own** scoped tokens per §2.1.

---

## §5 — Where Claude reviews

After every commit + push, Claude pulls main and reviews against the relevant acceptance
checklist (§2.8 for Phase 1, §3.10 for each Phase 2 sub-phase). Expect one of:

- **APPROVED** — proceed to next sub-phase.
- **CHANGE REQUESTED** — specific punch list with file paths + line numbers, fix and push
  again under the same brief / sub-phase.

Do not start the next sub-phase before the previous one is APPROVED.

---

## §6 — Voice module (mandatory)

This is engineering prose, not marketing prose. Strict, plain, terse, professional. No
adjectives where a verb works. No "we" — direct second-person ("Replace…", "Add…",
"Do not…"). Match the existing brief 30 / 36 prose register exactly. Every section above
is the worked example.

---

**Start with Phase 1. Swarm S1–S4 in parallel. Push one commit. Wait for Claude review.**
