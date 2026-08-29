import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { PaletteProvider } from '@/contexts/palette-context'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'
import { buildPaletteBootScript } from '@/components/marketplace/palette-boot'

/**
 * File shop uses the same marketplace chrome as /marketplace so signed-in
 * clients keep Home, Dashboard, and account nav. Canonical lives on the
 * market host; portal /shop is the same page (no bounce).
 *
 * MarketplaceShell mounts <PalettePicker>, which calls usePalette() — so the
 * shop layout must provide <PaletteProvider> exactly like the marketplace
 * layout does, or the page crashes with "usePalette must be used within
 * PaletteProvider".
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      {/* Same first-paint boot as the marketplace layout — see palette-boot.ts */}
      <script dangerouslySetInnerHTML={{ __html: buildPaletteBootScript() }} />
      <PaletteProvider>
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--ys-paper, #4A2A1A)', transition: 'background 0.35s ease' }} />}>
          <MarketplaceShell>{children}</MarketplaceShell>
        </Suspense>
      </PaletteProvider>
    </CartProvider>
  )
}
