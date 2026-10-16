'use client'

import { notFound } from 'next/navigation'
import Checkout from '@/components/checkout/Checkout'
import type { AvailablePaymentMethod } from '@/components/checkout/useCheckout'
import '../../marketplace/marketplace-brand.css'
import '../../marketplace/marketplace-first-paint.css'
import '../../marketplace/marketplace-polish.css'
import '../../marketplace/mobile-flow.css'
import '../../marketplace/discovery-grid.css'
import '../../marketplace/gig-detail-professional-layout.css'

const methods: AvailablePaymentMethod[] = [
  { methodKey: 'preview:hosted-card', provider: 'preview', id: 'hosted-card', label: 'Card payment', logoAsset: '', mode: 'hosted-redirect', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 1, isDefault: true, supportsVault: false },
  { methodKey: 'preview:wallet', provider: 'preview', id: 'wallet', label: 'Wallet balance', logoAsset: '', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 2, isDefault: false, supportsVault: false },
  { methodKey: 'preview:invoice', provider: 'preview', id: 'invoice', label: 'Invoice', logoAsset: '', mode: 'manual-invoice', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], priority: 3, isDefault: false, supportsVault: false },
]

export default function MarketCheckoutPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <main className="cw-market ys-market-checkout-preview"><div className="ys-gig-checkout"><Checkout title="Brand identity package" amountUsdCents={17500} description="Standard package · 5 day delivery" source={{ sourceType: 'gig', sourceId: 'preview-gig', tierId: 'standard' }} walletBalanceCents={6000} previewMethods={methods} previewState="idle" excludeInvoice variant="gig" onSubmit={async () => ({})} onCancel={() => {}} /></div></main>
}
