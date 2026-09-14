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
    expect(banner).toContain('yousafe:cookie-consent')
    expect(banner).toContain('Accept analytics')
    expect(banner).toContain('Reject non-essential')
    expect(banner).toContain('privacy-policy')
    expect(analytics).toContain('yousafe:cookie-consent')
    expect(analytics).toContain("consent !== 'granted'")
  })
})
