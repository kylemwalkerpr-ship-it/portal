import { Suspense } from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* Suspense is required because MarketplaceShell uses useSearchParams() */}
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#FBFAF7' }} />}>
        <MarketplaceShell>{children}</MarketplaceShell>
      </Suspense>
    </CartProvider>
  )
}
