import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMarketBreadcrumb } from '@/lib/marketBreadcrumb'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('market breadcrumbs', () => {
  test('trail starts at Marketplace and uses clean market URLs', () => {
    const list = buildMarketBreadcrumb([{ name: 'Providers', path: '/providers' }, { name: 'Jane Doe', path: '/providers/jane' }])
    expect(list['@type']).toBe('BreadcrumbList')
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2, 3])
    expect(list.itemListElement[0]).toMatchObject({ name: 'Marketplace', item: 'https://market.yousafeconsultancy.com/' })
    expect(list.itemListElement[2].item).toBe('https://market.yousafeconsultancy.com/providers/jane')
  })

  test.each([
    'app/marketplace/providers/[id]/page.tsx',
    'app/marketplace/providers/page.tsx',
    'app/marketplace/categories/page.tsx',
    'app/marketplace/get-matched/page.tsx',
    'app/marketplace/gigs/page.tsx',
    'app/shop/page.tsx',
    'app/shop/[slug]/page.tsx',
  ])('%s renders the breadcrumb JSON-LD', (file) => {
    expect(read(file)).toContain('<MarketBreadcrumbJsonLd items=')
  })
})
