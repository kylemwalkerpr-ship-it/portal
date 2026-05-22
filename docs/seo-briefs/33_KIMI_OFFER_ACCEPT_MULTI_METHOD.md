# Kimi Brief 33 — Offer Accept: Wallet + Saved Card + New Card

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** briefs 27 → 32 merged. Read `00_HOUSE_STYLE.md` and, in the repo, the current state of:

- `app/api/offers/[id]/accept/route.ts` — the atomic wallet-only accept route from brief 31.
- `components/messaging/OfferPaymentModal.tsx` — the modal from brief 31 (GET on open, POST on pay, error coerced to string via `extractErrorMessage`).
- `components/messaging/UnifiedInbox.tsx` — opens the modal; do not change inbox UI in this brief.
- `app/api/payments/charge/route.ts` — the catalogue charge route that already supports `paymentMethodId` (saved card vault lookup → `chargeVaulted`) and `token` (new card → `charge`).
- `app/api/wallet/payment-methods/route.ts` — GET returns `{ cards: [{id, vault_id, brand, last4, exp_month, exp_year, is_default}] }`.
- `app/api/payments/config/route.ts` — returns `{ scriptUrl, tokenizationKey, mode }` for Collect.js.
- `lib/payments/providers/nmi.ts` — has both `charge({ token, amountCents, ... })` (one-shot) and `chargeVaulted({ vaultId, amountCents, ... })`.
- `lib/checkoutOrders.ts` — `createPaidOrder()` accepts `paymentMethod` arg.
- `components/design/student.jsx` lines ~2120-2640 — reference implementation of the 3-method picker (wallet · saved_card · new_card) already in the dashboard catalogue. The pattern is correct; use it as the design source for this brief.

**Goal.** Extend the in-message offer accept flow so a student can pay an attorney/consultant offer with:

1. Wallet balance (existing behaviour — unchanged).
2. A saved card (vault charge through NMI).
3. A new card (Collect.js inline tokenization, then one-shot charge).

The flow must remain **atomic on the server**. The price is resolved server-side, the charge is captured, the offer is moved to `accepted`, the order is created, the provider earning is credited — all or nothing. The client never sets the price.

Non-negotiables:

- No new ToS/Refund checkboxes. Acceptance is implicit via the Pay click + fine-print disclosure under the button (matches the recent friction-fix across other dialogs).
- Errors are always coerced to a string before rendering (preserves the brief 31 §1 React error #31 fix; `error: { message, ... }` objects must never reach JSX as children).
- Saved cards in the picker are **not fully masked**. Each option shows brand + `••••{last4}` + `exp MM/YY`, so the user can identify which card to choose. Vault IDs stay out of the DOM.
- Card data never touches our server. Tokenization is Collect.js client-side; the server only sees the opaque token.
- NMI tokenization init follows the corrected order: fetch config → load script → configure on `script.onload`. Do not check `window.CollectJS` before loading the script.
- No new API surface beyond what's listed below; reuse `/api/wallet/payment-methods` and `/api/payments/config`.

---

## §1 — Extend the GET handler at `/api/offers/[id]/accept`

The current GET returns `{ offer, breakdown, balanceCents }`. Add **`savedCards`** to the payload so the modal can render the picker in one round-trip.

```ts
// returned payload shape
{
  offer,
  breakdown: { subtotal, platform_fee, tax, total, display_subtotal, display_total },
  balanceCents,
  savedCards: [
    { id, brand, last4, exp_month, exp_year, is_default },
    // ...
  ],
}
```

Implementation:

- Reuse the existing `listCards(profileId)` helper (the same one `/api/wallet/payment-methods` uses).
- Do **not** include `vault_id` in the response. The client only needs `id`; the server resolves `id → vault_id` on POST.
- If `listCards` throws, log the error and return `savedCards: []` (degrades gracefully — wallet + new-card paths still work).

All other GET behaviour is unchanged. Auth gate, role gate, status gate, expiry gate stay.

---

## §2 — Extend the POST/PATCH handler at `/api/offers/[id]/accept`

Today the handler is wallet-only. Make it dispatch on `paymentMethod`:

```ts
type AcceptBody =
  | { paymentMethod: 'wallet' }
  | { paymentMethod: 'saved_card'; paymentMethodId: string }
  | { paymentMethod: 'new_card'; token: string }
```

Backwards compatibility: if `paymentMethod` is missing from the body, default to `'wallet'` (existing callers continue to work).

For each branch, do the same downstream work the wallet branch already does (offer update, order create, earning credit). Only the "capture funds" step differs:

### Branch `wallet`

Unchanged from today. `getOrCreateWallet` → balance check → `debit(...)` → offer update → `createPaidOrder({ paymentMethod: 'wallet' })` → `creditEarning`.

### Branch `saved_card`

1. Validate `paymentMethodId` is a non-empty string.
2. Look up the card row scoped to `auth.profileId`:

   ```sql
   select id, vault_id from student_payment_methods
   where id = $paymentMethodId and profile_id = $auth.profileId
   ```

   - If no row → `fail('Card not found', 404)`.
3. Call `provider.chargeVaulted({ vaultId, amountCents: total, currency: 'usd', customer: { email, name }, metadata: { offerId, source: 'offer_accept' } })`.
   - `customer.email` / `customer.name` come from `profile.email` / `profile.full_name`, same as `/api/payments/charge`.
4. If `result.status !== 'paid'`, `fail(result.message || 'Payment could not be processed', 402, { provider_status: result.status })`. **Do not touch the offer.**
5. On success: update offer to `accepted`, `createPaidOrder({ paymentMethod: 'saved_card', ... })`, `creditEarning(...)`.

### Branch `new_card`

1. Validate `token` is a non-empty string.
2. Call `provider.charge({ token, amountCents: total, currency: 'USD', items: [{ sku: offer.id, name: offer.title, unitAmountCents: total, quantity: 1 }], customer: { email, name }, metadata: { offerId, source: 'offer_accept' } })`.
3. If `result.status !== 'paid'`, fail 402 with the message.
4. On success: same downstream as `saved_card` but `paymentMethod: 'new_card'`.

### Cross-cutting rules for the new branches

- **Idempotency / double-pay guard.** Re-read the offer with `select status` right before charging:
  - If `status !== 'pending'`, abort with `fail('Offer already accepted or expired.', 409)`. The card has not been charged yet at this point.
  - If `expires_at` has passed, mark `status: 'expired'` and abort 409 (same as today).
- **Charge failure leaves no orphan state.** Do not update the offer to `accepted` before the charge succeeds. Wallet branch is atomic via the DB; card branches need this explicit ordering.
- **Order paymentMethod** is whichever branch ran (`'wallet'` | `'saved_card'` | `'new_card'`).
- **Error coercion.** `fail()` already wraps into the envelope. The client extracts `json.error.message` — keep `fail()` calls passing a string as the first arg, with structured detail as the third arg only (e.g., `fail('Insufficient wallet balance', 402, { balanceCents, requiredCents })`).
- **Logging.** Log charge failures with `[offers/accept]` prefix + the offer id (do not log token, do not log full vault id).

### Atomicity note

The wallet path is naturally atomic — debit and offer-update can be ordered such that a debit failure stops the flow. For card paths, the order is **charge first, then offer update**. Failure between charge and offer-update is the only risky window; log loudly and return 500 with a message that names the offer id so support can recover manually. Acceptable risk; do not introduce a 2-phase commit.

---

## §3 — Refactor `OfferPaymentModal.tsx` into a 3-method picker

Keep the existing modal shell (header, breakdown card, error band, Cancel button). Replace the wallet-only Pay button + Top-up block with a payment-method picker plus a single Pay button that reflects the selected method.

### State

```ts
const [payMethod, setPayMethod]               = useState<'wallet' | 'saved_card' | 'new_card'>('wallet')
const [savedCards, setSavedCards]             = useState<SavedCard[]>([])
const [selectedCardId, setSelectedCardId]     = useState<string>('')
const [newCardToken, setNewCardToken]         = useState<string | null>(null)
const [nmiReady, setNmiReady]                 = useState(false)
const [nmiError, setNmiError]                 = useState<string | null>(null)
```

`savedCards` is populated from the GET payload added in §1. Default `selectedCardId` to the card with `is_default === true`, falling back to `savedCards[0]?.id || ''`.

Default `payMethod`:

- If wallet balance covers the total → `'wallet'`.
- Else if at least one saved card exists → `'saved_card'`.
- Else → `'new_card'`.

### Picker UI

Three radio-style options in a vertical stack, each a clickable card:

1. **Wallet balance**
   - Subtitle: `{formatMoney(walletCents, currency)} available` — if insufficient, suffix " · insufficient" in muted red; disable the option's selectability.
2. **Saved card**
   - Disabled when `savedCards.length === 0`. Subtitle: "No saved cards yet — add one from billing" with a link to `/student?goto=billing`.
   - When enabled and selected, render a `<select>` immediately below with one `<option>` per card. The option label is exactly:

     ```
     {BRAND.toUpperCase()} ••••{last4} · exp {String(exp_month).padStart(2,'0')}/{String(exp_year).slice(-2)}{is_default ? ' · default' : ''}
     ```

     The user MUST be able to read this and identify the right card. Brand and last4 are non-sensitive (PCI-DSS SAQ A allows showing them); exp month/year are also non-sensitive. Do not fully mask — do not show `•••• ••••` or `••••0000`.
3. **New card**
   - Subtitle: "Enter card details securely with Collect.js".
   - When selected, render Collect.js inline fields and a "Tokenize card securely" button (see §4).

The picker uses the same `CheckoutChoice`/`CheckoutButton` visual language as `components/design/fiverr-workbench.jsx` and the dashboard catalogue checkout, scoped to the modal's color palette (NAVY, GOLD, etc.).

### Pay button

Single button below the picker. Label is method-dependent:

- `wallet` → `Pay {formatMoney(total)} from wallet`
- `saved_card` (and a card is selected) → `Pay {formatMoney(total)} with {BRAND} ••••{last4}`
- `saved_card` (no card selected) → `Choose a saved card` (disabled)
- `new_card` (no token yet) → `Tokenize your card first` (disabled)
- `new_card` (token present) → `Pay {formatMoney(total)} with new card`

Disabled when `submitting`, or when the chosen method's prerequisites aren't met (no card selected, wallet insufficient, no token).

### Pay handler

```ts
async function handlePay() {
  if (submitting) return
  setSubmitting(true); setError(null)
  try {
    const body =
      payMethod === 'wallet'      ? { paymentMethod: 'wallet' } :
      payMethod === 'saved_card'  ? { paymentMethod: 'saved_card', paymentMethodId: selectedCardId } :
                                    { paymentMethod: 'new_card', token: newCardToken }

    const res = await fetch(`/api/offers/${offerId}/accept`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 402 && payMethod === 'wallet') {
        setWalletCents(Number(json?.error?.balanceCents ?? walletCents ?? 0))
        setRequiredCents(Number(json?.error?.requiredCents ?? requiredCents ?? 0))
      }
      setError(extractErrorMessage(json, res.status))
      setSubmitting(false)
      return
    }
    onPaid?.()
    onClose()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Payment failed.')
    setSubmitting(false)
  }
}
```

**Critical:** never put `json.error` (the object) into state. `extractErrorMessage` already returns a string; preserve that guarantee.

### Fine-print disclosure (replaces removed ToS checkboxes)

Directly below the Pay button, render:

```
By placing this order you agree to the Terms of Service and Refund Policy.
```

Both phrases linked to `TERMS_URL` and `REFUND_POLICY_URL` (same constants used elsewhere; import from wherever they're already defined, or duplicate as local constants in this file). Style: 11px, muted ink, centered, underlined links in muted ink. Same pattern as the friction-fix in `fiverr-workbench.jsx` and `student.jsx`.

Do **not** add checkboxes. Do **not** gate the Pay button on acceptance state. The click is the acceptance.

---

## §4 — Collect.js init for the New Card branch

Use the **corrected** order from the latest tokenization fix in `student.jsx` (NOT the broken early-return version).

```ts
const initNmi = async () => {
  if (nmiReady) return
  setNmiError(null)
  if (typeof window === 'undefined') return
  try {
    const cfgRes = await fetch('/api/payments/config')
    const cfg = await cfgRes.json().catch(() => ({}))
    if (!cfgRes.ok || !cfg.scriptUrl) {
      setNmiError('Payment config unavailable')
      return
    }
    const scriptUrl = cfg.scriptUrl
    const configure = () => {
      const CollectJS = (window as any).CollectJS
      if (!CollectJS) { setNmiError('Payment tokenization library not available'); return }
      CollectJS.configure({
        variant: 'inline',
        fields: {
          ccnumber: { placeholder: 'Card number', selector: '#nmi-offer-card-number' },
          ccexp:    { placeholder: 'MM / YY',     selector: '#nmi-offer-card-expiry' },
          cvv:      { placeholder: 'CVV',         selector: '#nmi-offer-card-cvv' },
        },
        callback: (response: any) => {
          if (response.token) {
            setNewCardToken(response.token)
            setNmiError(null)
          } else {
            setNmiError(response.message || 'Card tokenization failed')
          }
        },
      })
      setNmiReady(true)
    }
    if ((window as any).CollectJS || document.querySelector(`script[src="${scriptUrl}"]`)) {
      configure()
      return
    }
    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.dataset.tokenizationKey = cfg.tokenizationKey || ''
    script.onload = configure
    script.onerror = () => setNmiError('Failed to load payment tokenization library')
    document.body.appendChild(script)
  } catch (e: any) {
    setNmiError(e?.message || 'Failed to initialise card fields')
  }
}
```

Call `initNmi()` from the `onClick` of the "New card" picker option (lazy load — do not load Collect.js until the user selects this method).

Render three field containers when `payMethod === 'new_card'`:

```tsx
<div id="nmi-offer-card-number" style={...} />
<div id="nmi-offer-card-expiry" style={...} />
<div id="nmi-offer-card-cvv" style={...} />
```

Below the fields, a "Tokenize card securely" button:

- `disabled={!nmiReady}`.
- On click: `if (!nmiReady) { setNmiError('Payment fields are not ready — please wait a moment.'); return }; (window as any).CollectJS.startPaymentRequest()`.
- Label switches to "Card tokenized ✓" once `newCardToken` is set.

Surface `nmiError` in a small red band above the button.

When the user switches to a different `payMethod` and back, the inline fields will re-mount. That's acceptable; CollectJS is idempotent across configure calls within the same page lifecycle.

---

## §5 — Top-up fallback for the wallet branch

The current modal shows a "Top up wallet" link when `walletCents < total`. Keep that **only when `payMethod === 'wallet'` AND balance is insufficient**. For the other methods, hide the top-up block — the user can pay directly with their card.

---

## §6 — Error coercion (preserve brief 31 §1)

`extractErrorMessage(json, status)` already coerces. Audit every `setError(...)` call site in the modal to ensure the value is `string | null`. Add a runtime check in tests if practical:

```ts
function assertString(v: unknown): string { return typeof v === 'string' ? v : String(v ?? '') }
```

This is paranoia, but it prevents React error #31 if a future change passes an object.

---

## §7 — Accessibility

- The picker is a single `role="radiogroup"` with three `role="radio"` buttons. Arrow-key navigation between options.
- The `<select>` for saved cards has `aria-label="Choose a saved card"`.
- The Pay button has a clear text label including amount and method.
- Modal close button has `aria-label="Close payment modal"`.
- Focus moves into the modal on open and is restored on close (existing modal might already do this; preserve).

---

## §8 — Idempotency & Safety

- No DB schema changes. No new tables. No new endpoints.
- Charge metadata always includes `{ offerId, source: 'offer_accept' }` so support can reconcile.
- Do not log card tokens, vault ids, or full card numbers. Brand + last4 + exp are fine.
- The order `paymentMethod` value on the orders table must be one of `'wallet' | 'saved_card' | 'new_card'` — verify the column accepts these enum values; if it's a check-constrained enum, update the constraint in the same Supabase migration file that defines orders (only if necessary). If the column is free-form text, no migration needed.
- Two consecutive `pnpm build` runs produce identical bundles.

---

## §9 — Verification

```bash
cd /Users/phantomdarne/Documents/GitHub/yousafe-portal
pnpm build 2>&1 | tail -10
git diff --check
git status --short
```

Manual scenarios (against a staging or local environment with a real offer):

1. Open offer → modal loads → wallet has enough → click Pay → status 200, offer becomes accepted, order created.
2. Open offer → wallet insufficient → switch to Saved card → pick a card visible by brand + last4 + exp → click Pay → 200, charge succeeds, offer accepted, order has `payment_method='saved_card'`.
3. Open offer → switch to New card → Collect.js loads from `script.onload` → tokenize → Pay → 200, offer accepted, order has `payment_method='new_card'`.
4. Open offer → wallet insufficient → no saved cards → modal defaults to New card option.
5. Force a 402 from `chargeVaulted` (e.g., a card with insufficient funds in the NMI test mode): error band renders as a **string**, offer remains `pending`, no order created.
6. Click Pay twice rapidly: second click is rejected by `submitting` guard. Charge happens exactly once.
7. Saved card dropdown labels visibly include brand + last4 + exp (smoke-test with screenshot or DOM inspection: `VISA ••••4242 · exp 12/27`).

Curl checks:

```bash
# GET shape includes savedCards
curl -s --max-time 15 \
  -H "Cookie: __session=..." \
  https://portal.yousafeconsultancy.com/api/offers/<id>/accept | \
  python3 -c "import json,sys;d=json.load(sys.stdin);print('savedCards' in d.get('data',d))"
# Expect: True
```

Grep sanity:

```bash
rg -n "TODO|FIXME|console\.(log|debug)" components/messaging/OfferPaymentModal.tsx app/api/offers
# Expect: 0
```

---

## §10 — Reject Criteria

Reject the handoff if any of these are true:

- The card row's `vault_id` appears anywhere in the GET response or in the DOM.
- The saved-card dropdown obscures `last4` or `exp` (e.g., shows `VISA ••••••••` or just `VISA`).
- A new ToS/Refund checkbox was reintroduced.
- The Pay button gates on any acceptance state besides the per-method readiness rules.
- `setError` ever receives a non-string anywhere in the file.
- Collect.js `window.CollectJS` is checked before the script-load logic runs (the old broken pattern).
- A failed card charge leaves the offer in `accepted` state.
- The wallet branch behaviour observably changes (regression of brief 31).
- Card data is sent to our server (anything other than the opaque token reaches `/api/offers/[id]/accept`).
- Build is not idempotent.
- The PATCH alias breaks (`/api/offers/[id]/accept` accepts both POST and PATCH today; keep both).

---

## §11 — Handoff Report

Return:

1. One-line summary.
2. Files changed (full list, with line counts).
3. Build output summary.
4. Whether the order `payment_method` column required any schema/constraint change; if so, the SQL.
5. The §9 manual scenarios you executed, with results (which ran, which were simulated, which couldn't run locally).
6. Visual QA notes (desktop + mobile): the picker fits the modal, the saved-card option's text is readable at common widths, the new-card fields render at 42px height, errors render as text.
7. Risks and follow-ups (e.g., reconciliation between charge and offer-update, edge cases in NMI test mode).

Do not commit. Supervisor reviews and ships.
