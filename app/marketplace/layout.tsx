import type { Metadata } from 'next'
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
        {/* No Suspense around the shell: MarketplaceShell reads search params
            via usePathname + window (never useSearchParams), so navigating
            between market routes keeps the shell + children mounted instead
            of unmounting everything into a fallback (the nav-lag fix). */}
        <MarketplaceShell>{children}</MarketplaceShell>
      </PaletteProvider>
    </CartProvider>
  )
}
