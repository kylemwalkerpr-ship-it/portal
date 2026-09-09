import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('admin sidebar footer polish', () => {
  const layout = read('app/dashboard/layout.tsx')
  const polish = read('components/design/AdminSidebarFooterPolish.tsx')
  const admin = read('components/design/admin.jsx')

  test('loads the polish for both root and nested dashboard routes', () => {
    expect(layout).toContain('<AdminSidebarFooterPolish />')
  })

  test('removes only the cramped duplicate admin sidebar logout control', () => {
    expect(admin).toContain('aria-label="Log out"')
    expect(polish).toContain('div:only-child:has(> button[aria-label="Log out"])')
    expect(polish).toContain('display: none !important;')
    expect(polish).not.toContain('aria-label="Log out and return to YouSafe Consultancy"')
  })

  test('keeps the remaining identity card tidy in the narrow rail', () => {
    expect(polish).toContain('text-overflow: ellipsis;')
    expect(polish).toContain('white-space: nowrap;')
    expect(polish).toContain('border: 1px solid rgba(148, 163, 184, 0.22);')
  })
})
