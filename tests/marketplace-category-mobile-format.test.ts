import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(
  path.join(root, 'app/marketplace/categories/[categoryId]/page.tsx'),
  'utf8',
)
const guidanceCss = fs.readFileSync(
  path.join(root, 'app/marketplace/categories/[categoryId]/category-guidance.module.css'),
  'utf8',
)

describe('marketplace category mobile formatting', () => {
  it('keeps the first screen concise and conversion-led', () => {
    expect(source).toContain('className="ys-category-hero"')
    expect(source).toContain('YouSafe Marketplace')
    expect(source).toContain('active service')
  })

  it('renders real service discovery before the long-form buying guidance', () => {
    const discovery = source.indexOf('<GigDiscoveryPage categoryId={filterId}')
    const guidance = source.indexOf('aria-label={`${displayName} buying guidance`}')
    expect(discovery).toBeGreaterThan(-1)
    expect(guidance).toBeGreaterThan(-1)
    expect(discovery).toBeLessThan(guidance)
  })

  it('keeps buying guidance expanded by default while preserving collapse control', () => {
    expect(source).toContain('<details open')
    expect(source).toContain('ys-category-guidance-card')
    expect(source).toContain('<summary')
    expect(source).toContain('Before you order')
    expect(source).toContain('Choose the right scope')
    expect(source).toContain('Self-serve or specialist?')
    expect(source).toContain('{displayName} guidance</h2>')
    expect(source).toContain('<Link href="/shop">preparation packs</Link>')
    expect(guidanceCss).toContain('width: min(calc(100% - 32px), 64rem)')
    expect(guidanceCss).toContain('.card[open] .chevron')
  })
})
