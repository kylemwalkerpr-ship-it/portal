import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

describe('Messenger product UI contract', () => {
  const contract = read('app/messenger-product-contract.css')
  const statusContract = read('app/messenger-status-contract.css')
  const clearance = read('app/student-mobile-dock-clearance.css')
  const profile = read('components/messaging/ProfilePreviewDrawer.tsx')
  const statusViewer = read('components/messaging/StatusViewer.tsx')

  test('loads protected Messenger contracts from the final mobile layer', () => {
    const normalized = clearance.trimStart()
    expect(normalized.startsWith("@import './messenger-product-contract.css';\n@import './messenger-status-contract.css';")).toBe(true)
  })

  test('mobile conversation list stays flat, dense, and messenger-like', () => {
    expect(contract).toContain("data-mobile-view='list'")
    expect(contract).toContain('body .yousafe-messenger .row {')
    expect(contract).toContain('min-height: 76px !important')
    expect(contract).toContain('border-radius: 0 !important')
    expect(contract).toContain('background: var(--panel) !important')
    expect(contract).toContain('body .yousafe-messenger .cl-search {')
    expect(contract).toContain('border-radius: 14px !important')
  })

  test('mobile thread preserves single-row chrome, real bubbles and safe-area composer', () => {
    expect(contract).toContain('flex-wrap: nowrap !important')
    expect(contract).toContain('body .yousafe-messenger .bub {')
    expect(contract).toContain('max-width: 84% !important')
    expect(contract).toContain('font-size: 15.5px !important')
    expect(contract).toContain('body .yousafe-messenger .comp-row {')
    expect(contract).toContain('env(safe-area-inset-bottom)')
  })

  test('touch menus, settings and contact info are first-class mobile surfaces', () => {
    expect(contract).toContain('body .yousafe-messenger .ctxmenu,')
    expect(contract).toContain('bottom: max(10px, env(safe-area-inset-bottom)) !important')
    expect(contract).toContain('body .yousafe-messenger .settings-modal {')
    expect(contract).toContain('height: min(88dvh, 760px) !important')
    expect(contract).toContain('.yousafe-messenger .ys-contact-info-layer {')
    expect(profile).toContain('className="ys-contact-info"')
    expect(profile).toContain('Messaging on YouSafe')
  })

  test('status viewing has story depth and pause resumes without resetting progress', () => {
    expect(statusViewer).toContain('const STORY_MS = 6500')
    expect(statusViewer).toContain('const pausedRef = React.useRef(false)')
    expect(statusViewer).toContain('pausedRef.current = paused')
    expect(statusViewer).toContain("document.visibilityState !== 'hidden'")
    expect(statusViewer).toContain('className="ys-status-progress"')
    expect(statusViewer).toContain('onPointerDown={() => setPaused(true)}')
    expect(statusViewer).not.toContain('statuses.length, onClose, paused])')
    expect(statusContract).toContain('.yousafe-messenger .ys-status-stage {')
    expect(statusContract).toContain('height: 100dvh')
    expect(statusContract).toContain('env(safe-area-inset-bottom)')
  })

  test('contracts are scoped so dashboard and marketplace skins cannot inherit chat primitives', () => {
    expect(contract).not.toMatch(/(^|\n)\s*\.row\s*\{/)
    expect(contract).not.toMatch(/(^|\n)\s*\.bub\s*\{/)
    expect(contract).toContain('body .yousafe-messenger .row {')
    expect(contract).toContain('body .yousafe-messenger .bub {')
    expect(statusContract).not.toMatch(/(^|\n)\s*\.ys-status-stage\s*\{/)
  })
})
