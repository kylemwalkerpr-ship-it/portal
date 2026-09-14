'use client'

/**
 * Google Analytics GA4 for market + portal (shared Next app).
 * Analytics is opt-in: the Google tag is not requested until the visitor
 * explicitly grants analytics consent in CookieConsentBanner.
 */

import Script from 'next/script'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  buildGaBootScript,
  gaTagSrc,
  getGaMeasurementId,
  trackPageView,
} from '@/lib/analytics/ga4'

const CONSENT_KEY = 'yousafe:cookie-consent'
const CONSENT_EVENT = 'yousafe:cookie-consent-change'

type Consent = 'granted' | 'denied' | null

function readConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

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
  const [consent, setConsent] = useState<Consent>(null)

  useEffect(() => {
    setConsent(readConsent())

    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<string>).detail
      setConsent(value === 'granted' ? 'granted' : 'denied')
    }

    window.addEventListener(CONSENT_EVENT, onConsent)
    return () => window.removeEventListener(CONSENT_EVENT, onConsent)
  }, [])

  if (consent !== 'granted') return null

  return (
    <>
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
