import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* Suspense is required because MarketplaceShell uses useSearchParams() */}
      <Suspense>
        <MarketplaceShell>{children}</MarketplaceShell>
      </Suspense>
    </CartProvider>
  )
}
