/**
 * Regression 2026-10-02 (jkanyi94): a student (role=client, 7 orders) was
 * routed to the SUPPORT lane. Root cause was outside this repo: the support
 * site (support-saas getOrCreateProfile) rewrote the SHARED profiles row to
 * role=support/status=pending when the student opened
 * support.yousafeconsultancy.com (fixed there + row restored). These checks lock
 * the portal half: roles come only from the DB row, students/clients always
 * resolve to the client dashboard, nothing defaults or self-assigns 'support'.
 */
import fs from 'node:fs'
import path from 'node:path'
import { normalizeAuthLane, roleLabel } from '@/lib/roleLanes'
import { normalizeAuthIntent } from '@/lib/auth/returnTo'

const read = (p: string) => fs.readFileSync(p, 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('student/client role resolution', () => {
  test('student and client normalize to the client lane; unknown values never become support', () => {
    expect(normalizeAuthLane('student')).toBe('client')
    expect(normalizeAuthLane('client')).toBe('client')
    expect(normalizeAuthLane(undefined)).toBe('client')
    expect(normalizeAuthLane('')).toBe('client')
    expect(normalizeAuthLane('admin')).toBe('client')
    expect(roleLabel('student')).toBe('client')
  })

  test('support and admin are never self-service intents', () => {
    expect(normalizeAuthIntent('support')).toBeNull()
    expect(normalizeAuthIntent('admin')).toBeNull()
    expect(normalizeAuthIntent('student')).toBe('client')
  })

  test('dashboard renders by the DB row only and sends only ACTIVE support staff to the support workspace', () => {
    const page = read('app/dashboard/page.tsx')
    expect(page).toContain('findOrLinkProfile(db, userId, identity?.email)')
    expect(page).not.toMatch(/\.unsafeMetadata|jar\.get\('ys_requested_lane'\)|params\.lane/)
    expect(page).toContain("if (profile.role === 'support' && profile.status === 'active') {")
    expect(page).not.toMatch(/role:\s*'support'/)
  })

  test('client and legacy student rows render the student app', () => {
    const client = read('app/dashboard/client.tsx')
    expect(client).toMatch(/role === 'consultant' \? <ConsultantApp[\s\S]*: <StudentApp /)
    // Buyer gates accept both spellings so legacy 'student' rows keep working.
    expect(read('lib/student.ts')).toContain("profile.role === 'client' || profile.role === 'student'")
  })

  test('self-service onboarding can only create client profiles', () => {
    const route = read('app/api/onboarding/role/route.ts')
    expect(route).toContain("if (body.role !== 'client')")
    expect(read('lib/auth/roles.ts')).toContain("export type SelfServiceRole = 'client' | ProviderRole")
  })

  test("no portal code path writes role 'support' except the admin user route", () => {
    const offenders = [...walk('app'), ...walk('lib'), ...walk('components')]
      .filter((file) => !file.includes(`${path.sep}admin${path.sep}`))
      .filter((file) => /\.(update|upsert|insert)\([^)]*role:\s*['"]support['"]/.test(read(file)) || /role:\s*['"]support['"]\s*,\s*status:\s*['"]pending['"]/.test(read(file)))
    expect(offenders).toEqual([])
  })
})
