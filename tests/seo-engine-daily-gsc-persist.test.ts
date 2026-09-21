/**
 * P1A — the scheduled daily engine (`phase:'all'`) must refresh persisted GSC
 * query×page evidence exactly once per run, BEFORE the planner can consume it,
 * record window-end/sync evidence, and go `partial` with truthful phaseErrors
 * when measurement is unavailable or broken — without crashing other phases.
 */
import { POST } from '@/app/api/cron/seo-engine-daily/route'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { runRankingPassForPlans, attributizeOutcomes } from '@/lib/seoEngine/rankingModel'
import { loadForecastTracker } from '@/lib/seoEngine/forecastTracker'
import { persistGscQueryPageRows } from '@/lib/seoFactory/gscPersistence'
import type { InterlinkReconciliationSummary } from '@/lib/seoFactory/interlinkReconciliation'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = () => builder
      builder.maybeSingle = async () => ({ data: null, error: null })
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return builder
    },
  })),
}))

jest.mock('@/lib/seoEngine/knowledge', () => ({
  ingestKnowledge: jest.fn(),
  recordEngineRun: jest.fn(async () => ({ ok: true })),
  latestEngineRuns: jest.fn(async () => []),
}))

jest.mock('@/lib/seoEngine/planner', () => ({
  runPlanner: jest.fn(),
  loadPlansDashboard: jest.fn(async () => ({ plans: [] })),
}))

jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  runVisibilityAudits: jest.fn(),
}))

jest.mock('@/lib/seoEngine/engineAi', () => ({
  formatEnginePairTape: jest.fn(() => 'pair-tape'),
}))

jest.mock('@/lib/seoEngine/interlink', () => ({
  persistPlannerInterlinks: jest.fn(async () => ({ stored: 0, filtered: 0, errors: [] })),
}))

jest.mock('@/lib/seoEngine/rankingModel', () => ({
  runRankingPassForPlans: jest.fn(),
  attributizeOutcomes: jest.fn(),
}))

jest.mock('@/lib/seoEngine/forecastTracker', () => ({
  loadForecastTracker: jest.fn(),
}))

jest.mock('@/lib/seoEngine/titleLab', () => ({
  loadCalibrationHistory: jest.fn(async () => []),
  recalibrateTitleScorer: jest.fn(),
  TITLE_SCORER_WEIGHTS: {},
}))

jest.mock('@/lib/seoEngine/engineConfig', () => ({
  saveEngineConfig: jest.fn(async () => ({ ok: true })),
}))

jest.mock('@/lib/seoEngine/planEconomics', () => ({
  planEconomicsSummary: jest.fn(() => ({ revenueUsdMonthly: 0, estimatedPlans: 0, byAction: {} })),
}))

jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  fetchAhrefsSiteAudit: jest.fn(),
  persistAhrefsSnapshot: jest.fn(async () => ({ ok: true })),
}))

jest.mock('@/lib/seoFactory/gscPersistence', () => ({
  persistGscQueryPageRows: jest.fn(),
}))

// This suite's subject is scheduled GSC query×page persistence. The daily
// route also runs the real P6 interlink reconciliation on `phase:'all'`, which
// has its own dedicated suites (p6-interlink-reconciliation-cron.test.ts and
// the P6 reconciliation unit suites). Mock it here with a TRUTHFUL healthy
// no-op summary — typed against the real summary so a shape change is a
// compile error, not a silently "healthy" lie — so an unrelated (and
// intentionally minimal) Supabase mock can never turn these GSC assertions
// into an accidental partial run.
jest.mock('@/lib/seoFactory/interlinkReconciliation', () => ({
  reconcileStagedInterlinks: jest.fn(
    async (): Promise<InterlinkReconciliationSummary> => ({
      scannedRows: 0,
      stagedSources: 0,
      eligibleSources: 0,
      unavailable: false,
      unavailableReason: null,
      skippedYoung: 0,
      skippedCooldown: 0,
      skippedAttemptCooldown: 0,
      skippedInvalidSource: 0,
      skippedMissingJobIdentity: 0,
      missingJobIdentityRows: 0,
      missingJobIdentityError: null,
      verifiedLive: 0,
      notDeploymentProven: 0,
      verificationFailed: 0,
      verificationUnavailable: 0,
      finalized: 0,
      applied: 0,
      plannedVerdicts: 0,
      dbErrors: 0,
      attemptMarkerErrors: 0,
      remaining: 0,
      ok: true,
      errors: [],
      details: [],
    }),
  ),
}))

const ingest = ingestKnowledge as jest.Mock
const record = recordEngineRun as jest.Mock
const plan = runPlanner as jest.Mock
const visibility = runVisibilityAudits as jest.Mock
const rank = runRankingPassForPlans as jest.Mock
const rewards = attributizeOutcomes as jest.Mock
const tracker = loadForecastTracker as jest.Mock
const gscPersist = persistGscQueryPageRows as jest.Mock

const GSC_RANGE = { startDate: '2026-06-18', endDate: '2026-09-15', days: 90 }
const GSC_LIVE = {
  status: 'live',
  ok: true,
  rowsProcessed: 1234,
  range: GSC_RANGE,
  siteUrl: 'sc-domain:yousafeconsultancy.com',
  syncedAt: '2026-09-16T09:15:00.000Z',
  attemptedAt: '2026-09-16T09:14:58.000Z',
  warnings: [],
}

function primeSuccess(order: string[]) {
  ingest.mockImplementation(async () => {
    order.push('ingest')
    return {
      sourcesRun: 5,
      itemsFetched: 10,
      itemsStored: 8,
      aiSummarized: 0,
      skipped: 0,
      errors: [],
      aiErrors: [],
      perSource: [],
      pair: {},
    }
  })
  gscPersist.mockImplementation(async () => {
    order.push('gsc')
    return { ...GSC_LIVE }
  })
  plan.mockImplementation(async () => {
    order.push('planner')
    return { plans: [{}], pair: {} }
  })
  rank.mockResolvedValue({ computed: 5, topScores: [{ topic: 'x', total: 9.1 }] })
  rewards.mockResolvedValue({ events: 1, jobsConsidered: 2, jobsMatched: 1 })
  tracker.mockResolvedValue({ summary: { evaluated: 3, inFlight: 1, onTrackRate: 0.5 } })
  visibility.mockResolvedValue({ total: 2, cited: 1, failed: 0 })
}

function cronRequest(body: Record<string, unknown>) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'authorization' ? `Bearer ${process.env.CRON_SECRET}` : null,
    },
    json: async () => body,
  } as never
}

function lastRecordCall() {
  const calls = record.mock.calls
  return calls[calls.length - 1] as [string, string, Record<string, unknown>, string[]]
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-cron-secret'
  delete process.env.AHREFS_API_KEY
})

describe('seo-engine-daily phase all — scheduled GSC persistence', () => {
  it('syncs persisted GSC once per run BEFORE the planner and records window/sync evidence', async () => {
    const order: string[] = []
    primeSuccess(order)

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(gscPersist).toHaveBeenCalledTimes(1)
    expect(gscPersist.mock.calls[0][0]).toBeTruthy()
    expect(order).toContain('gsc')
    expect(order).toContain('planner')
    expect(order.indexOf('gsc')).toBeLessThan(order.indexOf('planner'))

    const [kind, status, summary] = lastRecordCall()
    expect(kind).toBe('daily')
    expect(status).toBe('success')
    expect(summary.gscPersistStatus).toBe('live')
    expect(summary.gscRowsProcessed).toBe(1234)
    expect(summary.gscWindowEnd).toBe('2026-09-15')
    expect(summary.gscSyncedAt).toBe('2026-09-16T09:15:00.000Z')
    expect(summary.gscAttemptedAt).toBe('2026-09-16T09:14:58.000Z')

    expect(body.gscPersistStatus).toBe('live')
    expect(body.gscRowsProcessed).toBe(1234)
    expect(body.gscWindowEnd).toBe('2026-09-15')
    expect(body.gscSyncedAt).toBe('2026-09-16T09:15:00.000Z')
    expect(body.gscAttemptedAt).toBe('2026-09-16T09:14:58.000Z')
  })

  it('records partial with a truthful phaseError when GSC is unavailable, and keeps other phases running', async () => {
    const order: string[] = []
    primeSuccess(order)
    gscPersist.mockImplementation(async () => {
      order.push('gsc')
      return {
        status: 'unavailable',
        ok: false,
        rowsProcessed: 0,
        range: GSC_RANGE,
        siteUrl: null,
        syncedAt: null,
        attemptedAt: '2026-09-16T09:15:00.000Z',
        warnings: ['GSC credentials not configured (set GSC_SERVICE_ACCOUNT_JSON or OAuth bundle)'],
      }
    })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(plan).toHaveBeenCalledTimes(1)
    expect(rank).toHaveBeenCalledTimes(1)

    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(summary.gscPersistStatus).toBe('unavailable')
    expect(summary.gscRowsProcessed).toBe(0)
    expect(summary.gscSyncedAt).toBeNull()
    expect(summary.gscAttemptedAt).toBe('2026-09-16T09:15:00.000Z')
    expect(errors.join(' ')).toMatch(/gsc-persist/)
    expect(errors.join(' ')).toMatch(/unavailable/)
    expect(body.gscPersistStatus).toBe('unavailable')
    expect(body.gscSyncedAt).toBeNull()
    expect(body.gscAttemptedAt).toBe('2026-09-16T09:15:00.000Z')
    expect((body.phaseErrors as string[]).join(' ')).toMatch(/gsc-persist/)
  })

  it('records partial with a truthful phaseError when the GSC sync throws, and keeps other phases running', async () => {
    const order: string[] = []
    primeSuccess(order)
    gscPersist.mockImplementation(async () => {
      order.push('gsc')
      throw new Error('GSC persist timeout')
    })

    await POST(cronRequest({ phase: 'all' }))

    expect(plan).toHaveBeenCalledTimes(1)
    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(summary.gscPersistStatus).toBe('failed')
    expect(summary.gscSyncedAt).toBeNull()
    expect(typeof summary.gscAttemptedAt).toBe('string')
    expect(errors.join(' ')).toMatch(/gsc-persist/)
    expect(errors.join(' ')).toMatch(/timeout/i)
  })

  it('keeps gscSyncedAt null when the persisted sync returns failed (no fresh sync evidence)', async () => {
    const order: string[] = []
    primeSuccess(order)
    gscPersist.mockImplementation(async () => {
      order.push('gsc')
      return {
        status: 'failed',
        ok: false,
        rowsProcessed: 0,
        range: GSC_RANGE,
        siteUrl: 'sc-domain:yousafeconsultancy.com',
        syncedAt: null,
        attemptedAt: '2026-09-16T09:15:00.000Z',
        warnings: [],
        error: 'upsert exploded',
      }
    })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(summary.gscPersistStatus).toBe('failed')
    expect(summary.gscSyncedAt).toBeNull()
    expect(summary.gscAttemptedAt).toBe('2026-09-16T09:15:00.000Z')
    expect(errors.join(' ')).toMatch(/upsert exploded/)
    expect(body.gscSyncedAt).toBeNull()
  })

  it('treats a live zero-row window as empty success — not unavailable, not demand=0', async () => {
    const order: string[] = []
    primeSuccess(order)
    gscPersist.mockImplementation(async () => {
      order.push('gsc')
      return { ...GSC_LIVE, status: 'empty', rowsProcessed: 0 }
    })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('success')
    expect(summary.gscPersistStatus).toBe('empty')
    expect(summary.gscRowsProcessed).toBe(0)
    expect(errors.join(' ')).not.toMatch(/gsc-persist/)
    expect(body.gscPersistStatus).toBe('empty')
  })

  it('records phase all as partial when reward attribution evidence is unavailable', async () => {
    const order: string[] = []
    primeSuccess(order)
    rewards.mockResolvedValue({
      events: 0,
      jobsConsidered: 223,
      jobsMatched: 0,
      duplicatesSkipped: 0,
      persistFailed: 0,
      unavailable: 'GSC attribution window timed out',
    })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>
    const [, status, , errors] = lastRecordCall()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/reward-attribution/)
    expect(errors.join(' ')).toMatch(/timed out/i)
    expect((body.phaseErrors as string[]).join(' ')).toMatch(/reward-attribution/)
  })

  it('records phase all as partial when any reward persistence write fails', async () => {
    const order: string[] = []
    primeSuccess(order)
    rewards.mockResolvedValue({
      events: 0,
      jobsConsidered: 223,
      jobsMatched: 1,
      duplicatesSkipped: 0,
      persistFailed: 1,
    })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>
    const [, status, , errors] = lastRecordCall()

    expect(body.ok).toBe(false)
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/reward-persist/)
  })

  it('does not run the persisted GSC sync for phase knowledge alone', async () => {
    const order: string[] = []
    primeSuccess(order)

    await POST(cronRequest({ phase: 'knowledge' }))

    expect(gscPersist).not.toHaveBeenCalled()
  })
})


describe('seo-engine-daily phase rewards — truthful reward availability', () => {
  it('keeps a genuine zero-evidence rewards pass successful', async () => {
    rewards.mockResolvedValue({
      events: 0,
      jobsConsidered: 223,
      jobsMatched: 0,
      duplicatesSkipped: 0,
      persistFailed: 0,
    })

    const res = await POST(cronRequest({ phase: 'rewards' }))
    const body = (await res.json()) as Record<string, unknown>
    const [kind, status, summary, errors] = lastRecordCall()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(kind).toBe('daily')
    expect(status).toBe('success')
    expect(summary.events).toBe(0)
    expect(summary.unavailable).toBeNull()
    expect(errors).toEqual([])
  })

  it('returns ok:false and records partial when reward attribution evidence is unavailable', async () => {
    rewards.mockResolvedValue({
      events: 0,
      jobsConsidered: 223,
      jobsMatched: 0,
      duplicatesSkipped: 0,
      persistFailed: 0,
      unavailable: 'GSC attribution window timed out',
    })

    const res = await POST(cronRequest({ phase: 'rewards' }))
    const body = (await res.json()) as Record<string, unknown>
    const [, status, summary, errors] = lastRecordCall()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(status).toBe('partial')
    expect(summary.unavailable).toBe('GSC attribution window timed out')
    expect(errors.join(' ')).toMatch(/reward-attribution/)
    expect(errors.join(' ')).toMatch(/timed out/i)
  })

  it('returns ok:false and records partial when any reward write fails', async () => {
    rewards.mockResolvedValue({
      events: 0,
      jobsConsidered: 223,
      jobsMatched: 1,
      duplicatesSkipped: 0,
      persistFailed: 1,
    })

    const res = await POST(cronRequest({ phase: 'rewards' }))
    const body = (await res.json()) as Record<string, unknown>
    const [, status, summary, errors] = lastRecordCall()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(status).toBe('partial')
    expect(summary.persistFailed).toBe(1)
    expect(errors.join(' ')).toMatch(/reward-persist/)
  })
})
