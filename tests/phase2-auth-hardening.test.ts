/**
 * Phase 2 (auth) hardening regressions.
 *  - profile relink by email must match the exact address, never a LIKE pattern
 *  - a user's review report must not hide the review publicly
 *  - the public review list returns published reviews without reviewer/order ids
 *  - revoked consultants are locked out of consultant APIs
 *  - portal relink uses only Clerk's verified primary email
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { escapeIlikeExact } from '@/lib/auth/ilike'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('escapeIlikeExact', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeIlikeExact('a_b%c\\d@x.com')).toBe('a\\_b\\%c\\\\d@x.com')
  })
  it('leaves ordinary addresses unchanged', () => {
    expect(escapeIlikeExact('jane.doe+tag@example.com')).toBe('jane.doe+tag@example.com')
  })
})

describe('auth hardening source guards', () => {
  it('review flag queues moderation without changing the public status', () => {
    const src = read('app/api/gig-reviews/[id]/flag/route.ts')
    expect(src).not.toMatch(/update\(\s*\{\s*status:\s*'flagged'/)
    expect(src).toContain("from('moderation_queue')")
  })

  it('public review list is published-only and omits reviewer/order ids', () => {
    const src = read('app/api/gig-reviews/route.ts')
    expect(src).toContain(".eq('status', 'published')")
    expect(src).not.toMatch(/from\('gig_reviews'\)\.select\('\*'\)/)
    const select = src.match(/\.select\('([^']+)'\)\s*\n\s*\.eq\('status', 'published'\)/)
    expect(select).not.toBeNull()
    expect(select![1]).not.toMatch(/reviewer_id|order_id/)
  })

  it('consultant helper rejects suspended and declined accounts', () => {
    const src = read('lib/consultant.ts')
    expect(src).toMatch(/profile\.status === 'suspended' \|\| profile\.status === 'declined'/)
  })

  it('portal relink uses the verified Clerk email and an exact ilike match', () => {
    const src = read('lib/portalAuth.ts')
    expect(src).toContain('identityFromClerkUser(clerkUser)?.email')
    expect(src).not.toMatch(/\.ilike\('email', clerkEmail\)/)
    expect(read('lib/auth/roles.ts')).toContain("ilike('email', escapeIlikeExact(email))")
  })
})
