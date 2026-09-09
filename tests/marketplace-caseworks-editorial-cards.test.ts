import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = fs.readFileSync(
  path.join(root, 'components/marketplace/CaseworksReadMoreRail.tsx'),
  'utf8',
)

describe('marketplace MyCaseworks editorial rail', () => {
  test('presents editorial links as titled information cards instead of raw URLs', () => {
    expect(source).toContain('MyCaseworks guide')
    expect(source).toContain('Read guide →')
    expect(source).toContain('{item.title}')
    expect(source).not.toContain('legal.yousafeconsultancy.com{item.path}')
  })

  test('keeps every card fully clickable and preserves marketplace attribution', () => {
    expect(source).toContain('href={`${CASEWORKS_HOST}${item.path}/?utm_source=marketplace')
    expect(source).toContain('aria-label={`Read ${item.title} on MyCaseworks`}')
  })

  test('uses a mobile-first card grid and exposes the library action on all screen sizes', () => {
    expect(source).toContain('grid gap-3 p-4 sm:grid-cols-2 sm:p-6')
    expect(source).toContain('Browse all guides')
    expect(source).not.toContain('hidden font-mono')
  })
})
