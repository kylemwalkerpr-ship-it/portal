# Yousafe Messenger — Implementation Handoff

> **For Claude Code (or any developer agent).** This bundle is a working
> WhatsApp-style messenger prototype for the Yousafe legal marketplace.
> It runs offline as a single HTML page backed by a localStorage store
> seeded with realistic data. Your job is to port it to the production
> Next.js portal at `kylemwalkerpr-ship-it/portal` and into the support
> SaaS at `kylemwalkerpr-ship-it/support-saas`.
>
> Everything here is *shape-stable*: data models, message types, store
> actions, and component contracts map 1:1 to the existing Supabase
> tables, RPCs, and components. **Do not invent new shapes — wherever
> the prototype names a column, an endpoint, or a status, use exactly
> that.** Where the prototype invented something new, this document
> calls it out explicitly with `[NEW]` and provides the full SQL.

---

## 1. What this bundle is

- A vanilla React + Babel prototype, runnable by opening `messenger.html`
  in a browser. No build step.
- A complete UI for every Yousafe role: **client (buyer), consultant,
  attorney, support, admin**. Each gets its own shell.
- Seed data covering the five roles, realistic conversations (I-130,
  Section 21 defence, OPT, PGWP, etc.), orders, inquiries, statuses,
  and support tickets.
- A localStorage-backed store (`store.jsx`) whose mutations are 1:1
  with backend API calls — every action carries the matching
  `POST/PATCH/DELETE` route in a comment above its function.

## 2. File map

| File | Purpose |
|---|---|
| `messenger.html`     | Entry point. Loads React 18.3.1, Babel 7.29, all modules in dependency order. |
| `messenger.css`      | Full design system: tokens, themes, components, modals, animations. |
| `safety.js`          | Off-platform contact filter (phone, email, URLs, payment-apps, obfuscation). Runs client-side; **port to server too**. |
| `data.js`            | Seed users, conversations, messages, orders, **inquiries**, **statuses**, **tickets**. |
| `inquiry-data.js`    | Country/case-type/question tree + `recommendTier()` — verbatim port of `lib/intake-questions.ts`. |
| `utils.jsx`          | Time/file/relative formatters — matches `lib/messaging/format.ts`. |
| `icons.jsx`          | Hand-drawn SVG icons. |
| `store.jsx`          | Single source of truth (React Context). Every action documents its production endpoint. |
| `Inquiry.jsx`        | InquiryComposer (5-step), StatusRing, StatusViewer, MarketplaceFeed, InquiryBubble. |
| `Offers.jsx`         | OfferCard, OfferComposer (role-aware), OfferRequestCard, OrdersPane. |
| `Support.jsx`        | SupportShell, SupportConversationView, RefundTicketModal, AdminTicketsShell, AdminTicketView. |
| `Bubble.jsx`         | All message-type renderers + per-message context menu. |
| `Composer.jsx`       | Input bar: text, emoji, attachments, voice, polls, offers. |
| `ChatList.jsx`       | Left rail: search, filters, archive, status rings, view tabs, pinned. |
| `Modals.jsx`         | ImageViewer, ForwardPicker, ArchivedView, StarredView, SettingsPanel, NewChatModal, ToastHost. |
| `ChatView.jsx`       | Right pane: header, message list, info panel, orders pane. |
| `app.jsx`            | App root — role-aware shell switcher, mounts all modals. |

## 3. Roles and shells

Roles match `profiles.role` from `allow_attorney_role.sql`:
**`client / consultant / attorney / support / admin`** (+ the legacy
seed value `student` which is treated as `client`).

Each role renders a different left rail + center pane:

| Role | Left rail | Center pane | Highlights |
|---|---|---|---|
| `client` (buyer) | `ChatList` | `ChatView` | "+ Inquiry" CTA, status ring on own avatar. Up to 10 active statuses. |
| `attorney` / `consultant` | `ChatList` (Chats tab) **or** `MarketplaceFeed` (Marketplace tab) | `ChatView` | Toggle pill at top. "+ Send offer" CTA in chat header for any buyer chat. |
| `support`     | `SupportShell` | `SupportConversationView` (read-only) | Sees every order's underlying buyer ↔ seller conversation. Can post `[Support]` system notes. "Raise refund ticket" CTA. |
| `admin`       | `AdminTicketsShell` | `AdminTicketView` | Pending / Approved / Denied filter. Approve / Deny actions trigger `escrow_system_v2` RPCs. |

The role toggle in Settings → "View as" lets a single account flip
between all five for demoing. **In production**: gate each shell on
`profiles.role` server-side; do not trust the client.

## 4. Data shapes — existing vs new

The portal already has `inquiries`, `inquiry_messages`, and
`attorney_offers` from `supabase/inquiries_pipeline.sql`. The support
SaaS already has `chat_conversations`, `chat_messages`, and
`chat_notifications` from `supabase/migrations/002_support_chat.sql`.
Reuse those — do not duplicate.

### 4a. Existing schema (use as-is)

`inquiries` columns to map this prototype's terms onto:

| Prototype | Production column |
|---|---|
| `id`               | `id` (uuid) |
| `buyer_id`         | `client_profile_id` |
| `country`          | `country` |
| `case_type`        | `case_type` |
| `case_type_label`  | `case_type_label` |
| `urgency`          | `urgency` |
| `tier.tier`        | `recommended_tier` |
| `answers`          | `answers` (jsonb) |
| `headline`         | first line of `meta.headline` *(extend meta)* |
| `summary`          | first line of `meta.summary` *(extend meta)* |
| `status`           | `status` (enum `'open','claimed','converted','closed','cancelled'` — the prototype's `'fulfilled'` becomes `'converted'`) |
| `claimed_by`       | `claimed_by_attorney_id` |
| `expires_at`       | computed (`created_at + 24h` for the status broadcast — see §4b) |

`attorney_offers` already matches the prototype's offer shape:
`title, description, price, delivery_days, status (sent / accepted /
declined / withdrawn / expired)`. Wire the prototype's
`OfferSendComposer` to `POST /api/messages/conversations/[id]/quick-offer`
which already inserts into this table.

### 4b. `[NEW]` — Status broadcasts table

The 24h WhatsApp-style status broadcast is **not yet in production**.
Add this migration:

```sql
-- supabase/inquiry_statuses.sql
create table public.inquiry_statuses (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.profiles(id) on delete cascade,
  kind            text not null default 'inquiry' check (kind in ('inquiry','text','image')),
  inquiry_id      uuid references public.inquiries(id) on delete cascade,
  payload         jsonb,                  -- snapshot: country_flag, case_type_label, urgency
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours'
);

create index inquiry_statuses_person_active_idx
  on public.inquiry_statuses (person_id, expires_at desc);
create index inquiry_statuses_active_idx
  on public.inquiry_statuses (expires_at) where expires_at > now();

create table public.inquiry_status_views (
  status_id       uuid references public.inquiry_statuses(id) on delete cascade,
  viewer_id       uuid references public.profiles(id) on delete cascade,
  viewed_at       timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

-- Cap: a buyer can have at most 10 active (non-expired) statuses.
-- Enforced in /api/inquiries POST handler:
--   if (await activeStatusCount(client_profile_id) >= 10) return 429.

alter table public.inquiry_statuses enable row level security;
alter table public.inquiry_status_views enable row level security;

create policy inquiry_statuses_select on public.inquiry_statuses
  for select using (
    person_id = auth.uid()                                  -- author
    or (select role from public.profiles where id = auth.uid())
       in ('attorney','consultant','admin','support')        -- pros + staff
    or exists (                                              -- prior counterparts
      select 1 from public.conversations c
      where c.client_profile_id = person_id
        and (c.attorney_id = auth.uid() or c.consultant_id = auth.uid())
    )
  );

create policy inquiry_status_views_self on public.inquiry_status_views
  for all using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());
```

### 4c. `[NEW]` — Support tickets table (void / refund)

```sql
-- supabase/support_tickets.sql
create type public.support_ticket_kind   as enum ('void','refund_partial','release_hold','other');
create type public.support_ticket_status as enum ('pending','approved','denied','cancelled');

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  conversation_id uuid references public.order_conversations(id) on delete set null,
  raised_by       uuid not null references public.profiles(id) on delete restrict,  -- support agent
  kind            support_ticket_kind   not null,
  amount_cents    bigint,                                                            -- null for kind='other'
  reason          text not null check (length(reason) >= 8),
  detail          text,                                                              -- admin-only private notes
  status          support_ticket_status not null default 'pending',
  decided_by      uuid references public.profiles(id) on delete set null,           -- admin
  decided_at      timestamptz,
  decision_notes  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index support_tickets_status_idx  on public.support_tickets (status, created_at desc);
create index support_tickets_order_idx   on public.support_tickets (order_id);
create index support_tickets_raised_idx  on public.support_tickets (raised_by);

create trigger support_tickets_updated
  before update on public.support_tickets
  for each row execute function public.handle_updated_at();

alter table public.support_tickets enable row level security;

-- Support agents can create + read their own tickets and tickets for orders
-- they touch. Admins can read everything and decide. Buyers and sellers
-- never see this table — system messages in their chat communicate state.
create policy support_tickets_support on public.support_tickets
  for select using (
    (select role from public.profiles where id = auth.uid()) in ('support','admin')
  );
create policy support_tickets_create on public.support_tickets
  for insert with check (
    (select role from public.profiles where id = auth.uid()) = 'support'
    and raised_by = auth.uid()
  );
create policy support_tickets_decide on public.support_tickets
  for update using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Trigger: when status flips pending → approved/denied, fire the escrow
-- RPC and drop a system message into the underlying conversation.
create or replace function public.on_support_ticket_decided() returns trigger as $$
declare
  sys_body text;
begin
  if old.status = 'pending' and new.status in ('approved','denied') then
    -- Approval → run escrow change via the existing RPCs in escrow_system_v2.sql.
    if new.status = 'approved' then
      if new.kind = 'void' then
        perform public.refund_order_full(new.order_id);
      elsif new.kind = 'refund_partial' and new.amount_cents > 0 then
        perform public.refund_order_partial(new.order_id, new.amount_cents);
      elsif new.kind = 'release_hold' then
        perform public.release_escrow_now(new.order_id);
      end if;
      sys_body := format('Admin approved support''s ticket — escrow %s.',
        case new.kind
          when 'void' then 'fully refunded'
          when 'refund_partial' then format('partially refunded ($%.2f)', new.amount_cents / 100.0)
          when 'release_hold' then 'released to seller'
          else 'updated'
        end);
    else
      sys_body := 'Admin denied support''s ticket. Order is unchanged.'
        || coalesce(' Note: ' || new.decision_notes, '');
    end if;

    -- System message into the order's conversation.
    insert into public.order_messages (conversation_id, sender_id, type, body, created_at)
    select new.conversation_id, null, 'system', sys_body, now()
    where new.conversation_id is not null;
  end if;
  return new;
end $$ language plpgsql security definer;

create trigger support_tickets_decide_trigger
  after update on public.support_tickets
  for each row execute function public.on_support_ticket_decided();
```

### 4d. `[NEW]` — Message types

Add to the message-type enum (`order_messages.type` / `conversation_messages.type`):

| New type | Carrier | Renderer |
|---|---|---|
| `inquiry`       | `attachment: { kind:'inquiry', inquiry_id }`              | `InquiryBubble` — auto-renders full Q+A brief from live inquiry row |
| `offer_request` | `attachment: { kind:'offer_request', title, … }`          | `OfferRequestCard` |

The existing `offer` type continues to render via `OfferCard`. The
`system` type already exists; **support's `[Support] …` notes use it
as-is** — no new column needed, just a `[Support]` prefix in the body.

## 5. Realtime channels

| Channel | Triggers | Consumers |
|---|---|---|
| `realtime:public:inquiries`         | Insert/update on `inquiries`                              | Every connected seller's `MarketplaceFeed` (prepends + flashes a pulse). |
| `realtime:public:inquiry_statuses`  | Insert on `inquiry_statuses` filtered by viewer authority | Avatar status rings light up live. |
| `realtime:public:support_tickets`   | Status flips                                              | Support sees their submitted-ticket banner update; admin's queue gets a new row. |
| `realtime:public:order_messages` filtered to system rows | New `[Support]` / `[Admin]` system messages | Both chat parties see the notice in real time. |

The prototype simulates all four via window `CustomEvent`s
(`mc-inquiry-created`, `mc-ticket-created`, `mc-toast`). Replace with
Supabase channels in production.

## 6. The inquiry composer (5 steps, picker-first)

This is the most important UX requirement: a buyer should be able to
publish a rich, well-structured inquiry in **≤5 steps**, mostly through
selectors. The composer is implemented in `Inquiry.jsx` →
`InquiryComposer`. The five steps:

| # | Step | UI | Required? |
|---|---|---|---|
| 1 | Country     | 3 big tappable cards (flag + name + blurb) | Yes |
| 2 | Case type   | 6 case-type cards (per country, icon + label + Q count) | Yes |
| 3 | Details     | Picker-only questions (select / multiselect) for the case type; freeform fields are intentionally filtered out here | Skipped if no picker Qs |
| 4 | Urgency     | Universal urgency picker + (for immigration cases) prior-denial picker | Yes |
| 5 | Review      | Headline (auto-filled), optional summary, recommended tier card | Headline required (auto) |

Rules:

- Picking a card on step 1 or 2 auto-advances.
- Step 3 / step 4 self-skip if there are zero applicable questions.
- The summary on step 5 is optional but capped at 400 chars.
- All copy passes through `safety.scanMessage` before publish.
- **A buyer can have at most 10 active (non-expired) statuses.** Enforce
  in `POST /api/inquiries`: return `429 'Inquiry cap reached'` when
  the buyer already has 10 active rows in `inquiry_statuses`.

**`recommendTier()` is verbatim** from `lib/intake-questions.ts`. Do not
reimplement; import it.

## 7. Status ring (WhatsApp parity)

`InquiryStatusRing` is a presentational wrapper. Pass a `personId` and
the existing avatar as children. The ring:

- Renders only when that person has an active (not-expired) status.
- **Stays fixed** (no rotation). Pulses a soft green glow when at least
  one status is unviewed by the current user — see the
  `@keyframes statusring-glow` rule in `messenger.css`. The conic
  gradient is static; the `box-shadow` animates.
- Goes grey (`viewed`) when all are viewed.
- On click, opens `InquiryStatusViewer`.

Wrap `components/messaging/Avatar.tsx` with a `StatusRing` HOC, and use
that wrapper everywhere `Avatar` is imported. Keep the existing
online-dot + verified-badge slots inside the ring's `statusring-inner`
child.

## 8. Marketplace feed (attorney/consultant)

Tabs:

- **All open** — every `status='open'` inquiry, newest first.
- **Urgent** — only `urgency='now'`.
- **Matching** — eventual filter against the seller's profile country /
  practice areas. Currently a stub (`meCountry = null`).

Each row card:

- Buyer avatar with status ring (clicking = view status).
- Buyer name + country flag.
- Time ago.
- Urgency chip (red urgent / gold standard / green easy).
- Case-type icon + headline.
- Two-line summary (line-clamped).
- Footer: recommended tier + `View status` + `Reply` (primary).

`Reply` → `claimInquiry(id)` → server creates/reuses DM, posts pinned
inquiry message, marks inquiry as claimed, redirects view to chats.

## 8a. Responding to a status (full brief auto-generation)

When an attorney/consultant clicks **Reply** on a status (from the
marketplace feed, from the status viewer, or from a buyer's avatar
ring), the backend MUST:

1. Get-or-create a conversation between the buyer and the responding
   seller. Use the existing `inquiry_messages` table for pre-order
   chat; once an order opens, the same logical thread continues in
   `order_messages` (link via `orders.source_inquiry_id`).
2. Post a system message: `"<seller name> replied to your inquiry"`.
3. Post a single message of `type='inquiry'` with attachment
   `{ kind: 'inquiry', inquiry_id }`. **This single message is the
   conversation brief.** When rendered (`InquiryBubble`), the card
   automatically expands every question and answer from the buyer's
   intake form, plus the country, case type, urgency, recommended
   tier, and source name. *Both* parties see this — the buyer sees a
   reminder of what they submitted, the seller sees a structured
   reference for the call.
4. Flip the inquiry's `status` from `'open'` to `'claimed'` with
   `claimed_by_attorney_id = seller_id` and broadcast on the realtime
   channel so other sellers' feeds remove the row.

The brief renderer (`InquiryBubble`) joins on the live inquiry record
each render, so if the buyer edits or closes the inquiry the brief
updates everywhere. Treat the inquiry as the canonical artefact;
the message just references it.

Seller's `InquiryBubble` also surfaces a **Send custom offer** CTA at
the bottom that pre-fills the offer composer (see §10) — this is the
natural next step after reading the brief.

## 9. Safety filter (defense-in-depth)

`safety.js` blocks off-platform contact exfiltration. **The same logic
must run server-side** — block at API entry, not just on the client.
The function names and pattern bank port directly to TypeScript.

Existing detections:

- Phone (US + intl, with separators or spaced)
- Email
- External URLs (allowlist: mycaseworks, yousafe)
- Bare domains
- @handles, Telegram/WhatsApp link domains
- $cashtags, payment-app names
- Obfuscation: "g m a i l . c o m", "(at)", "[dot]", spaced digits

Soft violations ("text me", "call me", "let's take this off") trigger a
"Send anyway?" confirmation, not a hard block.

## 10. Offers — attorney initiation (production grade)

The portal already ships `components/messaging/OfferComposerInline.tsx`
(8.8KB inline form) and `components/messaging/OfferPaymentModal.tsx`
(23KB 3-method checkout). **This prototype's offer creation should
plug into those existing modules — not replace them.** Specifically:

1. **Keep `OfferComposerInline` for the field set** — the contract
   (`title`, `description`, `price`, `delivery_days`, `revisions`,
   `expires_in_days`) is already correct and wired to
   `/api/messages/conversations/[id]/quick-offer`. Wrap that inline
   form in a modal shell matching the design here: navy primary
   (`#1B2D4F` from `OfferPaymentModal`), gold offer eyebrow (`#9A7B3B`
   from the same file), Cormorant Garamond display, IBM Plex Mono
   kickers, dashed section rules.

2. **Add the seller's entry points** in three places:

   a. **Chat header pill (PRIMARY)** — when the viewer is an
      attorney/consultant **and** the counterparty is a client,
      render a gold pill `+ Send offer` in `cv-head-actions` (next to
      the context label). This is the **most discoverable** entry
      point and the one most production users will use.

      ```tsx
      // ChatHeader, after the context label
      {meIsSeller && cpIsClient && conv.type === 'dm' && (
        <button onClick={() => openOfferComposer(conv.id)}
                className="cv-head-offer-cta">
          + Send offer
        </button>
      )}
      ```

   b. **Composer pill** — keep the existing `+ Offer` chip at the
      left of the input. This is the *secondary* entry, mostly for
      mid-message decisions.

   c. **Inquiry card CTA** — when an attorney views a buyer's
      inquiry brief in chat, render a `Send custom offer` button at
      the bottom of the card that pre-fills the composer with the
      inquiry's `headline`, `summary`, and `recommended_tier.price`.
      See `InquiryBubble`'s `mc-open-offer-composer` event.

3. **Pass `prefill` through the modal** — the composer accepts a
   `prefill` prop with `{ headline | title, summary | description,
   tier: { price } }`. Pre-fill the title with the inquiry headline,
   description with the summary, and seed the price input from the
   tier's lower bound. Sellers can edit freely from there.

4. **Live preview pane** — keep the right-column preview that renders
   the buyer-facing offer bubble in real time as the seller edits.
   Uses the same `OfferCard` the real chat uses, with `mine={false}`
   to show the buyer's Accept & Decline buttons.

5. **Payout breakdown** — buyer pays → 8% platform fee → seller net.
   Pull the real fee from `lib/offerPricing.ts` rather than hardcoding.

6. **Escrow language** — every offer modal must repeat the escrow
   promise ("held until you mark the work complete, releases 7 days
   after delivery if no revision requested"). This is the platform's
   primary trust signal.

7. **OfferPaymentModal stays as-is** — the buyer's "Accept & Pay"
   button on the OfferCard opens the existing 3-method modal (wallet
   / saved card / new card). The Accept button this prototype renders
   should call into `<OfferPaymentModal offerId={...} open={true} />`.

### Buyer-side request flow

For buyers (clients), the analogous flow is "Request a custom offer"
— a narrower modal asking what they need, budget range (or "I'm
open"), and timeline. Posts as a new `offer_request` message type. See
`Offers.jsx → OfferRequestComposer`.

## 11. Support module (third module — NEW)

The **Support Console** is a third UI surface, distinct from buyer and
seller views. It lives at the same URL but renders different shells
based on `profiles.role`. Two implementation options:

- **Option A (recommended): bring support inside the portal.** Mount
  `SupportShell` + `SupportConversationView` at `/dashboard/support`
  under a `role='support'` guard. Reuse the portal's
  `conversations`/`order_messages` tables — read-only.
- **Option B: keep support in support-saas.** Wire support-saas to read
  the portal's `order_messages` via a cross-database view or a service-
  role-tokened API endpoint (`GET /api/admin/conversations/[id]/messages`).
  Render the same shell there.

Either way, the contract is:

### 11a. Support's left rail — order list

`SupportShell` renders one row per order with:

- Buyer + seller avatar pair (stacked, slightly offset).
- Order title.
- Order ID, total, escrow held.
- Status chip (or **Ticket open** if `support_tickets.status='pending'`
  exists for this order).
- "LIVE" indicator at the top — orders update in real time as escrow
  state changes.

Filters: **All orders** · **In progress** · **Delivered** · **Flagged**
(only orders with a pending ticket).

### 11b. Support's center pane — read-only conversation

Click any order → `SupportConversationView` loads the **full buyer ↔
seller conversation** in read-only mode. The header shows:

- Both party avatars with an "×" between (no message-direction
  ambiguity — support is third-party).
- Order title + ID as the subtitle.
- A bright "Raise refund ticket" CTA in the top-right (gold/red
  pill).
- A green "Support read-only view" banner above the message list.

The composer at the bottom is **system-only**: anything typed posts
as a `system` message prefixed with `[Support]`, visible to both the
buyer and seller. This is for visible support intervention
("We're reviewing your dispute — back to you in 24h").

For **private notes** that admin should see but the parties shouldn't,
use the ticket's `detail` field (see 11c).

### 11c. Refund ticket modal

`RefundTicketModal` opens from the chat-header CTA. The form:

| Step | UI |
|---|---|
| Ticket type     | Four radio cards: **Void order** (full refund) / **Partial refund** / **Release escrow early** / **Other admin action** |
| Amount          | USD input, auto-locked to the escrow balance for `void` and `release_hold` |
| One-line reason | Public-facing — appears in the system message both parties see |
| Detail          | Long-form private notes for admin (not visible to buyer or seller) |

On submit → `POST /api/support/tickets` → row in `support_tickets`
with `status='pending'`. The server simultaneously posts a system
message into the order's conversation:
`"Support has opened a ticket on this order (#MC-2918). Pending admin review."`

### 11d. Realtime + audit

- Every ticket fans out on `realtime:public:support_tickets` so the
  admin's queue lights up instantly.
- Every system message in the order conv fans out on the existing
  `order_messages` realtime channel — buyer + seller see support's
  intervention in real time, no refresh needed.
- All ticket state transitions are auditable via `created_at`,
  `updated_at`, `decided_by`, `decided_at` — keep these immutable.

## 12. Admin module (superadmin — NEW)

The **Admin Tickets** shell is the approval surface. Production: this
lives in the saas dashboard's superadmin view.

### 12a. Admin's left rail — pending queue

`AdminTicketsShell` renders one row per ticket, defaults to the
**Pending** filter. Each row:

- Big red icon (alert circle).
- "Ticket · *kind*" title (e.g. "Ticket · refund partial").
- Reason text (truncated).
- Footer: order ID short, amount, order title.
- Status chip on the right.

Filters: **Pending** · **Approved** · **Denied** · **All**.

### 12b. Admin's center pane — ticket review

Click a ticket → `AdminTicketView` shows the full case:

- **Order section** — title, ID, status, total, escrow, buyer, seller.
- **Support's case** — type, amount, public reason, private detail
  (admin-only).
- **Last 6 messages** of the underlying conversation, inline (so admin
  doesn't have to context-switch).
- **Decision card** — a textarea for the decision note + Approve /
  Deny buttons. Notes are required for denials, optional for approvals.

On **Approve**: the `support_tickets_decide_trigger` SQL trigger fires
(see §4c) which:
1. Runs the matching `escrow_system_v2` RPC (`refund_order_full`,
   `refund_order_partial`, or `release_escrow_now`).
2. Posts a `system` message into the order's conversation: "Admin
   approved support's ticket — escrow fully refunded."
3. Updates the ticket row: `status='approved'`, `decided_by`,
   `decided_at`, `decision_notes`.

On **Deny**: status goes to `denied`. The system message reads:
"Admin denied support's ticket. Order is unchanged. Note: …"

### 12c. Safety rails

- Decisions are **one-way** — once approved/denied, the ticket cannot
  be reopened. If new info arrives, support raises a new ticket.
- Two-person rule: support can never decide their own ticket. The
  `support_tickets_decide` RLS policy enforces `role = 'admin'` for
  updates.
- Approvals run inside a Postgres transaction so escrow moves and the
  status flip commit atomically — partial failures are impossible.

## 13. State management — what each store action maps to

`store.jsx` is the single source of truth. Each action header carries
its production endpoint. The full mapping:

```
sendMessage         POST   /api/messages/conversations/[id]
sendSystemMessage   POST   /api/messages/conversations/[id]   { type: 'system', body }
markRead            PATCH  /api/messages/conversations/[id]   { read: true }
togglePin           PATCH  /api/messages/conversations/[id]   { pinned: ... }
toggleArchive       PATCH  /api/messages/conversations/[id]   { archived: ... }
setMute             PATCH  /api/messages/conversations/[id]   { muted_until: ... }
toggleBlock         PATCH  /api/messages/conversations/[id]   { blocked: ... }
deleteConversation  DELETE /api/messages/conversations/[id]
clearMessages       PATCH  /api/messages/conversations/[id]/clear
toggleReaction      POST   /api/messages/conversations/[id]/messages/[mid]/react
toggleStar          PATCH  /api/messages/conversations/[id]/messages/[mid]  { starred: ... }
deleteMessage       DELETE /api/messages/conversations/[id]/messages/[mid]  { scope: ... }
editMessage         PATCH  /api/messages/conversations/[id]/messages/[mid]  { body: ... }
forwardMessage      POST   /api/messages/forward
updateOffer         PATCH  /api/offers/[id]/[accept|decline|withdraw]
updateOrder         PATCH  /api/orders/[id]
createInquiry       POST   /api/inquiries                    [existing — already wired]
claimInquiry        POST   /api/inquiries/[id]/claim         [extend to inject InquiryBubble msg]
updateInquiryStatus PATCH  /api/inquiries/[id]
markStatusViewed    POST   /api/statuses/[id]/view           [NEW — see §4b]
createSupportTicket POST   /api/support/tickets              [NEW — see §4c]
decideTicket        PATCH  /api/admin/tickets/[id]           [NEW — see §4c]
```

## 14. Implementation order suggestion

1. Apply the migrations in §4b (statuses) and §4c (support_tickets).
2. Port `safety.js` to `lib/safety.ts` and apply it as middleware to
   all message POSTs + inquiry POSTs.
3. Replace the existing student "inquiries" section with
   `InquiryComposer` from `Inquiry.jsx`. Wire `POST /api/inquiries` to
   also insert into `inquiry_statuses` and broadcast.
4. Wire Supabase Realtime for `inquiries`, `inquiry_statuses`,
   `support_tickets`, and the existing `order_messages` channels.
5. Replace the marketplace landing's "Hot inquiries" feed with the
   `MarketplaceFeed` component.
6. Add `InquiryStatusRing` to `components/messaging/Avatar.tsx`.
7. Replace `UnifiedInbox` left-rail with the prototype's role-aware
   tabbed ChatList (Chats + Marketplace).
8. Polish: wrap `OfferComposerInline.tsx` in the modal chrome from
   this prototype, add the three seller entry points (§10).
9. **Support module:** mount `/dashboard/support` (Option A) or extend
   support-saas's `support-dashboard.tsx` (Option B). Hook up the
   ticket form + read-only conversation view.
10. **Admin module:** mount under the existing saas dashboard's
    superadmin route. Hook the Approve/Deny actions to the
    `support_tickets` table — the trigger does the rest.

## 15. Loose ends to handle in production

- **Pagination + virtualization** on the marketplace feed and the
  ticket queue. Add Supabase cursor pagination and `react-window` if
  open count > 200.
- **Status expiry job** — a Supabase cron (`inquiry_cleanup_cron.sql`
  already exists for inquiries) to archive statuses when `expires_at`
  lapses.
- **Anti-spam** on inquiry creation — rate-limit per buyer (e.g. 3 per
  24h beyond the 10 active cap) and run the inquiry text through the
  toxicity classifier the chat uses.
- **Notification fan-out** — when a buyer posts an inquiry, push a
  notification (email + portal toast) to the sellers in their country
  and case-type taxonomy.
- **Translations** — every string in the JSX needs to flow through
  `lib/translations.ts` / the `T` component. The prototype is
  English-only.
- **A11y** — the prototype uses role, aria-modal, and labels in places
  but is not exhaustive. Audit before ship.
- **Audit log** — `support_tickets` history is queryable but if you
  need a per-row event log, add `support_ticket_events` with the
  before/after JSON for each transition.
- **Refund webhook** — the escrow RPCs already coordinate with
  Stripe/NMI via `lib/payments/providers/nmi.ts`. Confirm the
  refund event flows back into the `payment_acknowledgments` table.

## 16. Running the prototype locally

```bash
# any static file server works
npx serve .            # then open messenger.html
```

No build, no deps. State persists to `localStorage` under
`mc_whatsapp_v6` — bump the key in `store.jsx` to wipe.

To preview every role flow quickly:
- Open Settings (gear icon top-left).
- Toggle "View as" → **Buyer / Attorney / Consultant / Support / Superadmin**.
- Each role lands on its native shell.

That's it. Ping back with questions, or just port one module at a time
and reference the prototype side-by-side.
