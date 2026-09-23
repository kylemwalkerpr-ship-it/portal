import fs from 'node:fs'
import path from 'node:path'

import {
  aggregateP11VisibilityReport,
  type P11VisibilityReportRow,
} from '@/lib/seoEngine/llmVisibility'

const coverage = (over: Record<string, unknown> = {}) => ({
  attempted: 2,
  successful: 1,
  providerUnavailable: 0,
  providerFailure: 0,
  parseFailure: 0,
  blocked: 0,
  unknown: 0,
  citedSuccessful: 0,
  successfulWithAuthoritativeCitation: 0,
  successfulWithOtherCurrentYouSafeCitation: 0,
  successfulWithWrongOrRetiredYouSafeCitation: 0,
  successfulWithCompetitorCitation: 0,
  successfulWithNoExtractableCitation: 1,
  distinctCurrentYouSafeUrls: [],
  distinctCompetitorDomains: [],
  shareOfVoice: 0,
  ...over,
})
const rows: P11VisibilityReportRow[] = [
  {
    audit_contract_version: 'p11-geo-v1', ownership_row_id: 1,
    audit_status: 'success', stage: 'visa', created_at: '2026-09-22T01:00:00Z',
    coverage: coverage({
      providerUnavailable: 1,
      citedSuccessful: 1,
      successfulWithAuthoritativeCitation: 1,
      successfulWithCompetitorCitation: 1,
      successfulWithNoExtractableCitation: 0,
      shareOfVoice: 1,
    }),
  },
  {
    audit_contract_version: 'p11-geo-v1', ownership_row_id: 28,
    audit_status: 'success', stage: 'visa', created_at: '2026-09-22T02:00:00Z',
    coverage: coverage({
      parseFailure: 1,
      successfulWithOtherCurrentYouSafeCitation: 1,
      successfulWithWrongOrRetiredYouSafeCitation: 1,
      shareOfVoice: 0,
    }),
  },
  {
    audit_contract_version: 'p11-geo-v1', ownership_row_id: null,
    audit_status: 'blocked', stage: null, created_at: '2026-09-22T03:00:00Z',
    coverage: coverage({ attempted: 0, successful: 0, blocked: 1, successfulWithNoExtractableCitation: 0, shareOfVoice: null }),
  },
]
describe('P11 GEO visibility reporting', () => {
  it('uses successful provider attempts as the only citation denominator and keeps failures visible', () => {
    const report = aggregateP11VisibilityReport(rows, { legacyRows: 267, authoritativeOwnerCount: 67 })
    expect(report).toEqual(expect.objectContaining({
      contractVersion: 'p11-geo-v1', queryRows: 3, attempted: 4, successful: 2,
      providerUnavailable: 1, providerFailure: 0, parseFailure: 1, blocked: 1, unknown: 0,
      citedSuccessful: 1, shareOfVoice: 50, measurementState: 'measured', legacyRows: 267,
      auditedAuthoritativeOwners: 2, authoritativeOwnerCount: 67,
    }))
    expect(report.successfulWithAuthoritativeCitation).toBe(1)
    expect(report.successfulWithOtherCurrentYouSafeCitation).toBe(1)
    expect(report.successfulWithWrongOrRetiredYouSafeCitation).toBe(1)
    expect(report.successfulWithCompetitorCitation).toBe(1)
    expect(report.successfulWithNoExtractableCitation).toBe(1)
    expect(report.ownerCoveragePercent).toBe(3)
  })

  it('returns null share when zero provider attempts succeeded', () => {
    const report = aggregateP11VisibilityReport([{
      audit_contract_version: 'p11-geo-v1', ownership_row_id: 1, audit_status: 'provider_unavailable',
      stage: 'visa', created_at: '2026-09-22T01:00:00Z',
      coverage: coverage({ attempted: 2, successful: 0, providerUnavailable: 2, successfulWithNoExtractableCitation: 0, shareOfVoice: null }),
    }], { legacyRows: 267, authoritativeOwnerCount: 67 })
    expect(report.successful).toBe(0)
    expect(report.shareOfVoice).toBeNull()
    expect(report.measurementState).toBe('unavailable')
  })
  it('requires status and admin surfaces to name the P11 successful-attempt denominator and legacy separation', () => {
    const status = fs.readFileSync(path.join(process.cwd(), 'app/api/seo-engine/status/route.ts'), 'utf8')
    const admin = fs.readFileSync(path.join(process.cwd(), 'components/design/admin-seo-engine.tsx'), 'utf8')
    expect(status).toContain('loadVisibilityStatusSummary')
    expect(status).not.toContain('loadVisibilityFeed(')
    expect(status).toContain('reporting')
    expect(admin).toContain('successful provider attempts')
    expect(admin).toContain('authoritative owners audited')
    expect(admin).toContain('legacy rows separate')
    expect(admin).toContain('provider unavailable')
    expect(admin).toContain('parse failure')
  })
})
