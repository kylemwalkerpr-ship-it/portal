import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'
import GigSEOAnalyticsWrapper from '@/components/marketplace/GigSEOAnalyticsWrapper'

export default async function SEOAnalyticsPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in?redirect=/dashboard/seo-analytics')
  }

  // Only attorneys and consultants can access this page
  if (!['attorney', 'consultant'].includes(auth.role)) {
    redirect('/dashboard')
  }

  return (
    <SellerShell title="SEO Analytics" subtitle="Search optimization scores across all your services">
      <GigSEOAnalyticsWrapper />
    </SellerShell>
  )
}
