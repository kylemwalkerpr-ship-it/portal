# Brief 43 — Attorney-side inquiry plumbing: brief deep-link + queue surfacing + client profile preview

**To:** Kimi (sole session)
**From:** Claude (engineering supervisor)
**Type:** Three connected bug fixes. **Single agent.** One commit.
**Predecessor briefs:** 40 Part C (the `/api/inquiries/with-status` route that creates status-broadcast inquiries) and 40 Part D (the `ProfilePreviewDrawer` that 404s on client avatars). Both shipped.

**Sequencing: brief 43 is independent of briefs 41 and 42.** It can ship before or after either. Recommend shipping before 42 because it changes the same `UnifiedInbox` + `InquiryBubble` files brief 42 reads downstream.

---

## §0 — What's broken today

When a student posts a WhatsApp-style status broadcast (brief 40 Part C `/api/inquiries/with-status`), the resulting inquiry travels three legs to the attorney/consultant side. Each leg is broken.

### 0.1 — Leg 1: `Open full brief →` link 404s

In the messenger, when an attorney sees the student's `CASE BRIEF` card rendered by `components/messaging/InquiryBubble.tsx`, the card's primary CTA is `Open full brief →`. Clicking it lands on the portal's 404 page.

Root cause: `components/messaging/InquiryBubble.tsx:131` renders `<Link href={\`/dashboard/inquiries/${live.id}\`}>`. That route does not exist. The portal uses `/dashboard?page=<view>` query-string deep-links handled by the role-shell client component (`StudentApp` / `AttorneyApp` / `ConsultantApp`), not nested file-system routes. There is no `app/dashboard/inquiries/[id]/page.tsx`.

### 0.2 — Leg 2: status-broadcast inquiries do not appear in the attorney Inquiries / Queue section

`app/api/attorney/inquiries/route.ts` powers the attorney's `Inquiry Queue` (and `My Inquiries`) view. Lines 32, 38, 46, 48 filter the `inquiries` table by:

```ts
.from('inquiries')
.in('status', ['open', 'engaged', 'claimed'])
…
.filter((q) => q.source !== 'portal_attorney_chat')
```

The `/api/inquiries/with-status` route from brief 40 Part C inserts new rows but the audit of that route is needed:
- Does the insert set `source`? If unset (null), it passes the `source !== 'portal_attorney_chat'` filter.
- Does the insert set `status = 'open'`? If so, it passes the status filter.
- Does the insert set `target_attorney_profile_id`? Status broadcasts are unpinned — anyone can pick them up. If the queue requires a target attorney, broadcasts silently disappear.
- The attorney queue may also be filtering by jurisdiction match against the attorney's `jurisdictions` array — broadcasts have a `country` value that must intersect.

The user expects: a student status broadcast = an open public inquiry visible to **every active attorney + consultant** in a matching jurisdiction, listed in their `Inquiry Queue` view, clickable to open the full brief.

### 0.3 — Leg 3: `ProfilePreviewDrawer` returns "Profile not found" for clients

Brief 40 Part D's `ProfilePreviewDrawer` fetches `GET /api/sellers/[id]`. That route only resolves `attorneys.id` / `attorneys.profile_id` / `consultants.id` / `consultants.profile_id` (lines 16–24 of `app/api/sellers/[id]/route.ts`). When the avatar clicked belongs to a **client** (student), every lookup returns `null`, the route returns 404 with `'Seller not found'`, and the drawer renders "Profile not found." literally as in the third screenshot.

The drawer needs to support a third branch: **client preview** — name + avatar + role badge ("Client") + country (if present on the profile) + member-since + a short summary like "Has posted N inquiries on YouSafe." No rating, no jurisdictions, no services grid (none of those make sense for a buyer).

---

## §1 — Non-negotiable constraints

1. **No new dependencies.** Use what's in `package.json`.
2. **No schema changes** unless the audit in §3.2 finds a real gap. If a schema change is the only path, author one defensive migration file (`if not exists` style), flag it explicitly in the handoff, and let Claude apply via the Management API.
3. **TypeScript:** `npx tsc --noEmit` clean before completion. No `// @ts-nocheck` re-introductions.
4. **Worktree only.** Claude commits + pushes per the standing protocol. One focused commit covering all three fixes.
5. **Do not touch** `middleware.ts`, Clerk config, satellite domains, the four mirror-on-write routes from `a4929f8`, the brief-37 messenger primitives, or the brief-38 marketplace tokens.
6. **Do not** break the existing `portal_attorney_chat` inquiries that flow through the same queue — they must keep filtering correctly.
7. **Real data only.** No mock arrays, no placeholder client objects. If a client profile lacks a country / member-since / inquiry count, render the real empty state (e.g., omit the row), don't filler-fill.

---

## §2 — Fix 1: Wire `Open full brief →` to a real route

### 2.1 — Pick a route shape that works today

The portal's role shells (`components/design/student.jsx`, `attorney.jsx`, `consultant.jsx`) all read `?page=<view>` from `useSearchParams()` on mount and set internal page state accordingly (e.g., `student.jsx:1203-1208`). They do **not** consume URL path segments beyond `/dashboard`.

The cleanest fix: extend the same `?page=<view>` deep-link pattern with an optional `?page=mine&open=<inquiryId>` parameter. When `AttorneyInquiries` mounts, if `open` is set, auto-open that inquiry in the existing `InquiryThread` view.

Concretely:

- In `components/messaging/InquiryBubble.tsx:131`, change the link from:
  ```tsx
  <Link href={`/dashboard/inquiries/${live.id}`}>
  ```
  to a role-aware target that uses the existing query-param pattern. Since the bubble renders in the unified inbox (shared across roles), build the URL with `?page=mine&open=<inquiry_id>` for the attorney/consultant viewer and `?page=inquiries&open=<inquiry_id>` for the client viewer. The viewer's role is already cached in `UnifiedInbox` per brief 40 Part C — pass it down as a prop to `InquiryBubble` if necessary.

  Equivalent target URLs:
  - Attorney viewer: `https://portal.yousafeconsultancy.com/dashboard?page=mine&open=<inquiry_id>`
  - Consultant viewer: `https://portal.yousafeconsultancy.com/dashboard?page=mine&open=<inquiry_id>` (same path; consultant shell can absorb the same query)
  - Client viewer: `https://portal.yousafeconsultancy.com/dashboard?page=inquiries&open=<inquiry_id>`

  All three are absolute URLs because the messenger may render inside the **marketplace shell** at `market.yousafeconsultancy.com/?view=messages` (per brief 39) — a relative link there would resolve under the market host and bounce through the middleware to the portal host, but absolute is more predictable.

- In `components/design/attorney-inquiries.jsx`, on mount read `useSearchParams()` for `open`; if set, call the existing `openInquiry(openId)` (or whatever the equivalent state-setter is — read the file first to find the canonical handler), and strip the `open` param from the URL via `router.replace()` so a refresh doesn't re-trigger the open (mirror the pattern `student.jsx:1218` uses).

- Same wiring in `components/design/my-inquiries.jsx` for clients.

### 2.2 — Acceptance for Fix 1

- Attorney messaging surface: click `Open full brief →` on a status-bubble → lands on `/dashboard?page=mine` with the named inquiry's thread pre-opened.
- Client messaging surface (rare — clients view their own status bubbles in `MarketplaceFeed`): click `Open full brief →` → lands on `/dashboard?page=inquiries` with the inquiry pre-opened.
- Refreshing the resulting page does not re-trigger any side effects from the `open` param (URL is cleaned).

---

## §3 — Fix 2: Surface status-broadcast inquiries in the attorney Queue

### 3.1 — Audit `/api/inquiries/with-status` against the queue filter

Open both files side-by-side:
- `app/api/inquiries/with-status/route.ts` (the author)
- `app/api/attorney/inquiries/route.ts` (the consumer)

Cross-reference the columns the author sets vs the columns the consumer filters on. Likely gaps:

- The `with-status` route may insert `source = null`. The queue accepts that (the filter is `q.source !== 'portal_attorney_chat'`). OK.
- The `with-status` route may not set `target_attorney_profile_id`. The queue probably treats `target_attorney_profile_id IS NULL` as "open to all", which is correct for broadcasts.
- The `with-status` route may set `status = 'open'` (or default to it). The queue accepts `['open', 'engaged', 'claimed']`. OK.
- **The queue probably filters by jurisdiction match.** If the attorney's `jurisdictions` array doesn't include the inquiry's `country` value, the inquiry is hidden from that attorney's queue. This is correct behaviour — but if the inquiry's `country` is set to e.g. `UK` and the attorney has `['US']`, the broadcast won't appear. Confirm by inspecting the actual queue logic.

Whatever the actual mismatch turns out to be, the fix should:

1. Confirm `/api/inquiries/with-status` writes every field the queue expects, with sensible defaults — `source = 'status_broadcast'` (a new explicit string), `status = 'open'`, `target_attorney_profile_id = NULL`, `claimed_by_attorney_id = NULL`, and the jurisdiction value from the composer's Country step.
2. Confirm `/api/attorney/inquiries/route.ts` accepts `source IN (NULL, 'status_broadcast', <existing accepted sources>)`. Add `'status_broadcast'` to the explicit accept list if there is one; if the filter is currently a `!== 'portal_attorney_chat'` exclude, it already passes.
3. Confirm the consultant queue (if one exists at `app/api/consultant/inquiries/route.ts` — check; if not, no-op) has the equivalent filter.
4. If the queue is jurisdiction-filtered, make sure broadcasts respect that filter normally — do **not** disable jurisdiction matching. Cross-jurisdiction inquiries should remain invisible to attorneys outside that jurisdiction.

### 3.2 — Surface "Inquiries" entry in the messenger left rail (if missing)

The user expects to see a clickable Inquiries entry **inside the messenger**, not only inside the dashboard sidebar. Audit:

- In `components/messaging/UnifiedInbox.tsx`'s left rail header (the area near "+ Inquiry" added in brief 40 Part C, the Settings gear, and the star button) — for the **attorney + consultant** viewer roles, add a small button labelled `Inquiries` (icon: 📥) that navigates to `https://portal.yousafeconsultancy.com/dashboard?page=mine` (attorney) or `?page=mine` (consultant — same path; consultant shell has its own `mine` view).
- The button is **hidden** for clients (they already have a `+ Inquiry` button) and for unauthenticated viewers (the inbox isn't reachable for them anyway).
- This is **navigation only** — it does not re-render the inquiry queue inside the messenger. The user said "open a queue of current and active inquiries by all students" — and the existing attorney inquiry queue is exactly that. Routing the button to `/dashboard?page=mine` honours that without duplicating UI.

### 3.3 — Acceptance for Fix 2

- A student posts a status broadcast via `+ Inquiry`. Within 12s (the polling cadence), every active attorney + consultant with a matching jurisdiction sees the broadcast in their `Inquiry Queue` view (`/dashboard?page=queue`) AND their `My Inquiries` view (`/dashboard?page=mine`) — whichever route the existing UI flow leads to. The inquiry shows the case-type label, urgency chip, headline, and a `View brief` button.
- The same broadcast renders as a `CASE BRIEF` bubble in the messenger inquiry thread, with the `Open full brief →` link from Fix 1 wired correctly.
- Clicking `Inquiries` in the messenger left rail (attorney/consultant viewer) lands on the same queue.
- Existing `portal_attorney_chat` inquiries continue rendering in the queue without regression.

---

## §4 — Fix 3: `ProfilePreviewDrawer` for clients

### 4.1 — Extend `/api/sellers/[id]` with a client fall-through

`app/api/sellers/[id]/route.ts` currently checks four sources in parallel (attorneys.id, consultants.id, attorneys.profile_id, consultants.profile_id) and returns 404 when all four miss. Add a **fifth** fall-through: if no seller resolves, look up `profiles` directly and return a client-shaped preview if `profiles.role IN ('client', 'student')`.

Response shape additions:

```jsonc
{
  "role": "client" | "attorney" | "consultant",
  "profile": {
    "id": "...",
    "full_name": "...",
    "avatar_url": "...",
    "country": "..." | null,
    "member_since": "..."           // profiles.created_at
  },
  // existing seller fields only when role === 'attorney' || 'consultant'
  "attorney": { ... } | null,
  "consultant": { ... } | null,
  "gigs": [ ... ] | [],
  "reviews": [ ... ] | []
}
```

For clients: add an `inquiry_count` field computed as a single `SELECT count(*)` on `inquiries` keyed by `client_profile_id`. Cheap enough.

Do **not** rename or restructure the existing seller response keys — the existing consumers (`SellerProfilePage`, `ProfilePreviewDrawer`'s seller branch, the marketplace gig detail) need them byte-for-byte.

### 4.2 — `ProfilePreviewDrawer` client render branch

Update `components/messaging/ProfilePreviewDrawer.tsx` to render a **role-aware** body:

- When `role === 'attorney'` or `consultant`: existing layout (avatar + name + role badge + tagline + rating + jurisdictions/specialties + top 3 gigs + footer link to marketplace profile).
- When `role === 'client'`:
  - Avatar + name (in `F.display` 22px).
  - Role badge: `Client` (use the same chip style; colour can stay neutral — no special accent for clients).
  - Country if present (single line, `F.mono` uppercase, e.g. `UK · LONDON` style — country only, no city).
  - "Member since {month year}" computed from `profiles.created_at`.
  - "Has posted {N} {inquiries|inquiry}" pulled from the new `inquiry_count` field.
  - **No** rating, **no** jurisdictions, **no** services grid, **no** "View full profile →" footer link (clients have no public profile page in the marketplace today; if the user wants one later, brief separately).

The drawer's suppression rule from brief 40 Part D (don't open for `sellerId === viewerProfileId`) stays.

### 4.3 — Acceptance for Fix 3

- Attorney/consultant clicks a client's avatar in the chat header, on a bubble (incoming first-in-group), or via the `StatusViewer` header. Drawer slides in with the client-shaped body — name, role badge `Client`, country, member-since, inquiry count. No "Profile not found." text.
- Attorney/consultant clicks another seller's avatar — existing seller body renders unchanged.
- Client clicks an attorney's avatar — existing seller body renders unchanged.
- Client clicks their own avatar — drawer suppressed (existing rule).
- `npx tsc --noEmit` clean.

---

## §5 — File list (single commit)

Expected file set (Kimi confirms in handoff):

1. `components/messaging/InquiryBubble.tsx` — change the `Open full brief →` href, accept a `viewerRole` prop, derive the correct deep-link URL.
2. `components/messaging/UnifiedInbox.tsx` — pass `viewerRole` to `InquiryBubble`; add the `Inquiries` button in the attorney/consultant left-rail header.
3. `components/design/attorney-inquiries.jsx` — read `?open=<id>` on mount, auto-open that inquiry, strip the param.
4. `components/design/my-inquiries.jsx` — same `?open=<id>` handling for clients.
5. `app/api/inquiries/with-status/route.ts` — confirm the insert sets `source = 'status_broadcast'` + `status = 'open'` + `target_attorney_profile_id = NULL`; adjust only if a gap is found.
6. `app/api/attorney/inquiries/route.ts` — confirm the filter accepts status-broadcast inquiries; adjust only if a gap is found.
7. `app/api/consultant/inquiries/route.ts` (if it exists) — same audit.
8. `app/api/sellers/[id]/route.ts` — add client fall-through branch; extend the response shape.
9. `components/messaging/ProfilePreviewDrawer.tsx` — role-aware render with client branch.

---

## §6 — Acceptance gates (Claude runs before committing)

- `npx tsc --noEmit` clean.
- `grep -rn "/dashboard/inquiries/" components/` returns zero matches.
- Manual smoke test of all three legs per §2.2 / §3.3 / §4.3.
- No regression on the brief-37 messenger surface (UnifiedInbox modals open, status broadcasts still render, Respond CTA still creates conversations).
- No regression on the brief-39 marketplace nav / inline messages.
- No regression on the brief-40 student status flow or profile preview for sellers.

---

## §7 — Hand-off rhythm

Single agent, single commit, worktree only. Return one standing-schema handoff once the three fixes are locally green. Claude reviews the worktree diff, runs the acceptance gates, then commits + pushes with this pre-authored message:

```
fix(messenger): attorney inquiry brief deep-link + queue surfacing + client profile preview

Brief 43. Three connected bugs on the attorney-side inquiry flow,
all triggered when a student posts a WhatsApp-style status broadcast
from brief 40 Part C.

  1. Open full brief → 404'd because InquiryBubble linked to a
     non-existent /dashboard/inquiries/[id] route. Switched to the
     portal's canonical ?page=<view>&open=<id> query-param deep-link
     pattern. Attorney+consultant viewers route to ?page=mine&open=…;
     client viewers route to ?page=inquiries&open=… The role shells
     read the open param on mount, auto-open the named inquiry, and
     strip the param via router.replace() so refreshes don't loop.
  2. Status-broadcast inquiries weren't surfacing in the attorney
     Inquiry Queue because /api/inquiries/with-status was missing
     explicit source / status / target_attorney_profile_id values
     the queue depends on (and the queue's accept list didn't
     enumerate 'status_broadcast'). Both sides now agree on
     source='status_broadcast' + status='open' +
     target_attorney_profile_id=NULL as the canonical shape for
     unpinned, jurisdiction-matched public inquiries. Same audit
     applied to /api/consultant/inquiries.
  3. ProfilePreviewDrawer returned "Profile not found" when an
     attorney clicked a client's avatar because /api/sellers/[id]
     only resolved seller records. Added a fifth fall-through to
     look up profiles directly and return a client-shaped preview
     (full_name, avatar_url, country, member_since, inquiry_count)
     when no seller matches and the profile's role is client.
     ProfilePreviewDrawer gains a role-aware client branch — no
     rating, no jurisdictions, no services grid, no marketplace
     profile link (clients have no public profile today).

Bonus: the messenger left rail now exposes an Inquiries nav button
for attorney + consultant viewers, routing them to the canonical
?page=mine queue view alongside the existing + Inquiry button for
clients.

No schema changes, no new dependencies, no // @ts-nocheck
re-introductions. npx tsc --noEmit clean.

Co-Authored-By: Kimi <noreply@moonshot.cn>
```

---

## §8 — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives ("Replace…", "Add…", "Do not…"). Match brief 30 / 36 / 37 / 38 / 39 / 40 / 41 / 42 register exactly. The commit message in §7 is pre-authored; do not change it.

---

**Single agent. Single commit. Worktree only. Return the standing-schema handoff with all §6 acceptance gates run locally.**
