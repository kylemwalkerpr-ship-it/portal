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

export default function MarketCheckoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const [signedOut, setSignedOut] = useState(false)
  useEffect(() => {
    setSignedOut(new URLSearchParams(window.location.search).get('state') === 'signed-out')
  }, [])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: buildPaletteBootScript() }} />
      <PaletteProvider>
        <main className="cw-market ys-market-checkout-preview">
          <style jsx global>{`body:has(.ys-market-checkout-preview) [data-cookie-banner], body:has(.ys-market-checkout-preview) [data-cookie-settings] { display:none !important; }`}</style>
          {signedOut ? (
            <aside className="ys-preview-order-cta">
              <div className="ys-preview-order-price">$175</div>
              <button type="button" className="ys-preview-order-button" disabled>Continue (Standard)</button>
              <p className="ys-buyer-gate-note">Sign in or create a buyer account to continue.</p>
            </aside>
          ) : (
            <div className="ys-gig-checkout">
              <Checkout title="Confirm your order" orderTitle="Brand identity package" orderDescription="Standard package · 5 day delivery" amountUsdCents={17500} source={{ sourceType: 'gig', sourceId: 'preview-gig', tierId: 'standard' }} walletBalanceCents={6000} previewMethods={methods} previewState="idle" excludeInvoice variant="gig" onSubmit={async () => ({})} onCancel={() => {}} />
            </div>
          )}
        </main>
      </PaletteProvider>
    </>
  )
}
