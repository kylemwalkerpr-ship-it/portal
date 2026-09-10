import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace card finishing pass', () => {
  const layout = read('app/marketplace/layout.tsx')
  const finishing = read('app/marketplace/marketplace-card-finishing.css')

  test('loads the finishing layer after the broader Marketplace completion styles', () => {
    const completion = layout.indexOf("import './marketplace-completion.css'")
    const finishingIndex = layout.indexOf("import './marketplace-card-finishing.css'")
    expect(completion).toBeGreaterThan(-1)
    expect(finishingIndex).toBeGreaterThan(completion)
  })

  test('enforces a complete two-line clamp contract across canonical and featured service cards', () => {
    expect(finishing).toContain('.cw-market .ys-discovery-gig-card h3')
    expect(finishing).toContain('.cw-market .featured .gig h4')
    expect(finishing).toContain('display: -webkit-box !important')
    expect(finishing).toContain('-webkit-box-orient: vertical !important')
    expect(finishing).toContain('-webkit-line-clamp: 2 !important')
    expect(finishing).toContain('white-space: normal !important')
    expect(finishing).toContain('min-height: 2.84em !important')
  })

  test('uses restrained fine-pointer hover feedback instead of changing touch interaction', () => {
    expect(finishing).toContain('@media (hover: hover) and (pointer: fine)')
    expect(finishing).toContain('transform: translateY(-3px) !important')
    expect(finishing).toContain('transform: scale(1.02) !important')
    expect(finishing).toContain('240ms cubic-bezier(.22, 1, .36, 1)')
    expect(finishing).toContain('380ms cubic-bezier(.22, 1, .36, 1)')
  })

  test('keeps reduced-motion users authoritative over the finishing transitions', () => {
    expect(finishing).toContain('@media (prefers-reduced-motion: reduce)')
    expect(finishing).toContain('transition: none !important')
    expect(finishing).toContain('transform: none !important')
    expect(finishing).toContain('will-change: auto !important')
  })
})
