import type { ReactNode } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { PaletteProvider } from '@/contexts/palette-context'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'
import { buildPaletteBootScript } from '@/components/marketplace/palette-boot'
import '../marketplace/marketplace-brand.css'
import '../marketplace/marketplace-polish.css'

/**
 * File shop uses the same marketplace chrome as /marketplace so signed-in
 * clients keep Home, Dashboard, and account nav. Canonical lives on the
 * market host; portal /shop is the same page (no bounce).
 *
 * MarketplaceShell mounts <PalettePicker>, which calls usePalette() — so the
 * shop layout must provide <PaletteProvider> exactly like the marketplace
 * layout does, or the page crashes with "usePalette must be used within
 * PaletteProvider". It also imports the same scoped Marketplace brand CSS so
 * action aliases, focus-visible treatment, and mobile brand treatment cannot
 * drift between service browsing and the file/template shop.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      {/* Same first-paint boot as the marketplace layout — see palette-boot.ts */}
      <script dangerouslySetInnerHTML={{ __html: buildPaletteBootScript() }} />
      <PaletteProvider>
        {/* Same no-Suspense contract as app/marketplace/layout.tsx — the shell
            must stay mounted across /shop navigations. */}
        <MarketplaceShell>{children}</MarketplaceShell>
      </PaletteProvider>
    </CartProvider>
  )
}
