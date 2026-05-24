# Brief 40 — Unified neutral palette + final messenger polish

**To:** Kimi (sole session)
**From:** Claude (engineering supervisor)
**Type:** Combined refactor + feature finish. Five parts (A-E), shipped as one PR per part. **Last brief in the messenger arc.**
**Predecessor briefs:** 37 (messenger), 38 (marketplace editorial), 39 (auth nav + inline messages), all closed.

---

## §0 — What this is

After brief 39 the portal has three working surfaces with three drifted palettes:

| Surface | Palette source | Vibe |
|---|---|---|
| Dashboards (`components/design/*.jsx`)         | `C` object in `components/design/shared.jsx` | Cyan/navy fiverr-workbench tech tones |
| Marketplace (`components/marketplace/*.tsx`)   | `T` + `F` in `components/marketplace/tokens.ts` | Warm sepia editorial (paper / vellum / ink) |
| Messenger (`components/messaging/*`)           | `--paper` / `--ink` / `--rule` in `messenger-tokens.css` | Same warm sepia + WhatsApp greens |

Plus the user has surfaced four discrete asks the brief-37 messenger never finished:

1. The messenger boots into **System** theme by default; the user wants **Light** as the default (System remains a selectable option in settings).
2. Wallpaper choice is fixed to Default / Paper / None; the user wants to **upload their own image** as a fourth option.
3. The WhatsApp-style 24-hour status broadcast is wired on the **attorney + consultant side only** (they see the ring). **Students cannot post a status**, even though the original prototype intended the student-side post to **be** the marketplace inquiry — a status broadcast = a public inquiry that attorneys and consultants pick up and respond to.
4. In the messenger, clicking the counterparty's avatar or name does nothing today. It should open a **profile preview drawer** with the seller's avatar, name, role, tagline, rating, top services, plus a link to the full marketplace profile.

Brief 40 closes all five issues in five focused PRs.

---

## §1 — Non-negotiable constraints (shared across A-E)

1. **No logic changes outside the surfaces enumerated in each part.** This is a tight scope brief. Do not refactor adjacent files just because you read them.
2. **No new fonts, no new dependencies.** Use what's in `package.json` today (`@clerk/nextjs`, Supabase client, Lora / Inter / Plex Mono via `next/font`).
3. **TypeScript:** `npx tsc --noEmit` must be clean **with `// @ts-nocheck` removed wherever it exists** on every file you touch. `UnifiedInbox.tsx` had its directive removed permanently in commit `bbf2e9b` and stays nocheck-free; do not put it back. Any new file you create starts type-checked.
4. **Worktree only.** Claude commits + pushes per the standing protocol. Each part lands as one focused commit on `main`.
5. **No Clerk satellite mode** (reverted in `6c08e52`). No touching `middleware.ts`. No touching the four mirror-on-write routes from `a4929f8`.
6. **Sequencing is binding.** Ship in order A → B → C → D. Each part returns a worktree-ready handoff; Claude approves + commits + pushes; then you start the next part.
7. **Real data only.** No mock arrays, no Lorem Ipsum. Empty states are the real-data empty states.

---

# PART A — Unified neutral palette

## §A.1 — The palette (binding)

### Neutral foundations (cool, not warm) — replace warm sepia + cyan/navy

| Token (T / messenger var)             | Dashboard `C` slot   | New hex | Old hex   | Role |
|---|---|---|---|---|
| `T.paper`     / `--paper`             | `C.bg`               | `#F7F8FA` | `#FBFAF7` | Page background — cool off-white |
| `T.paper2`    / `--paper-2`           | `C.surface2`         | `#EEF1F6` | `#F4F0E6` | Secondary surface |
| `T.paper3`    / `--paper-3`           | `C.surface3`         | `#DDE3EA` | `#ECE6D5` | Tertiary surface |
| `T.vellum`    / `--vellum`            | `C.surface`          | `#FFFFFF` | `#FFFEF9` | Cards + panels |
| `T.ink`       / `--ink`               | `C.text`             | `#0F172A` | `#1D2433` | Primary text |
| `T.inkMid`    / `--ink-mid`           | `C.textMuted`        | `#334155` | `#4A4F5B` | Body text |
| `T.inkSoft`   / `--ink-soft`          | `C.textDim`          | `#64748B` | `#7B7B72` | Muted text |
| `T.rule`      / `--rule`              | `C.border`           | `#E2E8F0` | `#D9D1BD` | Hairline borders |
| `T.ruleSoft`  / `--ruleSoft` / `--rule-soft` | `C.border2` / `C.borderSoft` | `#F1F5F9` | `#E7E0CD` | Soft dividers |

### Accent triplet (unchanged values — load-bearing across the codebase)

| Token | Hex | Role |
|---|---|---|
| `T.indigo` / `--indigo`           | `#3C3B6E` | Primary brand |
| `T.indigoDeep` / `--indigo-deep`  | `#2A2A55` | Hover + active |
| `T.indigoSoft` / `--indigo-soft`  | `rgba(60,59,110,0.08)` | Active-pill background |
| `T.brick` / `--brick`             | `#B22234` | Destructive + errors |
| `T.gold` / `--gold`               | `#C4A45A` | Highlights |
| `T.star` / `--star`               | `#C68B27` | Rating stars |
| `T.moss` / `--moss`               | `#5F6B3A` | Verified + success |

### Dashboard `C` extra slots

| `C` key            | New hex   | From |
|---|---|---|
| `cyan`             | `#3C3B6E` | (was legacy brand cyan → now unified indigo) |
| `cyanDark`         | `#2A2A55` | indigoDeep |
| `navy`             | `#0F172A` | ink |
| `red`              | `#B22234` | brick |
| `gold`             | `#C4A45A` | gold |
| `green`            | `#5F6B3A` | moss |
| `amber`            | `#D97706` | warning |

If `shared.jsx`'s `C` object has any **other** keys (e.g. `cyanSoft`, `divider`, `chip`), map them defensively: neutrals → nearest §A.1 analogue; accents → leave untouched. Log every such judgement call in your handoff.

### Messenger-only tokens — DO NOT TOUCH

`--wa-green`, `--wa-green-d`, `--wa-tick-blue`, `--bub-out`, `--bub-in`, `--chat-bg`, `--bub-link`, `--bub-shadow` are WhatsApp identity tokens. They stay byte-identical. Same with the `[data-theme="dark"]` overrides further down `messenger-tokens.css` — dark mode tuning is out of scope.

### Derived theme vars in `messenger-tokens.css`

Update the resolved values inside `.yousafe-messenger {` to match the new neutrals:

| CSS var | New value |
|---|---|
| `--bg`           | `#F7F8FA` |
| `--panel`        | `#FFFFFF` |
| `--panel-2`      | `#EEF1F6` |
| `--hover`        | `rgba(15,23,42,0.045)` |
| `--border`       | `#E2E8F0` |
| `--border-soft`  | `#F1F5F9` |
| `--text`         | `#0F172A` |
| `--text-mid`     | `#334155` |
| `--text-soft`    | `#64748B` |
| `--dim`          | `#98A2B3` |

## §A.2 — Three keystone files

1. `components/design/shared.jsx` — apply the §A.1 mapping to the `C` object in place. No key renames, no additions, no deletions.
2. `components/marketplace/tokens.ts` — apply the §A.1 mapping to the `T` object. `F` untouched.
3. `components/messaging/messenger-tokens.css` — apply §A.1 + derived theme vars. WhatsApp tokens untouched.

## §A.3 — Hardcoded hex audit

After the keystones land, run:

```
grep -rn "#FBFAF7\|#F4F0E6\|#ECE6D5\|#FFFEF9\|#1D2433\|#4A4F5B\|#7B7B72\|#D9D1BD\|#E7E0CD" \
  app/ components/ | grep -v node_modules | grep -v "\.next"
```

```
grep -rn "#1B2D4F\|#0EA5E9\|#22D3EE\|#06B6D4" \
  app/ components/ | grep -v node_modules | grep -v "\.next" | \
  grep -v "marketplace/tokens.ts" | grep -v "messenger-tokens.css"
```

For each match, swap the literal to the unified equivalent. Log every swap in a new file `docs/seo-briefs/40-audit-notes.md` (the only new file Part A authorises).

## §A.4 — Part A acceptance gates

- `npx tsc --noEmit` clean.
- Both audit greps above return zero matches.
- Hard-refresh `/dashboard`, `/marketplace`, `/marketplace/gigs/<slug>`, `/marketplace?view=messages` — all four share one neutral foundation; accent colours sit identically on all four.
- WhatsApp bubbles still render green-on-beige; `--chat-bg` unchanged.

---

# PART B — Messenger polish (Light default + custom wallpaper)

## §B.1 — Light as default theme

In `components/messaging/UnifiedInbox.tsx`, change the theme `useState` default and the hydration-effect fallback:

- The current default is `'system'`; change to `'light'` everywhere it appears as a fallback (search the file for `'system'` and the `prefers-color-scheme` block).
- `localStorage.yousafe.messenger.theme` reads continue to honour whatever the user has saved. Only the **first-ever-mount default** moves from `system` to `light`.
- The `MessengerSettings` panel's Theme segmented control keeps all three options — Light / Dark / System — but its initial highlighted state for a brand-new user is now Light.
- The `prefers-color-scheme` listener stays wired (so a user who explicitly chooses System still gets OS-following behaviour); it just is not the boot default anymore.

## §B.2 — Custom wallpaper upload

### §B.2.1 — Supabase storage bucket

Author a new migration file `supabase/messenger_wallpapers_bucket.sql`:

```sql
-- Create a private storage bucket for per-user messenger wallpapers.
-- Run via Supabase SQL Editor (Claude applies).
insert into storage.buckets (id, name, public)
values ('messenger-wallpapers', 'messenger-wallpapers', true)
on conflict (id) do nothing;

-- RLS: any authenticated user can read / write only their own folder.
create policy "users read own wallpaper"
  on storage.objects for select
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users upload own wallpaper"
  on storage.objects for insert
  with check (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users replace own wallpaper"
  on storage.objects for update
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own wallpaper"
  on storage.objects for delete
  using (
    bucket_id = 'messenger-wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Bucket is public-read** so the rendered `background-image` URL works without signed URLs. RLS still gates writes to the owner only. The folder convention is `{auth.uid()}/wallpaper.{ext}`.

### §B.2.2 — Upload API

New route `app/api/messenger/wallpaper/route.ts`:

- `POST` — accepts a `multipart/form-data` with field `file`. Validates: image MIME (`image/jpeg`, `image/png`, `image/webp`), max 4 MB, ≤ 4000×4000 dims. Uploads to `messenger-wallpapers/{profile_id}/wallpaper.{ext}` via the Supabase admin client (server-side, RLS bypassed). Returns `{ url }` with the public URL.
- `DELETE` — removes the user's wallpaper object. Returns `{ ok: true }`.

Auth via `requirePortalUser` (the canonical helper used by other portal routes); reject anonymous.

### §B.2.3 — Settings panel UI

In `components/messaging/MessengerSettings.tsx`, extend the Wallpaper section:

- Replace the three-option segmented control with a four-option grid (or vertical list): `Default doodle`, `Paper`, `None`, `Custom`.
- When `Custom` is selected and no upload exists yet, render an inline `<input type="file" accept="image/*">` styled as a paper-pill button labelled `Upload image`. On selection, POST to `/api/messenger/wallpaper`; show a spinner while uploading; on success, persist the returned URL to `localStorage.yousafe.messenger.wallpaper_url` and set `localStorage.yousafe.messenger.wallpaper = 'custom'`.
- When `Custom` is selected and an upload exists, render a 96×64 thumbnail of the current wallpaper with two buttons: `Replace` (re-runs the file picker) and `Remove` (DELETE call, then revert to `Default`).
- On error (oversized file, wrong MIME, network), show a brick-red inline error under the upload control with the specific reason.

### §B.2.4 — Apply the wallpaper

In `messenger-tokens.css`, add a new `[data-wallpaper="custom"]` selector scoped to `.yousafe-messenger`:

```css
.yousafe-messenger[data-wallpaper="custom"] {
  --chat-bg: var(--panel-2);                    /* fallback colour while the image loads */
}
.yousafe-messenger[data-wallpaper="custom"] [data-chat-canvas]::before {
  content: "";
  position: absolute; inset: 0;
  background-image: var(--chat-bg-image);       /* set inline from JS */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.92;
  pointer-events: none;
}
```

In `UnifiedInbox.tsx`, when `wallpaper === 'custom'` and a `wallpaper_url` is present, set `document.querySelector('.yousafe-messenger')?.style.setProperty('--chat-bg-image', \`url("${url}")\`)` inside the same `useLayoutEffect` that sets the other DOM attributes. Add the `data-chat-canvas` attribute to the existing chat messages region on `ChatScreen`'s render so the `::before` overlay anchors correctly. Other wallpaper modes ignore `--chat-bg-image`.

## §B.3 — Part B acceptance gates

- A brand-new user (clear `localStorage`) lands on `Light` theme, not System.
- Settings → Wallpaper → `Custom` → Upload image → image renders inside the chat canvas. Persists across refresh.
- Settings → Wallpaper → `Custom` → `Remove` → reverts to Default doodle, image deleted from storage.
- Oversized / wrong-MIME upload returns a brick-red inline error and does not corrupt local state.
- `npx tsc --noEmit` clean.

---

# PART C — Student status broadcast (the "+ Inquiry" flow)

## §C.1 — What this completes

Brief 37's `HANDOFF.md` §4b describes status broadcasts as the **student-facing** way to post a marketplace inquiry: a 24-hour public broadcast that lands in the status ring on the attorney + consultant side. The student composes via a 5-step `InquiryComposer` (`docs/seo-briefs/37-messenger-template/Inquiry.jsx`); on submit, one row lands in `inquiries` and one row lands in `inquiry_statuses`, both pointing at the same case.

Brief 37 §3.4 only landed the **viewer** side (the ring + `StatusViewer`). The **author** side — the composer + the submit pipeline + the seller's "Respond" action — is what Part C ships.

## §C.2 — InquiryComposer port

Port `docs/seo-briefs/37-messenger-template/Inquiry.jsx`'s `InquiryComposer` (the 5-step wizard) to a new client component `components/messaging/InquiryComposer.tsx`. Use the existing helpers in `lib/intake-questions.ts` (`docs/seo-briefs/37-messenger-template/inquiry-data.js` is a verbatim port of this — do not re-port it). Token chrome on the new component uses the unified palette from Part A.

Step list (must match prototype):
1. Country (US / UK / CA)
2. Case type (filtered by country, from `getCategorySourceLabels`-style lookup in `lib/intake-questions.ts`)
3. Urgency (Now / Soon / Later / Easy)
4. Tier-driving answers (`recommendTier()` result determines the recommended package)
5. Headline + summary (free text, validated against `lib/safety.ts`'s `safetyGuard`)

Submit handler calls a new server route `POST /api/inquiries/with-status`:

## §C.3 — Server route: `app/api/inquiries/with-status/route.ts`

- Auth via `requireClient` (only clients post inquiries).
- Validates payload with the existing `lib/safety.ts`. Rejects on filter hit with 422 + violations.
- In one Supabase transaction (chain inserts; if status insert fails, delete the inquiry row to keep them atomic — the existing `app/api/inquiries/route.ts` already has the atomicity pattern, mirror it):
  1. Insert into `inquiries` with the standard column shape.
  2. Insert into `inquiry_statuses` with `person_id` = the client's `profile_id`, `kind = 'inquiry'`, `inquiry_id` set, `payload` = `{ country_flag, case_type_label, urgency, tier }` snapshot, `expires_at` = `created_at + interval '24 hours'`.
- Honours the existing 10-active-statuses-per-buyer cap (look up the count first; if ≥ 10, return 409 + a friendly message).
- Returns `{ inquiry_id, status_id }`.

## §C.4 — "+ Inquiry" trigger

In `UnifiedInbox.tsx`, the left-rail header has a "Settings" gear and a star button after brief 37. **Only for the client role**, prepend a primary "+ Inquiry" button (indigo pill, `F.ui`, leading `+` glyph) at the top of the left rail above the search input. Click opens `InquiryComposer` as a modal (full-screen on mobile, side drawer on desktop). The button is hidden for attorney / consultant viewers.

`UnifiedInbox` derives the viewer's role from `/api/profile` on mount (the same hook `MarketplaceShell` already uses); cache it in a `useState` and gate the button on `role === 'client'`.

## §C.5 — Respond action in StatusViewer

In `components/messaging/StatusViewer.tsx`, the viewer currently auto-marks each status as viewed when displayed. Add a primary CTA `Respond` (indigo pill) **only** when the viewer is `attorney` or `consultant` and the status owner is **not** the viewer. The CTA calls a new server route `POST /api/statuses/[id]/respond`:

- Auth: `attorney` or `consultant`.
- Resolves the status → inquiry → `client_profile_id`.
- Calls the existing `getOrCreateConversation(viewer, client, 'inquiry', inquiry_id)` helper (already in `lib/conversations.ts`).
- Inserts an opening message into `conversation_messages` with `type='inquiry'` and `metadata = { inquiry_id, status_id }` so the existing `InquiryBubble` renderer picks it up.
- Returns `{ conversation_id }`. The client closes the viewer and navigates the inbox to the new conversation.

## §C.6 — Part C acceptance gates

- A signed-in client sees "+ Inquiry" at the top of the left rail; an attorney / consultant does not.
- Clicking "+ Inquiry" opens the 5-step composer. Submit fires `/api/inquiries/with-status` and lands one row in `inquiries` + one in `inquiry_statuses`. The status appears immediately in the client's own ring (mark-as-self, ring renders gold) and in every active attorney + consultant's status ring within the 12s `MarketplaceFeed` poll cycle.
- The off-platform safety filter (`safetyGuard` from `lib/safety.ts`) rejects a composer body containing a phone number / email / URL with the existing violation list.
- 11th active status returns 409 + a friendly inline message; the composer stays open with the body preserved.
- An attorney opens the status from the ring, taps `Respond`, lands in a freshly created conversation with the student's inquiry brief rendered as the opening `InquiryBubble`.
- `npx tsc --noEmit` clean. No schema changes (the migration in §B.2.1 is the only SQL in this brief).

---

# PART D — Avatar / name → profile preview drawer

## §D.1 — New component: `components/messaging/ProfilePreviewDrawer.tsx`

Right-side slide-in drawer (380px desktop, full-width mobile). Mounts at `z-index` higher than the messenger but lower than the `StatusViewer` (e.g. `z-index: 250`). Backdrop is `rgba(15,23,42,0.35)`; click closes.

Body:
- Avatar (96px), name in `F.display` 22px, role badge (`Attorney` / `Consultant` / `Client`).
- Tagline if present.
- Rating stars + count using `T.star`.
- Jurisdictions chips (attorney only).
- Specialties / practice areas (first 6, comma-separated).
- Languages.
- Years of experience.
- Top 3 active gigs by `order_count` (use the existing `/api/sellers/[id]/gigs` endpoint).
- Footer: `View full profile →` link → `https://market.yousafeconsultancy.com/providers/{username || profile_id}`.

Data source: `GET /api/sellers/[id]` — already exists and accepts profile_id, attorneys.id, or consultants.id. No new API route.

## §D.2 — Wire avatar + name clicks

In `UnifiedInbox.tsx`:
- The right-pane chat header currently shows the counterparty avatar + name (lines around the `ChatScreen` header prop). Add `role="button"`, `cursor: 'pointer'`, and an `onClick` that opens `ProfilePreviewDrawer` for `activeConv.counterpart.id`.
- Inside `ThreadMessage` (the message-renderer function), make the avatar element on `isFirstInGroup` incoming bubbles also a click target that opens the drawer for `m.sender_id`.

In `components/messaging/StatusViewer.tsx`, the header avatar + name are already clickable for "mark viewed" navigation — extend that to also open the same `ProfilePreviewDrawer` instead of just advancing.

## §D.3 — Part D acceptance gates

- In `UnifiedInbox`, clicking the chat-header avatar or name opens the drawer with the seller's data; closing returns focus to the chat input.
- Clicking an incoming bubble's avatar (only the `isFirstInGroup` one to avoid noise) opens the same drawer.
- The drawer's "View full profile →" link opens `market.yousafeconsultancy.com/providers/<username>` in a new tab.
- For a client's own avatar (the student looking at their own status ring), the drawer is suppressed (no useful info to show).
- `npx tsc --noEmit` clean.

---

# PART E — Swarm strategy + final hand-off

## §E.1 — Swarm assignments

Spin three parallel swarms within each part where files don't overlap:

| Part | Swarms | Files |
|---|---|---|
| **A** (palette) | S1: dashboard keystone (`components/design/shared.jsx`). S2: marketplace + messenger keystones (`components/marketplace/tokens.ts`, `components/messaging/messenger-tokens.css`). S3 (after S1+S2): hardcoded hex audit + new `docs/seo-briefs/40-audit-notes.md`. | per §A.2 / §A.3 |
| **B** (polish) | S1: Light default flip in `UnifiedInbox.tsx`. S2: Settings panel UI + custom wallpaper upload (`MessengerSettings.tsx` + `messenger-tokens.css` `[data-wallpaper="custom"]` block + JS apply in `UnifiedInbox.tsx`). S3: SQL migration `supabase/messenger_wallpapers_bucket.sql` + API route `app/api/messenger/wallpaper/route.ts`. | per §B |
| **C** (status flow) | S1: `components/messaging/InquiryComposer.tsx` port (new file). S2: `app/api/inquiries/with-status/route.ts` (new). S3: `UnifiedInbox.tsx` "+ Inquiry" trigger + role detection. S4: `StatusViewer.tsx` Respond CTA + `app/api/statuses/[id]/respond/route.ts` (new). | per §C |
| **D** (profile preview) | Single swarm: `components/messaging/ProfilePreviewDrawer.tsx` (new) + wiring in `UnifiedInbox.tsx` + `StatusViewer.tsx`. | per §D |

## §E.2 — Hand-off rhythm

After **each part**, return a standing-schema handoff (Stash status / Authorized phases shipped / Pending Claude action at top; body fields per the protocol). Claude reviews the worktree, applies any SQL via the Management API, then commits + pushes a single focused commit per part.

Do not start the next part until Claude posts the literal line **"BRIEF 40 PART <X> APPROVED — proceed to PART <Y>"**.

## §E.3 — Required commit messages (Claude uses these verbatim)

- Part A: `feat(theme): unify portal onto a cool neutral palette`
- Part B: `feat(messenger): light default, custom wallpaper upload, settings polish`
- Part C: `feat(messenger): student status / inquiry broadcast (composer + submit + respond)`
- Part D: `feat(messenger): profile preview drawer on avatar/name click`

## §E.4 — Out of scope

- Dark-mode tuning of the `[data-theme="dark"]` block in `messenger-tokens.css` (future brief).
- Group chat shapes (`conversations.type = 'group'`).
- Voice notes, polls (composer affordances remain inert as in brief 37 §2.5).
- Anything in brief 37 / 38 / 39 already approved.
- `app/api/admin/*`, `app/api/support/*` beyond what already exists.
- `middleware.ts`, Clerk config, satellite domains.

---

# §F — Voice module (mandatory)

Engineering prose. Strict, plain, terse, professional. Second-person imperatives ("Replace…", "Add…", "Do not…"). Match brief 30 / 36 / 37 / 38 / 39 register exactly. The commit messages above are pre-authored; do not change them.

---

**Start PART A. Return a single worktree-ready handoff covering all of Part A. Claude reviews, commits, pushes, then posts the proceed-to-B line. Repeat through D.**
