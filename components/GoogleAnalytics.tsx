'use client'

/**
 * Google Analytics GA4 for market + portal (shared Next app).
 * Pattern mirrors yousafe-consultancy landing/usa/ca/uk/au/checkout layouts:
 * next/script gtag.js + inline config, afterInteractive.
 *
 * Differences vs static marketing hosts:
 * - measurement ID from NEXT_PUBLIC_GA_MEASUREMENT_ID (fallback G-FTKZCVNW4B)
 * - cross-domain linker for the estate
 * - send_page_view: false + client page_view on App Router navigations
 */

import Script from 'next/script'
import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  buildGaBootScript,
  gaTagSrc,
  getGaMeasurementId,
  trackPageView,
} from '@/lib/analytics/ga4'

function GaRoutePageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams?.toString()
    const pagePath = qs ? `${pathname}?${qs}` : pathname || '/'
    trackPageView(pagePath, measurementId)
  }, [pathname, searchParams, measurementId])

  return null
}

export default function GoogleAnalytics() {
  const measurementId = getGaMeasurementId()

  return (
    <>
      {/* Google tag (gtag.js) — same estate property as consultancy hosts */}
      <Script src={gaTagSrc(measurementId)} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {buildGaBootScript(measurementId)}
      </Script>
      <Suspense fallback={null}>
        <GaRoutePageViews measurementId={measurementId} />
      </Suspense>
    </>
  )
}
