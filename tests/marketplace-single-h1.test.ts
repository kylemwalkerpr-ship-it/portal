import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('marketplace pages render exactly one H1', () => {
  test('category shelves keep the server H1; the discovery island demotes to h2', () => {
    const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
    expect(discovery).toContain('categoryName ? <h2 style={titleStyle}>{titleText}</h2> : <h1 style={titleStyle}>{titleText}</h1>')
    expect(read('app/marketplace/categories/[categoryId]/page.tsx')).toContain('<h1 id="ys-category-title"')
  })

  test('providers index has one H1 from the SEO block', () => {
    expect(read('components/marketplace/MarketplaceProvidersIndex.tsx')).not.toMatch(/<h1[\s>]/)
  })

  test('get-matched promotes the intake title to H1', () => {
    expect(read('components/marketplace/GetMatchedClient.tsx')).toContain('headingLevel={1}')
    expect(read('components/design/inquiry-intake-form.jsx')).toContain("headingLevel === 1 ? 'h1' : 'h2'")
  })
})
