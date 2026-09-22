/**
 * P1 measurement integrity — LLM audit failures are unavailable observations,
 * never genuine citation losses. RED-first contract for write + read paths.
 */

const mockGenerateContentText = jest.fn()
const mockCreateSupabaseAdminClient = jest.fn()
const mockRemediateVisibilityAudits = jest.fn()
const mockLoadPlansDashboard = jest.fn()

jest.mock('@/lib/contentAiProvider', () => ({
  generateContentText: (...args: unknown[]) => mockGenerateContentText(...args),
}))

jest.mock('@/lib/contentAiRegistry', () => ({
  COMMISSIONED_PROVIDERS: [
    { pin: 'deepseek-flash', isConfigured: () => false },
  ],
  LANE_DEFAULT_PIN: 'deepseek-flash',
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

import {
  aggregateEngineAudits,
  loadLlmVisibilityEvidence,
  loadVisibilityByCluster,
  loadVisibilityFeed,
  runFanOutVisibilityAudits,
  runVisibilityAudits,
  type EngineAudit,
} from '@/lib/seoEngine/llmVisibility'

type Filter = { kind: 'eq' | 'not'; column: string; op?: string; value: unknown }

type Resolver = (ctx: {
  table: string
  columns: string
  filters: Filter[]
  limit: number | null
}) => Array<Record<string, unknown>>

function hasAuditFailed(value: unknown): boolean {
  return Array.isArray(value) && value.includes('audit_failed')
}

function fakeSupabase(resolver: Resolver, inserts: Array<Record<string, unknown>> = []) {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          const filters: Filter[] = []
          const chain = {
            eq(column: string, value: unknown) {
              filters.push({ kind: 'eq', column, value })
              return chain
            },
            not(column: string, op: string, value: unknown) {
              filters.push({ kind: 'not', column, op, value })
              return chain
            },
            order() {
              return chain
            },
            async limit(limit: number) {
              let rows = resolver({ table, columns, filters, limit })
              for (const filter of filters) {
                if (filter.kind === 'eq') {
                  rows = rows.filter((row) => row[filter.column] === filter.value)
                } else if (filter.op === 'is' && filter.value === null) {
                  rows = rows.filter((row) => row[filter.column] != null)
                } else if (filter.op === 'ov' && String(filter.value).includes('audit_failed')) {
                  rows = rows.filter((row) => !hasAuditFailed(row[filter.column]))
                }
              }
              return { data: rows.slice(0, limit), error: null }
            },
          }
          return chain
        },
        async insert(row: Record<string, unknown>) {
          inserts.push(row)
          return { data: null, error: null }
        },
      }
    },
  }
}

const failedEngine = (engine = 'deepseek-flash'): EngineAudit => ({
  engine,
  model: null,
  ok: false,
  cited: false,
  citedUrls: [],
  competitorDomains: [],
  answerFormat: null,
  snippet: '',
  confidence: 0,
  flags: ['engine_error: provider unavailable'],
})

const successfulEngine = (cited: boolean, engine = 'deepseek-flash'): EngineAudit => ({
  engine,
  model: 'model',
  ok: true,
  cited,
  citedUrls: cited ? ['https://legal.yousafeconsultancy.com/ca/study-permit/'] : [],
  competitorDomains: cited ? [] : ['example.com'],
  answerFormat: 'direct_answer',
  snippet: cited ? 'YouSafe is cited.' : 'No estate citation.',
  confidence: 0.8,
  flags: [],
})

describe('P1 LLM audit failure accounting', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRemediateVisibilityAudits.mockResolvedValue([])
    mockLoadPlansDashboard.mockResolvedValue({
      plans: [{ cluster_id: 'ca-study', primary_term: 'study permit canada', related_terms: [], plan: {} }],
    })
  })

  it('treats an all-engine failure as unavailable, not 0% citation share', () => {
    const result = aggregateEngineAudits('study permit canada', [failedEngine()])
    expect(result.shareOfVoice).toBeNull()
    expect(result.measurementState).toBe('unavailable')
    expect(result.actions).toEqual([])
    expect(result.cited).toBe(false)
  })

  it('keeps partial engine failures out of the successful-engine denominator', () => {
    const result = aggregateEngineAudits('study permit canada', [
      successfulEngine(true, 'engine-a'),
      successfulEngine(false, 'engine-b'),
      failedEngine('engine-c'),
    ])
    expect(result.shareOfVoice).toBe(0.5)
    expect(result.measurementState).toBe('measured')
  })

  it('persists an empty/fallback provider failure as audit_failed with NULL share and no false remediation', async () => {
    const inserts: Array<Record<string, unknown>> = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => [], inserts))
    mockGenerateContentText.mockRejectedValue(new Error('provider down'))

    const result = await runVisibilityAudits({
      queries: ['study permit canada'],
      maxAudits: 1,
      maxEngines: 1,
    })

    expect(result.attempted).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.total).toBe(0)
    expect(result.shareOfVoice).toBeNull()
    expect(result.measurementState).toBe('unavailable')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].flags).toEqual(expect.arrayContaining(['audit_failed']))
    expect(inserts[0].share_of_voice).toBeNull()
    expect(mockRemediateVisibilityAudits).toHaveBeenCalledWith([])
  })

  it('keeps pre-P11 stored rows out of the P11 headline and remediation input', async () => {
    const rows = [
      { id: 'm1', query: 'study permit canada', fan_out: false, cited: true, share_of_voice: 1, flags: [], stage: 'visa' },
      { id: 'm2', query: 'student visa uk', fan_out: false, cited: false, share_of_voice: 0, flags: [], stage: 'visa' },
      { id: 'f1', query: 'engine outage query', fan_out: false, cited: false, share_of_voice: 0, flags: ['audit_failed'], stage: 'visa' },
    ]
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => rows))

    const feed = await loadVisibilityFeed(50)

    expect(feed.total).toBe(0)
    expect(feed.failed).toBe(0)
    expect(feed.attempted).toBe(0)
    expect(feed.cited).toBe(0)
    expect(feed.shareOfVoice).toBeNull()
    expect(feed.measurementState).toBe('unavailable')
    expect(mockRemediateVisibilityAudits).toHaveBeenCalledWith([])
  })

  it('keeps a pre-P11 failure-only feed outside the P11 denominator', async () => {
    const rows = [
      { id: 'f1', query: 'engine outage query', fan_out: false, cited: false, share_of_voice: 0, flags: ['audit_failed'] },
    ]
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => rows))

    const feed = await loadVisibilityFeed(50)

    expect(feed.total).toBe(0)
    expect(feed.failed).toBe(0)
    expect(feed.shareOfVoice).toBeNull()
    expect(feed.measurementState).toBe('unavailable')
    expect(mockRemediateVisibilityAudits).toHaveBeenCalledWith([])
  })

  it('topic evidence ignores a newer failed row and uses the newest measured observation', async () => {
    const rows = [
      { query: 'study permit canada', cited: false, share_of_voice: 0, flags: ['audit_failed'], top_competitor: null, competitor_share: null },
      { query: 'study permit canada', cited: true, share_of_voice: 1, flags: [], top_competitor: null, competitor_share: null },
    ]
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => rows))

    const evidence = await loadLlmVisibilityEvidence('study permit canada')

    expect(evidence).toEqual({ cited: 1, total: 1, shareOfVoice: 1, topCompetitorDomain: null, competitorShare: null })
  })

  it('topic evidence is unavailable when matching history contains only failed audits', async () => {
    const rows = [
      { query: 'study permit canada', cited: false, share_of_voice: 0, flags: ['audit_failed'], top_competitor: null, competitor_share: null },
    ]
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => rows))

    await expect(loadLlmVisibilityEvidence('study permit canada')).resolves.toBeNull()
  })

  it('fan-out execution excludes failed audits from cluster totals and persists them as unavailable', async () => {
    const inserts: Array<Record<string, unknown>> = []
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(() => [], inserts))
    mockGenerateContentText.mockRejectedValue(new Error('provider down'))

    const result = await runFanOutVisibilityAudits({ planLimit: 1, maxPerPlan: 2, maxAudits: 1 })

    expect(result.attempted).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.total).toBe(0)
    expect(result.shareOfVoice).toBeNull()
    expect(result.measurementState).toBe('unavailable')
    expect(result.byCluster).toEqual({})
    expect(inserts).toHaveLength(1)
    expect(inserts[0].flags).toEqual(expect.arrayContaining(['audit_failed']))
    expect(inserts[0].share_of_voice).toBeNull()
  })

  it('fan-out read evidence excludes audit_failed rows before the per-cluster denominator', async () => {
    const clusters = [{ cluster_id: 'ca-study', fan_out: true, flags: [] }]
    const rows = [
      { cluster_id: 'ca-study', fan_out: true, cited: false, flags: ['audit_failed'] },
      { cluster_id: 'ca-study', fan_out: true, cited: true, flags: [] },
    ]
    mockCreateSupabaseAdminClient.mockReturnValue(fakeSupabase(({ columns }) =>
      columns === 'cluster_id' ? clusters : rows,
    ))

    const byCluster = await loadVisibilityByCluster(12, 50)

    expect(byCluster).toEqual({ 'ca-study': { cited: 1, total: 1 } })
  })
})
