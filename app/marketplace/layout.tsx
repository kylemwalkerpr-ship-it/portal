import MarketplaceNavHeader from '@/components/marketplace/MarketplaceNavHeader'

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketplaceNavHeader />
      {children}
    </>
  )
}
