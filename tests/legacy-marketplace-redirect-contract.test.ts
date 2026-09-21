import fs from 'node:fs'
import path from 'node:path'

import nextConfig from '../next.config'

const root = process.cwd()
const nextConfigSource = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8')
const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8')

describe('legacy Marketplace URL consolidation', () => {
  test('permanently redirects the retired namespace before middleware on every served host', async () => {
    expect(nextConfigSource).toContain("source: '/marketplace/:path*'")
    expect(nextConfigSource).toContain("destination: 'https://market.yousafeconsultancy.com/:path*'")
    expect(nextConfigSource).toContain('permanent: true')

    // "On every served host" is the contract, so the legacy rule itself must
    // stay unconditional: no `has`/`missing` gate may appear on it. This used to
    // be asserted as "next.config.ts contains no `type: 'host'` anywhere"; the
    // portal auth-lane shells (MARKET-PORTAL-AUTH-HANDOFF-1102 R2) are
    // deliberately host-scoped, so the guard is now asserted against the rule it
    // is actually about instead of against the whole file.
    const legacy = (await nextConfig.redirects!()).find(
      (rule) => rule.source === '/marketplace/:path*',
    )
    expect(legacy).toBeDefined()
    expect(legacy).not.toHaveProperty('has')
    expect(legacy).not.toHaveProperty('missing')
    expect(legacy?.destination).toBe('https://market.yousafeconsultancy.com/:path*')
    expect(legacy?.permanent).toBe(true)
  })

  test('keeps the retired namespace out of every rewrite table', async () => {
    const rewrites = await nextConfig.rewrites!()
    const tables = Array.isArray(rewrites)
      ? [rewrites]
      : [rewrites?.beforeFiles ?? [], rewrites?.afterFiles ?? [], rewrites?.fallback ?? []]
    // The consolidation is one permanent hop — never a rewrite, host-gated or
    // otherwise (a rewrite would serve the retired namespace a second time).
    expect(tables.flat().filter((rule) => rule.source.startsWith('/marketplace'))).toEqual([])
  })

  test('keeps a one-hop permanent middleware fallback and emits no checkout URLs', () => {
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain("const cleanMarketplacePath = pathname === '/marketplace' ? '/' : pathname.slice('/marketplace'.length) || '/'")
    expect(middleware).toContain('target.hostname = MARKET_HOST')
    expect(middleware).toContain('NextResponse.redirect(target, { status: 301 })')
    expect(nextConfigSource).not.toContain('checkout.yousafeconsultancy.com')
  })
})
