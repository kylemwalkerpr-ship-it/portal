import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { postgrestOrTerm } from '../lib/auth/ilike'

describe('postgrestOrTerm', () => {
  it('leaves ordinary search text alone', () => {
    expect(postgrestOrTerm('ORD-1234')).toBe('ORD-1234')
    expect(postgrestOrTerm('United Kingdom')).toBe('United Kingdom')
  })

  it('removes .or() delimiters so input cannot add filter branches', () => {
    const out = postgrestOrTerm('x%,status.eq.paid),and(id.neq.0')
    expect(out).not.toMatch(/[,()]/)
  })

  it('escapes LIKE wildcards and strips quotes/backslashes', () => {
    expect(postgrestOrTerm('50%_off')).toBe('50\\%\\_off')
    expect(postgrestOrTerm(`a"b'c\\d`)).toBe('a b c d')
  })

  it('caps length', () => {
    expect(postgrestOrTerm('a'.repeat(500)).length).toBe(100)
  })
})

describe('search routes never embed raw q in .or() filters', () => {
  const files = [
    'lib/mobileOrders.ts',
    'app/api/admin/orders/route.ts',
    'app/api/client/inquiries/search/route.ts',
    'app/api/support/inquiries/route.ts',
    'app/api/admin/inquiries/route.ts',
    'app/api/admin/escrow/route.ts',
    'app/api/attorney/orders/search/route.ts',
    'app/api/student/orders/route.ts',
    'app/api/attorney/inquiries/search/route.ts',
  ]
  it.each(files)('%s', (rel) => {
    const src = readFileSync(join(__dirname, '..', rel), 'utf8')
    const orLines = src.split('\n').filter((l) => l.includes('.or('))
    for (const l of orLines) expect(l).not.toContain('%${q}%')
    expect(src).toContain('postgrestOrTerm(q)')
  })
})
