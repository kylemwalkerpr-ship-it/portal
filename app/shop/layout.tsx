import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'

/**
 * File shop uses the same marketplace chrome as /marketplace so signed-in
 * clients keep Home, Dashboard, and account nav. Canonical lives on the
 * market host; portal /shop is the same page (no bounce).
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F7F8FA' }} />}>
        <MarketplaceShell>{children}</MarketplaceShell>
      </Suspense>
    </CartProvider>
  )
}
