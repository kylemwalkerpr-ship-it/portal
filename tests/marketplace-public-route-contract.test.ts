import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('standalone Marketplace public URL contract', () => {
  test('footer links directly to clean market-host routes and preserves seller onboarding', () => {
    const footer = read('components/marketplace/MarketplaceFooter.tsx')
    expect(footer).toContain("{ label: 'Marketplace', href: '/' }")
    expect(footer).toContain("{ label: 'Categories', href: '/categories' }")
    expect(footer).toContain("{ label: 'File shop', href: '/shop' }")
    expect(footer).toContain("{ label: 'Help', href: '/#faq' }")
    expect(footer).toContain("{ label: 'Become a seller', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' }")
    expect(footer).not.toContain("href: '/marketplace")
  })

  test('core public landing pages emit market-host canonicals in source metadata', () => {
    const home = read('app/marketplace/page.tsx')
    const categories = read('app/marketplace/categories/page.tsx')
    const shop = read('app/shop/page.tsx')

    expect(home).toContain("getMarketplaceCanonicalUrl('/marketplace/')")
    expect(home).toContain('alternates: { canonical: canonicalUrl }')
    expect(categories).toContain("getMarketplaceCanonicalUrl('/marketplace/categories/')")
    expect(categories).toContain('alternates: { canonical: canonicalUrl }')
    expect(shop).toContain("const CANONICAL = 'https://market.yousafeconsultancy.com/shop'")
    expect(shop).toContain('alternates: { canonical: CANONICAL }')
  })

  test('portal host permanently redirects the File Shop tree to the market host', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain("hostname === PORTAL_HOST && (pathname === '/shop' || pathname.startsWith('/shop/'))")
    expect(middleware).toContain("const redirectUrl = new URL(pathname + search, `https://${MARKET_HOST}`)")
    expect(middleware).toContain('NextResponse.redirect(redirectUrl, { status: 301 })')
  })

  test('authenticated template empty states link directly to the canonical File Shop', () => {
    const purchased = read('components/student/MyTemplatesView.tsx')
    const filler = read('components/student/StudentTemplateFiller.tsx')
    for (const source of [purchased, filler]) {
      expect(source).toContain('https://market.yousafeconsultancy.com/shop')
      expect(source).not.toContain('href="/marketplace/templates"')
    }
  })
})
