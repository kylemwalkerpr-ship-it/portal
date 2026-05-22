# Kimi Brief 28 — Complete Stripe Excision Across the Platform

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** brief 27 shipped (commits 4907b31 → 41744f6). Read
`00_HOUSE_STYLE.md`, `lib/payments/README.md`, `lib/payments/types.ts`,
`lib/wallet.ts`, `supabase/wallet_nmi.sql`.

This is the biggest money brief. Execute exactly. Claude gates it strictest.

---

## 0. WHY — STRIPE IS GONE, FINISH THE JOB

The Stripe account is terminated. Brief 27 re-wired the **student wallet**.
But Stripe is still wired throughout: gig tier checkout, service checkout,
offer payment (the literal "Pay with Stripe" button in the message offer
modal), Stripe Connect for attorney/consultant payouts, the admin Payouts
queue, the Stripe webhook, `lib/stripe.ts`, `lib/stripeCustomer.ts`,
`lib/payouts.ts`, and many user-visible copy strings.

Patching one surface while leaving Stripe alive on the others **will**
silently re-introduce a dead dependency on the next code path traversal.
The only safe state is: **no Stripe anywhere** — in code, secrets, env,
copy, or DB-column reads — replaced by the existing `lib/payments` (NMI)
+ `lib/wallet` (Supabase) + a new **manual-payout queue** for providers.

---

## 1. THE MENTAL MODEL (read this before touching code)

There are four roles and three money flows. End-state:

| Role | Pays in | Receives | Surface |
|---|---|---|---|
| **Student / Client** | NMI (Collect.js → wallet top-up, or direct charge for guest template buys) | Refunds (wallet credit) | Wallet UI, marketplace, message offers |
| **Attorney** | — | Manual payout (admin marks paid; bank/ACH/Wise out-of-band) | Earnings dashboard, payout history |
| **Consultant** | — | Manual payout (same) | Earnings dashboard, payout history |
| **Admin** | — | — | Earnings reconciliation, manual payout queue, refund actions |

**Money flow A — Buyer pays for anything (gig tier, service, offer, template):**
1. Signed-in student → debit `student_wallets.balance_cents` via the
   `wallet_debit` Postgres RPC. The ledger row records the order.
2. Signed-in student with insufficient balance → prompt top-up.
3. Guest (templates only) → direct NMI `charge()` via the existing
   `/api/payments/charge` route.
4. **Price is ALWAYS resolved server-side** from the authoritative DB row /
   catalogue (gig tier, offer, service, template). Never trust client.

**Money flow B — Provider earns:**
1. When a buyer debits/charges for a provider's service/offer/gig tier, the
   provider gets a `provider_earnings` ledger row (`amount_cents`, fee,
   `status: 'owed'`, linked to the order).
2. After delivery is approved (escrow release), the earning flips to
   `status: 'releasable'`.
3. Admin processes payouts → creates a `provider_payouts` row marking N
   earnings as `paid` with a `method` (ACH/Wise/manual) and a `reference`.

**Money flow C — Refunds:**
- Wallet-paid order → wallet credit via `wallet_credit` RPC.
- Guest direct-NMI order → `lib/payments` `refund()` against the NMI
  transaction id.

That is the only model. Everything below implements it.

---

## 2. DECISIONS (do not deviate)

- **All buyer payment** goes through `lib/payments` (`charge`,
  `chargeVaulted`) and/or `lib/wallet` (`debit`, `credit`). Never import a
  gateway SDK; never call NMI's URL directly.
- **All balance mutation** goes through `lib/wallet.ts`. Routes never write
  `student_wallets` or `wallet_transactions` directly.
- **Provider payouts are manual.** No new payout integration. A queue +
  admin action + ledger.
- **Drop nothing from the DB.** Stripe columns
  (`stripe_account_id`, `stripe_customer_id`, `stripe_onboarding_complete`,
  `stripe_started`, `stripe_bypass`, `stripe_payment_intent_id`, etc.)
  remain in the schema as **historical data**; stop reading or writing
  them in any code path. A follow-up brief drops them.
- **Never trust a client-supplied amount.** Resolve every price from the
  DB row or `lib/template-packs/catalogue.json`.
- **`lib/payments/*`, `lib/wallet.ts`, `supabase/wallet_nmi.sql`,
  `app/api/wallet/*`, `app/api/payments/*`** — already shipped foundations.
  Only ADD to them where required (e.g. capturing card display fields);
  do not refactor them.

---

## 3. SCOPE MAP — WHAT EXISTS TODAY

Files Kimi must change or delete (groups, not exhaustive — verify with grep):

**A. Buyer-pay routes (rewrite onto wallet/NMI):**
```
app/api/checkout/order/route.ts      — gig tier checkout (Stripe PI)
app/api/checkout/card/route.ts       — gig tier card-confirm (Stripe PI)
app/api/checkout/service/route.ts    — service checkout (Stripe PI)
app/api/checkout/template/route.ts   — template checkout (legacy)
app/api/checkout/wallet/route.ts     — wallet via Stripe (legacy)
app/api/offers/[id]/checkout/route.ts            — pay an offer
app/api/consultant/offers/[id]/checkout/route.ts — consultant offer pay
app/api/gigs/[id]/tiers/[tierId]/purchase/route.ts — gig tier purchase
app/api/messages/conversations/[id]/quick-offer/route.ts — chat offer
lib/checkoutOrders.ts                — Stripe checkout business logic
```

**B. Stripe Connect (delete entirely):**
```
app/api/connect/onboard/route.ts
app/api/connect/status/route.ts
app/api/connect/dashboard-link/route.ts
app/api/attorney/connect/onboard/route.ts
app/api/attorney/connect/status/route.ts
app/api/attorney/connect/dashboard-link/route.ts
app/api/admin/payouts/connect/route.ts
app/api/admin/users/[id]/stripe-bypass/route.ts
app/dashboard/connect/complete/page.tsx
app/dashboard/connect/onboard/page.tsx
app/dashboard/consultant/connect/page.tsx
```

**C. Admin payouts (rewrite for manual model):**
```
app/api/admin/payouts/route.ts                — queue
app/api/admin/payouts/release/route.ts        — release one (Stripe transfer)
app/api/admin/payouts/refunds/route.ts        — refund (Stripe)
app/api/admin/payouts/providers/route.ts      — Connect status list
app/api/admin/escrow/[id]/refund/route.ts
app/api/admin/escrow/[id]/release/route.ts
app/api/admin/escrow/run-auto-releases/route.ts
app/api/admin/orders/[id]/route.ts            — Stripe refs
lib/payouts.ts                                — Stripe transfer logic
```

**D. Webhook (delete):**
```
app/api/webhooks/stripe/route.ts
```

**E. Library (delete):**
```
lib/stripe.ts
lib/stripeCustomer.ts
```

**F. Earnings / read-only Stripe refs (replace data source):**
```
app/api/attorney/earnings/summary/route.ts
app/api/attorney/earnings/monthly/route.ts
app/api/attorney/earnings/route.ts
app/api/attorney/home/route.ts
app/api/attorney/data/route.ts
app/api/attorney/preferences/route.ts
app/api/attorney/inquiries/[id]/offers/route.ts  — “block until Connect ready”
app/api/consultant/data/route.ts
app/api/student/home/route.ts
app/api/templates/route.ts
app/api/admin/data/route.ts
app/api/admin/services/route.ts
app/api/admin/services/[id]/route.ts
app/api/attorneys/[id]/route.ts
app/api/consultants/[id]/route.ts
app/api/orders/[id]/escrow/route.ts
```

**G. UI (re-wire + copy):**
```
components/design/attorney-settings.jsx     — “Stripe Connect” tab
components/design/attorney-earnings.jsx     — “Stripe Connect required” badges
components/design/attorney-overview.jsx     — “Stripe Connect banner”
components/design/attorney.jsx              — payout copy
components/design/attorney-profile.jsx
components/design/attorney-profile-editor.jsx
components/design/consultant.jsx            — payout copy + connect page link
components/design/admin.jsx                 — “Stripe Connect” fields
components/design/admin-payouts.jsx         — Connect tab, bypass UI
components/design/admin-orders.jsx
components/design/admin-escrow.jsx
components/design/admin-dashboard.jsx
components/design/student-billing.jsx
components/design/student.jsx               — gig-checkout Stripe path (lines ~1135, ~2348)
components/design/find-attorney.jsx
components/design/fiverr-workbench.jsx
components/design/seller/SellerDashboardHome.tsx
components/design/landing.jsx               — marketing copy
components/design/DashboardGuide.tsx        — onboarding copy
components/messaging/OfferPaymentModal.tsx  — the "Pay with Stripe" modal
components/messaging/UnifiedInbox.tsx
components/marketplace/GigDetailPage.tsx    — gig tier purchase
components/marketplace/MarketplaceHero.tsx
components/marketplace/MessageOfferCard.tsx
components/auth-shell.tsx
components/translation-boundary.tsx
lib/email.ts
lib/translations.ts
lib/chatKnowledgeBase.ts
lib/intake-questions.ts
lib/platformConfig.ts
```

**H. Env / secrets (remove):**
- `wrangler.toml [vars]`: drop `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and any
  other `STRIPE_*` var. Worker secrets `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` to be deleted post-deploy (Claude will run
  `wrangler secret delete`).

---

## 4. STEP 1 — DATA MODEL (`supabase/stripe_excision.sql`)

One migration. Earnings + payouts; no destructive changes.

```sql
-- Provider earnings: one row per delivered/credited order line.
create table if not exists provider_earnings (
  id              text primary key,                  -- "earn_<random>"
  provider_id     uuid not null references profiles(id),
  order_id        text not null,                     -- gig order / offer / service order
  source          text not null check (source in ('gig','offer','service')),
  amount_cents    bigint not null check (amount_cents > 0),
  fee_cents       bigint not null default 0 check (fee_cents >= 0),
  currency        text not null default 'USD',
  status          text not null check (status in ('owed','releasable','paid','refunded','cancelled')),
  released_at     timestamptz,
  payout_id       text,                              -- FK to provider_payouts
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists provider_earnings_provider_idx
  on provider_earnings(provider_id, status, created_at desc);
create index if not exists provider_earnings_order_idx
  on provider_earnings(order_id);

-- Manual payout batches.
create table if not exists provider_payouts (
  id              text primary key,                  -- "po_<random>"
  provider_id     uuid not null references profiles(id),
  amount_cents    bigint not null check (amount_cents > 0),
  currency        text not null default 'USD',
  method          text not null,                     -- 'ach' | 'wire' | 'wise' | 'manual'
  reference       text,                              -- bank reference, txid, etc.
  notes           text,
  marked_paid_at  timestamptz not null default now(),
  marked_by       uuid references profiles(id),      -- admin
  created_at      timestamptz not null default now()
);
create index if not exists provider_payouts_provider_idx
  on provider_payouts(provider_id, marked_paid_at desc);

-- RPCs (atomic): credit_earning, release_earnings_for_order, record_payout.
create or replace function public.credit_earning(
  p_provider_id uuid, p_order_id text, p_source text,
  p_amount_cents bigint, p_fee_cents bigint default 0
) returns provider_earnings language plpgsql as $$
declare e provider_earnings;
begin
  insert into provider_earnings (id, provider_id, order_id, source, amount_cents, fee_cents, status)
  values ('earn_' || replace(gen_random_uuid()::text, '-', ''),
          p_provider_id, p_order_id, p_source, p_amount_cents, p_fee_cents, 'owed')
  returning * into e;
  return e;
end$$;

create or replace function public.release_earnings_for_order(p_order_id text)
returns setof provider_earnings language plpgsql as $$
begin
  return query
    update provider_earnings
       set status = 'releasable', released_at = now(), updated_at = now()
     where order_id = p_order_id and status = 'owed'
     returning *;
end$$;

create or replace function public.record_payout(
  p_provider_id uuid, p_amount_cents bigint,
  p_method text, p_reference text, p_notes text,
  p_marked_by uuid, p_earning_ids text[]
) returns provider_payouts language plpgsql as $$
declare p provider_payouts;
begin
  insert into provider_payouts (id, provider_id, amount_cents, method, reference, notes, marked_by)
  values ('po_' || replace(gen_random_uuid()::text, '-', ''),
          p_provider_id, p_amount_cents, p_method, p_reference, p_notes, p_marked_by)
  returning * into p;
  update provider_earnings
     set status = 'paid', payout_id = p.id, updated_at = now()
   where id = any(p_earning_ids) and provider_id = p_provider_id and status = 'releasable';
  return p;
end$$;
```

User runs the migration. Flag it; do not block.

---

## 5. STEP 2 — A SERVER-ONLY MODULE: `lib/earnings.ts`

```ts
// All read/write of provider_earnings + provider_payouts goes through here.
export async function creditEarning({...}): Promise<ProviderEarning>
export async function releaseEarningsForOrder(orderId: string): Promise<ProviderEarning[]>
export async function listEarnings(providerId: string, filter?): Promise<ProviderEarning[]>
export async function summary(providerId: string): Promise<{owedCents, releasableCents, paidCents}>
export async function recordPayout(providerId, opts, earningIds[]): Promise<ProviderPayout>
export async function listPayouts(providerId: string): Promise<ProviderPayout[]>
```

All money mutation routes through here. Admin and provider routes both use it.

---

## 6. STEP 3 — BUYER-PAY ROUTES (THE WORK)

For each route in §3.A, replace the Stripe path with this contract:

**Server validation:**
- Auth (session). For routes that allow guest, `requireStudent` is optional;
  for everything that isn't a template = require an active student.
- Look up the authoritative price from DB / catalogue (never the body):
  - `/api/checkout/order` + `/api/gigs/[id]/tiers/[tierId]/purchase` →
    `gig_tiers.price_cents` for the named tier id.
  - `/api/checkout/service` → `services.price_cents`.
  - `/api/offers/[id]/checkout` + `/api/consultant/offers/[id]/checkout` +
    `/api/messages/conversations/[id]/quick-offer` →
    `offers.amount_cents` for the offer id.
  - Templates already covered by `/api/wallet/debit` + `/api/payments/charge`
    (catalogue). Delete `/api/checkout/template` entirely.
- `/api/checkout/wallet` — delete; superseded by `/api/wallet/topup`.

**Pay path:**
- Signed-in student → call `wallet.debit(profile.id, priceCents, …)` and
  create the order row in the relevant orders table
  (`orders`/`gig_orders`/`service_orders`) with `paid` status. On the same
  transaction (or immediately after), call
  `earnings.creditEarning({providerId, orderId, source, amountCents: priceCents - feeCents, feeCents})`.
- If wallet balance is short → return 402 with `{error, balanceCents,
  requiredCents}` so the UI links to Top Up.
- (Guest template path stays as-is — `/api/payments/charge`.)

**Order completion / approval:**
- When the buyer approves delivery (existing endpoints under
  `app/api/orders/.../complete`, `attorney/orders/.../complete`, etc.) →
  call `earnings.releaseEarningsForOrder(orderId)`. No Stripe transfer.

**Refunds (admin):**
- `app/api/admin/escrow/[id]/refund/route.ts` → wallet-paid orders →
  `wallet.credit(...)` for the buyer. Mark the order refunded; flip the
  earning to `'refunded'`.
- For old historical Stripe-paid orders that show up in the queue: return
  a 410 with “historical Stripe order — process refund out-of-band.”

**Delete unused routes:**
- `app/api/checkout/template/route.ts`
- `app/api/checkout/wallet/route.ts`
- All routes under `app/api/connect/*` and `app/api/attorney/connect/*`
- `app/api/admin/payouts/connect/route.ts`
- `app/api/admin/users/[id]/stripe-bypass/route.ts`
- `app/api/webhooks/stripe/route.ts`

---

## 7. STEP 4 — ADMIN PAYOUT QUEUE (MANUAL)

`app/api/admin/payouts/route.ts` becomes a queue read:
- GET: list providers with `status='releasable'` earnings, totals, oldest age.
- POST: body `{ providerId, earningIds[], method, reference, notes }` →
  `earnings.recordPayout()` after admin confirms the off-platform transfer.

`app/api/admin/payouts/release/route.ts` becomes “mark this batch paid.”
`app/api/admin/payouts/refunds/route.ts` already covered by the escrow
refund endpoint — delete unless still distinct.

Admin UI (`components/design/admin-payouts.jsx`):
- Remove Connect tab + bypass UI entirely.
- Tabs: **Owed** · **Releasable (Ready for payout)** · **History**.
- The “Mark paid” action collects: amount confirmation, method (ACH /
  Wire / Wise / Manual), reference text, notes.

---

## 8. STEP 5 — PROVIDER EARNINGS DASHBOARD

`app/api/attorney/earnings/{route,summary,monthly}.ts` and the consultant
equivalents read from `provider_earnings` + `provider_payouts` only.
Drop all Stripe Connect status fields. The dashboard shows:
`Total earned · Pending (owed) · Releasable · Paid out` + the payout history.

Block-an-offer-until-Connect-ready logic in
`app/api/attorney/inquiries/[id]/offers/route.ts` and the consultant offer
route — **remove the block**. Providers can send offers freely; the platform
collects payment to its own wallet, and pays the provider manually.

---

## 9. STEP 6 — UI COPY SWEEP

Replace user-visible strings systematically:

| Old | New |
|---|---|
| “Stripe Connect” | “Payout setup” |
| “Stripe Connect required” | “Payout setup pending” |
| “Pay with Stripe” | “Pay” (or “Pay with card” where context needs disambiguation) |
| “Set up your Stripe Connect account” | “Set up payouts” |
| “Earnings appear here once Stripe Connect transfers complete” | “Earnings appear here once your delivery is approved.” |
| “Powered by Stripe” | remove |

Files to sweep (full list in §3.G). For onboarding/guide copy
(`DashboardGuide.tsx`), describe the new manual model honestly:
*“Your earnings show here as soon as your delivery is approved. The team
processes payouts on a regular cadence — bank/ACH details live in your
Payout setup.”*

The provider “Payout setup” page replaces the Connect onboarding page:
just a small form capturing the provider’s preferred payout method and
bank/Wise details (stored in `profiles.payout_method`, `payout_account_info`
as text fields — admin reads them when paying out).

---

## 10. STEP 7 — `lib/` CLEANUP

- Delete `lib/stripe.ts`.
- Delete `lib/stripeCustomer.ts`.
- Rewrite `lib/payouts.ts` against the new model OR delete and inline the
  small remaining logic into `lib/earnings.ts`.
- Rewrite `lib/checkoutOrders.ts`: remove all Stripe imports / paymentIntent
  creation. It can become a thin helper that creates the order row + the
  wallet debit + the earning credit, or be deleted with the logic moved
  into the buyer-pay routes.
- `lib/email.ts`, `lib/translations.ts`, `lib/chatKnowledgeBase.ts`,
  `lib/intake-questions.ts`, `lib/platformConfig.ts` — search for “stripe”
  and replace per §9.

---

## 11. STEP 8 — CARD `last4` DISPLAY FIX (UX)

Currently `Add Card` works (cards persist) but the UI shows the saved card
without brand or last4 — the user can’t tell which card they’re using.

**Root cause:** the `Add Card` Collect.js callback in `student.jsx` (and
anywhere else that adds cards — e.g. a checkout’s save-card option) is
not capturing `response.card.{type, number, exp}` and forwarding it to
`POST /api/wallet/payment-methods`. The route accepts `brand`, `last4`,
`exp_month`, `exp_year`, but the client isn’t sending them.

**Fix:**
- In every Collect.js `callback`, capture from `response.card`:
  - `brand` ← `response.card.type` (e.g. `"visa"`)
  - `last4` ← last 4 chars of `response.card.number` (the number returned
    is already masked, e.g. `"4xxxxxxxxxxxx1111"`)
  - `exp_month` ← parseInt(`response.card.exp`.slice(0,2))
  - `exp_year` ← 2000 + parseInt(`response.card.exp`.slice(2,4))
- POST them with the `token` to `/api/wallet/payment-methods` (and to
  `/api/wallet/topup` when `saveCard:true`).
- In the saved-cards list UI (`student.jsx`, `student-billing.jsx`),
  render every card as:
  `{brand} •••• {last4} · {expMonth}/{expYear} {is_default ? '(default)' : ''}`
  with a sensible fallback (`Card •••• ????`) when missing.

---

## 12. STEP 9 — ENV CLEANUP

In `wrangler.toml [vars]`, remove `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and
any other `STRIPE_*`. Leave a one-line comment that the secrets
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are removed via
`wrangler secret delete` post-deploy. Search the repo for `STRIPE_PUB_KEY`,
`process.env.STRIPE_*`, `NEXT_PUBLIC_STRIPE_*` and remove all reads.

---

## 13. SELF-CHECK
- `grep -rni stripe app/ components/ lib/ | grep -v "lib/payments/" | grep -vE "//.*historical"` returns nothing.
- `grep -rni "stripe connect\|pay with stripe\|loadStripe\|@stripe" app/ components/ lib/` returns nothing.
- `find app/api -path '*connect*' -o -path '*stripe*'` returns nothing.
- `lib/stripe.ts`, `lib/stripeCustomer.ts`, `app/api/webhooks/stripe/route.ts`,
  `app/dashboard/connect/` removed.
- Every buyer-pay route validates the price server-side and either
  `wallet.debit`s or `provider.charge`s — nothing in between.
- Cards in the list render with `{brand} •••• {last4}`.
- Build x2 idempotent.
- `lib/payments/`, `lib/wallet.ts`, `supabase/wallet_nmi.sql` untouched.

## 14. VERIFICATION
```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
echo "stripe survivors (expect 0 outside historical comments):"
grep -rni stripe app/ components/ lib/ 2>/dev/null | grep -v "lib/payments/README.md" | wc -l
echo "stripe routes (expect 0):"
find app/api app/dashboard -type d \( -name "*stripe*" -o -name "*connect*" \) 2>/dev/null | wc -l
test ! -f lib/stripe.ts && echo "lib/stripe.ts removed ok"
test ! -f lib/stripeCustomer.ts && echo "lib/stripeCustomer.ts removed ok"
test ! -f app/api/webhooks/stripe/route.ts && echo "stripe webhook removed ok"
test -f supabase/stripe_excision.sql && echo "migration ok"
test -f lib/earnings.ts && echo "earnings service ok"
git status --porcelain | grep -v /.next/
```

Required: `build: 0`; **0** Stripe survivors; **0** connect/stripe route
directories; lib + webhook removed; earnings service + migration present.

## 15. EDITORIAL GATE (Claude)
Reject if: ANY of `stripe`/`loadStripe`/`@stripe`/`pm_`/`StripeConnect`
remains in any code path; any buyer-pay route accepts a client-supplied
amount; balance mutated outside `lib/wallet.ts`; earnings mutated outside
`lib/earnings.ts`; `lib/payments/` modified; cards rendered without
brand+last4; copy still says “Stripe Connect” or “Pay with Stripe”
anywhere user-facing; the migration drops Stripe columns
(it must not — historical data); build not idempotent.

## 16. HANDOFF
No zip. Report the §14 output. Do not commit or branch — Claude reviews,
commits, deploys, then runs `wrangler secret delete STRIPE_SECRET_KEY`
and `wrangler secret delete STRIPE_WEBHOOK_SECRET`.
