import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace footer coverage', () => {
  it('mounts the route-aware footer alongside MarketplaceShell', () => {
    const layout = read('app/marketplace/layout.tsx')
    expect(layout).toContain('MarketplaceRouteFooter')
    expect(layout).toContain('<MarketplaceRouteFooter />')
  })

  it('covers public category, gig, and provider path shapes without duplicating the landing footer', () => {
    const source = read('components/marketplace/MarketplaceRouteFooter.tsx')
    expect(source).toContain("replace(/^\\/marketplace(?=\\/|$)/, '')")
    expect(source).toContain('categories|gigs|providers')
    expect(source).toContain('if (!needsSharedFooter) return null')
  })
})
