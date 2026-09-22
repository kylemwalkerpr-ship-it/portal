import fs from 'node:fs'
import path from 'node:path'

const mockGenerateContentText = jest.fn()
const mockCreateSupabaseAdminClient = jest.fn()
const mockRemediateVisibilityAudits = jest.fn()
const mockLoadPlansDashboard = jest.fn()
const mockLoadKnowledgeFeed = jest.fn()

jest.mock('@/lib/contentAiProvider', () => ({
  generateContentText: (...args: unknown[]) => mockGenerateContentText(...args),
}))

jest.mock('@/lib/contentAiRegistry', () => ({
  COMMISSIONED_PROVIDERS: [
    { pin: 'grok', isConfigured: () => false },
    { pin: 'deepseek-v41-flash', isConfigured: () => true },
  ],
  LANE_DEFAULT_PIN: 'grok',
  commissionedProvider: (pin: string) => ({ pin }),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => mockCreateSupabaseAdminClient(),
}))

jest.mock('@/lib/seoEngine/citationRemediation', () => ({
  remediateVisibilityAudits: (rows: unknown[]) => mockRemediateVisibilityAudits(rows),
}))

jest.mock('@/lib/seoEngine/planner', () => ({
  loadPlansDashboard: (...args: unknown[]) => mockLoadPlansDashboard(...args),
}))

jest.mock('@/lib/seoEngine/knowledge', () => ({
  loadKnowledgeFeed: (...args: unknown[]) => mockLoadKnowledgeFeed(...args),
}))

import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { P11_AUDIT_CONTRACT_VERSION, selectStrategicAuditTargets } from '@/lib/seoEngine/geoVisibilityTruth'
import { isAuthoritativeOwnershipRow, type OwnershipRow } from '@/lib/seoFactory/ownership'

const registryPath = path.join(process.cwd(), 'data/seo/ownership-registry.json')
const registryJson = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { rows?: OwnershipRow[] } | OwnershipRow[]
const registryRows: OwnershipRow[] = Array.isArray(registryJson) ? registryJson : registryJson.rows || []
const ownerByQuery = new Map(
  registryRows.filter(isAuthoritativeOwnershipRow).map((row) => [row.primary_keyword.toLowerCase(), row.owner_url]),
)

function fakeSupabase(inserts: Array<Record<string, unknown>>, legacyReads: jest.Mock) {
  return {
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ __table: table, ...row })
          return { data: null, error: null }
        },
        select: (...args: unknown[]) => {
          legacyReads(table, ...args)
          throw new Error('P11 default execution must not read adaptive planner/prior-audit pools')
        },
      }
    },
  }
}

function structuredAnswer(query: string) {
  const owner = ownerByQuery.get(query.toLowerCase())
  if (!owner) throw new Error(`test fixture has no authoritative owner for ${query}`)
  return JSON.stringify({
    answer: `Answer for ${query}`,
    answerFormat: 'direct_answer',
    sources: [{ url: owner, domain: new URL(owner).hostname, quote: 'owner evidence', position: 1 }],
    confidence: 0.9,
    flags: [],
  })
}

describe('P11 ownership-bound GEO execution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRemediateVisibilityAudits.mockResolvedValue([])
    mockLoadPlansDashboard.mockResolvedValue({ plans: [{ primary_term: 'forbidden adaptive query' }] })
    mockLoadKnowledgeFeed.mockResolvedValue({ items: [{ title: 'forbidden knowledge query' }] })
  })

  it('selects the bounded default cohort from authoritative ownership and records both commissioned provider attempts', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const legacyReads = jest.fn()
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(inserts, legacyReads))
    mockGenerateContentText.mockImplementation(async (args: { aiProvider?: string; prompt?: string }) => ({
      text: structuredAnswer(String(args.prompt || '')),
      provider: args.aiProvider,
      model: 'deepseek-flash',
    }))

    const expectedTargets = selectStrategicAuditTargets(registryRows, 5)
    const result = await runVisibilityAudits({ maxAudits: 5, maxEngines: 2 })

    expect(result.selected?.map((item) => item.query)).toEqual(expectedTargets.map((target) => target.query))
    expect(result.selected?.every((item) => item.source === 'ownership')).toBe(true)
    expect(mockLoadPlansDashboard).not.toHaveBeenCalled()
    expect(mockLoadKnowledgeFeed).not.toHaveBeenCalled()
    expect(legacyReads).not.toHaveBeenCalled()

    expect(mockGenerateContentText).toHaveBeenCalledTimes(5)
    expect(mockGenerateContentText.mock.calls.every(([args]) => (args as { aiProvider?: string }).aiProvider === 'deepseek-v41-flash')).toBe(true)
    expect(result.attempted).toBe(5)
    expect(result.total).toBe(5)
    expect(result.failed).toBe(0)
    expect(result.cited).toBe(5)
    expect(result.shareOfVoice).toBe(100)

    expect(inserts).toHaveLength(5)
    for (let i = 0; i < inserts.length; i += 1) {
      const row = inserts[i]
      const target = expectedTargets[i]
      expect(row.__table).toBe('seo_llm_visibility')
      expect(row.audit_contract_version).toBe(P11_AUDIT_CONTRACT_VERSION)
      expect(row.ownership_row_id).toBe(target.ownershipRowId)
      expect(row.query_family).toBe(target.queryFamily)
      expect(row.strategic_intent).toBe(target.strategicIntent)
      expect(row.authoritative_owner_url).toBe(target.authoritativeOwnerUrl)
      expect(row.prompt_id).toBe('p11-geo-citation-audit')
      expect(row.prompt_version).toBe('2026-09-22.1')
      expect(row.audit_status).toBe('success')
      expect(row.failure_reason).toBeNull()
      expect(row.cited).toBe(true)
      expect(row.share_of_voice).toBe(1)
      expect(row.coverage).toEqual(expect.objectContaining({
        attempted: 2,
        successful: 1,
        providerUnavailable: 1,
        providerFailure: 0,
        parseFailure: 0,
        successfulWithAuthoritativeCitation: 1,
        shareOfVoice: 1,
      }))
      expect(row.engines_json).toEqual(expect.arrayContaining([
        expect.objectContaining({ engine: 'grok', status: 'provider_unavailable', ok: false }),
        expect.objectContaining({ engine: 'deepseek-v41-flash', status: 'success', ok: true }),
      ]))
      expect(row.raw_cited_urls).toContain(target.authoritativeOwnerUrl)
      expect(row.normalized_cited_urls).toContain(target.authoritativeOwnerUrl)
      expect(row.citation_classifications).toEqual(expect.arrayContaining([
        expect.objectContaining({ classification: 'current_authoritative_owner' }),
      ]))
    }
  })

  it('blocks an explicit query with no authoritative strategic owner before any provider call', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const legacyReads = jest.fn()
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(inserts, legacyReads))

    const result = await runVisibilityAudits({
      queries: ['totally invented visa topic with no registered owner'],
      maxAudits: 1,
      maxEngines: 2,
    })

    expect(mockGenerateContentText).not.toHaveBeenCalled()
    expect(result.attempted).toBe(1)
    expect(result.total).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.shareOfVoice).toBeNull()
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toEqual(expect.objectContaining({
      audit_contract_version: P11_AUDIT_CONTRACT_VERSION,
      query: 'totally invented visa topic with no registered owner',
      ownership_row_id: null,
      authoritative_owner_url: null,
      audit_status: 'blocked',
      share_of_voice: null,
    }))
    expect(inserts[0].coverage).toEqual(expect.objectContaining({ attempted: 0, successful: 0, blocked: 1, shareOfVoice: null }))
  })

  it('persists parse failure separately from provider unavailability and never turns either into a no-citation success', async () => {
    const inserts: Array<Record<string, unknown>> = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(inserts, jest.fn()))
    const target = selectStrategicAuditTargets(registryRows, 1)[0]
    mockGenerateContentText.mockResolvedValue({
      text: `Malformed prose with recoverable ${target.authoritativeOwnerUrl}`,
      provider: 'deepseek-v41-flash',
      model: 'deepseek-flash',
    })

    const result = await runVisibilityAudits({ queries: [target.query], maxAudits: 1, maxEngines: 2 })

    expect(result.total).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.shareOfVoice).toBeNull()
    expect(inserts[0].audit_status).toBe('unknown')
    expect(inserts[0].share_of_voice).toBeNull()
    expect(inserts[0].coverage).toEqual(expect.objectContaining({
      attempted: 2,
      successful: 0,
      providerUnavailable: 1,
      parseFailure: 1,
      shareOfVoice: null,
    }))
    expect(inserts[0].raw_cited_urls).toContain(target.authoritativeOwnerUrl)
  })
})
