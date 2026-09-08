# Client Order Cancellation (before work starts)

**Repo:** yousafe-portal
**Author/executor:** DeepSeek (Entrim) supervised by Codex
**Status:** implemented + tested, **requires DB migration before it activates**

## 1. Problem

Clients had no way to cancel a paid-but-unstarted order. Providers could
cancel via `/api/orders/[id]/status` (which zeroes escrow via a trigger but
does **not** refund the client), and admins could refund escrow via a
**non-atomic** multi-step path (wallet credit, then a separate order update,
each with its own `warnings` array). Nobody on the *client* side could
cancel, and the financial outcome of the provider/admin paths was implicit,
uncommunicated, and not race-safe.

## 2. Contract (what “cancel” means)

Owning clients can cancel an order **only when it is genuinely unstarted**:

- **Status** is a verified legacy unstarted status: `created | queued | pending | new`.
- **No work evidence** even when a status alias looks unstarted:
  - `progress` non-null and `> 0`
  - any milestone past `pending`/`cancelled` (`in_progress`, `submitted`, `approved`, …)
  - a provider earning already `releasable`/`paid`
  - `payout_status` in `transferred | paid | released`
- **No escrow movement**: `escrow_released_amount > 0`; disputes
  (`escrow_disputed_at`/`escrow_frozen_at` or escrow state `disputed`/`frozen`),
  auto-release scheduled — any of these deny cancellation.
- **Verified held escrow (strict)**: `escrow_status` must be exactly `held`
  (a null/`refunded`/partial state is refused), `escrow_amount` must be
  positive **and an EXACT cent-for-cent match** of the captured amount (no
  one-cent tolerance; a `null`/`0`/negative balance fails safely — we never
  fabricate a balance from a schema default).
- **No prior refund**: `escrow_refunded_amount > 0`, `refunded_amount > 0`,
  `refund_status` in `succeeded | refunded | wallet_credit_complete`, or
  `cancelled_at` set — a cancelled/refunded order can never be re-cancelled
  (double-refund protection).
- **Monetary consistency**: the refund amount is the order's captured
  `amount_paid` (integer **cents**). If `amount_paid` is missing/zero while a
  `total_amount` exists — or the held `escrow_amount` does not exactly equal
  the captured amount — the RPC **refuses** (`inconsistent_money` /
  `no_funds` / `invalid_escrow` / `escrow_mismatch`) rather than fabricate a
  refund.
- **Currency (USD-only refund destination)**: the wallet ledger
  (`wallet_nmi.sql`) is USD-only. The order's persisted `currency` must be
  verifiably `usd`; a NULL order currency (`currency_unknown`) is ambiguous and
  refused (the DB `'usd'` default cannot certify legacy non-USD provenance),
  a known non-USD order is refused (`unsupported_currency`), and a wallet whose
  `currency` is not `usd` is refused (`wallet_currency_mismatch`).

**Financial outcome:** the full captured amount is credited to the owning
client's **wallet** exactly once (matching the existing admin escrow-refund
convention, `lib/wallet.refundToWallet`, ledger metadata `kind:'refund'`).
The live payment gateway is **never** called; a card-paid cancelled order is
still credited back to the wallet balance, and the UI says so explicitly.
`refund_method = 'wallet'`, `refund_status = 'succeeded'`.

### 2a. Checkout initializes the money fields cancellation relies on

`lib/checkoutOrders.ts` `createPaidOrder` now writes `currency` (the actual
resolved item currency, not the DB `'usd'` default) and `escrow_amount` (the
captured `totalCents` in dollars) alongside the existing `amount_paid` (cents)
/ `total_amount` (dollars). Both are in the insert's ESSENTIAL set, so a
schema that lacks either column **fails the order insert loudly** instead of
silently stripping financial metadata. This means every order created after
this change carries a verifiable escrow balance + currency; legacy orders
whose balance/currency is missing fail safe at cancel time (documented in
§8 Known limitations) and can be settled through the admin refund path.

## 3. Two flows

### 3a. Client-initiated (this feature)

```
GET  /api/orders/[id]/cancel   → read-only eligibility (shared lib verdict)
POST /api/orders/[id]/cancel   → server-authoritative cancellation

  requirePortalUser (role 'client')
        │
        ▼
  auth.db.rpc('client_cancel_order', { p_order_id, p_caller_id, p_reason })
        │
        ▼
  ┌─────────────────────────── SINGLE TRANSACTION ─────────────────────────┐
  │ SELECT orders … FOR UPDATE        ─── row lock (serialises ALL writers) │
  │ verify ownership (client_id = p_caller_id)                              │
  │ verify eligibility gates (above)                                        │
  │ refundCents := amount_paid                                             │
  │ wallet_credit(client, refundCents, …, metadata kind:'refund')           │
  │ UPDATE orders → status='cancelled', escrow refunded/zeroed,             │
  │                  refund_status='succeeded', payout_status='cancelled',  │
  │                  cancelled_at/by, refunded_at/amount                    │
  │ UPDATE provider_earnings → 'cancelled' (no payout can ever fire)        │
  │ cancel open milestones + pending scope changes + auto-release           │
  │ INSERT order_events + order_status_history + escrow_events              │
  │ INSERT canonical_ledger 'refund/credit' (append-only, best effort)      │
  └─────────────────────────────────────────────────────────────────────────┘
```

- **Migration missing?** The route returns `501 { deploy_required: true }`.
  It **never** falls back to the legacy non-atomic multi-step refund.
- **Exact-once:** the row lock + conditional writes mean a retry/second tab
  sees `status='cancelled'` and is refused `already_cancelled`.

### 3b. Provider / admin paths are unchanged but race-hardened

- `/api/orders/[id]/status` (provider start / provider cancel / client
  approve/revision) now performs a **conditional update**
  (`WHERE id = $1 AND status = <read status>`); zero matched rows → `409`.
  A client cancellation that lands between the provider's read and write can
  no longer be resurrected.
- `/api/consultant/orders/[id]/accept`, `…/progress`, `…/complete` and
  `/api/attorney/orders/[id]/progress`, `…/complete` get the same
  conditional-update guard; delivering/completing additionally refuses any
  non-started/terminal state (an unstarted or cancelled order can never flip
  straight to `under_review`/`completed`/`released`).
- `/api/orders/[id]/escrow` (`request_revision`, `raise_dispute`) is
  conditional too, so a cancelled order can't be pushed into a revision or a
  dispute. `approve_delivery` already had a conditional guard.
- Offer decline (`/api/offers/[id]/decline`) is preserved untouched — it
  handles *pending/sent* offers, which is a different lifecycle from
  cancelling a *paid* order and never touches money.

## 4b. Late-earnings race guard (provider_earnings)

**The race:** `checkout/order` and `offers/[id]/accept` create the order in one
transaction and credit the provider's earning (`credit_earning`) in a **later**
transaction. If client cancellation commits in between, the cancellation's
`UPDATE provider_earnings SET status='cancelled'` sees no row, and the delayed
`credit_earning` would insert a fresh `owed` earning on an order that already
refunded the client → payable money for refunded work.

**The fix (SQL, `supabase/client_order_cancellation.sql` §3):** a narrowly
scoped `BEFORE INSERT OR UPDATE OF status` trigger,
`guard_provider_earnings_payable`, that for any write INTO `owed | releasable |
paid`:

1. Locks the parent `orders` row **`FOR UPDATE`** (the same lock
   `client_cancel_order` takes) and judges on the parent's committed state —
   serialising with cancellation rather than trusting a read.
2. **Rejects** the write when the parent is `cancelled`/`refunded` or shows
   refund evidence (`refunded_amount`, `refund_status`,
   `escrow_refunded_amount`, `cancelled_at`). NB: `auto_release_eligible_at`
   is deliberately **not** refund evidence — it is set on every completed
   order awaiting its scheduled auto-release, and the auto-release cron
   legitimately flips earnings to `releasable` there, so treating it as
   evidence would block normal payout on completed orders.
3. **Allows** everything else:
   - writes INTO `cancelled`/`refunded` (the cancellation RPC's own flips) —
     so ordinary cancellation is never falsely rejected;
   - `completed`/`released` parents — legitimate `owed→releasable→paid`
     payout on a delivered order keeps working;
   - earnings with no matching `orders` row (`order_id` is TEXT in
     `provider_earnings`; we compare `o.id::text = new.order_id`, so a legacy
     non-uuid value can never raise a cast error) — preserves the
     service/non-order convention.

Because the rejection raises inside the delayed transaction, the app paths
already tolerate it: `checkout/order` records a `payment_incidents` row
(`kind: 'earning_credit_failed'`) for reconciliation, and `offers/accept`
catches and logs. Either way **no payable earning is ever created** on a
cancelled/refunded order.

**Lock-order / deadlock considerations:** cancellation locks `orders` then
`provider_earnings`; the earnings release/payout RPCs lock `provider_earnings`
(rows) then, via this trigger, the parent `orders` row — a lock-order
inversion. PostgreSQL resolves it with deadlock detection (`40P01`): the victim
transaction aborts and **every** write it made (wallet credit, order fields,
escrow events, earnings) rolls back together — a deadlock can never leave a
partial financial mutation. Both sides are retryable/idempotent, and the
trigger only takes the parent lock for payable-state writes on order-linked
earnings (minimal window).

**Outcome matrix (delayed credit vs cancellation):**

| Sequence | Result |
|---|---|
| Earning insert BEFORE cancellation | Earning is later flipped to `cancelled` by the RPC → never payable |
| Earning insert AFTER cancellation (delayed credit race) | Trigger rejects the insert (parent `cancelled`) → incident recorded, no payable earning |
| Concurrent release vs cancellation | Either release blocks on the parent lock and then reads cancelled (rejected), or cancellation wins and flips the (unreleased) earning to `cancelled` — never wallet refund **plus** payable earnings |
| Unrelated active/completed order | Guard allows inserts and payouts normally |

## 4. Financial integrity measures

- **Amouunts stay in their native units**: `amount_paid` is cents, escrow/
  refund columns are dollars. The RPC converts only via
  `round(cents::numeric/100, 2)` and validates the escrow mirror
  (`|round(escrow_amount*100) − amount_paid| ≤ 1¢`) when populated.
- **Never more than captured**: refund equals `amount_paid` and any prior
  refund indicators deny the whole request, so no sequence of cancellations
  returns more than was paid in.
- **Exactly-once ledger**: `wallet_credit` inside the same transaction; the
  ledger row is tagged `kind:'refund'` so `lib/wallet`'s refund-ceiling logic
  treats it as a genuine refund, never a top-up that could inflate a future
  ceiling. All audit rows are written in the same transaction.
- **service_role only**: `client_cancel_order` is `SECURITY DEFINER` but
  EXECUTE is revoked from `public`/`anon`/`authenticated` and granted only to
  `service_role`; the RPC itself re-verifies that `p_caller_id` is the order's
  `client_id`.

## 5. Race guards (terminal resurrection)

Every order state mutation that could beat a concurrent cancellation now uses
`WHERE status = <read-status>` and returns `409 Order status changed by another
request` when zero rows match. Combined with the RPC's `FOR UPDATE` lock, a
cancellation and a start/progress/complete can never interleave into a
resurrected (or double-refunded) order.

## 6. Touched components

| File | Change |
|---|---|
| `supabase/client_order_cancellation.sql` | **migration** — `order_status_history` IF NOT EXISTS + `client_cancel_order(uuid,uuid,text)` RPC, service_role-only; verifies held escrow (exact cents), currency, no prior refund, atomically refunds wallet once |
| `lib/checkoutOrders.ts` | `createPaidOrder` now persists `currency` + `escrow_amount` (ESSENTIAL, never silently stripped) |
| `lib/orderCancellation.ts` | shared eligibility verdict (`getClientCancellationEligibility`, status/code maps) — mirrors the SQL gates incl. escrow/currency |
| `app/api/orders/[id]/cancel/route.ts` | new POST (RPC, atomic) + GET (eligibility) |
| `app/api/student/orders/[id]/route.ts` | extra order columns + `cancelEligibility`/`canCancel` in response |
| `components/design/student-order-detail.jsx` | visible "Cancel this order" card, typed confirmation (refund-to-wallet outcome), busy/error/success, refresh |
| `app/api/orders/[id]/status/route.ts` | conditional update (provider/client/admin), no resurrection |
| `app/api/consultant/orders/[id]/accept|progress|complete` | conditional updates + completion status gate |
| `app/api/attorney/orders/[id]/progress|complete` | conditional updates + review/complete status gates |
| `app/api/orders/[id]/escrow/route.ts` | conditional updates for `request_revision`/`raise_dispute` |
| `tests/order-cancel.test.ts` | 37 Jest regression tests |
| `tests/order-cancel-late-credit.test.ts` | 8 tests: provider_earnings guard SQL contract + delayed-credit tolerance + disclosure |

## 7. Deployment

1. Apply `supabase/client_order_cancellation.sql` in the Supabase SQL editor
   (or via the project's migration-apply script). Idempotent.
2. Environment needs `student_wallets`/`wallet_credit`, `provider_earnings`,
   `order_milestones`, `order_scope_changes`, `escrow_events`,
   `order_status_history`, `canonical_ledger` — all already present in
   production; the migration is a no-op for anything that exists.
3. Deploy the portal. No new Worker secrets.
4. Until (1) is run, `POST /api/orders/[id]/cancel` returns
   `501 { error: { deploy_required: true } }` — the UI hides the action
   because the server exposes no `cancelEligibility`.

## 8. Validation

- `npx jest tests/order-cancel.test.ts` — **37 pass** (auth, marketplace/offer
  parity, legacy aliases, started/terminal denial, repeated cancellation,
  RPC failure + migration-missing handling, escrow null/zero/negative/refunded
  and one-cent-mismatch refusals, non-USD + unknown-currency refusals,
  RPC denial-code mapping to 422, `createPaidOrder` monetary-field
  initialization + ESSENTIAL guard, race guards for accept/progress/status/
  complete INCLUDING the attorney progress route; POST RPC args asserted to
  carry the owning client id + reason).
- `npx jest tests/order-cancel-late-credit.test.ts` — **8 pass**:
  statically verifies the `provider_earnings` payable-guard trigger shipped in
  the migration (timing/table, payable-only scope, parent `FOR UPDATE` lock,
  cast-safe `o.id::text = new.order_id` comparison, cancelled/refunded-only
  rejection that never blocks completed-order payouts, non-order allowance),
  and verifies the application tolerates a rejected late credit
  (`checkout/order` → `payment_incidents` row, no payable earning).
- Adjacent suites still green: `ledger-api`, `mobile-orders`,
  `mobile-checkout`, `marketplace-fiverr-upgrade`, `idempotency` (72 tests).
- `npx tsc --noEmit`: only 1 pre-existing error unrelated to this change
  (`components/design/studio-doc-editor.tsx`, a duplicated @tiptap/core
  dependency resolution issue that predates this work).

### Known limitations

- **SQL has NOT been executed against any database.** No `psql`/Postgres/
  Docker/`pg_virtualenv` on PATH and no PGlite installation was found in this
  environment; `credit_earning` / `release_earnings_for_order` SQL bodies are
  absent from the repository, so nothing references real schema definitions at
  test time. The RPC + trigger are reviewed against the referenced migrations
  (`escrow_system_v2.sql`, `wallet_nmi.sql`, `fiverr_gig_system.sql`,
  `orders_currency_patch.sql`, `orders_columns_patch.sql`, canonical ledger).
  The `order-cancel-late-credit` earnings-guard coverage is **static SQL
  contract + mocked application-path checks only** — it is NOT a substitute
  for executing the trigger. Requires deployment-time real-schema compatibility
  and transaction testing (create an order, cancel it, then verify the delayed
  `credit_earning` raises and that concurrent release/cancellation rolls back
  cleanly) before enabling the UI.
- **Strict escrow means legacy orders without a verified balance cannot be
  self-served.** `escrow_status='held'` + a positive `escrow_amount` exactly
  equal to `amount_paid` is now required. Orders created *before* the
  `createPaidOrder` fix that never received an `escrow_amount` backfill are
  **refused safely** (`invalid_escrow`) instead of being refunded from a
  fabricated/guessed balance; the existing admin refund path settles those.
- **Currency is USD-only for client self-serve refunds.** Orders persisting a
  non-USD `currency`, or with no recorded `currency`, cannot be refunded
  through this path (`unsupported_currency` / `currency_unknown`) because the
  wallet ledger is USD-only; admin settlement handles those.
- The escrow sync trigger (`escrow_on_order_status_change`) intentionally
  does **not** double-refund: our UPDATE sets `escrow_status='refunded'` +
  `escrow_amount=0`, so the trigger's `held` branch no-ops.
- Provider-initiated cancellation (existing `/api/orders/[id]/status → cancelled`)
  still zeroes escrow via the trigger **without** auto-refunding the client —
  that predates this feature and is out of scope; the client-cancel path is the
  one with a refunded settlement.