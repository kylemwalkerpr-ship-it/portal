'use client'

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import Checkout from '@/components/checkout/Checkout'
import type { AvailablePaymentMethod } from '@/components/checkout/useCheckout'
import { PaletteProvider } from '@/contexts/palette-context'
import { buildPaletteBootScript } from '@/components/marketplace/palette-boot'
import '../../marketplace/marketplace-brand.css'
import '../../marketplace/marketplace-first-paint.css'
import '../../marketplace/marketplace-polish.css'
import '../../marketplace/mobile-flow.css'
import '../../marketplace/discovery-grid.css'
import '../../marketplace/gig-detail-professional-layout.css'

const methods: AvailablePaymentMethod[] = [
  { methodKey: 'preview:hosted-card', provider: 'pesapal', id: 'card', label: 'Card payment', logoAsset: '', mode: 'hosted-redirect', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 1, isDefault: true, supportsVault: false, supportedBrands: ['visa', 'mastercard', 'amex'] },
  { methodKey: 'preview:wallet', provider: 'preview', id: 'wallet', label: 'Wallet balance', logoAsset: '', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 2, isDefault: false, supportsVault: false },
  { methodKey: 'preview:invoice', provider: 'preview', id: 'invoice', label: 'Invoice', logoAsset: '', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 3, isDefault: false, supportsVault: false },
]

function sandboxStatusLabel(status: string) {
  switch (status) {
    case 'checking': return 'Checking payment status…'
    case 'pending': return 'Waiting for PesaPal to confirm payment'
    case 'completed': return 'Payment complete'
    case 'failed': return 'Payment failed'
    case 'invalid': return 'Payment was not completed'
    case 'reversed': return 'Payment was reversed'
    case 'cancelled': return 'Checkout cancelled'
    case 'unverified': return 'We could not verify this payment yet'
    default: return 'Status unavailable'
  }
}

export default function MarketCheckoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const [signedOut, setSignedOut] = useState(false)
  const [sandboxMode, setSandboxMode] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSignedOut(params.get('state') === 'signed-out')
    setSandboxMode(params.get('sandbox') === '1')
    if (params.get('sandbox') !== '1') return
    if (params.get('pesapalTest') === 'cancelled') {
      setPaymentStatus('cancelled')
      return
    }
    if (params.get('pesapalTest') !== 'return') return
    const trackingId = params.get('OrderTrackingId') || params.get('orderTrackingId')
    if (!trackingId) return
    setPaymentStatus('checking')
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/dev/pesapal/status?trackingId=${encodeURIComponent(trackingId)}`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error('status_unavailable')
        const status = typeof data.status === 'string' ? data.status.toLowerCase() : 'unknown'
        if (!active) return
        setPaymentStatus(status)
        if (['completed', 'failed', 'invalid', 'cancelled'].includes(status)) return
      } catch {
        if (active) setPaymentStatus('checking')
      }

      attempts += 1
      if (active && attempts < 30) {
        timer = setTimeout(checkStatus, 2000)
      } else if (active) {
        setPaymentStatus((current) => current === 'pending' ? current : 'unverified')
      }
    }
    void checkStatus()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: buildPaletteBootScript() }} />
      <PaletteProvider>
        <main className="cw-market ys-market-checkout-preview">
          <style jsx global>{`body:has(.ys-market-checkout-preview) [data-cookie-banner], body:has(.ys-market-checkout-preview) [data-cookie-settings] { display:none !important; }`}</style>
          {paymentStatus ? (
            <aside className="ys-preview-order-cta" role="status" aria-live="polite">
              <div className="ys-preview-order-price">Sandbox payment</div>
              <p><strong>{sandboxStatusLabel(paymentStatus)}</strong></p>
              <a className="ys-preview-order-button" href={sandboxMode ? '/dev/market-checkout-preview?sandbox=1' : '/dev/market-checkout-preview'}>Start another sandbox checkout</a>
              <p className="ys-buyer-gate-note">This local test uses PesaPal sandbox and does not charge a real card.</p>
            </aside>
          ) : signedOut ? (
            <aside className="ys-preview-order-cta">
              <div className="ys-preview-order-price">$175</div>
              <button type="button" className="ys-preview-order-button" disabled>Continue (Standard)</button>
              <p className="ys-buyer-gate-note">Sign in or create a buyer account to continue.</p>
            </aside>
          ) : (
            <div className="ys-gig-checkout">
              {sandboxMode && <p className="ys-buyer-gate-note">Sandbox mode: this checkout uses test credentials and cannot charge a real card.</p>}
              <Checkout title="Order Confirmation" orderTitle="Brand identity package" orderDescription="Standard package · 5 day delivery" amountUsdCents={17500} source={{ sourceType: 'gig', sourceId: 'preview-gig', tierId: 'standard' }} walletBalanceCents={6000} previewMethods={methods} previewState="idle" previewHostedPayment={sandboxMode ? 'sandbox' : 'mock'} excludeInvoice variant="gig" onSubmit={async () => ({})} onCancel={() => {}} />
            </div>
          )}
        </main>
      </PaletteProvider>
    </>
  )
}
