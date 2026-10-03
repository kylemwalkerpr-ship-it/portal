import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('marketplace pages render exactly one H1', () => {
  test('category pages keep only the layout hero H1; page card and discovery island use h2', () => {
    const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
    expect(discovery).toContain('categoryName ? <h2 style={titleStyle}>{titleText}</h2> : <h1 style={titleStyle}>{titleText}</h1>')
    const page = read('app/marketplace/categories/[categoryId]/page.tsx')
    expect(page).toContain('<h2 id="ys-category-title"')
    expect(page).not.toMatch(/<h1[\s>]/)
    expect(read('app/marketplace/categories/[categoryId]/layout.tsx')).toContain('<h1 id="ys-category-experience-title">')
  })

  test('providers index has one H1 from the SEO block', () => {
    expect(read('components/marketplace/MarketplaceProvidersIndex.tsx')).not.toMatch(/<h1[\s>]/)
  })

  test('get-matched promotes the intake title to H1', () => {
    expect(read('components/marketplace/GetMatchedClient.tsx')).toContain('headingLevel={1}')
    expect(read('components/design/inquiry-intake-form.jsx')).toContain("headingLevel === 1 ? 'h1' : 'h2'")
  })
})

describe('provider profiles are never sitemap-only orphans', () => {
  test('/providers server-renders an A-Z link list of active profiles', () => {
    const page = read('app/marketplace/providers/page.tsx')
    expect(page).toContain('<ProvidersDirectoryLinks />')
    const list = read('components/marketplace/ProvidersDirectoryLinks.tsx')
    expect(list).toContain("p.status !== 'active'")
    expect(list).toContain('href={`/providers/${p.username}`}')
    expect(list).not.toContain("'use client'")
  })
})
