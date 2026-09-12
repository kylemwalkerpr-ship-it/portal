import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sitemap = fs.readFileSync(path.join(root, 'app/sitemap.ts'), 'utf8')
const robots = fs.readFileSync(path.join(root, 'app/robots.ts'), 'utf8')
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')
const gigPage = fs.readFileSync(path.join(root, 'app/marketplace/gigs/[slug]/page.tsx'), 'utf8')
const gigHub = fs.readFileSync(path.join(root, 'app/marketplace/gigs/page.tsx'), 'utf8')
const marketplaceFooter = fs.readFileSync(path.join(root, 'components/marketplace/MarketplaceFooter.tsx'), 'utf8')

describe('Marketplace gig crawl and index contract', () => {
  test('the Marketplace sitemap cannot collapse to empty because of ambiguous Worker host headers', () => {
    expect(sitemap).not.toContain("import { headers } from 'next/headers'")
    expect(sitemap).not.toContain('return []')
    expect(sitemap).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(sitemap).toContain("export const dynamic = 'force-dynamic'")
  })

  test('active provider-backed gigs are emitted as clean canonical Marketplace URLs', () => {
    expect(sitemap).toContain(".from('gigs')")
    expect(sitemap).toContain(".eq('status', 'active')")
    expect(sitemap).toContain(".not('provider_id', 'is', null)")
    expect(sitemap).toContain('clean(`/gigs/${gig.slug}`)')
    expect(sitemap).not.toContain('`/marketplace/gigs/${gig.slug}`')
    expect(sitemap).toContain('priority: 0.7')
  })

  test('the gig inventory has a crawlable parent hub rather than sitemap-only spokes', () => {
    expect(sitemap).toContain("{ url: `${base}/gigs`, changeFrequency: 'weekly', priority: 0.75 }")
    expect(gigHub).toContain("getMarketplaceCanonicalUrl('/gigs')")
    expect(gigHub).toContain("robots: { index: true, follow: true }")
    expect(gigHub).toContain(".eq('status', 'active')")
    expect(gigHub).toContain(".not('provider_id', 'is', null)")
    expect(gigHub).toContain('href={`/gigs/${gig.slug}`}')
    expect(gigHub).toContain('Complete service directory')
    expect(marketplaceFooter).toContain("{ label: 'Services', href: '/gigs' }")
  })

  test('portal remains protected while the market host is allowed to expose sitemap.xml', () => {
    expect(middleware).toContain("pathname === '/sitemap.xml'")
    expect(middleware).toContain('if (hostname !== MARKET_HOST)')
    expect(middleware).toContain('NextResponse.next()')
    expect(middleware).toContain("'/sitemap.xml'")
  })

  test('Marketplace robots advertises the sitemap using forwarded host signals', () => {
    expect(robots).toContain("h.get('x-forwarded-host')")
    expect(robots).toContain("h.get('x-original-host')")
    expect(robots).toContain('result.sitemap = `https://${MARKET_HOST}/sitemap.xml`')
    expect(robots).toContain("allow: '/'")
  })

  test('active gig detail pages remain indexable while missing or inactive gigs stay noindex', () => {
    expect(gigPage).toContain(".eq('status', 'active')")
    expect(gigPage).toContain('robots: { index: true, follow: true }')
    expect(gigPage).toContain('robots: { index: false, follow: true }')
    expect(gigPage).toContain('notFound()')
  })
})