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

  test('core public landing pages emit already-clean market-host canonicals', () => {
    const home = read('app/marketplace/page.tsx')
    const categories = read('app/marketplace/categories/page.tsx')
    const providers = read('app/marketplace/providers/page.tsx')
    const shop = read('app/shop/page.tsx')

    expect(home).toContain("getMarketplaceCanonicalUrl('/')")
    expect(home).toContain('alternates: { canonical: canonicalUrl }')
    expect(categories).toContain("getMarketplaceCanonicalUrl('/categories')")
    expect(categories).toContain('alternates: { canonical: canonicalUrl }')
    expect(providers).toContain("getMarketplaceCanonicalUrl('/providers')")
    expect(shop).toContain("const CANONICAL = 'https://market.yousafeconsultancy.com/shop'")
    expect(shop).toContain('alternates: { canonical: CANONICAL }')
  })

  test('retired /marketplace paths preserve legacy equity with one permanent hop to the clean market host', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain('(hostname === MARKET_HOST || hostname === PORTAL_HOST) && isLegacyMarketplacePath')
    expect(middleware).toContain("const cleanMarketplacePath = pathname === '/marketplace' ? '/' : pathname.slice('/marketplace'.length) || '/'")
    expect(middleware).toContain('target.hostname = MARKET_HOST')
    expect(middleware).toContain('target.pathname = cleanMarketplacePath')
    expect(middleware).toContain('NextResponse.redirect(target, { status: 301 })')
    expect(middleware).not.toContain("return new NextResponse('Not Found', {\n        status: 404")
  })

  test('clean market-host paths still rewrite only to the internal app route tree', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain('const rewrite = new URL(`/marketplace${pathname}${search}`, req.url)')
    expect(middleware).toContain('NextResponse.rewrite(rewrite)')
  })

  test('portal host permanently redirects only the separately owned File Shop tree to the market host', () => {
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
