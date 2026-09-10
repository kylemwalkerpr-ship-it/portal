import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('checkout retirement routing contract', () => {
  test('legacy template routes permanently redirect to canonical File Shop URLs', () => {
    const index = read('app/marketplace/templates/page.tsx')
    const detail = read('app/marketplace/templates/[slug]/page.tsx')

    expect(index).toContain("permanentRedirect('https://market.yousafeconsultancy.com/shop')")
    expect(detail).toContain('https://market.yousafeconsultancy.com/shop/${encodeURIComponent(slug)}')
    expect(index).not.toContain('notFound()')
    expect(detail).not.toContain('notFound()')
  })

  test('Marketplace sitemap publishes File Shop rather than template aliases', () => {
    const sitemap = read('app/sitemap.ts')
    expect(sitemap).toContain("{ url: `${base}/shop`, changeFrequency: 'weekly', priority: 0.75 }")
    expect(sitemap).toContain('url: `${base}/shop/${product.slug}`')
    expect(sitemap).not.toContain('/templates/${')
  })
})
