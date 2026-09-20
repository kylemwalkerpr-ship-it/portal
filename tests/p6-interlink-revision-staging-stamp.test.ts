/**
 * P6 final repair — M1: cooldown is driven by the durable STAGING/REVISION
 * timestamp, not by `updated_at`.
 *
 * Production has a BEFORE UPDATE trigger that always sets `updated_at = now()`,
 * which is later than every app-written verdict/attempt timestamp. The old
 * reconciler compared `verified_at >= updated_at`, so the cooldown was
 * structurally dead. This suite wires the REAL staging writer to a fake DB
 * that emulates that trigger, then feeds the stored row to the REAL
 * reconciler:
 *   · a verdict/attempt inside the current revision still cools down even
 *     though the trigger stamped updated_at later;
 *   · an old verdict/attempt before a NEW staged_at never suppresses the
 *     reship;
 *   · a same-source/same-job idempotent no-op does not reset staged_at.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoEngine/planner', () => ({
  bestCellForTerm: jest.fn(() => ({ stage: 'schools', country: 'US', score: 0.9 })),
  MIN_CELL_MATCH_SCORE: 0.5,
  plannerClusterId: jest.fn(() => 'seo-us-schools-f1-checklist'),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import { stageEngineInterlinksForVerification } from '@/lib/seoFactory/interlinkVerification'
import {
  reconcileStagedInterlinks,
  type StagedInterlinkRow,
} from '@/lib/seoFactory/interlinkReconciliation'
import { createP6FakeDb, type P6FakeRow } from './helpers/p6InterlinkFakeDb'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

const CANONICAL = 'https://market.yousafeconsultancy.com/articles/f1-checklist/'
const LIVE_TARGET = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'
const T0 = Date.parse('2026-09-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

const VERIFY_PROVEN = {
  ok: true,
  liveUrl: CANONICAL,
  httpStatus: 200,
  verifiedAt: new Date(T0).toISOString(),
  lineageVerified: true,
  publicationPhase: 'live_verified',
} as never

const FINALIZED = {
  sourceUrl: CANONICAL,
  checked: 1,
  applied: 1,
  absent: 0,
  targetNotLive: 0,
  unverifiable: 0,
  sourceNotLive: 0,
  skipped: 0,
  dbErrors: 0,
  sourceFetchOk: true,
}

let clock = T0
let db: ReturnType<typeof createP6FakeDb>

function seedRow(overrides: Partial<P6FakeRow> = {}): P6FakeRow {
  return {
    id: 'row-1',
    source_slug: 'seo-us-schools-f1-checklist',
    target_url: LIVE_TARGET,
    status: 'planned',
    applied_at: null,
    source_url: null,
    source_job_id: null,
    staged_at: null,
    verification_state: null,
    verified_at: null,
    verification_evidence: null,
    verification_attempted_at: null,
    ...overrides,
  }
}

function stage(jobId: string | null) {
  return stageEngineInterlinksForVerification({
    canonicalUrl: CANONICAL,
    jobId,
    primaryKeyword: 'f1 checklist',
    body: `See the [US student visa guide](${LIVE_TARGET}).`,
  })
}

/** Loader projection of the fake DB (emulating the real column mapping). */
async function loadStaged(limit: number): Promise<StagedInterlinkRow[]> {
  return db.rows
    .filter((row) => row.status === 'planned' && row.source_url && row.source_job_id)
    .slice(0, limit)
    .map((row) => ({
      id: row.id as string,
      sourceUrl: (row.source_url as string | null) ?? null,
      sourceJobId: (row.source_job_id as string | null) ?? null,
      verifiedAt: (row.verified_at as string | null) ?? null,
      attemptedAt: (row.verification_attempted_at as string | null) ?? null,
      stagedAt: (row.staged_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    }))
}

function harness() {
  const verify = jest.fn(async () => VERIFY_PROVEN)
  const finalize = jest.fn(async () => ({ ...FINALIZED }))
  const markAttempted = jest.fn(async () => ({ updated: 1 }))
  return {
    verify,
    finalize,
    markAttempted,
    deps: {
      loadStagedRows: jest.fn(loadStaged),
      verify,
      finalize,
      markAttempted,
      now: () => clock,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  clock = T0
  db = createP6FakeDb([seedRow()], { now: () => clock })
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
})

describe('A) the staging write records the revision stamp', () => {
  it('writes staged_at with source_url/source_job_id and the trigger pushes updated_at later', async () => {
    const result = await stage(JOB_A)

    expect(result.staged).toBe(1)
    expect(typeof db.rows[0].staged_at).toBe('string')
    expect(db.rows[0].source_job_id).toBe(JOB_A)
    // The emulated BEFORE UPDATE trigger stamped updated_at = now() in the
    // same update — the production condition that broke the old cooldown.
    expect(db.rows[0].updated_at).toBe(new Date(T0).toISOString())
  })

  it('a same-source/same-job idempotent no-op does NOT reset staged_at', async () => {
    await stage(JOB_A)
    const stamp = db.rows[0].staged_at
    const writesAfterFirst = db.updates.length

    clock = T0 + 5 * HOUR
    const second = await stage(JOB_A)

    expect(second.staged).toBe(1)
    expect(db.updates.length).toBe(writesAfterFirst)
    expect(db.rows[0].staged_at).toBe(stamp)
    // The DB trigger only runs when a row is actually written.
    expect(db.rows[0].updated_at).toBe(new Date(T0).toISOString())
  })

  it('a rebind to a new exact job moves staged_at forward (new revision)', async () => {
    await stage(JOB_A)
    const firstStamp = db.rows[0].staged_at

    clock = T0 + 5 * HOUR
    const rebind = await stage(JOB_B)

    expect(rebind.rebounded).toBe(1)
    expect(db.rows[0].source_job_id).toBe(JOB_B)
    const rebindPatch = db.updates[db.updates.length - 1].patch
    expect(rebindPatch.staged_at).not.toBe(firstStamp)
    expect(Number.isFinite(Date.parse(String(rebindPatch.staged_at)))).toBe(true)
    expect(db.rows[0].staged_at).toBe(rebindPatch.staged_at)
  })
})

describe('B) cooldown survives a trigger-later updated_at', () => {
  it('cools down a current-revision verdict even though updated_at is later', async () => {
    await stage(JOB_A)
    // Pin the revision stamp to a deterministic instant (the staging writer
    // uses wall-clock now; this suite drives the reconciler's fake clock).
    db.rows[0].staged_at = new Date(T0).toISOString()
    // Verdict written inside the current revision, then another DB update
    // (e.g. the attempt marker) pushes updated_at AFTER the verdict.
    db.rows[0].verified_at = new Date(T0 + HOUR).toISOString()
    db.rows[0].updated_at = new Date(T0 + 2 * HOUR).toISOString()
    clock = T0 + 3 * HOUR

    const h = harness()
    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedCooldown).toBe(1)
    expect(summary.eligibleSources).toBe(0)
  })

  it('cools down a current-revision attempt even though updated_at is later', async () => {
    await stage(JOB_A)
    db.rows[0].staged_at = new Date(T0).toISOString()
    db.rows[0].verification_attempted_at = new Date(T0 + HOUR).toISOString()
    db.rows[0].updated_at = new Date(T0 + 2 * HOUR).toISOString()
    clock = T0 + 3 * HOUR

    const h = harness()
    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedAttemptCooldown).toBe(1)
  })
})

describe('C) an older revision can never suppress the reship', () => {
  it('re-verifies when the verdict predates a new staged_at (rebind)', async () => {
    await stage(JOB_A)
    db.rows[0].staged_at = new Date(T0).toISOString()
    db.rows[0].verified_at = new Date(T0 - 30 * HOUR).toISOString()
    db.rows[0].verification_attempted_at = new Date(T0 - 30 * HOUR).toISOString()
    db.rows[0].updated_at = new Date(T0 - 30 * HOUR).toISOString()

    clock = T0 + 5 * HOUR
    await stage(JOB_B)
    // Pin the NEW revision stamp so the reconcile clock is deterministic.
    db.rows[0].staged_at = new Date(T0 + 5 * HOUR).toISOString()
    clock = T0 + 6 * HOUR

    const h = harness()
    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledWith({ canonicalUrl: CANONICAL, jobId: JOB_B })
    expect(summary.skippedCooldown).toBe(0)
    expect(summary.skippedAttemptCooldown).toBe(0)
    expect(summary.finalized).toBe(1)
  })
})
