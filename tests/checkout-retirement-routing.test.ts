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

  test('retired provider return URL redirects to the clean buyer route and keeps query parameters', () => {
    const config = read('next.config.ts')
    expect(config).toContain("source: '/checkout/pesapal/return', destination: '/checkout/return', permanent: true")
    expect(read('app/api/checkout/pesapal/session/route.ts')).toContain('`${origin}/checkout/return`')
    expect(read('app/api/wallet/topup/pesapal/route.ts')).toContain('`${origin}/checkout/return?cancelled=1`')
    expect(fs.existsSync(path.join(root, 'app/checkout/return/page.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'app/checkout/pesapal/return/page.tsx'))).toBe(false)
  })

  test('card brands are dimmed until the matching brand is detected', () => {
    const icons = read('components/checkout/CardBrandIcons.tsx')
    const mask = read('components/checkout/Checkout.tsx')
    expect(icons).toContain('styles.brandDimmed')
    expect(icons).toContain('styles.brandActive')
    expect(mask).toContain('activeBrand={detectedBrand}')
    expect(read('components/checkout/checkout.module.css')).toContain('.brandDimmed { opacity:.28; }')
  })
})
