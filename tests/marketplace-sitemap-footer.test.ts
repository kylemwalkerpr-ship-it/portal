import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const sitemap = read('app/sitemap.ts')
const middleware = read('middleware.ts')
const footer = read('components/marketplace/MarketplaceFooter.tsx')

describe('Marketplace sitemap discoverability', () => {
  test('serves the public sitemap from the market host only', () => {
    expect(sitemap).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(sitemap).toContain("const base = `https://${MARKET_HOST}`")
    expect(middleware).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(middleware).toContain("if (pathname === '/sitemap.xml' || pathname === '/sitemap.xml/')")
    expect(middleware).toContain('if (hostname !== MARKET_HOST)')
  })

  test('links the market sitemap from the shared Marketplace footer', () => {
    expect(footer).toContain("{ label: 'Sitemap', href: '/sitemap.xml' }")
    expect(footer).toContain('NAV_LINKS.map')
  })
})
