'use client'

import dynamic from 'next/dynamic'

const GigSEOAnalytics = dynamic(() => import('@/components/marketplace/GigSEOAnalytics'), { ssr: false })

export default function GigSEOAnalyticsWrapper() {
  return <GigSEOAnalytics />
}
