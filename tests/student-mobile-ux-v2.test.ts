import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('student mobile UX v2', () => {
  const component = read('components/student/StudentMobileNavigation.tsx')
  const css = read('app/student-mobile-ux-v2.css')
  const layout = read('app/layout.tsx')

  test('uses a fixed five-slot primary dock instead of horizontal destination hunting', () => {
    expect(component).toContain("{ source: 'Dashboard', label: 'Home' }")
    expect(component).toContain("{ source: 'Marketplace', label: 'Marketplace' }")
    expect(component).toContain("{ source: 'My Orders', label: 'Orders' }")
    expect(component).toContain("{ source: 'Messages', label: 'Messages' }")
    expect(component).toContain('ys-student-mobile-dock-label">More')
    expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))')
    expect(css).toContain(".yousafe-dashboard-shell[data-student-mobile-enhanced='true'] > .yousafe-sidebar")
  })

  test('secondary destinations remain explicitly reachable from More', () => {
    for (const label of [
      'File shop',
      'Services & Templates',
      'Template Filler',
      'Documents',
      'Find Your Specialist',
      'My Inquiries',
      'Billing',
      'Settings',
    ]) {
      expect(component).toContain(`'${label}'`)
    }
    expect(component).toContain('role="dialog"')
    expect(component).toContain('More dashboard destinations')
  })

  test('student page titles cover destinations that previously fell back to Dashboard', () => {
    expect(component).toContain("attorneys: 'Find Your Specialist'")
    expect(component).toContain("inquiries: 'My Inquiries'")
    expect(component).toContain("templates: 'Template Filler'")
    expect(component).toContain("billing: 'Billing'")
    expect(component).toContain('ys-student-mobile-page-title')
  })

  test('Yara and Articles are moved into More and their floating launchers cannot cover navigation', () => {
    expect(component).toContain('Yara support')
    expect(component).toContain('Articles')
    expect(component).toContain(".ys-chat-launcher')?.click()")
    expect(component).toContain("button[aria-label='Open article feed']")
    expect(css).toContain("body:has(.yousafe-dashboard-shell[data-student-mobile-enhanced='true']) .ys-chat-launcher")
    expect(css).toContain("button[aria-label='Open article feed']")
    expect(css).toContain('display: none !important')
  })

  test('open Messenger thread fills the parent shell instead of stacking another 100dvh', () => {
    const messengerStart = css.indexOf('/* ── Messenger: one viewport owner')
    expect(messengerStart).toBeGreaterThanOrEqual(0)
    const messengerCss = css.slice(messengerStart)
    expect(messengerCss).toContain('height: 100% !important')
    expect(messengerCss).toContain('max-height: 100% !important')
    expect(messengerCss).toContain('min-height: 0 !important')
    expect(messengerCss).not.toContain('height: 100dvh !important')
  })

  test('v2 layer and navigation coordinator are mounted after the original premium layer', () => {
    const premiumIndex = layout.indexOf("import './student-mobile-premium.css'")
    const v2Index = layout.indexOf("import './student-mobile-ux-v2.css'")
    expect(premiumIndex).toBeGreaterThanOrEqual(0)
    expect(v2Index).toBeGreaterThan(premiumIndex)
    expect(layout).toContain("import StudentMobileNavigation from '@/components/student/StudentMobileNavigation'")
    expect(layout).toContain('<StudentMobileNavigation />')
  })
})
