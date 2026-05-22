# Kimi Brief 28R — Revisions to Brief 28

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Working tree state:** brief 28 ~80% done — the whitelist held (`lib/payments`,
`lib/wallet.ts`, `supabase/wallet_nmi.sql`, all `app/api/wallet/*` routes
untouched), `lib/earnings.ts` ships with the right surface, `lib/stripe.ts`
+ `lib/stripeCustomer.ts` + the Stripe webhook are deleted, the migration
does not drop columns, buyer-pay routes that converted DO use
`wallet.debit + creditEarning` correctly, the card-display fix is wired
through `student.jsx`, and the build is idempotent.

The misses below must be fixed before Claude commits brief 28.

---

## MISS 1 — CRITICAL — OFFER PAYMENT PATHWAY IS BROKEN

You deleted `/api/offers/[id]/checkout/route.ts` and
`/api/consultant/offers/[id]/checkout/route.ts` (correct — they were
Stripe) but the surviving `/api/offers/[id]/accept/route.ts` only flips
`status='accepted'`. **Once accepted, the offer has no way to be paid.**
That's a money-path regression.

**Fix:** make accept the single atomic action: accept + debit wallet +
credit earning. Apply the same pattern to the consultant equivalent.

`app/api/offers/[id]/accept/route.ts` and the consultant equivalent
(`app/api/consultant/offers/[id]/accept/route.ts` if it exists, or fold
into the same route by detecting `sender_type`) must do, in order:

1. `requirePortalUser` (client/student only).
2. Load the offer; verify ownership (`recipient_id === auth.profileId`),
   status `pending`, not expired. (Already there.)
3. Resolve `amount_cents` **server-side** from
   `offer.discounted_price || offer.price`. Never trust the client.
4. Compute `platformFee` and `netPayout` via the existing
   `computePlatformFeeCents` / `computeNetPayoutCents` helpers.
   `total = amount + platformFee` (attorney) or `total = amount`
   (consultant) — match the existing pricing rules.
5. Call `wallet.debit(auth.profileId, total, …)`. On insufficient balance
   return 402 with `{ error: 'Insufficient wallet balance', balanceCents,
   requiredCents }` so the UI links to Top Up. **Do not modify the
   offer's status on this failure.**
6. Update `offers.status = 'accepted'`, write `accepted_at`. If the
   project has an `orders` row created on offer acceptance, create it
   here too (search for how the old `/checkout` route did it; reuse the
   same insert shape).
7. Call `earnings.creditEarning({ providerId: offer.sender_id, orderId,
   source: 'offer', amountCents: netPayout, feeCents: platformFee })`.
8. Return `{ ok: true, offer, breakdown, balanceCents }`.

The whole thing should be atomic enough that a failure after `debit`
either rolls back (re-credit) or leaves a clear audit row. Acceptable
v1: log loudly on `creditEarning` failure (the buyer paid; ops can
reconcile), but **never** complete an accept without having debited.

Also re-check `app/api/messages/conversations/[id]/quick-offer/route.ts`
— this one CREATES an offer, no payment needed; legitimately payment-
free, leave it. (Verifying — don't break what works.)

---

## MISS 2 — CRITICAL — TOP-UP REFUND ROUTE MISSING

`app/api/admin/wallet/topup-refund/route.ts` was specced in brief 28
§6.5 and is not present in the working tree. Build it per spec:

- POST, admin auth.
- Body `{ topupTxId, amountCents, reason?, outOfBand?: { method, reference } }`.
- Look up the `wallet_transactions` row (`type='topup'`); require
  `reference` (the NMI tx id) and `amount_cents > 0`.
- Resolve `currentBalance` from `student_wallets` of that row's
  `profile_id`.
- Refund cap: `min(originalTopup, currentBalance)`. If
  `amountCents > cap`, 400 with `{ maxRefundCents, balanceCents,
  originalCents }`.
- **Card-refund path** (no `outOfBand`):
  `getPaymentProvider().refund(originalNmiTxId, amountCents)` FIRST.
  Only on success → `wallet.debit(profileId, amountCents, …)` with
  `type='refund'`, `reference=originalNmiTxId`. NMI failure → 422 with
  the gateway message, **no** wallet debit.
- **Out-of-band path** (`outOfBand` present): skip NMI;
  `wallet.debit(profileId, amountCents, …)` with `type='adjustment'`,
  `reference=<method>:<reference>`.
- Exactly one ledger row per successful refund.

---

## MISS 3 — UI: REMOVE STRIPE CONNECT BLOCK FROM `attorney-earnings.jsx`

`components/design/attorney-earnings.jsx` still contains live Stripe
Connect UI:

- L173: `const openStripe = async () => { … }`
- L176: `if (onOpenStripe) return await onOpenStripe()`
- L237: `<ConnectStatusInline summary={summary} onOpenStripe={openStripe} opening={opening} />`
- L385–420: the entire `ConnectStatusInline` component + three
  `<Btn>` CTAs labelled "Open payout dashboard ↗" / "Continue
  onboarding" / "Set up payouts" all wired to `onOpenStripe`.

Remove `openStripe`, `onOpenStripe`, the `ConnectStatusInline`
component, and the `<ConnectStatusInline …/>` mount point at L237. If
a Payout Setup link is needed in its place, link to whatever new
payout-setup form §9 implies (or leave it out for this brief — the new
manual-payout flow has admin do the work, not the provider).

Identifier rename only is **not** acceptable — the dead code must go.

---

## MISS 4 — UI: REMOVE LEGACY STRIPE BLOCKS FROM `admin.jsx`

`components/design/admin.jsx` still has live Stripe references:

- L113–114: `const [stripePublishableKey, setStripePublishableKey] = …`
  and `const [stripeSecretKey, setStripeSecretKey] = …` — remove.
- L391: `const setStripeBypass = async (_user, _enabled) => { … }` —
  remove (the bypass route is already deleted; the UI stub is dead).
- L2181–2182: Two `<Input label="Publishable key (legacy Stripe)" …>` /
  `<Input label="Secret key (legacy Stripe)" …>` — remove the inputs and
  the surrounding form section.
- L196–201, L1558–1563, L1594: reads of `stripe_product_id`,
  `stripe_price_id_usd`, `stripe_price_id_cad`, `stripe_payment_link_url`,
  `stripe_payment_link_usd`, `stripe_payment_link_cad` from service rows
  — remove from the form's state and the editor template. The columns
  stay in the DB (historical) but no admin UI should read or write them.

---

## MISS 5 — COPY COMMENTS

Three file-doc / JSX-comment survivors say “Stripe Connect”:

- `app/api/attorney/preferences/route.ts:5` — file doc comment
- `app/api/attorney/earnings/summary/route.ts:5` — file doc comment
- `components/design/attorney-overview.jsx:148` — JSX comment

Update each to the new model: "manual-payout status" / "payout setup",
matching §9 of brief 28.

---

## MISS 6 — `student-billing.jsx` STALE REFERENCES

- L10: doc comment mentions `StripePaymentSection`
- L313: JSX comment "Payment methods (parent-owned StripePaymentSection)"

Update both — replace with the current Collect.js / NMI wording or just
drop the references (the component pattern is the same; only the
provider name is stale).

---

## §X VERIFICATION (after fixes)

```bash
cd ~/Documents/GitHub/yousafe-portal
rm -f .next/lock
pnpm build >/dev/null 2>&1 && pnpm build >/dev/null 2>&1; echo "build: $?"
test -f app/api/admin/wallet/topup-refund/route.ts && echo "topup-refund ok"
grep -rnE "openStripe|onOpenStripe|ConnectStatusInline|setStripeBypass|stripePublishableKey|stripeSecretKey|StripePaymentSection" app/ components/ lib/ 2>/dev/null | wc -l | awk '{print "live Stripe identifiers (expect 0):", $1}'
grep -rnE "Stripe Connect|Pay with Stripe" app/ components/ lib/ 2>/dev/null | grep -v "//.*historical" | wc -l | awk '{print "Stripe-Connect/Pay-with-Stripe copy survivors (expect 0):", $1}'
grep -n "wallet.debit\|creditEarning" "app/api/offers/[id]/accept/route.ts" | head
git status --porcelain | grep -v /.next/
```

Required: build x2 = 0; topup-refund route present; 0 live Stripe
identifiers; 0 "Stripe Connect" / "Pay with Stripe" survivors; offer
accept references both `wallet.debit` AND `creditEarning`.

## HANDOFF

Report the §X output. Do not commit or branch — Claude commits the
whole brief-28 + 28R set in one batch after revision passes.
