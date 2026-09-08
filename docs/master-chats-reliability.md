# Master Chats reliability — causes, fixes, tests, limitations

Admin Master Chats (`/dashboard/admin/content` → Admin, or
`AppDashboard` → **Master Chats**) renders via
`components/messaging/AdminMasterMessenger.tsx`. A user report showed
**"Invalid Date" on every bubble, unstyled full-width messages, and a tiny
native textarea**. This document records the precise causes, the permanent
fixes, the regression tests, and the remaining known limitations.

## Root causes (verified, not guesses)

| # | Symptom | Cause |
|---|---------|-------|
| 1 | `Invalid Date` on every bubble, especially Safari | `AdminMasterMessenger` pre-formatted `timestamp={fmtFullTime(m.created_at)}` and passed that **locale string** to `MessageBubble`, which formats its `timestamp` prop **again** through `fmtFullTime`. Feeding the already-formatted `"Sep 5, 3:30 PM"` back into `new Date()` is locale-dependent and fails in Safari → `Invalid Date`. The inbox (`UnifiedInbox`) correctly passes the **raw** `created_at`. Additionally `lib/messaging/format.ts` had **no finite-date guards** — `fmtRelative`, `fmtFullTime`, `sameDay`, `dateLabel` happily called `.getTime()` / `.toLocaleDateString()` on `Invalid Date`. |
| 2 | Unstyled full-width bubbles + tiny native textarea | `messenger-tokens.css` scopes **every** bubble/composer rule (`.bubrow`, `.bub`, `.bub-foot`, `.comp-input`, `.comp`, …) under `.yousafe-messenger`. The `AdminMasterMessenger` outer `<div>` did **not** declare that root class (or `data-theme`/`data-density`), so none of the WhatsApp-style bubble/composer styles applied and the `<textarea>` fell back to the browser's tiny native control. |
| 3 | Fast thread switching could show stale/wrong-thread data | `openThread` loaded async data with **no abort/version guard**. A slow response for conversation A arriving after the user switched to B would paint A's messages into B's view. `send` appended its result to `activeMsgs` unguarded, so an in-flight send could also land on the newly-opened thread. There was no incoming-message refresh at all. |
| 4 | Visible attachment / mic buttons that always fail | `AutoGrowInput` exposes paperclip + mic wired to the **participant-only** `/api/messages/conversations/[id]/attach` endpoint. `AdminMasterMessenger` supplied no `conversationId`, so the buttons were present but always errored ("Attachments are not available in this view."). Weakening auth to fit the participant endpoint was **not** acceptable. |
| 5 | Newest messages invisible in long threads | `GET /api/admin/messages/conversations/[id]/messages` loaded the **oldest 1000** rows (`order(created_at asc).limit(1000)`), so any thread beyond 1000 messages hid the newest traffic from admin oversight. |
| 6 | Layout not filling the admin shell | The wrapper used a hard-coded `calc(100vh - 64px)` and no scoped layout, so resize/mobile could push the composer off-screen. |

## Permanent fixes

### 1. Date contract — `lib/messaging/format.ts`
- New `toValidDate()` helper: returns `null` for null/undefined/empty,
  invalid strings, and invalid `Date` instances.
- `fmtRelative`, `fmtFullTime`, `dateLabel` render `''` for invalid/absent
  input (never `"Invalid Date"`); `sameDay` returns `false` for any invalid
  operand. Real ISO/offset timestamps and `Date` instances behave as before.
- `AdminMasterMessenger` now passes **raw** `timestamp={m.created_at}` to
  `MessageBubble`, which performs the single format call.

### 2. Scoped root + theme — `AdminMasterMessenger.tsx`
- Outer element is `<div class="yousafe-messenger" data-theme="light"
  data-density="compact">` wrapping `ChatScreen` in a determinate flex
  column (`flex:1; min-height:0`), so `messenger-tokens.css` applies and
  the chat scrolls internally at desktop **and** ≤680px (via the existing
  `data-mobile-view` rules + `.admin-master-back`). Reuses the existing
  design system — no parallel CSS redesign.

### 3. Race-free thread state
- `lib/adminMessages/threadGuard.ts` (pure, testable): **session** generation
  (advances on every thread open/close/retry) plus a **primary** generation
  (advances only on full loads) with an **in-flight** gate. Every request
  snapshots the session BEFORE fetching and re-checks it AFTER parsing the
  body and before every state write — fast switching including **A→B→A**
  discards stale results (the active id alone cannot distinguish them).
- Polls **skip while any thread fetch is in flight** and never advance the
  primary generation, so a slow initial load cannot be invalidated by a
  poll (which would strand `threadLoading`), and it still populates the
  view when it lands.
- Bounded visibility-aware refresh: 8s interval **plus**
  `visibilitychange`/`focus` handlers, no-op when the tab is hidden.
- Per-conversation drafts (`draftByConvRef`) survive thread switches; a
  successful send clears its snapshot **only while the stored draft still
  equals the sent text** (a newer draft typed mid-flight is preserved),
  and appends the returned message through an id-dedup merge so a
  concurrent poll's copy can never render twice.

### 4. Honest composer capabilities — `AutoGrowInput.tsx` + admin usage
- Backward-compatible capability props `allowAttach` / `allowVoice`
  (default `true` — all existing callers unaffected). When `false` the
  paperclip and mic **controls are omitted** instead of shown-as-broken.
- Admin composer passes `allowAttach={false} allowVoice={false}` (no
  authenticated admin attach path; auth deliberately not weakened).

### 5. Bounded latest-first pagination — API + UI (tie-safe)
- `lib/adminMessages/threadPage.ts` (pure): `parseThreadPageLimit` (default
  100, max 200), `buildThreadPage` (newest-first `limit+1` probe → ascending
  page), composite cursor `encodeCursor`/`parseCursor`, `olderThanSlot` and
  the PostgREST `cursorFilter`.
- Ordering is **stable `(created_at DESC, id DESC)`** so messages sharing a
  boundary timestamp are deterministically ordered. The `older_cursor` is a
  composite `{"c":<created_at>,"i":<id>}` JSON value; the next older page
  filters `created_at < c OR (created_at = c AND id < i)` — lexicographic
  older-than on the composite key — which **provably never skips or
  duplicates** equal-boundary rows. Malformed cursors → `400`.
- `GET /api/admin/messages/conversations/[id]/messages` returns the **newest**
  page (ascending, compatible `messages`/`total` shape) plus `has_older` /
  `older_cursor`; `?before=<cursor>` fetches the next older page.
- Pagination **exhaustion is tracked independently** (`history_done`):
  after the final older page, a silent poll cannot resurrect the button even
  though the newest page still reports `has_older`. Polls also **never move
  the history cursor** — only the initial/full load establishes it and
  older-page loads advance it — so a refresh can't regress the cursor and
  make the next "Load earlier" re-fetch already-loaded pages.
- Admin UI renders **Load earlier messages** when `has_older && !history_done`,
  prepending into the same ascending list, plus Refresh/Retry/empty/loading
  states and accessible labels. Enter-to-send was already wired in
  `AutoGrowInput`.

## Tests — Jest/node (no React renderer, no live messages/DB writes)

- **`tests/master-chats-reliability.test.ts` (20)**:
  - Date contract: real ISO + `-04:00`/`Z` offsets resolve to the same
    instant; invalid/absent values → `''`/`false`, never `Invalid Date`;
    `Date` instances accepted; no NaN units.
  - Scope/root + timestamp (static contract): component re-declares
    `.yousafe-messenger` + `data-theme`/`data-density`, imports the CSS,
    passes `timestamp={m.created_at}` and no longer contains `fmtFullTime`;
    bubble/composer CSS rules are scoped to `.yousafe-messenger`; admin
    composer omits attach/voice via capability props.
  - Pagination helper: limit clamp/default, newest-ascending extraction,
    composite-cursor encode/parse, malformed-cursor rejection, older-than
    comparator, and the **full-history walk with MANY equal boundary
    timestamps** proving zero skips/duplicates, plus the tie-safe PostgREST
    filter string.
  - Admin GET route (mocked Supabase): non-admin → 401; newest-ascending page
    with `limit+1` probe; composite `before=` cursor forwarded via `.or(...)`;
    malformed cursor → 400.
- **`tests/master-chats-thread-guard.test.ts` (11)** — behavioral race
  safety, exercising the REAL guard/state machine the component runs:
  polling skipped during a slow initial fetch (no threadLoading stranding),
  stale A response discarded after **A→B→A**, polls never advancing the
  primary generation, older loads not invalidating the owning full load,
  overlap prevention, id-dedup send-append, ordering under poll+older
  interleaving, exhaustion independence (no bogus button resurrection), and
  the never-wipe-newer-draft decision.

Full suite: `2505 tests / 201 suites` green; `tsc --noEmit` shows zero
errors in the touched files (one pre-existing unrelated error remains in
`components/design/studio-doc-editor.tsx`).

## Remaining limitations

- **No admin attachments / voice notes** by design: the participant-only
  attach endpoint is auth-bound; controls are omitted (`allowAttach` /
  `allowVoice`) until a dedicated `requireAdminUser`-guarded admin attach
  path exists.
- **Polling is poll-based, not realtime**: incoming messages appear within
  ~8s (or immediately on tab re-focus) while the Master Chats tab is
  visible. Fine-grained realtime (via `subscribeToTable`) was left out to
  keep the scope of the fix targeted; the existing inbox keeps its own
  subscription strategy untouched.
- **Draft restores on open** but is stored client-side only (per-session);
  a hard refresh loses an unsent draft.
- Composer Enter-to-send is standard keyboard behavior (no Shift flattening
  of multi-line), consistent with the rest of the messenger.