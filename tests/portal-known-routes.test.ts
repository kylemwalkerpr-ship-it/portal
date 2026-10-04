import fs from 'node:fs'
import path from 'node:path'
import { PORTAL_KNOWN_TOP_SEGMENTS, isUnknownPortalPath } from '@/lib/portalKnownRoutes'

const appDir = path.join(__dirname, '..', 'app')

function topLevelRouteSegments(): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith('_') || name.startsWith('@')) continue
    if (name.startsWith('(') && name.endsWith(')')) {
      // route group: its children are top-level segments
      for (const child of fs.readdirSync(path.join(appDir, name), { withFileTypes: true })) {
        if (child.isDirectory() && !child.name.startsWith('_')) out.push(child.name)
      }
      continue
    }
    out.push(name)
  }
  return out
}

describe('portal known top-level routes (Phase 6 custom 404)', () => {
  test('every app/ top-level route segment is listed, so no real section is treated as unknown', () => {
    const segments = topLevelRouteSegments()
    expect(segments.length).toBeGreaterThan(5)
    for (const seg of segments) {
      expect(seg.startsWith('[')).toBe(false) // a root dynamic segment would make "unknown" meaningless
      expect(PORTAL_KNOWN_TOP_SEGMENTS.has(seg)).toBe(true)
    }
  })

  test('unknown paths are detected; known sections, root and internals are not', () => {
    expect(isUnknownPortalPath('/this-page-does-not-exist')).toBe(true)
    expect(isUnknownPortalPath('/wp-admin/setup.php')).toBe(true)
    for (const p of ['/', '', '/dashboard', '/dashboard/admin/users', '/sign-in', '/api/profile', '/onboarding/provider', '/_next/static/x.js', '/__clerk/v1', '/robots.txt']) {
      expect(isUnknownPortalPath(p)).toBe(false)
    }
  })

  test('middleware short-circuits unknown portal paths before auth()', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')
    const guard = src.indexOf('isUnknownPortalPath(pathname)')
    const authCall = src.indexOf('const { userId, sessionClaims } = await auth()')
    expect(guard).toBeGreaterThan(0)
    expect(authCall).toBeGreaterThan(guard)
  })
})
