import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('student mobile UX v2', () => {
  const component = read('components/student/StudentMobileNavigation.tsx')
  const css = read('app/student-mobile-ux-v2.css')
  const clearanceCss = read('app/student-mobile-dock-clearance.css')
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

  test('the canonical YouSafe Assistant lives in More and no floating AI bubble can cover the dock', () => {
    expect(component).toContain('YouSafe AI Assistant')
    expect(component).toContain('Articles')
    expect(component).toContain("'.ysa-launcher, .ys-chat-launcher'")
    expect(component).toContain('clickLauncher(attempt + 1)')
    expect(component).toContain("button[aria-label='Open article feed']")
    expect(clearanceCss).toContain(".ysa-launcher")
    expect(clearanceCss).toContain("button[aria-label='Open YouSafe AI Assistant']")
    expect(clearanceCss).toContain(".ysa-panel")
    expect(clearanceCss).toContain('display: none !important')
  })

  test('fixed dock clearance is appended to real dashboard content so the final card stays visible after touch release', () => {
    expect(clearanceCss).toContain('--student-dock-v2-gap: 22px')
    expect(clearanceCss).toContain('--student-dock-v2-occlusion: calc(')
    expect(clearanceCss).toContain('--student-dock-v2-clearance: calc(')
    expect(clearanceCss).toContain('box-sizing: border-box !important')
    expect(clearanceCss).toContain('height: 100% !important')
    expect(clearanceCss).toContain('max-height: 100% !important')
    expect(clearanceCss).toContain('.yousafe-dashboard-main:not(:has(.yousafe-messenger))')
    expect(clearanceCss).toContain('padding-bottom: 0 !important')
    expect(clearanceCss).toContain('scroll-padding-bottom: var(--student-dock-v2-clearance) !important')
    expect(clearanceCss).toContain('.yousafe-dashboard-content::after')
    expect(clearanceCss).toContain('height: var(--student-dock-v2-clearance)')
    expect(clearanceCss).toContain('min-height: var(--student-dock-v2-clearance)')
    expect(clearanceCss).not.toContain('.yousafe-dashboard-main:not(:has(.yousafe-messenger))::after')
    expect(clearanceCss).not.toContain('flex: 0 0 var(--student-dock-v2-occlusion)')
    expect(clearanceCss).toContain('overflow-y: auto !important')
  })

  test('conversation list has a real iOS scroll track and keeps the dock tail reachable', () => {
    const marker = '/* Conversation list: one real iOS scroll owner'
    const start = clearanceCss.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const end = clearanceCss.indexOf(".yousafe-dashboard-shell[data-student-mobile-enhanced='true']:has(", start)
    const listCss = clearanceCss.slice(start, end > start ? end : undefined)
    const scrollSelector = ".ys-chatscreen[data-mobile-view='list'] .cl-scroll {"
    const scrollStart = listCss.indexOf(scrollSelector)
    expect(scrollStart).toBeGreaterThanOrEqual(0)
    const scrollEnd = listCss.indexOf('\n  }', scrollStart)
    const scrollCss = listCss.slice(scrollStart, scrollEnd > scrollStart ? scrollEnd : undefined)

    expect(listCss).toContain('.ys-inbox-frame')
    expect(listCss).toContain(".ys-chatscreen[data-mobile-view='list']")
    expect(listCss).toContain('.ys-chatscreen-sidebar')
    expect(listCss).toContain('.ys-chatscreen-sidebar > .cl')
    expect(listCss).toContain('.cl-head')
    expect(listCss).toContain('.cl-scroll')
    expect(listCss).toContain('.cl-scroll::after')
    expect(listCss).toContain('display: grid !important')
    expect(listCss).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(listCss).toContain('grid-template-rows: max-content minmax(0, 1fr) !important')
    expect(listCss).toContain('grid-template-areas: "head" "rail" !important')
    expect(listCss).toContain('flex: 1 1 0% !important')
    expect(listCss).toContain('min-height: min-content !important')
    expect(scrollCss).toContain('height: 100% !important')
    expect(scrollCss).toContain('max-height: 100% !important')
    expect(scrollCss).not.toMatch(/^\s*height:\s*auto\s*!important;/m)
    expect(scrollCss).not.toMatch(/^\s*height:\s*0\s*!important;/m)
    expect(scrollCss).toContain('min-height: 0 !important')
    expect(scrollCss).toContain('overflow-y: scroll !important')
    expect(scrollCss).toContain('touch-action: pan-y')
    expect(scrollCss).toContain('padding-bottom: var(--student-dock-v2-gap) !important')
    expect(scrollCss).toContain('scroll-padding-bottom: var(--student-dock-v2-clearance) !important')
    expect(listCss).toContain('height: var(--student-dock-v2-occlusion)')
  })

  test('open Messenger thread reclaims dock space and keeps the composer inside one viewport', () => {
    const threadSelector = ".ys-chatscreen[data-mobile-view='chat']"
    expect(clearanceCss).toContain(threadSelector)
    expect(clearanceCss).toContain('padding-bottom: 0 !important')
    expect(clearanceCss).toContain('scroll-padding-bottom: 0 !important')
    expect(clearanceCss).toContain('[data-chat-canvas]')
    expect(clearanceCss).toContain('overflow-y: auto !important')
    const viewportCss = read('app/mobile-visual-viewport.css')
    expect(viewportCss).toContain('.comp-row')
    expect(viewportCss).toContain('padding-bottom: 8px !important')
    expect(clearanceCss).toContain('flex: 1 1 0% !important')
  })

  test('open Messenger thread still fills the parent shell instead of stacking another 100dvh', () => {
    const messengerStart = css.indexOf('/* ── Messenger: one viewport owner')
    expect(messengerStart).toBeGreaterThanOrEqual(0)
    const messengerCss = css.slice(messengerStart)
    expect(messengerCss).toContain('height: 100% !important')
    expect(messengerCss).toContain('max-height: 100% !important')
    expect(messengerCss).toContain('min-height: 0 !important')
    expect(messengerCss).not.toContain('height: 100dvh !important')
  })

  test('clearance layer is mounted after both student mobile layers', () => {
    const premiumIndex = layout.indexOf("import './student-mobile-premium.css'")
    const v2Index = layout.indexOf("import './student-mobile-ux-v2.css'")
    const clearanceIndex = layout.indexOf("import './student-mobile-dock-clearance.css'")
    expect(premiumIndex).toBeGreaterThanOrEqual(0)
    expect(v2Index).toBeGreaterThan(premiumIndex)
    expect(clearanceIndex).toBeGreaterThan(v2Index)
    expect(layout).toContain("import StudentMobileNavigation from '@/components/student/StudentMobileNavigation'")
    expect(layout).toContain('<StudentMobileNavigation />')
  })
})
