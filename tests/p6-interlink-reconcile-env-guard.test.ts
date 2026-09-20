/**
 * P6 final repair — reconciliation window / env hardening.
 *
 * `Number(process.env.INTERLINK_RECONCILE_*)` was NaN for any non-numeric
 * value and `slice(0, NaN)` silently disabled the whole pass forever (green
 * run, zero work). The finite-number guard now falls back to the safe default.
 *
 * Also pinned: a non-finalizing attempt only ever writes the additive
 * nullable `verification_attempted_at` marker on the exact planned tuple — it
 * can never be mistaken for a verdict/proof (no verified_at, no
 * verification_state, no evidence, no status/applied movement).
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  resolveReconcileNumber,
  type InterlinkReconciliationDeps,
  type StagedInterlinkRow,
} from '@/lib/seoFactory/interlinkReconciliation'
import { markInterlinkVerificationAttempt } from '@/lib/seoFactory/interlinkVerification'
import { createP6FakeDb, type P6FakeRow } from './helpers/p6InterlinkFakeDb'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

const SOURCE_A = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const SOURCE_B = 'https://legal.yousafeconsultancy.com/uk/student-visas/'
const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-09-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

const ENV_KEYS = [
  'INTERLINK_RECONCILE_MIN_AGE_MS',
  'INTERLINK_RECONCILE_COOLDOWN_MS',
  'INTERLINK_RECONCILE_MAX_SOURCES',
  'INTERLINK_RECONCILE_SCAN_LIMIT',
] as const

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  jest.resetModules()
})

function staged(overrides: Partial<StagedInterlinkRow> = {}): StagedInterlinkRow {
  return {
    id: 'row-1',
    sourceUrl: SOURCE_A,
    sourceJobId: JOB_A,
    verifiedAt: null,
    attemptedAt: null,
    updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
    ...overrides,
  }
}

describe('A) finite-number guard', () => {
  it.each([
    ['abc', 3, 3],
    ['', 3, 3],
    ['NaN', 3, 3],
    [undefined, 3, 3],
    [null, 3, 3],
    [Number.NaN, 3, 3],
    [Number.POSITIVE_INFINITY, 3, 3],
    ['7', 3, 7],
    [7.9, 3, 7],
    [0.5, 3, 0],
    [-5, 3, 0],
  ])('resolveReconcileNumber(%p, %p) → %p', (value, fallback, expected) => {
    expect(
      resolveReconcileNumber(value, fallback as number, { min: 0, integer: true }),
    ).toBe(expected)
  })

  it('garbage env values can never disable the pass (they fall back to the defaults)', async () => {
    process.env.INTERLINK_RECONCILE_MAX_SOURCES = 'not-a-number'
    process.env.INTERLINK_RECONCILE_SCAN_LIMIT = ''
    process.env.INTERLINK_RECONCILE_MIN_AGE_MS = 'NaN'
    process.env.INTERLINK_RECONCILE_COOLDOWN_MS = 'Infinity'
    jest.resetModules()
    const mod = await import('@/lib/seoFactory/interlinkReconciliation')

    expect(mod.INTERLINK_RECONCILE_MAX_SOURCES).toBe(3)
    expect(mod.INTERLINK_RECONCILE_SCAN_LIMIT).toBe(200)
    expect(mod.INTERLINK_RECONCILE_MIN_AGE_MS).toBe(30 * 60 * 1000)
    expect(mod.INTERLINK_RECONCILE_COOLDOWN_MS).toBe(20 * 60 * 60 * 1000)

    const verify = jest.fn(async () => ({
      ok: true,
      liveUrl: SOURCE_A,
      httpStatus: 200,
      verifiedAt: '2026-09-20T12:00:00.000Z',
      lineageVerified: true,
      publicationPhase: 'live_verified',
    })) as never
    const finalize = jest.fn(async () => ({
      sourceUrl: SOURCE_A,
      checked: 1,
      applied: 1,
      absent: 0,
      targetNotLive: 0,
      unverifiable: 0,
      sourceNotLive: 0,
      skipped: 0,
      dbErrors: 0,
      sourceFetchOk: true,
    })) as never
    const deps = {
      loadStagedRows: jest.fn(async (limit: number) =>
        [staged({ id: 'a' }), staged({ id: 'b', sourceUrl: SOURCE_B, sourceJobId: JOB_B })].slice(0, limit),
      ),
      verify,
      finalize,
      markAttempted: jest.fn(async () => ({ updated: 1 })),
      now: () => NOW,
    } as unknown as InterlinkReconciliationDeps

    const summary = await mod.reconcileStagedInterlinks(deps)

    // RED before the guard: `slice(0, NaN)` = an empty batch = a silently
    // disabled pass that still reports ok.
    expect(verify).toHaveBeenCalledTimes(2)
    expect(summary.applied).toBe(2)
    expect(summary.ok).toBe(true)
  })
})

describe('B) the attempt marker is additive and never a verdict/proof', () => {
  function installDb(rows: P6FakeRow[]) {
    const db = createP6FakeDb(rows)
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)
    return db
  }

  function attemptRow(overrides: Partial<P6FakeRow> = {}): P6FakeRow {
    return {
      id: 'row-1',
      status: 'planned',
      source_url: SOURCE_A,
      source_job_id: JOB_A,
      verified_at: null,
      verification_state: null,
      verification_evidence: null,
      applied_at: null,
      ...overrides,
    }
  }

  beforeEach(() => jest.clearAllMocks())

  it('writes ONLY verification_attempted_at for the exact planned job tuple', async () => {
    const db = installDb([attemptRow()])

    const result = await markInterlinkVerificationAttempt({
      sourceUrl: SOURCE_A,
      sourceJobId: JOB_A,
      now: new Date(NOW).toISOString(),
    })

    expect(result).toEqual({ updated: 1 })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].patch).toEqual({ verification_attempted_at: new Date(NOW).toISOString() })
    const [sourceFilter, jobFilter, statusFilter] = db.updates[0].filters
    expect(sourceFilter).toMatchObject({ op: 'in', column: 'source_url' })
    expect([...(sourceFilter.value as string[])].sort()).toEqual(
      [SOURCE_A, SOURCE_A.replace(/\/$/, '')].sort(),
    )
    expect(jobFilter).toEqual({ op: 'eq', column: 'source_job_id', value: JOB_A })
    expect(statusFilter).toEqual({ op: 'eq', column: 'status', value: 'planned' })
    const stored = db.rows[0]
    expect(stored.verification_attempted_at).toBe(new Date(NOW).toISOString())
    // No verdict / proof / lifecycle column may move.
    expect(stored.status).toBe('planned')
    expect(stored.applied_at).toBeNull()
    expect(stored.verified_at).toBeNull()
    expect(stored.verification_state).toBeNull()
    expect(stored.verification_evidence).toBeNull()
  })

  it('leaves a different job / applied row untouched (exact tuple only)', async () => {
    const db = installDb([
      attemptRow({ id: 'other-job', source_job_id: JOB_B }),
      attemptRow({ id: 'applied', status: 'applied', applied_at: '2026-09-01T00:00:00.000Z' }),
    ])

    const result = await markInterlinkVerificationAttempt({
      sourceUrl: SOURCE_A,
      sourceJobId: JOB_A,
      now: new Date(NOW).toISOString(),
    })

    expect(result.updated).toBe(0)
    expect(db.rows.every((row) => row.verification_attempted_at == null)).toBe(true)
  })

  it('refuses a malformed job id or a blank source instead of guessing', async () => {
    installDb([attemptRow()])

    expect(await markInterlinkVerificationAttempt({ sourceUrl: SOURCE_A, sourceJobId: 'plan-1' })).toEqual({
      updated: 0,
      error: expect.stringMatching(/exact sourceUrl and sourceJobId/i),
    })
    expect(await markInterlinkVerificationAttempt({ sourceUrl: '  ', sourceJobId: JOB_A })).toEqual({
      updated: 0,
      error: expect.stringMatching(/exact sourceUrl and sourceJobId/i),
    })
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('reports a marker DB-write failure truthfully instead of a silent zero', async () => {
    createSupabaseAdminClientMock.mockReturnValue({
      from: () => {
        const builder: Record<string, unknown> = {}
        for (const method of ['update', 'in', 'eq']) builder[method] = () => builder
        builder.select = () => builder
        builder.then = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'permission denied for table seo_interlinks' } }).then(
            resolve,
          )
        return builder
      },
    } as never)

    const result = await markInterlinkVerificationAttempt({
      sourceUrl: SOURCE_A,
      sourceJobId: JOB_A,
      now: new Date(NOW).toISOString(),
    })

    expect(result.updated).toBe(0)
    expect(result.error).toMatch(/permission denied/)
  })
})
