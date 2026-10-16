'use client'

import { notFound } from 'next/navigation'
import Checkout from '@/components/checkout/Checkout'
import type { AvailablePaymentMethod, CheckoutState } from '@/components/checkout/useCheckout'

const previewMethods: AvailablePaymentMethod[] = [
  {
    methodKey: 'manual:wallet', provider: 'manual', id: 'wallet', label: 'Wallet balance',
    logoAsset: '/payments/manual.svg', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD',
    currencies: ['USD'], priority: 1, isDefault: false, supportsVault: false,
  },
  {
    methodKey: 'nmi:card', provider: 'nmi', id: 'card', label: 'Card payment', supportedBrands: ['visa', 'mastercard', 'amex', 'discover'],
    logoAsset: '/payments/nmi.svg', mode: 'inline-token', displayCurrency: 'USD', chargeCurrency: 'USD',
    currencies: ['USD'], priority: 2, isDefault: true, supportsVault: true,
  },
  {
    methodKey: 'pesapal:card', provider: 'pesapal', id: 'card', label: 'Card payment', supportedBrands: ['visa', 'mastercard', 'amex'],
    logoAsset: '/payments/pesapal.svg', mode: 'hosted-redirect', displayCurrency: 'USD', chargeCurrency: 'USD',
    currencies: ['USD'], priority: 3, isDefault: false, supportsVault: false,
  },
]

const states: Array<{ state: CheckoutState; message?: string }> = [
  { state: 'idle' },
  { state: 'submitting', message: 'Your payment is being submitted.' },
  { state: 'redirecting', message: 'Opening your secure payment page.' },
  { state: 'pending', message: 'Waiting for the payment provider.' },
  { state: 'failed', message: 'The payment could not be completed. Try another method.' },
  { state: 'cancelled', message: 'Checkout was closed. Confirm any payment before retrying.' },
  { state: 'method_unavailable', message: 'The selected method was disabled. Choose an available option.' },
  { state: 'receipt', message: 'A server-confirmed receipt is ready.' },
]

export default function CheckoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 64px', background: 'var(--ys-paper, #F7F8FA)', color: 'var(--ys-ink, #0F172A)' }}>
      <header style={{ maxWidth: 1280, margin: '0 auto 28px' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: 38 }}>Checkout preview</h1>
        <p style={{ color: 'var(--ys-inkMid, #334155)', lineHeight: 1.5 }}>Local fixture with mocked methods and checkout states. No payment requests are sent.</p>
      </header>

      <section aria-label="Checkout state previews" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: 20, maxWidth: 1280, margin: '0 auto 44px' }}>
        {states.map(({ state, message }) => (
          <div key={state}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 650 }}>{state.replace('_', ' ')}</h2>
            <Checkout
              title="Consultation package"
              amountUsdCents={12500}
              description="A 60-minute consultation with a legal specialist."
              purpose="order"
              walletBalanceCents={4500}
              savedCards={[{ id: 'preview-card', gateway: 'nmi', brand: 'Visa', last4: '4242', is_default: true }]}
              previewMethods={previewMethods}
              previewState={state}
              previewMessage={message}
              variant="cart"
              onSubmit={async () => ({})}
            />
          </div>
        ))}
      </section>

      <section aria-label="Wallet top-up preview" style={{ maxWidth: 520, margin: '0 auto 44px', padding: 24, border: '1px solid #E5E7EB', borderRadius: 18, background: '#fff', boxShadow: '0 12px 32px rgba(15,23,42,.08)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>Top up wallet</h2>
        <p style={{ margin: '0 0 18px', color: '#64748B' }}>Preview state · hosted card payment · no payment request is sent.</p>
        <label htmlFor="preview-topup-amount" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Amount (USD)</label>
        <input id="preview-topup-amount" readOnly value="$25.00" style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 18, marginBottom: 14 }} />
        <button type="button" style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 15 }}>Continue to secure payment</button>
      </section>

      <section aria-label="Offer modal checkout variant" style={{ maxWidth: 620, margin: '0 auto 40px' }}>
        <h2>Offer modal variant</h2>
        <Checkout
          title="Custom offer"
          amountUsdCents={8500}
          purpose="offer"
          description="Complete payment from the conversation."
          walletBalanceCents={10000}
          previewMethods={previewMethods}
          previewState="idle"
          variant="offer"
          onSubmit={async () => ({})}
        />
      </section>

      <section aria-label="Gig checkout variant" style={{ maxWidth: 620, margin: '0 auto' }}>
        <h2>Gig checkout variant</h2>
        <Checkout
          title="Marketplace gig"
          amountUsdCents={17500}
          purpose="order"
          description="Standard package · 5 day delivery"
          walletBalanceCents={6000}
          previewMethods={previewMethods}
          previewState="idle"
          variant="gig"
          onSubmit={async () => ({})}
        />
      </section>
    </main>
  )
}
