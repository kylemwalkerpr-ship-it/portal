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

  test('keeps a one-hop permanent middleware fallback and emits no checkout URLs', () => {
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain("const cleanMarketplacePath = pathname === '/marketplace' ? '/' : pathname.slice('/marketplace'.length) || '/'")
    expect(middleware).toContain('target.hostname = MARKET_HOST')
    expect(middleware).toContain('NextResponse.redirect(target, { status: 301 })')
    expect(nextConfig).not.toContain('checkout.yousafeconsultancy.com')
  })
})
