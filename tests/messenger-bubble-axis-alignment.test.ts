import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger grouped bubble axis alignment', () => {
  const css = read('app/messenger-bubble-axis-alignment.css')
  const layout = read('app/layout.tsx')

  test('intermediate received and sent rows reserve the terminal avatar gutter', () => {
    expect(css).toContain('.yousafe-messenger .bubrow.theirs:not(.last)::before')
    expect(css).toContain('.yousafe-messenger .bubrow.mine:not(.last)::after')
    expect(css).toContain('flex: 0 0 34px')
    expect(css).toContain('width: 34px')
    expect(css).toContain('min-width: 34px')
  })

  test('alignment contract loads after viewport/mobile hardening', () => {
    const viewport = layout.indexOf("import './mobile-visual-viewport.css'")
    const alignment = layout.indexOf("import './messenger-bubble-axis-alignment.css'")
    expect(viewport).toBeGreaterThanOrEqual(0)
    expect(alignment).toBeGreaterThan(viewport)
  })
})
