import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import SellerShell from '@/components/seller/SellerShell'

const GigSEOAnalytics = dynamic(() => import('@/components/marketplace/GigSEOAnalytics'), { ssr: false })

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
      <GigSEOAnalytics />
    </SellerShell>
  )
}
