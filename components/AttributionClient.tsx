'use client'

/**
 * P10 attribution bootstrap.
 *
 * Runs once per page load and again whenever the cookie banner records a new
 * choice, so a visitor who accepts analytics mid-page gets a session created for
 * the page they are on (and a denying visitor has any identity withdrawn).
 * Renders nothing.
 */
import { useEffect } from 'react'
import { CONSENT_CHANGE_EVENT, bootstrapAttribution } from '@/lib/attribution/client'

export default function AttributionClient() {
  useEffect(() => {
    void bootstrapAttribution()
    const onConsentChange = () => { void bootstrapAttribution() }
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
  }, [])

  return null
}
