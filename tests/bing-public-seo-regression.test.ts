import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('Bing public SEO regression guard', () => {
  test('public Marketplace image surfaces do not emit empty alt attributes', () => {
    const files = [
      'app/shop/FilesShop.tsx',
      'components/marketplace/FilesRailScroller.tsx',
      'components/marketplace/MarketplaceFooter.tsx',
      'components/marketplace/MarketplaceHero.tsx',
      'components/design/landing/LandingPhotoSlideshow.tsx',
    ]

    for (const file of files) {
      expect(read(file)).not.toContain('alt=""')
    }
  })

  test('file-shop product metadata avoids the redundant title suffix', () => {
    const productPage = read('app/shop/[slug]/page.tsx')
    expect(productPage).toContain('const title = product.name')
    expect(productPage).not.toContain('| YouSafe File Shop`')
  })

  test('future shop-blog generation applies concise SEO title logic', () => {
    const generator = read('lib/shopSeoGenerator.ts')
    expect(generator).toContain('function conciseSeoTitle(title: string): string')
    expect(generator).toContain('const seoTitle = conciseSeoTitle(product.title)')
    expect(generator).toContain('title: "${esc(seoTitle)}"')
    expect(generator).not.toContain('${esc(product.title)} | YouSafe Consultancy Shop')
  })
})
