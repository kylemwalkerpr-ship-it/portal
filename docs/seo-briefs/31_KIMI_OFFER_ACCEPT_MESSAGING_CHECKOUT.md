# Kimi Brief 31 — Offer-Accept Fix · WhatsApp Messaging · Catalogue NMI Checkout

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** briefs 27-30 merged and deployed. Read `00_HOUSE_STYLE.md`
and, in the repo, `lib/apiEnvelope.ts`, `app/api/offers/[id]/accept/route.ts`,
`components/messaging/OfferPaymentModal.tsx`, `components/messaging/UnifiedInbox.tsx`.

Three independent issues. **§1 is CRITICAL and live in production — do it
first.** §2 and §3 can follow. Execute exactly.

---

## §1 — CRITICAL — OFFER ACCEPT IS BROKEN

### 1.1 The bug

When a student clicks "Accept & Pay" on an offer in messages, the page
crashes ("We hit a snag") with console errors: `405 offers`, `404 orders`,
`500 data`, `402 accept`, and **React error #31** (rendering
`object with keys {message, balanceCents, requiredCents}`).

Root cause: brief 28R rewrote `POST /api/offers/[id]/accept` into the
**single atomic money action** — it debits the wallet, creates the order,
and credits the provider earning, all on `POST`. But
`components/messaging/OfferPaymentModal.tsx` was never updated. It still
treats `accept` as a *loader*:

- On modal open (`useEffect`, ~line 60) it fires `POST /api/offers/[id]/accept`
  just to read the offer for display. If the buyer's balance is sufficient
  this **silently charges them before they click Pay**. If not, it returns
  `402`.
- `lib/apiEnvelope.ts` `fail()` returns `{ data:null, error:{ message, ...details }, meta }`
  — `error` is an **object**. The modal does `setError(acceptJson?.error)`,
  putting an object into React state, then renders `{error}` as a child →
  **React #31 crash**.
- The modal's `handlePay` then `POST`s `/api/checkout/order` — a second,
  duplicate offer-payment path. After the open-time `accept` already ran,
  this double-charges or errors.

### 1.2 The fix — make `accept` the one canonical offer-payment path

**A. Add a read-only `GET` to `app/api/offers/[id]/accept/route.ts`.**

Add an exported `GET` handler that returns the data the modal needs to
*display* the offer, **without debiting, without creating an order, without
crediting earnings**. It must:

1. `requirePortalUser`, role `client`.
2. Load the offer; verify `recipient_id === auth.profileId`, status
   `pending`, not expired (same checks the POST handler already does).
3. Resolve `amount` from `discounted_price || price`, compute `platformFee`
   / `total` / `netPayout` with the **same helpers the POST handler uses**
   (`computePlatformFeeCents` / `computeNetPayoutCents`).
4. Read the wallet balance via `getOrCreateWallet`.
5. Return `ok({ offer, breakdown: { subtotal, platform_fee, tax: 0, total },
   balanceCents })`.

Do not change the existing `POST`/`PATCH` (the atomic action) — only add `GET`.

**B. Rewrite `components/messaging/OfferPaymentModal.tsx`.**

- On open: call **`GET /api/offers/[id]/accept`** (the new read-only route)
  for the breakdown + balance. Never `POST` on open.
- The "Pay" button: call **`POST /api/offers/[id]/accept`** exactly once.
  This is the whole payment. On `ok` → `onPaid?.()` + `onClose()`. On
  non-ok → see error handling below.
- **Delete the `/api/checkout/order` call entirely** — that path is dead
  for offers.
- The insufficient-balance branch (`402`): the response is
  `{ error: { message, balanceCents, requiredCents } }`. Show
  `error.message` (a **string**) plus a "Top up wallet" link to
  `/student?goto=billing`, and display `requiredCents` vs `balanceCents`.

**C. Error handling — never put an object in React state.**

Everywhere the offer flow reads an API error, extract the **string**:

```js
const msg = json?.error?.message || json?.error || `Request failed (${res.status})`
setError(typeof msg === 'string' ? msg : 'Something went wrong.')
```

`error` state must always be `string | null`. Audit `OfferPaymentModal.tsx`
and `UnifiedInbox.tsx` (`handleOfferDecline`, `handleOfferWithdraw` do
`throw new Error(d?.error || …)` — `d.error` is now an object, so this
throws `Error("[object Object]")`; change to `d?.error?.message`).

### 1.3 Self-check for §1

- Opening the modal performs **no** debit (it only `GET`s).
- Clicking Pay debits exactly once and never calls `/api/checkout/order`.
- An insufficient-balance offer shows a clean "top up" message — no crash,
  no React #31, no white "We hit a snag" page.
- After accept, the thread + dashboard refresh with no `405`/`404`/`500`
  in the console.

---

## §2 — MESSAGING UI: WHATSAPP-STYLE CHAT

`components/messaging/UnifiedInbox.tsx` (mounted in `student.jsx`,
`attorney.jsx`, and the consultant dashboard) currently renders the thread
as a flat "sheet" of bubbles. Make the **thread pane** read like a modern
chat app (WhatsApp/iMessage). **UI only — do not change any data wiring**
(`loadList`, `loadThread`, `send`, polling, the offer handlers all stay).

Redesign the thread pane (the right `<main>`, the `ThreadMessage`
component, and the composer):

1. **Chat background** — give the scrolling thread a soft neutral backdrop
   (e.g. `#ECE7DF` / a faint texture), not flat white, so bubbles read as
   bubbles.
2. **Bubbles** — sent (mine) = filled brand colour (`NAVY` or `GREEN`) with
   white text, aligned right; received = white/`SURFACE` bubble, dark text,
   aligned left. Tighter padding, ~14px radius, a slight corner "tail" on
   the sender side. Max width ~75%.
3. **Group consecutive messages** from the same sender — collapse the gap
   between them; only the last in a run shows the timestamp.
4. **Timestamp** — small and subtle, bottom-right *inside* the bubble (not
   a separate MONO line under every message).
5. **Date separators** — a centered pill ("Today", "Yesterday", or
   `MMM D`) between messages from different calendar days.
6. **Composer** — a single rounded auto-growing input (1 line that grows,
   not a fixed 2-row textarea) with a circular send button. Keep the "💰
   Offer" button for `canSendOffer` users.
7. If the Messages view is presented in a modal/panel, the chat must fill
   it cleanly — no giant serif "Messages." page header crammed inside; keep
   chrome minimal (counterpart avatar + name + context, that's it).
8. Keep the left conversation-list pane and its behaviour as-is.

House style; honest copy; no emojis beyond what is already there.

---

## §3 — CATALOGUE: ADD DIRECT NMI CARD CHECKOUT

In the **student dashboard catalogue** (`components/design/student.jsx`,
the "services and templates" catalogue + its checkout modal), a student can
currently only pay from **wallet balance** (and the flow still calls the
**deleted** route `/api/checkout/wallet` — a bug). The user wants a direct
**pay-with-card** option so a student can buy a template/service without
pre-loading the wallet.

### 3.1 Backend

- **Templates:** `app/api/payments/charge/route.ts` already exists — it
  takes `{ token, items, customer }`, validates slugs against the
  catalogue, charges via `getPaymentProvider().charge()`, writes
  `template_orders`. Reuse it as-is for the new-card template path.
- **Saved card:** add support for paying a catalogue item with a vaulted
  card — accept a `paymentMethodId` (a `student_payment_methods` row),
  resolve its `vault_id`, and use `getPaymentProvider().chargeVaulted()`.
  Add this to `payments/charge` (branch on `token` vs `paymentMethodId`),
  mirroring how `app/api/wallet/topup/route.ts` already handles both.
- **Services:** if a service/gig catalogue item cannot already be charged
  by card, extend `payments/charge` to resolve service items server-side
  (price from the authoritative services source, never the client) and
  create the matching order row — same validate-server-side discipline.
- **Remove the dead `/api/checkout/wallet` call** in `student.jsx` — point
  the wallet-balance path at the live wallet route (`/api/wallet/debit`,
  which already resolves prices server-side and debits the wallet).

All card data stays client-side via Collect.js tokenisation (the
`initCollectJs` infra already exists in `student.jsx`). Never send a PAN to
our server. Never trust a client-supplied price.

### 3.2 UI

In the catalogue checkout, present three tender options for any item:

- **Wallet balance** — debit the wallet (`/api/wallet/debit`). If short,
  link to Top Up.
- **Saved card** — pick a `student_payment_methods` card (show brand +
  last4) → `payments/charge` with `paymentMethodId`.
- **New card** — NMI Collect.js fields → tokenize → `payments/charge` with
  `token`.

On success: show the existing confirmation and record the order. On a
gateway decline: surface the gateway message, no order created.

---

## §4 — VERIFICATION

```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
grep -n "checkout/order" components/messaging/OfferPaymentModal.tsx | wc -l | awk '{print "checkout/order in modal (expect 0):", $1}'
grep -nE "export (async )?function (GET|POST|PATCH)" "app/api/offers/[id]/accept/route.ts"
grep -rn "api/checkout/wallet" app/ components/ 2>/dev/null | wc -l | awk '{print "dead checkout/wallet calls (expect 0):", $1}'
git status --porcelain | grep -v /.next/
```

Required: `build: 0`; `checkout/order` gone from the modal; the accept
route exports `GET` + `POST` + `PATCH`; 0 `checkout/wallet` calls.

Manual: accept an offer with sufficient balance (debits once, no crash);
accept with insufficient balance (clean "top up" message, no React #31);
buy a template with a new card and with wallet balance.

---

## §5 — EDITORIAL GATE (Claude)

Reject if: opening the offer modal debits the wallet; the modal still calls
`/api/checkout/order`; any API error object is put into React state or
rendered as a child; the accept `GET` mutates anything; messaging data
wiring changed; a client-supplied price/amount is trusted; a PAN reaches
the server; the dead `/api/checkout/wallet` call survives; build not
idempotent.

---

## §6 — HANDOFF

No zip. Report the §4 output and a one-line note on each of the three
manual checks. Do not commit or branch — Claude reviews and commits.
