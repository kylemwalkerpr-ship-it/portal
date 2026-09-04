import { publicPathFromRepoFile, sitemapPathForShippedFile, upsertStudioSitemapEntry } from '@/lib/seoFactory/siteHealth'

describe('studio sitemap upsert', () => {
  const base = `export const dynamic = 'force-static'
const STATIC_ROUTES = []
// ── File-tree walker
function walk() {}
`

  it('sends each ship to the sitemap for that host, not usa by default', () => {
    expect(sitemapPathForShippedFile('yousafe-consultancy', 'landing-page/app/blog/h-1b-cap-exempt-employers/page.tsx'))
      .toBe('landing-page/app/sitemap.xml/route.ts')
    expect(sitemapPathForShippedFile('yousafe-consultancy', 'usa/content/from/nigeria.md'))
      .toBe('usa/app/sitemap.xml/route.ts')
    expect(sitemapPathForShippedFile('yousafe-consultancy', 'uk/content/blog/graduate-route.md'))
      .toBe('uk/app/sitemap.xml/route.ts')
    expect(sitemapPathForShippedFile('caseworks', 'app/us/f-1-opt/page.tsx'))
      .toBe('app/sitemap.xml/route.ts')
    expect(sitemapPathForShippedFile('portal', 'catalogue/foo.mdx'))
      .toBe('app/sitemap.ts')
  })

  it('converts a shipped page.tsx path into a public URL', () => {
    expect(publicPathFromRepoFile('app/us/education-verification/page.tsx')).toBe('/us/education-verification/')
  })

  it('inserts a 100% gate page into the studio sitemap block', () => {
    const first = upsertStudioSitemapEntry(base, 'app/us/education-verification/page.tsx', 'caseworks')
    expect(first.added).toBe(true)
    expect(first.content).toContain('/us/education-verification/')
    expect(first.content).toContain('STUDIO_SITEMAP_ROUTES')
    const second = upsertStudioSitemapEntry(first.content, '/us/education-verification/', 'caseworks')
    expect(second.added).toBe(false)
  })
})
