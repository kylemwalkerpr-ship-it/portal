import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

describe('Messenger product UI contract', () => {
  const contract = read('app/messenger-product-contract.css')
  const clearance = read('app/student-mobile-dock-clearance.css')

  test('loads the final Messenger contract from the last mobile layer', () => {
    expect(clearance.trimStart().startsWith("@import './messenger-product-contract.css';")).toBe(true)
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

  test('touch menus and settings remain full-depth mobile surfaces', () => {
    expect(contract).toContain('body .yousafe-messenger .ctxmenu,')
    expect(contract).toContain('bottom: max(10px, env(safe-area-inset-bottom)) !important')
    expect(contract).toContain('body .yousafe-messenger .settings-modal {')
    expect(contract).toContain('height: min(88dvh, 760px) !important')
  })

  test('the contract is scoped so dashboard and marketplace skins cannot inherit chat primitives', () => {
    expect(contract).not.toMatch(/(^|\n)\s*\.row\s*\{/)
    expect(contract).not.toMatch(/(^|\n)\s*\.bub\s*\{/)
    expect(contract).toContain('body .yousafe-messenger .row {')
    expect(contract).toContain('body .yousafe-messenger .bub {')
  })
})
