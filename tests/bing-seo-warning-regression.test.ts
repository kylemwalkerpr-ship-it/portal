import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('Bing SEO warning regressions', () => {
  test('file-shop and Marketplace images carry meaningful alt text', () => {
    const shop = read('app/shop/FilesShop.tsx')
    const rail = read('components/marketplace/FilesRailScroller.tsx')
    const footer = read('components/marketplace/MarketplaceFooter.tsx')

    expect(shop).toContain('alt={`${product.title} cover`}')
    expect(shop).not.toContain('src={product.cover} alt=""')
    expect(rail).toContain('alt={`${p.title} cover`}')
    expect(rail).not.toContain('src={p.cover} alt=""')
    expect(footer).toContain('alt="YouSafe Consultancy"')
  })

  test('Bing-flagged immigration pack titles use concise SERP labels', () => {
    const page = read('app/shop/[slug]/page.tsx')
    const expected = [
      'F-1 Visa DS-160 + I-20 Prep Pack | YouSafe',
      'Canada Study Permit Prep Pack | YouSafe',
    ]

    expected.forEach((title) => {
      expect(title.length).toBeLessThanOrEqual(60)
      expect(page).toContain(title)
    })
    expect(page).toContain('const title = SHOP_SEO_TITLES[slug] ??')
  })
})
