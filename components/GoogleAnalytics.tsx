'use client'

/**
 * Google Analytics GA4 for market + portal (shared Next app).
 * Google is requested only after explicit consent from the estate-wide cookie.
 */

import Script from 'next/script'
import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cleanGoogleLinkerHref } from '@/lib/analytics/googleLinkerUrl'
import {
  buildGaBootScript,
  gaTagSrc,
  getGaMeasurementId,
  trackPageView,
} from '@/lib/analytics/ga4'
import { readClientConsent } from '@/lib/attribution/client'

const CONSENT_EVENT = 'yousafe:cookie-consent-change'

type Consent = 'granted' | 'denied' | null

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

function GoogleLinkerUrlCleaner({
  measurementId,
  consent,
}: {
  measurementId: string
  consent: Consent
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams?.toString() ?? ''

  useEffect(() => {
    if (typeof window === 'undefined' || !new URLSearchParams(query).has('_gl')) return

    // readClientConsent also performs a one-time, explicit-choice migration from
    // the old portal-only storage into the new shared cookie.
    const effectiveConsent = readClientConsent()
    const cleanAddressBar = () => {
      const cleaned = cleanGoogleLinkerHref(window.location.href)
      if (cleaned) window.history.replaceState(window.history.state, '', cleaned)
    }

    if (effectiveConsent !== 'granted') {
      cleanAddressBar()
      return
    }

    let requested = false
    const fallback = window.setTimeout(cleanAddressBar, 2500)
    const poll = window.setInterval(() => {
      if (requested || typeof window.gtag !== 'function') return
      requested = true
      // The GA config is queued before this get callback. It gets the chance to
      // consume Google's incoming linker value before the URL is shortened.
      window.gtag('get', measurementId, 'client_id', cleanAddressBar)
    }, 50)

    return () => {
      window.clearTimeout(fallback)
      window.clearInterval(poll)
    }
  }, [consent, measurementId, pathname, query])

  return null
}

export default function GoogleAnalytics() {
  const measurementId = getGaMeasurementId()
  const [consent, setConsent] = useState<Consent>(null)

  useEffect(() => {
    setConsent(readClientConsent() === 'granted' ? 'granted' : readClientConsent() === 'denied' ? 'denied' : null)

    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<string>).detail
      setConsent(value === 'granted' ? 'granted' : 'denied')
    }

    window.addEventListener(CONSENT_EVENT, onConsent)
    return () => window.removeEventListener(CONSENT_EVENT, onConsent)
  }, [])

  return (
    <>
      {consent === 'granted' && (
        <>
          <Script src={gaTagSrc(measurementId)} strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {buildGaBootScript(measurementId)}
          </Script>
          <Suspense fallback={null}>
            <GaRoutePageViews measurementId={measurementId} />
          </Suspense>
        </>
      )}
      <Suspense fallback={null}>
        <GoogleLinkerUrlCleaner measurementId={measurementId} consent={consent} />
      </Suspense>
    </>
  )
}
