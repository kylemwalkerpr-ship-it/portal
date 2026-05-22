# Kimi Brief 35 — Three Payment Methods on Marketplace Gig + Template Cart

**Supervisor:** Claude. **Executor:** Kimi.
**Repo:** `yousafe-portal`.
**Prerequisites:** briefs 27-34 merged. Read `00_HOUSE_STYLE.md` and the current state of:

- `components/design/fiverr-workbench.jsx` — `GigCheckoutDialog` starting at `function GigCheckoutDialog`.
- `app/marketplace/cart/page.tsx` — template purchase checkout page.
- `app/api/checkout/order/route.ts` — currently wallet-only for gig source type.
- `app/api/payments/charge/route.ts` — handles `paymentMethodId` (saved vault) and `token` (new card).
- `lib/checkoutOrders.ts` — `resolveCheckoutItem` already handles `sourceType: 'gig'` + `createPaidOrder`.
- `lib/payments/providers/nmi.ts` — `charge({ token, ... })` and `chargeVaulted({ vaultId, ... })`.
- `app/api/wallet/payment-methods/route.ts` — GET returns `{ cards: [{id, brand, last4, exp_month, exp_year, is_default}] }`.
- `app/api/payments/config/route.ts` — returns `{ scriptUrl, tokenizationKey, mode }` for Collect.js.

---

## Background

When a student clicks **Buy** on a marketplace gig, `GigCheckoutDialog` in `fiverr-workbench.jsx` opens. It shows three `CheckoutButton` options (wallet, saved_card, nmi) but **only wallet works**. The `saved_card` path posts `paymentMethod: 'saved_card'` to `/api/checkout/order`, which ignores it and falls through (wallet-only route). The `nmi` button has no card fields and is mislabeled "Pay with saved card" — it is dead code.

On the template **Cart** page (`app/marketplace/cart/page.tsx`), there is no saved-card option at all; only wallet and inline Collect.js new-card.

This brief wires all three methods — **wallet**, **saved card**, **new card** — on both surfaces.

---

## §1 — Extend `/api/checkout/order` for card payments on gig source type

The route already handles the full downstream flow for `sourceType: 'gig'` on the wallet path. Extend it to dispatch on `paymentMethod` for card paths using the **identical pattern** as brief 33 did for `/api/offers/[id]/accept`.

Accept request body:

```ts
type CheckoutOrderBody =
  | { sourceType: 'gig'; sourceId: string; tierId?: string; paymentMethod?: 'wallet' }
  | { sourceType: 'gig'; sourceId: string; tierId?: string; paymentMethod: 'saved_card'; paymentMethodId: string }
  | { sourceType: 'gig'; sourceId: string; tierId?: string; paymentMethod: 'new_card'; token: string }
  // offer source types unchanged
```

If `paymentMethod` is absent, default to `'wallet'` (backwards compatible).

For **`saved_card`**:
1. Validate `paymentMethodId` non-empty.
2. Look up `student_payment_methods` row scoped to `auth.profileId`: `select id, vault_id where id = $paymentMethodId and profile_id = $auth.profileId`. 404 if missing.
3. Call `provider.chargeVaulted({ vaultId, amountCents: resolved.totalCents, currency: 'usd', customer: { email, name }, metadata: { source: 'gig_checkout', gigId: resolved.gigId } })`.
4. If `result.status !== 'paid'`: return 402 with the provider message. **Do not create the order.**
5. On success: `createPaidOrder({ paymentMethod: 'saved_card' })`, then `creditEarning`. Return `ok(...)`.

For **`new_card`**:
1. Validate `token` non-empty.
2. Call `provider.charge({ token, amountCents: resolved.totalCents, currency: 'USD', items: [{ sku: resolved.gigId || resolved.sourceId, name: resolved.title, unitAmountCents: resolved.totalCents, quantity: 1 }], customer: { email, name }, metadata: { source: 'gig_checkout' } })`.
3. Same 402 / success logic as saved_card.

`customer.email` / `customer.name` come from `auth.profile.email` / `auth.profile.full_name` — the same way `app/api/payments/charge/route.ts` resolves them.

**Atomicity rule (same as brief 33):** for card paths, charge first, then update DB. A failed charge must not create an order. Log charge failures with `[checkout/order] card charge failed:` prefix plus source id (no token, no vault id).

Non-gig source types (`unified_offer`, `attorney_offer`, `consultant_offer`) are **unchanged** — brief 33 handles those via `/api/offers/[id]/accept`.

---

## §2 — Fix `GigCheckoutDialog` in `fiverr-workbench.jsx`

### 2.1 State cleanup

Remove the confusing `'nmi'` payMethod value. The three canonical values are:

```js
// 'wallet' | 'saved_card' | 'new_card'
const [payMethod, setPayMethod] = React.useState('wallet')
```

Default `payMethod`:
- If wallet balance ≥ total price → `'wallet'`.
- Else if at least one saved card exists → `'saved_card'`.
- Else → `'new_card'`.

Add state for new-card tokenization:

```js
const [newCardToken, setNewCardToken] = React.useState(null)
const [nmiReady, setNmiReady] = React.useState(false)
const [nmiError, setNmiError] = React.useState(null)
```

### 2.2 `pay()` function

```js
const pay = async () => {
  if (busy) return
  if (payMethod === 'wallet' && !canUseWallet) {
    setError('Your wallet balance is not enough for this order.')
    return
  }
  if (payMethod === 'saved_card' && !selectedCardId) {
    setError('Choose a saved card first.')
    return
  }
  if (payMethod === 'new_card' && !newCardToken) {
    setError('Tokenize your card first using the secure form above.')
    return
  }
  setBusy(true)
  setError('')
  try {
    const body = {
      sourceType: 'gig',
      sourceId: gig.id,
      tierId: tier.id,
      paymentMethod: payMethod,
      ...(payMethod === 'saved_card' && { paymentMethodId: selectedCardId }),
      ...(payMethod === 'new_card'   && { token: newCardToken }),
    }
    const payload = await requestJson('/api/checkout/order', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (payload.url) { window.location.href = payload.url; return }
    onPaid?.()
  } catch (e) {
    setError(typeof e.message === 'string' ? e.message : 'Payment failed.')
  } finally {
    setBusy(false)
  }
}
```

### 2.3 NMI init (corrected `script.onload` pattern — mandatory)

```js
const initNmi = async () => {
  if (nmiReady) return
  setNmiError(null)
  try {
    const cfg = await requestJson('/api/payments/config')
    if (!cfg.scriptUrl) { setNmiError('Payment config unavailable'); return }
    const configure = () => {
      const CollectJS = window.CollectJS
      if (!CollectJS) { setNmiError('Payment tokenization library not available'); return }
      CollectJS.configure({
        variant: 'inline',
        fields: {
          ccnumber: { placeholder: 'Card number', selector: '#nmi-gig-card-number' },
          ccexp:    { placeholder: 'MM / YY',     selector: '#nmi-gig-card-expiry' },
          cvv:      { placeholder: 'CVV',         selector: '#nmi-gig-card-cvv' },
        },
        callback: (response) => {
          if (response.token) { setNewCardToken(response.token); setNmiError(null) }
          else { setNmiError(response.message || 'Card tokenization failed') }
        },
      })
      setNmiReady(true)
    }
    if (window.CollectJS || document.querySelector(`script[src="${cfg.scriptUrl}"]`)) {
      configure(); return
    }
    const script = document.createElement('script')
    script.src = cfg.scriptUrl
    script.async = true
    script.dataset.tokenizationKey = cfg.tokenizationKey || ''
    script.onload = configure
    script.onerror = () => setNmiError('Failed to load payment tokenization library')
    document.body.appendChild(script)
  } catch (e) {
    setNmiError(e?.message || 'Failed to initialise card fields')
  }
}
```

Call `initNmi()` when the user selects the `'new_card'` option — lazy load.

### 2.4 Picker UI (replace the three `CheckoutButton` lines)

```jsx
{/* Wallet */}
<CheckoutButton
  active={payMethod === 'wallet'}
  disabled={!canUseWallet}
  onClick={() => canUseWallet && setPayMethod('wallet')}
  title="Wallet balance"
  detail={walletBalance === null
    ? 'Loading balance...'
    : `${money((walletBalance || 0) * 100)} available${canUseWallet ? '' : ' · insufficient'}`}
/>

{/* Saved card */}
<CheckoutButton
  active={payMethod === 'saved_card'}
  disabled={!cards.length}
  onClick={() => { if (cards.length) setPayMethod('saved_card') }}
  title="Saved card"
  detail={cards.length === 0
    ? 'No saved cards — add one from billing'
    : selectedCard
      ? `${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4} · exp ${String(selectedCard.exp_month).padStart(2,'0')}/${String(selectedCard.exp_year).slice(-2)}`
      : 'Select a card below'}
/>
{payMethod === 'saved_card' && cards.length > 0 && (
  <select
    value={selectedCardId}
    onChange={e => setSelectedCardId(e.target.value)}
    aria-label="Choose a saved card"
    style={{ width: '100%', border: `1px solid ${C.border2}`, borderRadius: '10px', padding: '11px 12px', background: C.surface2, color: C.text }}
  >
    {cards.map(card => (
      <option key={card.id} value={card.id}>
        {(card.brand || 'CARD').toUpperCase()} ••••{card.last4} · exp {String(card.exp_month).padStart(2,'0')}/{String(card.exp_year).slice(-2)}{card.is_default ? ' · default' : ''}
      </option>
    ))}
  </select>
)}

{/* New card */}
<CheckoutButton
  active={payMethod === 'new_card'}
  onClick={() => { setPayMethod('new_card'); initNmi() }}
  title="New card"
  detail="Enter card details securely"
/>
{payMethod === 'new_card' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    {nmiError && (
      <div style={{ color: C.red, fontSize: '12px', padding: '8px 12px', background: 'rgba(220,38,38,0.06)', borderRadius: '8px' }}>
        {nmiError}
      </div>
    )}
    <div id="nmi-gig-card-number" style={{ padding: '10px 14px', background: '#fff', borderRadius: '8px', border: `1px solid ${C.border}`, minHeight: '42px' }} />
    <div style={{ display: 'flex', gap: '10px' }}>
      <div id="nmi-gig-card-expiry" style={{ flex: 1, padding: '10px 14px', background: '#fff', borderRadius: '8px', border: `1px solid ${C.border}`, minHeight: '42px' }} />
      <div id="nmi-gig-card-cvv" style={{ flex: 1, padding: '10px 14px', background: '#fff', borderRadius: '8px', border: `1px solid ${C.border}`, minHeight: '42px' }} />
    </div>
    <button
      type="button"
      onClick={() => {
        if (!nmiReady) { setNmiError('Payment fields are not ready — please wait a moment.'); return }
        window.CollectJS.startPaymentRequest()
      }}
      disabled={!nmiReady}
      style={{ padding: '9px 16px', borderRadius: '8px', background: C.surface2, border: `1px solid ${C.border}`, fontSize: '13px', cursor: nmiReady ? 'pointer' : 'not-allowed', color: C.text }}
    >
      {newCardToken ? 'Card tokenized ✓' : 'Tokenize card securely'}
    </button>
  </div>
)}
```

### 2.5 Pay button (below the picker)

```jsx
{error && (
  <div style={{ color: C.red, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: '10px', padding: '10px 12px', fontSize: '13px' }}>
    {error}
  </div>
)}
<Btn
  variant="primary" fullWidth size="lg"
  onClick={pay}
  disabled={
    busy ||
    (payMethod === 'wallet'     && !canUseWallet) ||
    (payMethod === 'saved_card' && !selectedCardId) ||
    (payMethod === 'new_card'   && !newCardToken)
  }
>
  {busy ? 'Processing...' : payMethod === 'wallet'
    ? `Pay ${money(totalCents)} from wallet`
    : payMethod === 'saved_card' && selectedCard
    ? `Pay ${money(totalCents)} with ${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4}`
    : payMethod === 'new_card' && newCardToken
    ? `Pay ${money(totalCents)} with new card`
    : payMethod === 'saved_card'
    ? 'Choose a saved card'
    : 'Tokenize your card first'}
</Btn>
<p style={{ color: C.textDim, fontSize: '11px', textAlign: 'center', margin: '6px 0 0', lineHeight: 1.5 }}>
  By placing this order you agree to the{' '}
  <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: 'underline' }}>Terms of Service</a>{' '}
  and{' '}
  <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: 'underline' }}>Refund Policy</a>.
</p>
```

### 2.6 What NOT to change in `fiverr-workbench.jsx`

- The price breakdown card (subtotal, platform fee, provider receives, You pay).
- `providerType` / `platformPercent` / `providerPayoutCents` computation.
- The modal shell (backdrop, close button, header).
- `requestJson` helper.
- The `C` color constants and `CheckoutButton` component.
- On-close reset logic.

---

## §3 — Add saved card to `cart/page.tsx`

The cart page already handles wallet (→ `/api/wallet/debit`) and new card (→ Collect.js tokenization → `/api/payments/charge` with `token`). Add a third tab for **saved card**.

### 3.1 New state

```ts
const [savedCards, setSavedCards] = useState<SavedCard[]>([])
const [selectedCardId, setSelectedCardId] = useState('')
// payMethod expands: 'wallet' | 'card' | 'saved_card'
const [payMethod, setPayMethod] = useState<'wallet' | 'card' | 'saved_card'>('wallet')
```

Load saved cards alongside wallet balance in the existing signed-in useEffect:

```ts
fetch('/api/wallet/payment-methods', { credentials: 'same-origin' })
  .then(r => r.json())
  .then(d => {
    const cards = d.cards ?? []
    setSavedCards(cards)
    setSelectedCardId(cards.find((c: SavedCard) => c.is_default)?.id || cards[0]?.id || '')
  })
  .catch(() => setSavedCards([]))
```

### 3.2 Add `handleSavedCardPay`

```ts
async function handleSavedCardPay() {
  if (!selectedCardId) { setCheckoutError('Choose a saved card first.'); return }
  setIsSubmitting(true); setCheckoutError(null)
  try {
    const res = await fetch('/api/payments/charge', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethodId: selectedCardId,
        items: items.map(item => ({ slug: item.slug, quantity: item.quantity })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCheckoutError(typeof data.message === 'string' ? data.message : data.error || 'Payment was declined.')
      return
    }
    clear()
    router.push('/marketplace/order/success')
  } catch (e: any) {
    setCheckoutError(e?.message || 'Payment failed.')
  } finally {
    setIsSubmitting(false)
  }
}
```

### 3.3 Picker UI

Insert a "Saved card" tab between the Wallet and Card tabs in the signed-in payment section. Below the tabs, when `payMethod === 'saved_card'`, render:

- If no saved cards: amber notice "No saved cards. Top up or pay by new card." No additional controls.
- If saved cards exist: a `<select>` with one option per card. **Labels must include brand + last4 + exp** — not just brand:

  ```tsx
  <option key={c.id} value={c.id}>
    {(c.brand || 'CARD').toUpperCase()} ••••{c.last4} · exp {String(c.exp_month).padStart(2,'0')}/{String(c.exp_year).slice(-2)}{c.is_default ? ' · default' : ''}
  </option>
  ```

- The selected card detail also echoes in the tab button: "Saved card · VISA ••••4242".

### 3.4 Checkout submit routing

Extend the existing `handleCheckout` (or `startCheckout`) function:

```ts
if (isSignedIn && payMethod === 'saved_card') {
  await handleSavedCardPay()
  return
}
if (isSignedIn && payMethod === 'wallet') {
  // existing wallet path unchanged
}
// existing new-card / guest path unchanged
```

### 3.5 What NOT to change in `cart/page.tsx`

- The existing wallet debit path.
- The existing Collect.js init (it already uses the `script.onload` pattern — do not alter it).
- Cart item rendering, quantity controls, or remove buttons.
- SEO metadata and layout.
- Guest checkout path.

---

## §4 — Saved card visibility rule (applies to every picker in this brief)

Saved cards are **never fully masked**. Every `<option>` and every button label must show:

```
BRAND ••••last4 · exp MM/YY [· default]
```

- `last4` is plain text — 4 visible digits as stored.
- `exp_month` zero-padded to 2 digits.
- `exp_year` as last 2 digits.
- `· default` appended when `is_default === true`.

This matches the rule from brief 33 and brief 31 friction-fix. A fully-masked label ("VISA ••••••••" or just "VISA") is a **reject**.

---

## §5 — No ToS checkboxes

No acceptance checkboxes anywhere. Both surfaces use the fine-print disclosure under the Pay button (already in `GigCheckoutDialog` since the friction-fix; ensure `cart/page.tsx` also has it). The button click IS the acceptance.

---

## §6 — Idempotency & safety

- No DB schema changes. No new tables.
- `vault_id` never reaches the client — server resolves `id → vault_id` inside `/api/checkout/order`.
- Two consecutive `pnpm build` runs produce identical bundles.
- No new third-party JS. No analytics changes.

---

## §7 — Verification

```bash
cd /Users/phantomdarne/Documents/GitHub/yousafe-portal
pnpm build 2>&1 | tail -10
git diff --check
git status --short
```

Manual scenarios:

1. Sign in as student, open a gig → click Buy → GigCheckoutDialog opens → wallet tab selected by default if sufficient balance → click Pay → 200, order created with `payment_method='wallet'`.
2. Same → switch to Saved card → dropdown shows `VISA ••••4242 · exp 12/27 · default` → click Pay → 200, `chargeVaulted` succeeded, order `payment_method='saved_card'`.
3. Same → switch to New card → Collect.js fields render, Tokenize button → tokenized → Pay → 200, `charge(token)` succeeded, order `payment_method='new_card'`.
4. Force wallet insufficient: wallet tab is disabled (disabled prop on `CheckoutButton`); default jumps to Saved card.
5. No saved cards: Saved card tab disabled, detail says "No saved cards — add one from billing".
6. Cart page: sign in → add template to cart → go to `/cart` → Saved card tab appears → select card with visible BRAND ••••last4 exp → pay → order created.
7. Failed saved card (NMI test decline): error message is a **string** in the error band; order NOT created; dialog remains open.
8. Double-click Pay: `busy` flag prevents second submission.

Grep sanity:

```bash
# No fully-masked card labels
rg -n "ending \${|last4\}" components/design/fiverr-workbench.jsx app/marketplace/cart/page.tsx | head
# Every result must be accompanied by exp_month/exp_year — check no orphan "ending X" without exp

# NMI init: window.CollectJS not checked before script load
rg -n "window.CollectJS" components/design/fiverr-workbench.jsx | head
# Expect: only inside the `configure` callback and `startPaymentRequest` call
```

---

## §8 — Reject Criteria

Reject if:

- Saved card option in either surface shows a fully-masked label without `last4` **and** `exp`.
- `vault_id` appears in the GET response or in client-side state.
- A failed card charge creates an order or changes the gig/tier state.
- `window.CollectJS` is checked before the `script.onload` fires (the broken early-return pattern).
- A ToS/Refund checkbox is reintroduced.
- `setError` / `setCheckoutError` is ever given a non-string value.
- The `'nmi'` payMethod value still exists anywhere in the final code.
- Non-gig source types in `/api/checkout/order` are changed.
- Build is not idempotent.

---

## §9 — Handoff Report

Return:

1. One-line summary.
2. Files changed with line counts.
3. Build output summary.
4. Confirm `vault_id` is absent from client responses (grep result).
5. §7 manual scenario results (which ran, which were simulated).
6. Saved card label screenshot / DOM snippet confirming `BRAND ••••last4 · exp MM/YY` format.
7. Risks & follow-ups.

Do not commit. Supervisor reviews and ships.
