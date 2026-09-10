import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextConfig = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8')
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')

describe('legacy Marketplace URL consolidation', () => {
  test('permanently redirects the retired namespace on both served hosts before middleware', () => {
    expect(nextConfig).toContain("['market.yousafeconsultancy.com', 'portal.yousafeconsultancy.com']")
    expect(nextConfig).toContain("source: '/marketplace/:path*'")
    expect(nextConfig).toContain("destination: 'https://market.yousafeconsultancy.com/:path*'")
    expect(nextConfig).toContain('permanent: true')
  })

  test('keeps the middleware 404 only as a fallback and emits no new legacy internal links', () => {
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain("return new NextResponse('Not Found', {")
    expect(nextConfig).not.toContain('checkout.yousafeconsultancy.com')
  })
})
