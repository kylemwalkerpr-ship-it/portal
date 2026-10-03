import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const mockGenerateContentText = jest.fn()
const mockCreateSupabaseAdminClient = jest.fn()
const mockRemediateVisibilityAudits = jest.fn()
const mockLoadPlansDashboard = jest.fn()
const mockLoadKnowledgeFeed = jest.fn()
let mockGrokConfigured = false
let mockDeepseekConfigured = true

jest.mock('@/lib/contentAiProvider', () => ({
  generateContentText: (...args: unknown[]) => mockGenerateContentText(...args),
}))

jest.mock('@/lib/contentAiRegistry', () => ({
  COMMISSIONED_PROVIDERS: [
    { pin: 'grok', isConfigured: () => mockGrokConfigured },
    { pin: 'deepseek-v41-flash', isConfigured: () => mockDeepseekConfigured },
  ],
  LANE_DEFAULT_PIN: 'grok',
  commissionedProvider: (pin: string) => ({ pin }),
}))

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdminClient: () => mockCreateSupabaseAdminClient(),
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

import { auditQuery, runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { runFanOutVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { executeP11AuditCommand, profileP11Actor } from '@/lib/seoEngine/p11AuditCommand'
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

function commandSupabase(tables: Record<string, Array<Record<string, any>>>) {
  let observationInsertAttempts = 0
  class Query {
    private action: 'select' | 'insert' | 'update' = 'select'
    private values: Record<string, any> | Record<string, any>[] = {}
    private filters: Array<[string, unknown]> = []
    private countOnly = false
    constructor(private table: string) {}
    insert(value: Record<string, any> | Record<string, any>[]) { this.action = 'insert'; this.values = value; return this }
    update(value: Record<string, any>) { this.action = 'update'; this.values = value; return this }
    select(_fields?: string, options?: { head?: boolean; count?: string }) {
      this.action = this.action === 'insert' || this.action === 'update' ? this.action : 'select'
      this.countOnly = options?.head === true
      return this
    }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
    maybeSingle() { return this.execute(true) }
    single() { return this.execute(true) }
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) { return this.execute(false).then(resolve, reject) }
    private async execute(single: boolean): Promise<any> {
      const rows = tables[this.table] || (tables[this.table] = [])
      if (this.action === 'insert') {
        const values = Array.isArray(this.values) ? this.values : [this.values]
        if (this.table === 'seo_llm_visibility') {
          observationInsertAttempts += values.length
          return { data: null, error: { code: 'XX000', message: 'simulated observation insert failure' }, count: null }
        }
        for (const value of values) {
          const duplicate = this.table === 'seo_llm_audit_commands'
            ? rows.some((row) => row.actor_scope === value.actor_scope && row.idempotency_key === value.idempotency_key)
            : this.table === 'seo_llm_audit_provider_claims'
              ? rows.some((row) => row.command_id === value.command_id && row.query_ordinal === value.query_ordinal && row.provider_pin === value.provider_pin)
              : false
          if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate durable key' }, count: null }
          rows.push({ id: randomUUID(), created_at: new Date().toISOString(), ...value })
        }
        return { data: single ? rows[rows.length - 1] : rows.slice(-values.length), error: null, count: null }
      }
      const matches = rows.filter((row) => this.filters.every(([key, value]) => row[key] === value))
      if (this.countOnly) return { data: null, count: matches.length, error: null }
      if (this.action === 'update') for (const row of matches) Object.assign(row, this.values)
      const result = this.action === 'update' ? matches : rows.filter((row) => this.filters.every(([key, value]) => row[key] === value))
      return { data: single ? result[0] || null : result, count: null, error: null }
    }
  }
  return { from: (table: string) => new Query(table), get observationInsertAttempts() { return observationInsertAttempts } }
}

describe('P11 ownership-bound GEO execution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGrokConfigured = false
    mockDeepseekConfigured = true
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

  it('uses successful provider attempts, not query rows, for the batch citation share', async () => {
    const inserts: Array<Record<string, unknown>> = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(inserts, jest.fn()))
    mockGrokConfigured = true
    const target = selectStrategicAuditTargets(registryRows, 1)[0]
    mockGenerateContentText.mockImplementation(async (args: { aiProvider?: string; prompt?: string }) => ({
      text: args.aiProvider === 'grok'
        ? JSON.stringify({ answer: 'Competitor answer', answerFormat: 'direct_answer', sources: [{ url: 'https://example.com/answer', domain: 'example.com', position: 1 }], confidence: 0.8, flags: [] })
        : structuredAnswer(String(args.prompt || '')),
      provider: args.aiProvider,
      model: String(args.aiProvider || 'model'),
    }))

    const result = await runVisibilityAudits({ queries: [target.query], maxAudits: 1, maxEngines: 2 })

    expect(result.total).toBe(1)
    expect(result.cited).toBe(1)
    expect(result.successfulProviderAttempts).toBe(2)
    expect(result.citedSuccessfulProviderAttempts).toBe(1)
    expect(result.shareOfVoice).toBe(50)
    expect(inserts[0].coverage).toEqual(expect.objectContaining({ successful: 2, citedSuccessful: 1, shareOfVoice: 0.5 }))
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

  it('keeps legacy non-command observation persistence best-effort', async () => {
    mockCreateSupabaseAdminClient.mockReturnValue({
      from: () => ({ insert: async () => ({ data: null, error: { message: 'legacy observation write failed' } }) }),
    })
    const result = await runVisibilityAudits({ queries: ['unowned legacy query'], maxAudits: 1 })
    expect(result.attempted).toBe(1)
    expect(result.failed).toBe(1)
    expect(mockGenerateContentText).not.toHaveBeenCalled()
  })

  it('claims and makes one unpinned fallback call, persisting the actual provider and model', async () => {
    mockGrokConfigured = false
    mockDeepseekConfigured = false
    const calls: unknown[] = []
    const command = {
      claimProvider: jest.fn(async (_ordinal: number, pin: string) => { calls.push(['claim', pin]); return true }),
      finishProviderClaim: jest.fn(async (_ordinal: number, pin: string, status: string, result: unknown) => { calls.push(['finish', pin, status, result]) }),
    }
    mockGenerateContentText.mockResolvedValue({
      text: JSON.stringify({ answer: 'Answer', answerFormat: 'direct_answer', sources: [{ url: 'https://example.com/a', domain: 'example.com', position: 1 }], confidence: 0.7, flags: [] }),
      provider: 'actual-provider', model: 'actual-model',
    })

    const result = await auditQuery('one fallback question', undefined, null, 2, command as any, 3)

    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
    const providerRequest = mockGenerateContentText.mock.calls[0][0] as Record<string, unknown>
    expect(providerRequest).not.toHaveProperty('aiProvider')
    expect(providerRequest).not.toHaveProperty('exclusive')
    expect(command.claimProvider).toHaveBeenCalledWith(3, 'lane-default-unpinned')
    expect(command.finishProviderClaim).toHaveBeenCalledWith(3, 'lane-default-unpinned', 'completed', expect.objectContaining({ engine: 'actual-provider', model: 'actual-model' }))
    expect(result.engines[0]).toMatchObject({ engine: 'actual-provider', model: 'actual-model' })
    expect(calls[0]).toEqual(['claim', 'lane-default-unpinned'])
  })

  it('does not call the unpinned provider when its durable logical claim already exists', async () => {
    mockGrokConfigured = false
    mockDeepseekConfigured = false
    const command = {
      claimProvider: jest.fn(async () => false),
      finishProviderClaim: jest.fn(),
    }
    await expect(auditQuery('one fallback question', undefined, null, 2, command as any, 0))
      .rejects.toThrow('Existing provider claim blocks invocation')
    expect(mockGenerateContentText).not.toHaveBeenCalled()
    expect(command.finishProviderClaim).not.toHaveBeenCalled()
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

  it('blocks a durable runVisibilityAudits command when its real observation insert fails, then retries as pending', async () => {
    const tables: Record<string, Array<Record<string, any>>> = {}
    const db = commandSupabase(tables)
    mockCreateSupabaseAdminClient.mockReturnValue(db)
    const target = selectStrategicAuditTargets(registryRows, 1)[0]
    mockGenerateContentText.mockImplementation(async (args: { aiProvider?: string; prompt?: string }) => ({
      text: structuredAnswer(String(args.prompt || '')),
      provider: args.aiProvider,
      model: 'deepseek-flash',
    }))
    const actor = profileP11Actor('profile-observation')
    const request = { queries: [target.query], maxAudits: 1, maxEngines: 2 }
    const runner = jest.fn((command: any) => runVisibilityAudits({ ...request, command }))

    await expect(executeP11AuditCommand({ actor, idempotencyKey: 'observation-failure-run', request, run: runner }))
      .rejects.toThrow('Observation persistence failed; provider claims prevent automatic reinvocation')
    expect(tables.seo_llm_audit_provider_claims).toHaveLength(1)
    expect(tables.seo_llm_audit_provider_claims[0].status).toBe('completed')
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
    expect(db.observationInsertAttempts).toBe(1)

    const retryRunner = jest.fn((command: any) => runVisibilityAudits({ ...request, command }))
    const retry = await executeP11AuditCommand({ actor, idempotencyKey: 'observation-failure-run', request, run: retryRunner })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(retryRunner).not.toHaveBeenCalled()
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
  })

  it('blocks a durable runFanOutVisibilityAudits command when its real observation insert fails, then retries as pending', async () => {
    const tables: Record<string, Array<Record<string, any>>> = {}
    const db = commandSupabase(tables)
    mockCreateSupabaseAdminClient.mockReturnValue(db)
    mockLoadPlansDashboard.mockResolvedValue({ plans: [{
      cluster_id: 'test-cluster',
      primary_term: 'test visa query',
      plan: { faq: ['How does this test visa process work?'] },
      related_terms: [],
    }] })
    mockGenerateContentText.mockResolvedValue({
      text: JSON.stringify({ answer: 'A direct answer', answerFormat: 'direct_answer', sources: [], confidence: 0.8, flags: [] }),
      provider: 'deepseek-v41-flash',
      model: 'deepseek-flash',
    })
    const actor = profileP11Actor('profile-fanout-observation')
    const request = { fanOut: true, planLimit: 1, maxPerPlan: 2, maxAudits: 1 }
    const runner = jest.fn((command: any) => runFanOutVisibilityAudits({ ...request, command }))

    await expect(executeP11AuditCommand({ actor, idempotencyKey: 'fanout-observation-failure', request, run: runner }))
      .rejects.toThrow('Observation persistence failed; provider claims prevent automatic reinvocation')
    expect(mockLoadPlansDashboard).toHaveBeenCalledTimes(1)
    expect(tables.seo_llm_audit_provider_claims).toHaveLength(1)
    expect(tables.seo_llm_audit_provider_claims[0]).toMatchObject({ query_ordinal: 0, status: 'completed' })
    expect(tables.seo_llm_audit_commands[0].status).toBe('blocked_indeterminate')
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
    expect(db.observationInsertAttempts).toBe(1)

    const retryRunner = jest.fn((command: any) => runFanOutVisibilityAudits({ ...request, command }))
    const retry = await executeP11AuditCommand({ actor, idempotencyKey: 'fanout-observation-failure', request, run: retryRunner })
    expect(retry).toMatchObject({ kind: 'pending', command: { status: 'blocked_indeterminate' } })
    expect(retryRunner).not.toHaveBeenCalled()
    expect(mockLoadPlansDashboard).toHaveBeenCalledTimes(1)
    expect(mockGenerateContentText).toHaveBeenCalledTimes(1)
  })
})
