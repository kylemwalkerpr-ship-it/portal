/// <reference types="jest" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('P10 audit repair contracts', () => {
  it('projects source_class into the coverage view ledger CTE before filtering on it', () => {
    const sql = read('supabase/migrations/20260922120000_p10_conversion_attribution.sql')
    const viewStart = sql.indexOf('create or replace view public.p10_conversion_chain_coverage')
    expect(viewStart).toBeGreaterThan(-1)
    const viewSql = sql.slice(viewStart)
    const ledger = viewSql.match(/with ledger as \(\s*select([\s\S]*?)from public\.conversion_events\s*\)/i)
    expect(ledger).not.toBeNull()
    expect(ledger?.[1]).toMatch(/\bsource_class\b/)
  })

  it('keeps the anonymous attribution collector reachable through Clerk middleware', () => {
    const source = read('middleware.ts')
    const matcherStart = source.indexOf('const isPublicRoute = createRouteMatcher([')
    const matcherEnd = source.indexOf('])', matcherStart)
    expect(matcherStart).toBeGreaterThan(-1)
    const matcher = source.slice(matcherStart, matcherEnd)
    expect(matcher).toContain("'/api/attribution(.*)'")
  })

  it('binds catalogue order_paid only after the durable payment subject was persisted', () => {
    const source = read('app/api/payments/charge/route.ts')
    expect(source).toContain('let templateOrderPersisted = false')
    expect(source).toContain('if (templateOrderPersisted && templateItemsForAttribution.length > 0)')

    const orderErrorCheck = source.indexOf('if (orderErr)')
    const successElse = source.indexOf('} else {', orderErrorCheck)
    const refAssignment = source.indexOf('serviceOrderRef = serviceOrderId')
    expect(orderErrorCheck).toBeGreaterThan(-1)
    expect(successElse).toBeGreaterThan(orderErrorCheck)
    expect(refAssignment).toBeGreaterThan(successElse)
  })

  it('appends order_refunded only after required wallet refund and order update succeed', () => {
    const source = read('app/api/admin/escrow/[id]/refund/route.ts')
    expect(source).toMatch(/\.select\([^\n]*\bcurrency\b/)
    expect(source).toContain('let walletRefundSucceeded = !order.client_id')
    expect(source).toContain('let orderUpdateSucceeded = false')
    expect(source).toContain('if (walletRefundSucceeded && orderUpdateSucceeded)')
  })
})
