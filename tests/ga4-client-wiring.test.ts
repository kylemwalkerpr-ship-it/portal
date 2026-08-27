import { readFileSync } from 'fs'
import { join } from 'path'
import {
  GA4_FALLBACK_MEASUREMENT_ID,
  GA4_LINKER_DOMAINS,
  buildGaBootScript,
  buildGaConfigOptions,
  gaTagSrc,
  getGaMeasurementId,
  trackBook,
  trackGenerateLead,
  trackPageView,
  trackSignUp,
} from '@/lib/analytics/ga4'

describe('GA4 client wiring helpers', () => {
  it('falls back to the estate measurement ID when env is empty', () => {
    expect(getGaMeasurementId(undefined)).toBe(GA4_FALLBACK_MEASUREMENT_ID)
    expect(getGaMeasurementId('')).toBe(GA4_FALLBACK_MEASUREMENT_ID)
    expect(getGaMeasurementId('   ')).toBe(GA4_FALLBACK_MEASUREMENT_ID)
  })

  it('prefers NEXT_PUBLIC_GA_MEASUREMENT_ID when set', () => {
    expect(getGaMeasurementId('G-CUSTOM12345')).toBe('G-CUSTOM12345')
    expect(getGaMeasurementId('  G-CUSTOM12345  ')).toBe('G-CUSTOM12345')
  })

  it('lists all estate linker domains including market, portal, checkout', () => {
    expect(GA4_LINKER_DOMAINS).toEqual(
      expect.arrayContaining([
        'yousafeconsultancy.com',
        'usa.yousafeconsultancy.com',
        'ca.yousafeconsultancy.com',
        'uk.yousafeconsultancy.com',
        'au.yousafeconsultancy.com',
        'legal.yousafeconsultancy.com',
        'market.yousafeconsultancy.com',
        'portal.yousafeconsultancy.com',
        'checkout.yousafeconsultancy.com',
      ]),
    )
    expect(GA4_LINKER_DOMAINS).toHaveLength(9)
  })

  it('disables automatic page_view so App Router can send SPA hits', () => {
    const opts = buildGaConfigOptions()
    expect(opts.send_page_view).toBe(false)
    expect(opts.linker.accept_incoming).toBe(true)
    expect(opts.linker.domains).toEqual([...GA4_LINKER_DOMAINS])
  })

  it('emits consultancy-style gtag boot script with linker domains', () => {
    const boot = buildGaBootScript('G-FTKZCVNW4B')
    expect(gaTagSrc('G-FTKZCVNW4B')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-FTKZCVNW4B',
    )
    expect(boot).toContain("gtag('js', new Date())")
    expect(boot).toContain("gtag('config', 'G-FTKZCVNW4B'")
    expect(boot).toContain('market.yousafeconsultancy.com')
    expect(boot).toContain('portal.yousafeconsultancy.com')
    expect(boot).toContain('checkout.yousafeconsultancy.com')
    expect(boot).toContain('"send_page_view":false')
  })

  it('no-ops event helpers when window.gtag is missing (SSR / early boot)', () => {
    expect(() => trackPageView('/marketplace')).not.toThrow()
    expect(() => trackGenerateLead({ method: 'form' })).not.toThrow()
    expect(() => trackBook({ method: 'calendly' })).not.toThrow()
    expect(() => trackSignUp({ method: 'clerk' })).not.toThrow()
  })

  it('forwards page_view and conversion helpers to window.gtag when present', () => {
    const gtag = jest.fn()
    const root = globalThis as typeof globalThis & { window?: { gtag?: typeof gtag } }
    const prev = root.window
    root.window = { gtag }
    try {
      trackPageView('/shop/gigs?q=f1', 'G-FTKZCVNW4B')
      trackGenerateLead({ value: 1 })
      trackBook()
      trackSignUp({ method: 'clerk' })
    } finally {
      if (prev === undefined) delete root.window
      else root.window = prev
    }

    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/shop/gigs?q=f1',
      send_to: 'G-FTKZCVNW4B',
    })
    expect(gtag).toHaveBeenCalledWith('event', 'generate_lead', { value: 1 })
    expect(gtag).toHaveBeenCalledWith('event', 'book', undefined)
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'clerk' })
  })

  it('mounts GoogleAnalytics from the shared root layout (market + portal)', () => {
    const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8')
    expect(layout).toContain("import GoogleAnalytics from '@/components/GoogleAnalytics'")
    expect(layout).toMatch(/<GoogleAnalytics\s*\/>/)
  })

  it('keeps next/script afterInteractive like consultancy layouts', () => {
    const src = readFileSync(join(__dirname, '../components/GoogleAnalytics.tsx'), 'utf8')
    expect(src).toContain("from 'next/script'")
    expect(src).toContain('afterInteractive')
    expect(src).toContain('id="google-analytics"')
  })
})
