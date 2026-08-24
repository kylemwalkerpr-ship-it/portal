import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'

/**
 * Default market surface is indexable. Pages that must stay out of the index
 * (cart, order success, empty thin shelves, missing gigs) set robots per-page.
 * Without this default, market host could inherit portal-oriented assumptions.
 */
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* Suspense is required because MarketplaceShell uses useSearchParams() */}
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#2C1410' }} />}>
        <MarketplaceShell>{children}</MarketplaceShell>
      </Suspense>
    </CartProvider>
  )
}
