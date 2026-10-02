/**
 * Trust-bar "active orders in queue" and "repeat clients" use the same buyer
 * rule as the completed-order count (gigs.order_count): owner, staff and
 * is_test_account buyers never count, and each figure is hidden at 0.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { NON_COUNTABLE_BUYER_ROLES, isCountableBuyer, loadCountableBuyerIds } from '@/lib/marketplace/countableBuyers'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function fakeDb(rows: Array<{ id: string; role?: string | null; is_test_account?: boolean | null }>, error: unknown = null) {
  const calls: string[][] = []
  return {
    calls,
    from: (table: string) => ({
      select: (_cols: string) => ({
        in: async (_col: string, ids: string[]) => {
          expect(table).toBe('profiles')
          calls.push(ids)
          return error ? { data: null, error } : { data: rows.filter((r) => ids.includes(r.id)), error: null }
        },
      }),
    }),
  }
}

describe('countable buyers (same rule as gigs.order_count)', () => {
  test('owner, staff, test accounts and missing buyers do not count', () => {
    expect(isCountableBuyer('b1', 'prov', { id: 'b1', role: 'client' })).toBe(true)
    expect(isCountableBuyer('b1', 'prov', null)).toBe(true) // no profile row counts, like the SQL LEFT JOIN
    expect(isCountableBuyer('prov', 'prov', { id: 'prov', role: 'attorney' })).toBe(false)
    expect(isCountableBuyer('a', 'prov', { id: 'a', role: 'admin' })).toBe(false)
    expect(isCountableBuyer('s', 'prov', { id: 's', role: 'support' })).toBe(false)
    expect(isCountableBuyer('t', 'prov', { id: 't', role: 'client', is_test_account: true })).toBe(false)
    expect(isCountableBuyer(null, 'prov', null)).toBe(false)
  })

  test('rule matches the SQL in real_completed_order_count', () => {
    const sql = read('supabase/migrations/20261002105000_real_completed_order_counts.sql')
    expect(sql).toContain(`coalesce(b.role, '') not in (${NON_COUNTABLE_BUYER_ROLES.map((r) => `'${r}'`).join(', ')})`)
    expect(sql).toContain('coalesce(b.is_test_account, false) = false')
    expect(sql).toContain('o.client_id <> g.provider_id')
    expect(sql).toContain('o.client_id is not null')
  })

  test('loadCountableBuyerIds filters in chunks and returns null on lookup failure', async () => {
    const db = fakeDb([{ id: 'c1', role: 'client' }, { id: 'adm', role: 'admin' }, { id: 'tst', role: 'client', is_test_account: true }])
    const set = await loadCountableBuyerIds(db, ['c1', 'adm', 'tst', 'prov', 'ghost', null, 'c1'], 'prov')
    expect([...set!].sort()).toEqual(['c1', 'ghost'])
    const many = fakeDb([])
    await loadCountableBuyerIds(many, Array.from({ length: 320 }, (_, i) => `id${i}`), 'prov')
    expect(many.calls.map((c) => c.length)).toEqual([150, 150, 20])
    expect(await loadCountableBuyerIds(fakeDb([], { message: 'boom' }), ['c1'], 'prov')).toBeNull()
  })

  test('reputation route applies the rule to queue and repeat-client figures', () => {
    const route = read('app/api/marketplace/gigs/[slug]/reputation/route.ts')
    expect(route).toContain("import { loadCountableBuyerIds } from '@/lib/marketplace/countableBuyers'")
    expect(route).toMatch(/\.from\('orders'\)\s+\.select\('client_id'\)\s+\.eq\('gig_id', gig\.id\)/)
    expect(route).toContain('activeQueueRows.filter((row) => row.client_id && countableBuyers.has(row.client_id)).length')
    expect(route).toContain('if (!countableBuyers.has(clientId)) continue')
    expect(route).toContain('if (!countableBuyers) historyComplete = false')
    expect(route).not.toContain('activeQueueRes.count')
  })

  test('trust bar hides each figure at 0', () => {
    const bar = read('components/marketplace/MarketplaceGigTrustBar.tsx')
    expect(bar).toContain('{activeQueue > 0 && (')
    expect(bar).toContain('repeatClients > 0 && repeatOrders > 0')
    expect(bar).toContain('{completedOrders > 0 && (')
  })
})

describe('landing files with made-up figures are gone', () => {
  test.each(['components/design/landing/FeaturedProviders.tsx', 'components/design/landing/data/featured-providers.ts', 'components/design/landing/data/stats.ts'])('%s deleted', (p) => {
    expect(existsSync(join(root, p))).toBe(false)
  })
})
