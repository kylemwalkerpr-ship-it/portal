import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('Marketplace image alt SEO contract', () => {
  test('file rail product covers use product-specific alternative text', () => {
    const source = read('components/marketplace/FilesRailScroller.tsx')
    expect(source).toContain('alt={`${p.title} file cover`}')
    expect(source).not.toContain('<img src={p.cover} alt=""')
  })

  test('shared Marketplace footer exposes the YouSafe brand image name', () => {
    const source = read('components/marketplace/MarketplaceFooter.tsx')
    expect(source).toContain('alt="YouSafe Consultancy"')
    expect(source).not.toContain('<img src="/logo.png" alt=""')
  })
})
