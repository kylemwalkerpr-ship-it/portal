import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace mobile document flow', () => {
  it('loads the mobile flow contract from the marketplace layout', () => {
    expect(read('app/marketplace/layout.tsx')).toContain("import './mobile-flow.css'")
  })

  it('does not let seller profiles add a second phone viewport below marketplace chrome', () => {
    const css = read('app/marketplace/mobile-flow.css')
    expect(css).toContain('.cw-market .ys-seller-profile-page')
    expect(css).toContain('.cw-market .ys-seller-profile-tab-content')
    expect(css).toContain('min-height: 0 !important')
  })

  it('removes the same nested viewport floor from loaded gig detail pages', () => {
    const css = read('app/marketplace/mobile-flow.css')
    expect(css).toContain('.cw-market > div:has(> main .ys-content-layout)')
  })
})
