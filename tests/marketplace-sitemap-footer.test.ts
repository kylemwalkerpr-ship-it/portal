import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const sitemap = read('app/sitemap.ts')
const sitemapPage = read('app/sitemap/page.tsx')
const middleware = read('middleware.ts')
const footer = read('components/marketplace/MarketplaceFooter.tsx')

describe('Marketplace sitemap discoverability', () => {
  test('serves the technical public sitemap from the market host only', () => {
    expect(sitemap).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(sitemap).toContain("const base = `https://${MARKET_HOST}`")
    expect(middleware).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(middleware).toContain("if (pathname === '/sitemap.xml' || pathname === '/sitemap.xml/')")
    expect(middleware).toContain('if (hostname !== MARKET_HOST)')
  })

  test('exposes a human-readable market-only sitemap at /sitemap and /sitemap/', () => {
    expect(sitemapPage).toContain("canonical: `${MARKET}/sitemap/`")
    expect(sitemapPage).toContain('href="/sitemap.xml"')
    expect(sitemapPage).toContain('Service categories')
    expect(sitemapPage).toContain('Immigration preparation packs')
    expect(middleware).toContain("pathname === '/sitemap' || pathname === '/sitemap/'")
    expect(middleware).toContain("target.pathname = '/sitemap'")
  })

  test('links the human sitemap from clean Marketplace footer routes', () => {
    expect(footer).toContain("{ label: 'Marketplace', href: '/' }")
    expect(footer).toContain("{ label: 'Categories', href: '/categories' }")
    expect(footer).toContain("{ label: 'Sitemap', href: '/sitemap/' }")
    expect(footer).not.toContain("href: '/marketplace/categories'")
    expect(footer).toContain('NAV_LINKS.map')
  })
})
