import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/marketplace/categories/[categoryId]/page.tsx'),
  'utf8',
)

describe('Marketplace category guidance card', () => {
  test('keeps long-form category guidance inside a collapsed native disclosure', () => {
    const detailsStart = source.indexOf('<details')
    const summaryStart = source.indexOf('<summary', detailsStart)
    const guidanceCopy = source.indexOf('YouSafe Marketplace lists fixed-price briefs', detailsStart)
    const detailsEnd = source.indexOf('</details>', detailsStart)

    expect(detailsStart).toBeGreaterThan(-1)
    expect(source).toContain('className="ys-category-guidance-card"')
    expect(summaryStart).toBeGreaterThan(detailsStart)
    expect(guidanceCopy).toBeGreaterThan(summaryStart)
    expect(detailsEnd).toBeGreaterThan(guidanceCopy)
    expect(source.slice(detailsStart, summaryStart)).not.toMatch(/\bopen\s*=/)
  })

  test('shows real marketplace inventory before optional guidance', () => {
    const inventory = source.indexOf('<GigDiscoveryPage')
    const guidance = source.indexOf('className="ys-category-guidance')

    expect(inventory).toBeGreaterThan(-1)
    expect(guidance).toBeGreaterThan(inventory)
  })

  test('keeps category editorial and comparison copy server-rendered inside the disclosure', () => {
    expect(source).toContain('editorial.body.map')
    expect(source).toContain('editorial.compare.map')
    expect(source).toContain('What to compare in {displayName}')
  })
})
