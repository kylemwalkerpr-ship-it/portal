import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('site hardening', () => {
  it('gates GA4 behind explicit analytics consent and exposes a consent banner', () => {
    const layout = read('app/layout.tsx')
    const analytics = read('components/GoogleAnalytics.tsx')
    const bannerPath = path.join(root, 'components/CookieConsentBanner.tsx')

    expect(fs.existsSync(bannerPath)).toBe(true)
    if (!fs.existsSync(bannerPath)) return

    const banner = fs.readFileSync(bannerPath, 'utf8')
    expect(layout).toContain("import CookieConsentBanner from '@/components/CookieConsentBanner'")
    expect(layout).toContain('<CookieConsentBanner />')
    expect(banner).toContain('Cookie settings')
    expect(banner).toContain('readClientConsent()')
    expect(read('lib/attribution/contract.ts')).toContain("'yousafe-analytics-consent'")
    expect(banner).toContain('Accept analytics')
    expect(banner).toContain('Reject non-essential')
    expect(banner).toContain('privacy-policy')
    expect(analytics).toContain('yousafe:cookie-consent-change')
    expect(analytics).toContain('readClientConsent')
    expect(analytics).toContain("consent === 'granted'")
    expect(analytics).toContain("effectiveConsent !== 'granted'")
  })

  it('publishes a real business contact address on the public marketplace', () => {
    const footer = read('components/marketplace/MarketplaceFooter.tsx')
    expect(footer).toContain('906 Donne Court, Virginia Beach, VA 23462')
    expect(footer).toContain('admin@yousafeconsultancy.com')
    expect(footer).toContain('https://usa.yousafeconsultancy.com/contact/')
  })

  it('keeps marketplace discovery images on the truthful responsive helper (no fabricated width variants)', () => {
    const card = read('components/marketplace/MarketplaceHero.tsx')
    const responsive = read('lib/responsiveImage.ts')
    expect(card).toContain("import { responsiveImageProps } from '@/lib/responsiveImage'")
    expect(card).toContain('responsiveImageProps(imageUrl, gig.title)')
    // Supabase image transforms are not enabled on this project (403
    // FeatureNotEnabled), so the helper must not fabricate width/format params.
    expect(responsive).not.toContain("searchParams.set('width'")
    expect(responsive).not.toContain("searchParams.set('format'")
    expect(responsive).not.toContain('format=webp')
    expect(responsive).toContain("loading: priority ? ('eager' as const) : ('lazy' as const)")
  })
})
