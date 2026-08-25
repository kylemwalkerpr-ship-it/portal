import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { PaletteProvider } from '@/contexts/palette-context'
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
      <PaletteProvider>
        {/* Suspense is required because MarketplaceShell uses useSearchParams() */}
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--ys-paper, #4A2A1A)', transition: 'background 0.35s ease' }} />}>
          <MarketplaceShell>{children}</MarketplaceShell>
        </Suspense>
      </PaletteProvider>
    </CartProvider>
  )
}
