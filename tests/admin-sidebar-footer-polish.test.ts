import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('dashboard sidebar footer polish', () => {
  const layout = read('app/dashboard/layout.tsx')
  const polish = read('components/design/AdminSidebarFooterPolish.tsx')
  const admin = read('components/design/admin.jsx')
  const student = read('components/design/student.jsx')
  const consultant = read('components/design/consultant.jsx')
  const attorney = read('components/design/attorney.jsx')

  test('loads the shared polish for root and nested dashboard routes', () => {
    expect(layout).toContain('<AdminSidebarFooterPolish />')
  })

  test('removes the cramped duplicate sidebar sign-out control for every dashboard role', () => {
    expect(admin).toContain('aria-label="Log out"')
    expect(student).toContain('aria-label="Log out"')
    expect(consultant).toContain('aria-label="Log out and return to YouSafe Consultancy"')
    expect(attorney).toContain('aria-label="Log out and return to YouSafe Consultancy"')
    expect(polish).toContain('button[aria-label^="Log out"]')
    expect(polish).toContain('display: none !important;')
  })

  test('preserves sign-out in each top-right account menu', () => {
    for (const source of [admin, student, consultant, attorney]) {
      expect(source).toContain('<UserMenu')
      expect(source).toContain('onLogout={onLogout}')
    }
  })

  test('keeps role-specific footer content while tidying the identity card', () => {
    expect(student).toContain('Wallet: {formatMoney(walletSummary.available')
    expect(polish).not.toContain(':only-child')
    expect(polish).toContain('> div:has(> button[aria-label^="Log out"])')
    expect(polish).toContain('text-overflow: ellipsis;')
    expect(polish).toContain('white-space: nowrap;')
    expect(polish).toContain('border: 1px solid rgba(148, 163, 184, 0.22);')
  })
})
