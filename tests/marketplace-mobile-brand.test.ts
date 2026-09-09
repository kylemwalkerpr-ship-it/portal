import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace mobile brand lockup', () => {
  const css = read('app/marketplace/marketplace-brand.css')
  const layout = read('app/marketplace/layout.tsx')

  test('loads the marketplace-only brand stylesheet', () => {
    expect(layout).toContain("import './marketplace-brand.css'")
  })

  test('shows the YouSafe slogan for anonymous and signed-in mobile headers', () => {
    expect(css).toContain("content: 'Your Safe Path to Success.';")
    expect(css).toContain('.cw-market .ys-shell-brand > div > span::after')
    expect(css).toContain('.cw-market .ys-shell-brand-sub::after')
    expect(css).toContain('display: block !important;')
  })

  test('keeps the logo prominent while preserving narrow-phone brand text', () => {
    expect(css).toContain('width: 38px !important;')
    expect(css).toContain('@media (max-width: 360px)')
    expect(css).toContain('.cw-market .ys-shell-brand > div > :not(img)')
    expect(css).toContain('display: flex !important;')
    expect(css).toContain('max-width: 168px !important;')
  })
})
