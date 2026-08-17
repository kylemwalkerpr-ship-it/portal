import { publicPathFromRepoFile, upsertStudioSitemapEntry } from '@/lib/seoFactory/siteHealth'

describe('studio sitemap upsert', () => {
  const base = `export const dynamic = 'force-static'
const STATIC_ROUTES = []
// ── File-tree walker
function walk() {}
`

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
