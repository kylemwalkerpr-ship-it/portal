/**
 * P11 auth-CPU remediation — /api/seo-engine/status must not pay deep
 * visibility/remediation computation just to render a health summary.
 *
 * Contract under test: `loadVisibilityStatusSummary()` reads only the
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
const mockListRegistry = jest.fn(async () => [{ is_authoritative: true }, { is_authoritative: true }])

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
  listRegistry: () => mockListRegistry(),
}))

import { loadVisibilityStatusSummary } from '@/lib/seoEngine/llmVisibility'

type Selected = { columns: string; limit: number | null }

type LatestCandidates = {
  legacy: Array<Record<string, unknown>>
  p11: Array<Record<string, unknown>>
}

type FakeSupabaseOptions = {
  totalRows?: number
  p11RowsExact?: number
  latestError?: Error
  primaryError?: Error
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
  options: FakeSupabaseOptions = {},
) {
  return {
    from(table: string) {
      return {
        select(columns: string, opts?: { count?: string; head?: boolean }) {
          const entry: Selected = { columns, limit: null }
          selections.push(entry)
          let latestIsP11 = false
          let countIsP11 = false
          const chain: Record<string, unknown> = {}
          chain.eq = (...args: unknown[]) => {
            if (columns === 'query,created_at' && args[0] === 'audit_contract_version') latestIsP11 = true
            if (opts?.count === 'exact' && args[0] === 'audit_contract_version') countIsP11 = true
            return chain
          }
          chain.order = () => chain
          chain.limit = (n: number) => {
            entry.limit = n
            return chain
          }
          chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
            if (opts?.count === 'exact' && opts?.head) {
              return Promise.resolve({
                data: null, error: null,
                count: countIsP11 ? (options.p11RowsExact ?? 1) : (options.totalRows ?? 268),
              }).then(resolve, reject)
            }
            if (columns === 'query,created_at' && options.latestError) return Promise.reject(options.latestError).then(resolve, reject)
            if (columns === 'audit_contract_version,ownership_row_id,coverage' && options.primaryError) {
              return Promise.reject(options.primaryError).then(resolve, reject)
            }
            const data = columns.includes('coverage')
              ? rows
              : columns === 'query,created_at'
                ? (latestIsP11 ? latest.p11 : latest.legacy)
                : []
            return Promise.resolve({ data, error: null }).then(resolve, reject)
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
    mockListRegistry.mockResolvedValue([{ is_authoritative: true }, { is_authoritative: true }])
  })

  it('assimilates a then-only PostgrestBuilder and returns the observed unavailable cohort without deep computation', async () => {
    const selections: Selected[] = []
    mockListRegistry.mockResolvedValue(Array.from({ length: 67 }, () => ({ is_authoritative: true })))
    const unavailableP11Row = {
      audit_contract_version: 'p11-geo-v1', ownership_row_id: 1,
      coverage: {
        attempted: 2, successful: 0, citedSuccessful: 0,
        providerUnavailable: 1, providerFailure: 1, parseFailure: 0, blocked: 0, unknown: 0,
        successfulWithAuthoritativeCitation: 0, successfulWithOtherCurrentYouSafeCitation: 0,
        successfulWithWrongOrRetiredYouSafeCitation: 0, successfulWithCompetitorCitation: 0,
        successfulWithNoExtractableCitation: 0, shareOfVoice: null,
      },
    }
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([unavailableP11Row], selections, {
      legacy: [{ query: 'legacy', created_at: '2026-09-22T12:00:00Z' }], p11: [],
    }))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.reporting).toEqual(expect.objectContaining({
      contractVersion: 'p11-geo-v1',
      queryRows: 1, attempted: 2, successful: 0,
      providerFailure: 1, providerUnavailable: 1, citedSuccessful: 0,
      shareOfVoice: null, measurementState: 'unavailable',
      legacyRows: 267, auditedAuthoritativeOwners: 1,
      authoritativeOwnerCount: 67, ownerCoveragePercent: 1,
    }))
    expect(summary.cited).toBe(0)
    expect(summary.total).toBe(0)
    expect(summary.attempted).toBe(2)
    expect(summary.failed).toBe(2)
    expect(summary.shareOfVoice).toBeNull()
    expect(summary.measurementState).toBe('unavailable')

    // No wide-row fetch: the P11 read must select a narrow aggregate column
    // set — never the deep-feed column list with snippet/citations/classifications.
    const p11Read = selections.find((s) => s.columns.includes('coverage'))
    expect(p11Read).toBeDefined()
    // Four query builders total: narrow rows, two exact counts, latest metadata.
    // This is unchanged by thenable assimilation; no deep feed query is added.
    expect(selections).toHaveLength(4)
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
    const selections: Selected[] = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([], selections, undefined, {
      primaryError: new Error('summary reporting query failed'),
    }))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.measurementState).toBe('unavailable')
    expect(summary.shareOfVoice).toBeNull()
    expect(summary.reporting).toEqual(expect.objectContaining({
      queryRows: 0, legacyRows: 0, attempted: 0, successful: 0,
      citedSuccessful: 0, shareOfVoice: null, measurementState: 'unavailable',
    }))
    // All-zero fields remain explicitly unavailable; they are never measured-empty evidence.
    expect(summary.reporting.measurementState).not.toBe('measured')
    expect(summary.summaryMode).toBe(true)
  })

  it('keeps valid reporting when only the latest-metadata read fails', async () => {
    const selections: Selected[] = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([measuredP11Row], selections, undefined, {
      latestError: new Error('latest query timeout'),
    }))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.reporting).toEqual(expect.objectContaining({
      queryRows: 1, attempted: 2, successful: 1, citedSuccessful: 1,
      measurementState: 'measured', shareOfVoice: 100,
    }))
    expect(summary.latest).toBeNull()
  })

  it('stays unavailable when both reporting and latest-metadata reads fail', async () => {
    const selections: Selected[] = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase([], selections, undefined, {
      primaryError: new Error('summary reporting query failed'),
      latestError: new Error('latest query timeout'),
    }))

    const summary = await loadVisibilityStatusSummary()

    expect(summary.measurementState).toBe('unavailable')
    expect(summary.shareOfVoice).toBeNull()
    expect(summary.reporting).toEqual(expect.objectContaining({
      queryRows: 0, attempted: 0, successful: 0, citedSuccessful: 0,
      shareOfVoice: null, measurementState: 'unavailable',
    }))
    expect(summary.latest).toBeNull()
    expect(mockRemediateVisibilityAudits).not.toHaveBeenCalled()
    for (const deepColumn of ['snippet', 'cited_urls', 'citation_classifications', 'brand_mentions']) {
      expect(selections.some((selection) => selection.columns.includes(deepColumn))).toBe(false)
    }
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
