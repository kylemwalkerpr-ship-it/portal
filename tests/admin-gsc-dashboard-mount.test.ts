/**
 * Admin UI contract for the Search Console section.
 *
 * P1 context: /api/content-studio/gsc/index-coverage and the
 * AdminGscDashboard component both shipped, but nothing imported the
 * component — the "Scan index coverage" button had no production entry
 * point. These tests lock the navigation/render path inside the existing
 * protected admin shell, plus the prop/behaviour contract the bare mount
 * depends on (optional props, configured siteUrl, no fake Disconnect, and
 * the documented 50-URL inspection sample).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

// ts-jest can transform the .tsx component; the offline fallback runner used
// when node_modules is unavailable cannot, so it skips just this SSR check.
const ssrTest = typeof jest === 'undefined' ? test.skip : test

describe('admin Search Console mount path', () => {
  const admin = read('components/design/admin.jsx')
  const sectionRoute = read('app/dashboard/admin/[section]/page.tsx')

  test('lazy-loads AdminGscDashboard into the admin shell bundle', () => {
    expect(admin).toContain(
      "const AdminGscDashboard = React.lazy(() => import('./admin-gsc-dashboard'))",
    )
  })

  test("registers 'gsc' as a deep-linkable admin page", () => {
    const adminPages = admin.match(/const ADMIN_PAGES = \[([^\]]*)\]/)?.[1] ?? ''
    expect(adminPages).toContain("'gsc'")

    const validSections =
      sectionRoute.match(/const VALID_SECTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
    expect(validSections).toContain("'gsc'")
  })

  test('renders a visible Search Console nav item that routes to the gsc section', () => {
    expect(admin).toContain('label="Search Console"')
    expect(admin).toMatch(/label="Search Console"[^>]*onClick=\{\(\) => setPage\('gsc'\)\}/)
  })

  test('maps a Search Console page title and mounts the dashboard in that section', () => {
    expect(admin).toContain("gsc: 'Search Console'")
    expect(admin).toContain("{page === 'gsc' && <AdminGscDashboard />}")
  })

  test('keeps the gsc section behind the existing admin auth gate', () => {
    expect(sectionRoute).toContain('requirePortalUser')
    expect(sectionRoute).toContain("auth.role !== 'admin'")
  })
})

describe('AdminGscDashboard bare-mount contract', () => {
  const dashboard = read('components/design/admin-gsc-dashboard.tsx')

  test('accepts no required props so the shell can mount it bare', () => {
    expect(dashboard).toContain('siteUrl?: string')
    expect(dashboard).toContain('onDisconnect?: () => void')
  })

  test('falls back to the configured siteUrl returned by /gsc/status', () => {
    expect(dashboard).toContain('setConfiguredSiteUrl(')
    expect(dashboard).toMatch(/const effectiveSiteUrl = .*configuredSiteUrl/)
  })

  test('omits the Disconnect control when no handler is supplied', () => {
    expect(dashboard).toContain('{onDisconnect && (')
  })

  test('asks for the documented effective 50-URL inspection sample', () => {
    expect(dashboard).toContain('maxUrls: 50')
    expect(dashboard).not.toContain('maxUrls: 250')
  })

  ssrTest('server-renders without any props (no credentials or handlers required)', () => {
    // require (not import) mirrors tests/markdown-document.test.ts: ts-jest
    // compiles this file to CJS and testEnvironment is node.
    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const AdminGscDashboard = require('@/components/design/admin-gsc-dashboard').default
    const html = renderToStaticMarkup(React.createElement(AdminGscDashboard))
    expect(html).toContain('Checking GSC status...')
  })
})
