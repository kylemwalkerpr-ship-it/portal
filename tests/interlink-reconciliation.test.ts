/**
 * Pure classification + mapping logic for the strictly read-only
 * `seo_interlinks` marketplace_cta reconciliation report.
 *
 * Known legacy shapes map deterministically to the canonical
 * `https://market.yousafeconsultancy.com/categories/<id>` only when the id is
 * a real catalogue category/subcategory. Anything else fails closed.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  classifyMarketplaceCtaRows,
  type InterlinkReconcileRow,
} from '../scripts/interlinkReconciliation'

const MARKET = 'https://market.yousafeconsultancy.com'
const PORTAL = 'https://portal.yousafeconsultancy.com'

function row(
  overrides: Partial<InterlinkReconcileRow> & Pick<InterlinkReconcileRow, 'id' | 'target_url'>,
): InterlinkReconcileRow {
  return { source_slug: 'seo-us-schools-f1', status: 'planned', ...overrides }
}

describe('F) marketplace_cta classification', () => {
  it('treats canonical rows as evidence only — never candidates', () => {
    const result = classifyMarketplaceCtaRows([
      row({ id: 'c1', target_url: `${MARKET}/categories/immigration` }),
      row({ id: 'c2', source_slug: 'seo-ca-work', target_url: `${MARKET}/categories/work-permits` }),
    ])

    expect(result.canonicalRows.map((r) => r.id)).toEqual(['c1', 'c2'])
    expect(result.canonicalRows.every((r) => r.classification === 'canonical')).toBe(true)
    expect(result.updateSafeCandidates).toHaveLength(0)
    expect(result.failsClosed).toBe(false)
  })

  it('maps both legacy shapes (singular + plural) for valid ids to the canonical URL', () => {
    const result = classifyMarketplaceCtaRows([
      row({ id: 'l1', source_slug: 'seo-us-a', target_url: `${PORTAL}/marketplace/category/immigration` }),
      row({ id: 'l2', source_slug: 'seo-us-b', target_url: `${PORTAL}/marketplace/categories/study-permits` }),
    ])

    expect(result.updateSafeCandidates.map((r) => r.id)).toEqual(['l1', 'l2'])
    expect(result.rollbackMappings).toEqual([
      {
        staleId: 'l1',
        sourceSlug: 'seo-us-a',
        from: `${PORTAL}/marketplace/category/immigration`,
        to: `${MARKET}/categories/immigration`,
      },
      {
        staleId: 'l2',
        sourceSlug: 'seo-us-b',
        from: `${PORTAL}/marketplace/categories/study-permits`,
        to: `${MARKET}/categories/study-permits`,
      },
    ])
    expect(result.failsClosed).toBe(false)
  })

  it('fails closed on an invalid catalogue id instead of guessing a category', () => {
    const result = classifyMarketplaceCtaRows([
      row({ id: 'm1', target_url: `${PORTAL}/marketplace/categories/not-a-real-service` }),
    ])

    expect(result.malformedUnsupported.map((r) => r.id)).toEqual(['m1'])
    expect(result.updateSafeCandidates).toHaveLength(0)
    expect(result.failsClosed).toBe(true)
  })

  it.each([
    ['market host with retired prefix', `${MARKET}/marketplace/categories/immigration`],
    ['remote /marketplace path', `${PORTAL}/marketplace/immigration`],
    ['query string', `${MARKET}/categories/immigration?utm_source=legacy`],
    ['fragment', `${MARKET}/categories/immigration#apply`],
    ['trailing slash', `${MARKET}/categories/immigration/`],
    ['uppercase id', `${MARKET}/categories/Immigration`],
    ['foreign host', `https://evil.example.com/categories/immigration`],
    ['empty id', `${PORTAL}/marketplace/categories/`],
    ['extra path segment', `${PORTAL}/marketplace/category/immigration/extra`],
  ])('fails closed on %s', (_name, targetUrl) => {
    const result = classifyMarketplaceCtaRows([row({ id: 'x1', target_url: targetUrl })])

    expect(result.malformedUnsupported.map((r) => r.id)).toEqual(['x1'])
    expect(result.failsClosed).toBe(true)
  })

  it.each(['applied', 'manual', null])(
    'fails closed on a valid-shape legacy row whose status is %s (not planned)',
    (status) => {
      const result = classifyMarketplaceCtaRows([
        row({ id: 'np1', status, target_url: `${PORTAL}/marketplace/categories/study-permits` }),
      ])

      expect(result.nonPlannedLegacy.map((r) => r.id)).toEqual(['np1'])
      expect(result.updateSafeCandidates).toHaveLength(0)
      expect(result.failsClosed).toBe(true)
    },
  )

  it('reports an existing canonical-pair collision without counting it safe', () => {
    const result = classifyMarketplaceCtaRows([
      row({ id: 'stale-1', source_slug: 'seo-us-a', target_url: `${PORTAL}/marketplace/category/study-permits` }),
      row({ id: 'canon-1', source_slug: 'seo-us-a', target_url: `${MARKET}/categories/study-permits` }),
    ])

    expect(result.existingCanonicalCollisions).toHaveLength(1)
    expect(result.existingCanonicalCollisions[0]).toMatchObject({
      id: 'stale-1',
      classification: 'legacy_collision',
      collidesWithRowId: 'canon-1',
      canonicalTargetUrl: `${MARKET}/categories/study-permits`,
    })
    expect(result.updateSafeCandidates).toHaveLength(0)
    expect(result.failsClosed).toBe(false)
  })

  it('detects collisions against any-reason rows supplied by the collision query', () => {
    const result = classifyMarketplaceCtaRows(
      [row({ id: 'stale-2', source_slug: 'seo-us-a', target_url: `${PORTAL}/marketplace/categories/study-permits` })],
      [{ id: 'other-1', source_slug: 'seo-us-a', target_url: `${MARKET}/categories/study-permits`, status: 'applied' }],
    )

    expect(result.existingCanonicalCollisions).toHaveLength(1)
    expect(result.existingCanonicalCollisions[0]).toMatchObject({
      id: 'stale-2',
      collidesWithRowId: 'other-1',
    })
    expect(result.failsClosed).toBe(false)
  })

  it('fails closed when two candidates map to the same (source_slug, canonical_target_url)', () => {
    const result = classifyMarketplaceCtaRows([
      row({ id: 'dup-1', source_slug: 'seo-us-a', target_url: `${PORTAL}/marketplace/category/study-permits` }),
      row({ id: 'dup-2', source_slug: 'seo-us-a', target_url: `${PORTAL}/marketplace/categories/study-permits` }),
    ])

    expect(result.intraMappingCollisions).toHaveLength(1)
    expect(result.intraMappingCollisions[0]).toMatchObject({
      sourceSlug: 'seo-us-a',
      canonicalTargetUrl: `${MARKET}/categories/study-permits`,
    })
    expect(result.intraMappingCollisions[0].rowIds.slice().sort()).toEqual(['dup-1', 'dup-2'])
    expect(result.updateSafeCandidates).toHaveLength(0)
    expect(result.rollbackMappings).toHaveLength(0)
    expect(result.failsClosed).toBe(true)
  })
})

describe('G) reconciliation executable source is strictly read-only', () => {
  const root = process.cwd()
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  /** Strip comments so only EXECUTABLE source is asserted on. */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
      })
      .join('\n')
  }

  const mutationCall = /\.(insert|update|delete|upsert|rpc)\s*\(/

  it('issues SELECT reads only — no Supabase mutation method, no apply flag', () => {
    const script = stripComments(read('scripts/reconcile-stale-planned-interlinks.mts'))
    expect(script).toContain('.select(')
    expect(script).not.toMatch(mutationCall)
    expect(script).not.toContain('--apply')
    expect(script).not.toMatch(/process\.argv/)
  })

  it('classification helper is database-free and mutation-free', () => {
    const helper = stripComments(read('scripts/interlinkReconciliation.ts'))
    expect(helper).not.toContain('@supabase/supabase-js')
    expect(helper).not.toMatch(mutationCall)
  })
})
