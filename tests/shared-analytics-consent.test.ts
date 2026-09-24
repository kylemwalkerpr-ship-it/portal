import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  parseAnalyticsConsentCookie,
  serializeAnalyticsConsentCookie,
} from '@/lib/analytics/consent'
import { cleanGoogleLinkerHref } from '@/lib/analytics/googleLinkerUrl'
import { isTrackingQueryKey, stripTrackingParams } from '@/lib/trackingParams'

describe('shared analytics consent contract', () => {
  it('reads the accepted/rejected estate cookie format', () => {
    expect(ANALYTICS_CONSENT_COOKIE).toBe('yousafe-analytics-consent')
    expect(parseAnalyticsConsentCookie('other=x; yousafe-analytics-consent=accepted')).toBe('granted')
    expect(parseAnalyticsConsentCookie('yousafe-analytics-consent=rejected')).toBe('denied')
    expect(parseAnalyticsConsentCookie('yousafe-analytics-consent=unknown')).toBeNull()
  })

  it('writes a six-month cookie shared by all YouSafe subdomains', () => {
    expect(ANALYTICS_CONSENT_MAX_AGE_SECONDS).toBe(15552000)
    expect(serializeAnalyticsConsentCookie('granted')).toBe(
      'yousafe-analytics-consent=accepted; Domain=.yousafeconsultancy.com; Path=/; Max-Age=15552000; Secure; SameSite=Lax',
    )
    expect(serializeAnalyticsConsentCookie('denied')).toContain('yousafe-analytics-consent=rejected;')
  })
})

describe('Google linker URL cleanup', () => {
  it('removes _gl but preserves normal query values and auth hash routes', () => {
    expect(cleanGoogleLinkerHref('https://portal.yousafeconsultancy.com/sign-in/student?_gl=token&return_to=%2Fdashboard#verify-email')).toBe(
      'https://portal.yousafeconsultancy.com/sign-in/student?return_to=%2Fdashboard#verify-email',
    )
  })

  it('leaves clean URLs unchanged', () => {
    expect(cleanGoogleLinkerHref('https://market.yousafeconsultancy.com/gigs?country=us#featured')).toBeNull()
  })

  it('keeps _gl on the incoming request long enough for GA to consume it', () => {
    expect(isTrackingQueryKey('_gl')).toBe(false)
    const url = new URL('https://market.yousafeconsultancy.com/?_gl=linker&keep=1')
    expect(stripTrackingParams(url)).toBeNull()
  })
})
