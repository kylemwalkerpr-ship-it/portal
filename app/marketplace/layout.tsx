import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { PaletteProvider } from '@/contexts/palette-context'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'
import { buildPaletteBootScript } from '@/components/marketplace/palette-boot'

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
      {/* Blocking first-paint script: resolves the stored palette BEFORE React
          hydrates so market pages never flash default mahogany / white. Runs
          on documentElement (which .cw-market inherits); PaletteProvider
          re-applies identical values after hydration — idempotent. */}
      <script dangerouslySetInnerHTML={{ __html: buildPaletteBootScript() }} />
      <PaletteProvider>
        {/* Suspense is required because MarketplaceShell uses useSearchParams() */}
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--ys-paper, #4A2A1A)', transition: 'background 0.35s ease' }} />}>
          <MarketplaceShell>{children}</MarketplaceShell>
        </Suspense>
      </PaletteProvider>
    </CartProvider>
  )
}
