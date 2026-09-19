import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('GSC soft-404 route contract', () => {
  test('legacy /marketplace URLs permanently canonicalize instead of hard-404ing', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain("const cleanMarketplacePath = pathname === '/marketplace' ? '/' : pathname.slice('/marketplace'.length) || '/'")
    expect(middleware).toContain('target.hostname = MARKET_HOST')
    expect(middleware).toContain('target.pathname = cleanMarketplacePath')
    expect(middleware).toContain('NextResponse.redirect(target, { status: 301 })')
  })

  test('free-text Marketplace search variants are noindex,follow', () => {
    const middleware = read('middleware.ts')
    // Query-sensitive robots metadata moved off the (now build-static) landing
    // page and onto the market-host edge, where it also covers the equally
    // build-static `/gigs` directory. The predicate still covers `q`; the full
    // filter/page parity matrix lives in
    // tests/marketplace-landing-query-noindex-parity.test.ts and the surface
    // boundary in tests/marketplace-discovery-variant-noindex.test.ts.
    expect(middleware).toContain(
      'isDiscoveryVariantRequest(pathname, req.nextUrl.searchParams)',
    )
    expect(middleware).toContain("'X-Robots-Tag', 'noindex, follow'")
  })

  test('seller onboarding link remains protected', () => {
    const contract = read('tests/marketplace-public-route-contract.test.ts')
    expect(contract).toContain("{ label: 'Become a seller', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' }")
  })
})
