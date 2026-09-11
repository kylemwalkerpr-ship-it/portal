import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('messenger desktop conversation-list scrolling', () => {
  const css = read('app/messenger-desktop-list-scroll.css')
  const layout = read('app/layout.tsx')
  const inbox = read('components/messaging/UnifiedInbox.tsx')

  test('the desktop sidebar establishes a bounded flex height chain', () => {
    expect(css).toContain('@media (min-width: 681px)')
    expect(css).toContain('.ys-chatscreen-sidebar')
    expect(css).toContain('display: flex')
    expect(css).toContain('height: 100%')
    expect(css).toContain('min-height: 0')
    expect(css).toContain('.ys-chatscreen-sidebar > .cl')
    expect(css).toContain('flex: 1 1 0%')
    expect(css).toContain('overflow: hidden')
  })

  test('the conversation rail is the desktop vertical scroll owner', () => {
    expect(css).toContain('.ys-chatscreen-sidebar > .cl > .cl-scroll')
    expect(css).toContain('overflow-y: auto')
    expect(css).toContain('overflow-x: hidden')
    expect(css).toContain('overscroll-behavior-y: contain')
  })

  test('the contract is shared by UnifiedInbox rather than one dashboard role', () => {
    expect(inbox).toContain('Single inbox component used by student + attorney + consultant')
    expect(css).not.toContain('data-student-mobile-enhanced')
  })

  test('the desktop contract is loaded globally without replacing mobile hardening', () => {
    expect(layout).toContain("import './messenger-mobile-back-list.css'")
    expect(layout).toContain("import './student-mobile-dock-clearance.css'")
    expect(layout).toContain("import './messenger-desktop-list-scroll.css'")
  })
})
