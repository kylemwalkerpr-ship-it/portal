import fs from 'node:fs'
import path from 'node:path'

const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')

describe('Clerk modal floating UI suppression', () => {
  test('hides support launchers, the provider message chip, and cookie controls behind Clerk', () => {
    expect(css).toContain('body:has(.cl-modalBackdrop) .ysa-launcher')
    expect(css).toContain('body:has(.cl-modalBackdrop) .ysa-panel')
    expect(css).toContain('body:has(.cl-modalBackdrop) .ys-chat-launcher')
    expect(css).toContain('body:has(.cl-modalBackdrop) .ys-floating-message-launcher')
    expect(css).toContain('body:has(.cl-modalBackdrop) [data-cookie-settings]')
    expect(css).toContain('body:has(.cl-modalBackdrop) [data-cookie-banner]')
    expect(css).toContain('body:has([class*="cl-modalBackdrop"])')
    expect(css).toMatch(/display:\s*none\s*!important/)
  })
})
