import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

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

  return <GigSEOAnalytics />
}
