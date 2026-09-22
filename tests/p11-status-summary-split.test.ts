/**
 * P11 auth-CPU remediation — /api/seo-engine/status must not pay deep
 * visibility/remediation computation just to render a health summary.
 *
 * Evidence reconfirmed: the status route calls `loadVisibilityFeed(50)`, which
 * fetches up to `P11_REPORTING_ROW_LIMIT` (5000) wide rows (30+ columns incl.
 * citation_classifications arrays), 2 exact head-counts and the full ownership
 * registry, then builds per-row citation actions and runs the remediation
 * generator — all to render ~10 aggregate numbers in the status JSON.
 *
 * Contract under test: a new `loadVisibilityStatusSummary()` reads only the
 * reporting aggregates (narrow P11 columns + the same two exact counts + the
 * authoritative-owner count), with:
 *  - NO wide-row fetch (no snippet/citations/classifications columns),
 *  - NO remediation generator invocation,
 *  - NO audits slice construction,
 * and the status route consumes the summary instead of the deep feed while
 * keeping the same `llmVisibility` response shape (backward-compatible fields
 * only, plus a new `summaryMode: true` marker).
 */

const mockCreateSupabaseAdminClient = jest.fn()
const mockRemediateVisibilityAudits = jest.fn()

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => mockCreateSupabaseAdminClient(),
  getSupabaseAdminClient: () => mockCreateSupabaseAdminClient(),
  isServiceRoleAchieved: () => true,
}))

jest.mock('@/lib/seoEngine/citationRemediation', () => ({
  remediateVisibilityAudits: (rows: unknown[]) => mockRemediateVisibilityAudits(rows),
}))

jest.mock('@/lib/seoFactory/ownership', () => ({
  // HOST_PUBLIC must survive the mock: geoVisibilityTruth derives its estate-host
  // set from it at module load.
  HOST_PUBLIC: {
    legal: 'https://legal.yousafeconsultancy.com',
    apex: 'https://yousafeconsultancy.com',
    usa: 'https://usa.yousafeconsultancy.com',
    uk: 'https://uk.yousafeconsultancy.com',
    ca: 'https://ca.yousafeconsultancy.com',
    au: 'https://au.yousafeconsultancy.com',
    market: 'https://market.yousafeconsultancy.com',
  },
  isAuthoritativeOwnershipRow: (row: Record<string, unknown>) => row.is_authoritative === true,
  listRegistry: jest.fn(async () => [{ is_authoritative: true }, { is_authoritative: true }]),
}))

import { loadVisibilityStatusSummary } from '@/lib/seoEngine/llmVisibility'

type Selected = { columns: string; limit: number | null }

type LatestCandidates = {
  legacy: Array<Record<string, unknown>>
  p11: Array<Record<string, unknown>>
}

const P11_ROW_COLUMNS = [
  'id', 'query', 'engine', 'model', 'cited', 'cited_urls', 'brand_mentions', 'snippet',
  'raw_score', 'stage', 'country', 'fan_out', 'competitor_domains', 'answer_format',
  'confidence', 'flags', 'share_of_voice', 'top_competitor', 'competitor_share',
  'created_at', 'audit_contract_version', 'ownership_row_id', 'authoritative_owner_url',
  'audit_status', 'failure_reason', 'citation_extraction_status', 'raw_cited_urls',
  'normalized_cited_urls', 'citation_classifications', 'competitor_cited_urls', 'coverage',
]

function fakeSupabase(
  rows: Array<Record<string, unknown>>,
  selections: Selected[],
  latest: LatestCandidates = { legacy: [], p11: [] },
) {
  return {
    from(table: string) {
      return {
        select(columns: string, opts?: { count?: string; head?: boolean }) {
          const entry: Selected = { columns, limit: null }
          selections.push(entry)
          let latestIsP11 = false
          const chain: Record<string, unknown> = {}
          chain.eq = (...args: unknown[]) => {
            if (columns === 'query,created_at' && args[0] === 'audit_contract_version') latestIsP11 = true
            return chain
          }
          chain.order = () => chain
          chain.limit = (n: number) => {
            entry.limit = n
            return chain
          }
          // Real supabase-js PostgrestBuilder implements the full promise
          // interface; the summary's latest-row read uses .catch().
          chain.catch = (onRejected: unknown) => chain
          chain.then = (resolve: (value: unknown) => unknown) => {
            if (opts?.count === 'exact' && opts?.head) {
              return Promise.resolve({ data: null, error: null, count: 4 }).then(resolve)
            }
            const data = columns.includes('coverage')
              ? rows
              : columns === 'query,created_at'
                ? (latestIsP11 ? latest.p11 : latest.legacy)
                : []
            return Promise.resolve({ data, error: null }).then(resolve)
          }
          return chain
        },
      }
    },
  }
}

const measuredP11Row = {
  id: 'r1',
  audit_contract_version: 'p11-geo-v1',
  ownership_row_id: 7,
  coverage: {
    attempted: 2, successful: 1, citedSuccessful: 1,
    providerUnavailable: 0, providerFailure: 0, parseFailure: 0, blocked: 0, unknown: 0,
    successfulWithAuthoritativeCitation: 1, successfulWithOtherCurrentYouSafeCitation: 0,
    successfulWithWrongOrRetiredYouSafeCitation: 0, successfulWithCompetitorCitation: 0,
    successfulWithNoExtractableCitation: 0, shareOfVoice: 1,
  },
}

describe('loadVisibilityStatusSummary — status-summary vs deep-feed split', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRemediateVisibilityAudits.mockResolvedValue([])
  })

  it('returns the same reporting aggregates as the deep feed without any deep computation', async () => {
    const selections: Selected[] = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([measuredP11Row], selections))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.reporting).toEqual(expect.objectContaining({
      contractVersion: 'p11-geo-v1',
      attempted: 2,
      successful: 1,
      citedSuccessful: 1,
      shareOfVoice: 100,
      measurementState: 'measured',
      auditedAuthoritativeOwners: 1,
      authoritativeOwnerCount: 2,
      ownerCoveragePercent: 50,
    }))
    expect(summary.cited).toBe(1)
    expect(summary.total).toBe(1)
    expect(summary.attempted).toBe(2)
    expect(summary.shareOfVoice).toBe(100)
    expect(summary.measurementState).toBe('measured')

    // No wide-row fetch: the P11 read must select a narrow aggregate column
    // set — never the deep-feed column list with snippet/citations/classifications.
    const p11Read = selections.find((s) => s.columns.includes('coverage'))
    expect(p11Read).toBeDefined()
    for (const deepColumn of ['snippet', 'cited_urls', 'citation_classifications', 'brand_mentions']) {
      expect(p11Read!.columns).not.toContain(deepColumn)
    }

    // No remediation generator, no audits slice: the summary type simply does
    // not carry them (compile-time guarantee, asserted via the absent keys).
    expect(mockRemediateVisibilityAudits).not.toHaveBeenCalled()
    expect(Object.keys(summary)).not.toContain('audits')
    expect(Object.keys(summary)).not.toContain('remediations')
  })

  it('falls back to the empty unavailable report when the summary read fails', async () => {
    mockCreateSupabaseAdminClient.mockReturnValue({
      from() {
        return {
          select() {
            return {
              eq: () => ({
                order: () => ({
                  limit: () => Promise.reject(new Error('db down')),
                }),
              }),
            }
          },
        }
      },
    })

    const summary = await loadVisibilityStatusSummary()

    expect(summary.measurementState).toBe('unavailable')
    expect(summary.shareOfVoice).toBeNull()
    expect(summary.reporting.measurementState).toBe('unavailable')
    expect(summary.summaryMode).toBe(true)
  })

  it('uses the newest P11 row for latest query metadata, never a newer legacy row', async () => {
    const selections: Selected[] = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([measuredP11Row], selections, {
      legacy: [{ query: 'legacy headline', created_at: '2026-09-22T12:00:00Z' }],
      p11: [{ query: 'p11 headline', created_at: '2026-09-22T11:00:00Z' }],
    }))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.latest).toEqual({
      query: 'p11 headline',
      createdAt: '2026-09-22T11:00:00Z',
    })
  })
})
