# Kimi Brief 27 — Wallet Re-architecture: Top Up + Card-on-File on NMI

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisite:** the payment abstraction's vault support is shipped (commit
4907b31). Read `00_HOUSE_STYLE.md` and, in the repo, `lib/payments/README.md`
+ `lib/payments/types.ts`.

This touches money. Execute exactly. Claude gates it strictest.

---

## 0. WHY — THE PROBLEM

The portal already has a **student wallet** (Top Up Balance, saved cards,
balance display) — but it is built entirely on the **terminated Stripe
account** and is non-functional:
- `wallet/balance` reads the **Stripe customer cash balance** — the balance
  literally lived on Stripe, not in our database.
- `wallet/topup` creates a Stripe PaymentIntent.
- `wallet/payment-methods` + `wallet/setup-intent` use Stripe payment methods.

NMI has no hosted "customer balance". So this is a **re-architecture, not a
re-wire**: the portal must become the system-of-record for the wallet
balance and the saved-card list, with NMI only as the money-in rail (via the
`lib/payments` abstraction's vault methods).

**Target model:** students top up a wallet balance by charging a saved card
or a new card through NMI; template packs become a catalogue in the student
dashboard, **purchased by debiting the wallet balance** — no per-item card
charge, no per-item payment links.

---

## 1. DECISIONS (do not deviate)

- **All payment goes through `getPaymentProvider()` from `@/lib/payments`.**
  Never import a gateway SDK; never call NMI directly. Use `charge`,
  `chargeVaulted`, `vaultCard`, `deleteVaultedCard`, `supportsVault`.
- **The wallet balance lives in our Supabase database** and is the single
  source of truth. Every change is one atomic write + one ledger row.
- **Never trust a client-supplied amount or balance.** Top-up amounts are
  validated; template prices are resolved server-side from the catalogue;
  the balance is only ever read/written server-side.
- **Do NOT touch** `lib/payments/`, `lib/checkoutOrders.ts`, gigs, the
  provider-escrow `orders` flow, or `app/api/offers/*`.
- Delete all Stripe coupling from the wallet routes in scope.

---

## 2. STEP 1 — DATA MODEL (`supabase/wallet_nmi.sql`)

One migration creating three tables. Money is stored in integer cents.

```sql
-- Per-student wallet balance. One row per client profile.
create table if not exists student_wallets (
  profile_id     uuid primary key references profiles(id),
  balance_cents  bigint not null default 0 check (balance_cents >= 0),
  currency       text   not null default 'USD',
  updated_at     timestamptz not null default now()
);

-- Append-only ledger. Every balance change is one row; balance_after_cents
-- is the wallet balance immediately after this entry. Auditable.
create table if not exists wallet_transactions (
  id                  text primary key,
  profile_id          uuid not null references profiles(id),
  type                text not null check (type in ('topup','purchase','refund','adjustment')),
  amount_cents        bigint not null,      -- signed: + credit, - debit
  balance_after_cents bigint not null,
  reference           text,                 -- NMI transaction id, or template order id
  description         text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_wallet_tx_profile on wallet_transactions(profile_id, created_at desc);

-- Saved cards (NMI Customer Vault references). No card data — only the
-- vault id + display fields.
create table if not exists student_payment_methods (
  id           text primary key,
  profile_id   uuid not null references profiles(id),
  vault_id     text not null,               -- NMI customer_vault_id
  brand        text,
  last4        text,
  exp_month    text,
  exp_year     text,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_spm_profile on student_payment_methods(profile_id);
```

The migration is run by the user against Supabase — flag it; do not block.

---

## 3. STEP 2 — A WALLET SERVICE (`lib/wallet.ts`)

A small server-only module that owns balance mutations so every route uses
the same safe path:
- `getBalance(profileId)` → reads/creates the `student_wallets` row, returns
  `{ balanceCents, currency }`.
- `credit(profileId, amountCents, { type, reference, description })` and
  `debit(profileId, amountCents, …)` — each performs the balance update AND
  the matching `wallet_transactions` row as one operation, computing
  `balance_after_cents`. `debit` must reject if the balance is insufficient
  (return a clear failure, never go negative — the table CHECK also guards).
- `listTransactions(profileId, limit)`.

All money mutation goes through this module — routes never write
`student_wallets` directly.

---

## 4. STEP 3 — RE-WIRE THE WALLET ROUTES

| Route | New behaviour |
|---|---|
| `app/api/wallet/balance/route.ts` | Return `getBalance()` from the DB. Drop all Stripe calls. |
| `app/api/wallet/payment-methods/route.ts` | GET: list `student_payment_methods` for the student. POST: body `{ token, cardDisplay }` from Collect.js → `getPaymentProvider().vaultCard()` → store a `student_payment_methods` row (first card becomes `is_default`). |
| `app/api/wallet/payment-methods/[id]/route.ts` | DELETE: look up the row, `getPaymentProvider().deleteVaultedCard(vault_id)`, delete the row. |
| `app/api/wallet/set-default/route.ts` | Set `is_default` on one card, clear it on the others, for that student. |
| `app/api/wallet/topup/route.ts` | Body: `{ amountCents, paymentMethodId? , token?, cardDisplay? }`. Validate `amountCents` (integer, min 100, sane max). If `paymentMethodId` → resolve its `vault_id`, `chargeVaulted()`. If `token` (new card) → `charge()`, and if `cardDisplay` present also `vaultCard()` to save it. On `paid` → `wallet.credit(type:'topup', reference:transactionId)`. Return the new balance. |
| `app/api/wallet/setup-intent/route.ts` | DELETE this route — NMI has no setup-intent. "Add card" is Collect.js tokenize → POST `payment-methods`. Remove any UI calls to it. |

Every route: auth as before (active client only); never expose the NMI
secret; on gateway decline return 402 with the message.

---

## 5. STEP 4 — TEMPLATE PACKS AS A WALLET-DEBIT CATALOGUE

- The student dashboard gets a **template-pack catalogue** view (the 16
  packs from `lib/template-packs`, admin-priced via `price_usd`). Reuse the
  existing `/marketplace/templates` product pages; surface the catalogue
  inside the student dashboard too.
- **Purchasing a template debits the wallet**, not a card. Add
  `app/api/wallet/purchase-template/route.ts`: body `{ slugs[] }` → resolve
  prices server-side from the catalogue → `wallet.debit(type:'purchase')`
  → on success create the `template_orders` row (status `paid`,
  `transaction_id` = the wallet transaction id). If the balance is
  insufficient, return a clear "insufficient balance — top up" response.
- The cart's checkout (`/marketplace/cart`) changes: instead of NMI
  Collect.js card entry, "Complete purchase" calls `purchase-template`
  (wallet debit). If the balance is short, the UI links to Top Up.
- **Replace `app/api/payments/charge/route.ts`'s role**: template packs are
  no longer charged directly. Either delete that route or leave it unused —
  Claude will decide at the gate. Do NOT delete `lib/payments` or its
  abstraction. (Direct `charge()` is still used by the top-up new-card path.)

---

## 6. STEP 5 — UI

Re-wire `components/design/student-billing.jsx` (and any wallet UI in
`student.jsx` / `student-dashboard-home.jsx`):
- Balance shown from `/api/wallet/balance`.
- Saved cards from `/api/wallet/payment-methods`; "Add card" = Collect.js
  inline tokenization (config from `/api/payments/config`) → POST
  `payment-methods`.
- Top Up: pick a saved card or add a new one, enter an amount, submit to
  `/api/wallet/topup`.
- Transaction history from `/api/student/billing/transactions` (point it at
  `wallet_transactions`).
- The template catalogue in the dashboard, each pack with a "Buy with
  balance" action → `purchase-template`.
- House-style; honest copy; no outcome promises.

---

## 7. SELF-CHECK
- No Stripe reference remains in any wallet route (`grep -ri stripe app/api/wallet`).
- No gateway SDK imported; payments only via `getPaymentProvider()`.
- `lib/payments/`, `lib/checkoutOrders.ts`, gigs, escrow, `app/api/offers` untouched.
- Balance only mutated through `lib/wallet.ts`; every mutation writes a ledger row.
- Top-up amount + template prices resolved/validated server-side.
- NMI secret never in a client bundle or any response.
- Portal builds ×2, idempotent.

## 8. VERIFICATION
```bash
cd ~/Documents/GitHub/yousafe-portal
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
echo "stripe refs in wallet routes (expect 0):"; grep - ric stripe app/api/wallet | grep -v ':0' || echo "  none"
test -f lib/wallet.ts && echo "wallet service ok"
test -f supabase/wallet_nmi.sql && echo "migration ok"
test ! -f app/api/wallet/setup-intent/route.ts && echo "setup-intent removed ok"
grep -rl getPaymentProvider app/api/wallet && echo "wallet uses abstraction ok"
git status --porcelain | grep -v /.next/
```
Required: `build: 0`; 0 stripe refs in wallet routes; wallet service +
migration present; setup-intent removed; wallet routes use the abstraction.

## 9. EDITORIAL GATE (Claude)
Reject if: any Stripe call survives in a wallet route; a gateway SDK imported;
`lib/payments/` modified; balance written outside `lib/wallet.ts`; a balance
change with no ledger row; client-supplied amount/price/balance trusted; the
NMI secret reachable client-side; gigs/escrow/`checkoutOrders` touched; build
not idempotent. After approval Claude commits, deploys, and (after the user
runs the migration) test-runs a top-up and a template purchase end to end.

## 10. HANDOFF
No zip. Report the §8 output. Do not commit or branch.
