/**
 * P6 (supervisor review repair) — durable finalization is wired to the
 * existing scheduled cron surface, and planner/verifier status semantics stay
 * truthful:
 *   · phase 'interlinks' runs the bounded reconciliation pass;
 *   · phase 'all' includes it after the other phases;
 *   · a pending deployment / filtered dead target is benign truth (run stays
 *     green, no phase error);
 *   · verifier-unavailable / DB-write failures are real phase errors (partial),
 *     so the GitHub workflow can still fail a genuinely degraded run.
 */
import { POST } from '@/app/api/cron/seo-engine-daily/route'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { runRankingPassForPlans, attributizeOutcomes } from '@/lib/seoEngine/rankingModel'
import { loadForecastTracker } from '@/lib/seoEngine/forecastTracker'
import { persistGscQueryPageRows } from '@/lib/seoFactory/gscPersistence'
import { persistPlannerInterlinks } from '@/lib/seoEngine/interlink'
import { reconcileStagedInterlinks } from '@/lib/seoFactory/interlinkReconciliation'

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
jest.mock('@/lib/seoEngine/llmVisibility', () => ({ runVisibilityAudits: jest.fn() }))
jest.mock('@/lib/seoEngine/engineAi', () => ({ formatEnginePairTape: jest.fn(() => 'pair-tape') }))
jest.mock('@/lib/seoEngine/interlink', () => ({ persistPlannerInterlinks: jest.fn() }))
jest.mock('@/lib/seoEngine/rankingModel', () => ({
  runRankingPassForPlans: jest.fn(),
  attributizeOutcomes: jest.fn(),
}))
jest.mock('@/lib/seoEngine/forecastTracker', () => ({ loadForecastTracker: jest.fn() }))
jest.mock('@/lib/seoEngine/titleLab', () => ({
  loadCalibrationHistory: jest.fn(async () => []),
  recalibrateTitleScorer: jest.fn(),
  TITLE_SCORER_WEIGHTS: {},
}))
jest.mock('@/lib/seoEngine/engineConfig', () => ({ saveEngineConfig: jest.fn(async () => ({ ok: true })) }))
jest.mock('@/lib/seoEngine/planEconomics', () => ({
  planEconomicsSummary: jest.fn(() => ({ revenueUsdMonthly: 0, estimatedPlans: 0, byAction: {} })),
}))
jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  fetchAhrefsSiteAudit: jest.fn(),
  persistAhrefsSnapshot: jest.fn(async () => ({ ok: true })),
}))
jest.mock('@/lib/seoFactory/gscPersistence', () => ({ persistGscQueryPageRows: jest.fn() }))
jest.mock('@/lib/seoFactory/interlinkReconciliation', () => ({
  reconcileStagedInterlinks: jest.fn(),
}))

const ingest = ingestKnowledge as jest.Mock
const record = recordEngineRun as jest.Mock
const plan = runPlanner as jest.Mock
const visibility = runVisibilityAudits as jest.Mock
const rank = runRankingPassForPlans as jest.Mock
const rewards = attributizeOutcomes as jest.Mock
const tracker = loadForecastTracker as jest.Mock
const gscPersist = persistGscQueryPageRows as jest.Mock
const persistInterlinks = persistPlannerInterlinks as jest.Mock
const reconcile = reconcileStagedInterlinks as jest.Mock

const PENDING_RECONCILE = {
  scannedRows: 4,
  stagedSources: 2,
  eligibleSources: 2,
  unavailable: false,
  unavailableReason: null,
  skippedYoung: 0,
  skippedCooldown: 0,
  skippedInvalidSource: 0,
  skippedMissingJobIdentity: 3,
  verifiedLive: 1,
  // Deployment not observable yet for the other source — benign truth.
  verificationFailed: 1,
  verificationUnavailable: 0,
  finalized: 1,
  applied: 1,
  plannedVerdicts: 0,
  dbErrors: 0,
  remaining: 0,
  ok: true,
  errors: [],
  details: [],
}

function prime(overrides: Partial<typeof PENDING_RECONCILE> = {}) {
  ingest.mockResolvedValue({
    sourcesRun: 4,
    itemsFetched: 8,
    itemsStored: 6,
    aiSummarized: 0,
    skipped: 0,
    errors: [],
    aiErrors: [],
    perSource: [],
    pair: {},
  })
  gscPersist.mockResolvedValue({
    status: 'live',
    ok: true,
    rowsProcessed: 10,
    range: { startDate: '2026-06-18', endDate: '2026-09-15', days: 90 },
    siteUrl: 'sc-domain:yousafeconsultancy.com',
    syncedAt: '2026-09-20T09:15:00.000Z',
    attemptedAt: '2026-09-20T09:14:58.000Z',
    warnings: [],
  })
  plan.mockResolvedValue({ plans: [{}], pair: {} })
  rank.mockResolvedValue({ computed: 1, topScores: [] })
  rewards.mockResolvedValue({ events: 0, jobsConsidered: 0, jobsMatched: 0, persistFailed: 0 })
  tracker.mockResolvedValue({ summary: { evaluated: 0, inFlight: 0, onTrackRate: 0 } })
  visibility.mockResolvedValue({ total: 0, cited: 0, failed: 0 })
  persistInterlinks.mockResolvedValue({ stored: 0, filtered: 0, errors: [] })
  reconcile.mockResolvedValue({ ...PENDING_RECONCILE, ...overrides })
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
  prime()
})

describe('phase interlinks — bounded durable reconciliation', () => {
  it('runs the reconciliation pass and reports its truthful summary', async () => {
    const res = await POST(cronRequest({ phase: 'interlinks' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.phase).toBe('interlinks')
    expect(body.interlinkReconcile).toMatchObject({ applied: 1, finalized: 1, verificationFailed: 1 })

    const [, status, summary] = lastRecordCall()
    expect(status).toBe('success')
    expect(summary.interlinkApplied).toBe(1)
    expect(summary.interlinkVerificationPending).toBe(1)
    expect(summary.interlinkSkippedMissingJobIdentity).toBe(3)
  })

  it('is a real partial error (never silent) when the verifier or DB writes fail', async () => {
    prime({ ok: false, verificationUnavailable: 1, applied: 0, errors: ['live verification unavailable for x'] })

    const res = await POST(cronRequest({ phase: 'interlinks' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.ok).toBe(false)
    const [, status, , errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/live verification unavailable/)
  })

  it('surfaces the pre-migration state explicitly without turning the run red', async () => {
    prime({ unavailable: true, unavailableReason: 'column seo_interlinks.source_url does not exist' })

    const res = await POST(cronRequest({ phase: 'interlinks' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect((body.interlinkReconcile as Record<string, unknown>).unavailable).toBe(true)
    const [, status, summary] = lastRecordCall()
    expect(status).toBe('success')
    expect(summary.interlinkUnavailable).toBe(true)
    expect(summary.interlinkUnavailableReason).toMatch(/does not exist/)
  })
})

describe('phase all — the daily run is the durable post-deploy opportunity', () => {
  it('runs reconciliation inside the daily pass and stays green for benign pending truth', async () => {
    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.interlinkReconcile).toMatchObject({ applied: 1, verificationFailed: 1 })
    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('success')
    expect(summary.interlinkReconcile).toMatchObject({ applied: 1, skippedMissingJobIdentity: 3 })
    expect(errors.join(' ')).not.toMatch(/interlink-reconcile/)
    expect((body.phaseErrors as string[]).join(' ')).not.toMatch(/interlink-reconcile/)
  })

  it('records partial with a truthful phase error when reconciliation really fails', async () => {
    prime({ ok: false, dbErrors: 1, errors: ['interlink finalization error for x: db exploded'] })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.ok).toBe(false)
    const [, status, , errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/interlink-reconcile/)
    expect(errors.join(' ')).toMatch(/db exploded/)
  })

  it('keeps a throwing reconciliation pass visible instead of crashing the daily run', async () => {
    reconcile.mockRejectedValue(new Error('reconcile exploded'))

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.ok).toBe(false)
    const [, status, , errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/interlink-reconcile: reconcile exploded/)
  })
})

describe('phase all — planner persistence status semantics', () => {
  it('reports filtered dead targets as truthful hygiene, not a phase error', async () => {
    persistInterlinks.mockResolvedValue({ stored: 2, filtered: 5, errors: [] })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.ok).toBe(true)
    expect(body.interlinksStored).toBe(2)
    expect(body.interlinksFiltered).toBe(5)
    const [, status, summary, errors] = lastRecordCall()
    expect(status).toBe('success')
    expect(summary.interlinksFiltered).toBe(5)
    expect(errors.join(' ')).not.toMatch(/interlinks:/)
    expect(body.phaseErrors).toEqual([])
  })

  it('keeps a verifier-unavailable planner failure as a real phase error', async () => {
    persistInterlinks.mockResolvedValue({ stored: 0, filtered: 0, errors: ['seo-x: verifier down'] })

    const res = await POST(cronRequest({ phase: 'all' }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.ok).toBe(false)
    const [, status, , errors] = lastRecordCall()
    expect(status).toBe('partial')
    expect(errors.join(' ')).toMatch(/interlinks: seo-x: verifier down/)
  })
})
