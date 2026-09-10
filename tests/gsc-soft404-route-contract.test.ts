import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('GSC soft-404 route contract', () => {
  test('legacy /marketplace URLs permanently canonicalize instead of hard-404ing', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain("const cleanMarketplacePath = pathname === '/marketplace' ? '/' : pathname.slice('/marketplace'.length) || '/'")
    expect(middleware).toContain("target.hostname = MARKET_HOST")
    expect(middleware).toContain('NextResponse.redirect(target, { status: 301 })')
    expect(middleware).not.toContain("return new NextResponse('Not Found', {\n        status: 404")
  })

  test('free-text Marketplace search variants are noindex,follow', () => {
    const middleware = read('middleware.ts')
    expect(middleware).toContain("pathname === '/' && req.nextUrl.searchParams.has('q')")
    expect(middleware).toContain("'X-Robots-Tag', 'noindex, follow'")
  })

  test('seller onboarding link remains protected', () => {
    const contract = read('tests/marketplace-public-route-contract.test.ts')
    expect(contract).toContain("{ label: 'Become a seller', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' }")
  })
})
