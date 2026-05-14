import { Suspense } from 'react'
import MarketplaceShell from '@/components/marketplace/MarketplaceShell'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    // Suspense is required because MarketplaceShell uses useSearchParams()
    <Suspense>
      <MarketplaceShell>{children}</MarketplaceShell>
    </Suspense>
  )
}
