/**
 * P6 (supervisor follow-up repair) — durable post-deploy finalization is
 * JOB-BOUND.
 *
 * Reviewer blocker: the durable reconciler called
 * `verifyLiveUrl({ canonicalUrl })` WITHOUT `jobId`, which puts verifyLiveUrl
 * on its legacy/uncontracted path and bypasses
 * `reconcilePublicationDeployment` / official deployment lineage.
 *
 * Contract pinned here on the real reconciliation module:
 *   · only planned rows with a durable source_url AND exact source_job_id are
 *     attempted; sources are grouped by exact (source_url, source_job_id) —
 *     never by source_url alone;
 *   · verifyLiveUrl is called with BOTH the exact canonicalUrl and the exact
 *     staged jobId, and only an ok=true verdict may finalize;
 *   · finalization is job-bound (exact sourceJobId) and stays planned-only;
 *   · rows without a valid job identity are skipped as unresolved with a
 *     truthful count and are NEVER verified/finalized through a legacy path;
 *   · deployment_pending (ok=false) is benign truth; a verifier throw /
 *     DB-write failure is a real error; the pass stays bounded and idempotent.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isSchemaUnavailable,
  reconcileStagedInterlinks,
  type StagedInterlinkRow,
} from '@/lib/seoFactory/interlinkReconciliation'

const SOURCE_A = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const SOURCE_B = 'https://legal.yousafeconsultancy.com/uk/student-visas/'
const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-09-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

/**
 * A live verdict with POSITIVE official deployment-lineage proof — the only
 * thing that may auto-finalize (exact job id is necessary but not sufficient).
 */
const VERIFY_OK = {
  ok: true,
  liveUrl: SOURCE_A,
  httpStatus: 200,
  verifiedAt: '2026-09-20T12:00:00.000Z',
  lineageVerified: true,
  publicationPhase: 'live_verified',
} as never
const VERIFY_PENDING = { ...(VERIFY_OK as Record<string, unknown>), ok: false } as never
/** ok=true on verifyLiveUrl's legacy/uncontracted health path: no lineage. */
const VERIFY_LEGACY_OK = {
  ...(VERIFY_OK as Record<string, unknown>),
  lineageVerified: null,
  publicationPhase: null,
} as never
/** ok=true but the deployment lineage could not be positively verified. */
const VERIFY_UNPROVEN = {
  ...(VERIFY_OK as Record<string, unknown>),
  lineageVerified: false,
} as never

const FINALIZED_ONE = {
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
}

function staged(overrides: Partial<StagedInterlinkRow> = {}): StagedInterlinkRow {
  return {
    id: 'row-1',
    sourceUrl: SOURCE_A,
    sourceJobId: JOB_A,
    verifiedAt: null,
    stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
    updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
    ...overrides,
  }
}

function harness(rows: StagedInterlinkRow[]) {
  const verify = jest.fn(async () => VERIFY_OK)
  const finalize = jest.fn(async () => ({ ...FINALIZED_ONE }))
  const markAttempted = jest.fn(async () => ({ updated: 1 }))
  return {
    verify,
    finalize,
    markAttempted,
    deps: {
      loadStagedRows: jest.fn(async (limit: number) => rows.slice(0, limit)),
      verify,
      finalize,
      markAttempted,
      now: () => NOW,
    },
  }
}

describe('A) exact (source_url, source_job_id) identity is the verification subject', () => {
  it('passes the exact staged jobId alongside the canonicalUrl and only finalizes on ok=true', async () => {
    const h = harness([staged()])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    // RED before the repair: this call was `{ canonicalUrl }` only, i.e. the
    // legacy/uncontracted verifyLiveUrl path with no deployment lineage.
    expect(h.verify).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A, jobId: JOB_A })
    expect(h.finalize).toHaveBeenCalledTimes(1)
    expect(h.finalize).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A, sourceJobId: JOB_A })
    expect(summary.verifiedLive).toBe(1)
    expect(summary.finalized).toBe(1)
    expect(summary.applied).toBe(1)
    expect(summary.skippedMissingJobIdentity).toBe(0)
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
  })

  it('groups by exact (source_url, source_job_id), never by source_url alone', async () => {
    // Same canonical, two different ship jobs: two distinct verification
    // subjects, each verified with its own exact job id and finalized
    // job-bound. Grouping by source_url alone would wrongly collapse them.
    const h = harness([
      staged({ id: 'a', sourceJobId: JOB_A }),
      staged({ id: 'b', sourceJobId: JOB_B }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.scannedRows).toBe(2)
    expect(summary.stagedSources).toBe(2)
    expect(h.verify).toHaveBeenCalledTimes(2)
    expect(h.verify).toHaveBeenNthCalledWith(1, { canonicalUrl: SOURCE_A, jobId: JOB_A })
    expect(h.verify).toHaveBeenNthCalledWith(2, { canonicalUrl: SOURCE_A, jobId: JOB_B })
    expect(h.finalize.mock.calls.map(([input]) => (input as { sourceJobId: string }).sourceJobId).sort()).toEqual([
      JOB_A,
      JOB_B,
    ])
  })

  it('groups rows of the same exact job into one verification', async () => {
    const h = harness([staged({ id: 'a' }), staged({ id: 'b' })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.stagedSources).toBe(1)
    expect(summary.details[0]).toMatchObject({ sourceUrl: SOURCE_A, sourceJobId: JOB_A })
  })

  it('never verifies rows without a durable source_url (planner slug is not authority)', async () => {
    const h = harness([staged({ sourceUrl: null }), staged({ sourceUrl: '   ' })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.skippedInvalidSource).toBe(2)
    expect(summary.stagedSources).toBe(0)
    expect(summary.ok).toBe(true)
  })

  it('reads a bounded window of planned, source_url-bearing rows including source_job_id', async () => {
    const h = harness([staged()])
    await reconcileStagedInterlinks(h.deps, { scanLimit: 50 })
    expect(h.deps.loadStagedRows).toHaveBeenCalledWith(50)

    const source = readFileSync(
      join(process.cwd(), 'lib', 'seoFactory', 'interlinkReconciliation.ts'),
      'utf8',
    )
    expect(source).toMatch(/source_job_id/)
    expect(source).toMatch(/verification_attempted_at/)
    expect(source).toMatch(/staged_at/)
    expect(source).toMatch(/\.eq\('status', 'planned'\)/)
    expect(source).toMatch(/\.not\('source_url', 'is', null\)/)
    // Jobless historical rows are fenced in the query itself so they cannot
    // occupy (and starve) the bounded scan window.
    expect(source).toMatch(/\.not\('source_job_id', 'is', null\)/)
    // M1: revision/cooldown membership is decided by the durable staged_at
    // stamp, with updated_at only as the documented legacy fallback.
    expect(source).toMatch(/group\.lastStagedAt \?\? group\.lastWrittenAt/)
  })
})

describe('B) rows without exact job identity can never auto-finalize', () => {
  it('skips null, blank and non-UUID job identities as unresolved with a truthful count', async () => {
    const h = harness([
      staged({ id: 'a', sourceJobId: null }),
      staged({ id: 'b', sourceJobId: '   ' }),
      staged({ id: 'c', sourceJobId: 'not-a-uuid' }),
      staged({ id: 'd', sourceJobId: 'row-abcde' }),
      staged({ id: 'e', sourceJobId: '11111111-1111-4111-8111-11111111111' }), // truncated
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    // RED before the repair: these rows would have been verified on the
    // legacy path and finalized purely from source_url.
    expect(h.verify).not.toHaveBeenCalled()
    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.skippedMissingJobIdentity).toBe(5)
    expect(summary.stagedSources).toBe(0)
    expect(summary.eligibleSources).toBe(0)
    expect(summary.applied).toBe(0)
    // Unresolved/manual is truthful, not an error.
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
  })

  it('still reconciles the job-bound row while leaving the jobless row unresolved', async () => {
    const h = harness([
      staged({ id: 'a', sourceJobId: null }),
      staged({ id: 'b', sourceUrl: SOURCE_B, sourceJobId: JOB_B }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(h.verify).toHaveBeenCalledWith({ canonicalUrl: SOURCE_B, jobId: JOB_B })
    expect(h.finalize).toHaveBeenCalledWith({ canonicalUrl: SOURCE_B, sourceJobId: JOB_B })
    expect(summary.skippedMissingJobIdentity).toBe(1)
    expect(summary.stagedSources).toBe(1)
    expect(summary.finalized).toBe(1)
  })
})

describe('C) fail closed on the live verdict', () => {
  it('does not finalize while the production deployment is not yet observable', async () => {
    const h = harness([staged()])
    h.verify.mockResolvedValue(VERIFY_PENDING)

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A, jobId: JOB_A })
    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.verificationFailed).toBe(1)
    expect(summary.verifiedLive).toBe(0)
    expect(summary.finalized).toBe(0)
    // Pending deployment is benign truth — not a failed run.
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
  })

  it('reports a real error and writes nothing when the verifier is unavailable', async () => {
    const h = harness([staged()])
    h.verify.mockRejectedValue(new Error('network unreachable'))

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.verificationUnavailable).toBe(1)
    expect(summary.ok).toBe(false)
    expect(summary.errors.join(' ')).toMatch(/live verification unavailable/i)
    expect(summary.errors.join(' ')).toContain(JOB_A)
  })

  it('surfaces finalizer DB-write failures truthfully without counting applied rows', async () => {
    const h = harness([staged()])
    h.finalize.mockResolvedValue({
      ...FINALIZED_ONE,
      applied: 0,
      dbErrors: 1,
      error: 'interlink store exploded',
    })

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.applied).toBe(0)
    expect(summary.dbErrors).toBe(1)
    expect(summary.ok).toBe(false)
    expect(summary.errors.join(' ')).toMatch(/interlink store exploded/)
  })

  it('reports a throwing finalizer as a real error for that source only', async () => {
    const h = harness([staged()])
    h.finalize.mockRejectedValue(new Error('finalizer exploded'))

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.finalized).toBe(0)
    expect(summary.ok).toBe(false)
    expect(summary.errors.join(' ')).toMatch(/finalization failed/i)
  })
})

describe('C2) ok=true is necessary but NOT sufficient — deployment lineage must be proven', () => {
  it('never finalizes an ok=true legacy/uncontracted verdict (no deployment lineage)', async () => {
    const h = harness([staged()])
    h.verify.mockResolvedValue(VERIFY_LEGACY_OK)

    const summary = await reconcileStagedInterlinks(h.deps)

    // RED before the repair: any ok=true resolved apply truth through the
    // legacy health path, which proves nothing about the deployment.
    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.verifiedLive).toBe(0)
    expect(summary.notDeploymentProven).toBe(1)
    expect(summary.applied).toBe(0)
    expect(summary.finalized).toBe(0)
    expect(summary.details[0]).toMatchObject({
      sourceUrl: SOURCE_A,
      sourceJobId: JOB_A,
      verified: false,
      applied: 0,
      notDeploymentProven: true,
    })
    // Truthful unresolved truth — not a failed run.
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
  })

  it('never finalizes an ok=true verdict whose lineageVerified is false', async () => {
    const h = harness([staged()])
    h.verify.mockResolvedValue(VERIFY_UNPROVEN)

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.finalize).not.toHaveBeenCalled()
    expect(summary.notDeploymentProven).toBe(1)
    expect(summary.applied).toBe(0)
  })

  it('finalizes when (and only when) ok + lineageVerified + live_verified agree', async () => {
    const h = harness([staged()])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.finalize).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A, sourceJobId: JOB_A })
    expect(summary.verifiedLive).toBe(1)
    expect(summary.notDeploymentProven).toBe(0)
    expect(summary.applied).toBe(1)
  })

  it('records a bounded durable attempt marker for a non-finalizing ok=true verdict', async () => {
    const h = harness([staged()])
    h.verify.mockResolvedValue(VERIFY_LEGACY_OK)

    await reconcileStagedInterlinks(h.deps)

    expect(h.markAttempted).toHaveBeenCalledWith({
      sourceUrl: SOURCE_A,
      sourceJobId: JOB_A,
      now: new Date(NOW).toISOString(),
    })
    expect(h.finalize).not.toHaveBeenCalled()
  })

  it('does not mark an attempt when a fully deployment-proven verdict finalizes', async () => {
    const h = harness([staged()])

    await reconcileStagedInterlinks(h.deps)

    expect(h.markAttempted).not.toHaveBeenCalled()
  })
})

describe('D) bounded, idempotent cadence', () => {
  it('skips a source whose current revision was staged inside the deployment-lag window', async () => {
    const h = harness([staged({ stagedAt: new Date(NOW - 60 * 1000).toISOString() })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedYoung).toBe(1)
    expect(summary.eligibleSources).toBe(0)
  })

  it('falls back to updated_at for a legacy job-bound row with no staged_at stamp', async () => {
    // Legacy (pre-staged_at) job-bound row: there is no revision stamp, so the
    // documented fallback uses updated_at for the deployment-lag window.
    const h = harness([staged({ stagedAt: null, updatedAt: new Date(NOW - 60 * 1000).toISOString() })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedYoung).toBe(1)
  })

  it('skips a source verified inside the cooldown window (no daily re-hammering)', async () => {
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 2 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedCooldown).toBe(1)
  })

  it('a trigger-later updated_at cannot defeat the current-revision verdict cooldown (M1)', async () => {
    // The row's BEFORE UPDATE trigger stamped updated_at AFTER the verdict
    // was written (production always does). Comparing the verdict against
    // updated_at made the cooldown structurally dead; the staged_at revision
    // stamp is the authority.
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 2 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
        updatedAt: new Date(NOW - 60 * 1000).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedCooldown).toBe(1)
    expect(summary.eligibleSources).toBe(0)
  })

  it('a trigger-later updated_at cannot defeat the current-revision attempt cooldown (M1)', async () => {
    const h = harness([
      staged({
        attemptedAt: new Date(NOW - 2 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
        updatedAt: new Date(NOW - 60 * 1000).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedAttemptCooldown).toBe(1)
  })

  it('re-attempts a source whose last verdict is older than the cooldown', async () => {
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 30 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 30 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.finalized).toBe(1)
  })

  it('is idempotent: a finalization that applies nothing repeats no state change', async () => {
    const h = harness([staged()])
    h.finalize.mockResolvedValue({ ...FINALIZED_ONE, applied: 0, checked: 0 })

    const first = await reconcileStagedInterlinks(h.deps)
    const second = await reconcileStagedInterlinks(h.deps)

    expect(first.applied).toBe(0)
    expect(second.applied).toBe(0)
    expect(h.verify).toHaveBeenCalledTimes(2)
    expect(second.ok).toBe(true)
  })

  it('never counts a zero-row finalizer no-op as finalized progress', async () => {
    const h = harness([staged()])
    // A concurrent reship rebound the row away: the finalizer checked ZERO
    // rows. That is a skip, not a real finalization.
    h.finalize.mockResolvedValue({ ...FINALIZED_ONE, applied: 0, checked: 0 })

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.finalized).toBe(0)
    expect(summary.applied).toBe(0)
    expect(summary.details[0]).toMatchObject({ checked: 0, applied: 0 })
    expect(summary.ok).toBe(true)
  })

  it('bounds the work per run and reports what is still eligible', async () => {
    const h = harness([
      staged({ id: 'a', sourceUrl: SOURCE_A }),
      staged({ id: 'b', sourceUrl: SOURCE_B, stagedAt: new Date(NOW - 3 * HOUR).toISOString() }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps, { maxSources: 1 })

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.eligibleSources).toBe(2)
    expect(summary.remaining).toBe(1)
  })

  it('does not let a stale verification timestamp suppress a newer revision', async () => {
    // The verdict belongs to an OLDER revision (verified 30h ago, but the row
    // was re-staged/rebound 2h ago → a fresh staged_at stamp). It must not be
    // suppressed.
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 30 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.skippedCooldown).toBe(0)
    expect(summary.finalized).toBe(1)
  })

  it('bounds a repeated non-finalizing attempt with the durable attempt marker', async () => {
    const h = harness([
      staged({
        attemptedAt: new Date(NOW - 2 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedAttemptCooldown).toBe(1)
    expect(summary.eligibleSources).toBe(0)
  })

  it('re-attempts a bounded source after the attempt cooldown elapses', async () => {
    const h = harness([
      staged({
        attemptedAt: new Date(NOW - 30 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 30 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.skippedAttemptCooldown).toBe(0)
  })

  it('a stale attempt marker never suppresses a newer revision', async () => {
    const h = harness([
      staged({
        attemptedAt: new Date(NOW - 30 * HOUR).toISOString(),
        stagedAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.skippedAttemptCooldown).toBe(0)
  })

  it('a permanently non-ok source cannot monopolize the bounded batch (rollover)', async () => {
    const rows = [
      staged({
        id: 'a',
        sourceUrl: SOURCE_A,
        stagedAt: new Date(NOW - 40 * HOUR).toISOString(),
        attemptedAt: null,
      }),
      staged({
        id: 'b',
        sourceUrl: SOURCE_B,
        stagedAt: new Date(NOW - 50 * HOUR).toISOString(),
        attemptedAt: new Date(NOW - 30 * HOUR).toISOString(),
      }),
    ]
    const h = harness(rows)
    h.verify.mockResolvedValue(VERIFY_PENDING)

    const first = await reconcileStagedInterlinks(h.deps, { maxSources: 1 })

    expect(h.verify).toHaveBeenNthCalledWith(1, { canonicalUrl: SOURCE_A, jobId: JOB_A })
    expect(first.verificationFailed).toBe(1)
    // Simulate the durable marker write the reconciler performs.
    rows[0].attemptedAt = new Date(NOW).toISOString()

    const second = await reconcileStagedInterlinks(h.deps, { maxSources: 1 })

    // The just-attempted source is cooldowned; the other staged source makes
    // progress on the next run.
    expect(h.verify).toHaveBeenNthCalledWith(2, { canonicalUrl: SOURCE_B, jobId: JOB_B })
    expect(second.eligibleSources).toBe(1)
    expect(second.skippedAttemptCooldown).toBe(1)
    expect(second.ok).toBe(true)
  })

  it('treats NaN option overrides as the safe defaults instead of disabling the pass', async () => {
    const h = harness([staged()])

    const summary = await reconcileStagedInterlinks(h.deps, {
      maxSources: Number.NaN,
      scanLimit: Number.NaN,
      minAgeMs: Number.NaN,
      cooldownMs: Number.NaN,
    })

    // `slice(0, NaN)` used to yield an empty batch forever: zero work, green run.
    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.finalized).toBe(1)
  })
})

describe('E) loader failure and mutation-surface contract', () => {
  it('a loader failure is a real truthful error with zero verification calls', async () => {
    const h = harness([staged()])
    h.deps.loadStagedRows.mockRejectedValue(new Error('db offline'))

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.ok).toBe(false)
    expect(summary.errors.join(' ')).toMatch(/staged interlink load failed/i)
    expect(h.verify).not.toHaveBeenCalled()
    expect(h.finalize).not.toHaveBeenCalled()
  })

  it('reports a pre-migration missing column as unavailable, not as a fake empty estate', async () => {
    const h = harness([staged()])
    h.deps.loadStagedRows.mockRejectedValue(
      new Error('staged interlink read failed: column seo_interlinks.source_job_id does not exist'),
    )

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.unavailable).toBe(true)
    expect(summary.unavailableReason).toMatch(/does not exist/)
    // Known pre-migration state: inert, explicitly reported, never a red run.
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
    expect(h.verify).not.toHaveBeenCalled()
  })

  it('narrows schema-unavailable signatures: a generic "does not exist" stays a REAL error', async () => {
    // The old detector treated ANY "does not exist" as a green pre-migration
    // state; a real schema failure must never be silently converted.
    expect(isSchemaUnavailable('relation "public.other_table" does not exist')).toBe(false)
    expect(isSchemaUnavailable('column other_table.foo does not exist')).toBe(false)
    expect(isSchemaUnavailable('permission denied for table seo_interlinks')).toBe(false)
    // Actual P6 signatures stay recognized.
    expect(isSchemaUnavailable('column seo_interlinks.source_job_id does not exist')).toBe(true)
    expect(isSchemaUnavailable('column seo_interlinks.staged_at does not exist')).toBe(true)
    expect(
      isSchemaUnavailable("Could not find the 'staged_at' column of 'seo_interlinks' in the schema cache"),
    ).toBe(true)

    const h = harness([staged()])
    h.deps.loadStagedRows.mockRejectedValue(
      new Error('staged interlink read failed: relation "public.other_table" does not exist'),
    )

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.unavailable).toBe(false)
    expect(summary.ok).toBe(false)
    expect(summary.errors.join(' ')).toMatch(/staged interlink load failed/)
  })

  it('the module owns no write verb, no applied status and no jobless legacy verification', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib', 'seoFactory', 'interlinkReconciliation.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/\.update\s*\(/)
    expect(source).not.toMatch(/\.upsert\s*\(/)
    expect(source).not.toMatch(/\.insert\s*\(/)
    expect(source).not.toMatch(/\.delete\s*\(/)
    expect(source).not.toMatch(/status\s*:\s*'applied'/)
    // Defaults are the real repository authorities.
    expect(source).toMatch(/verifyLiveUrl/)
    expect(source).toMatch(/finalizeStagedInterlinksForLiveSource/)
    // The exact job id travels with the canonicalUrl into verification and
    // finalization — the legacy jobless calls are gone.
    expect(source).toMatch(/verify\(\{\s*canonicalUrl:\s*source\.sourceUrl,\s*jobId:\s*source\.sourceJobId\s*\}\)/)
    expect(source).toMatch(
      /finalize\(\{\s*canonicalUrl:\s*source\.sourceUrl,\s*sourceJobId:\s*source\.sourceJobId\s*\}\)/,
    )
  })

  it('is wired to the existing scheduled cron surface, not a new public route', () => {
    const cron = readFileSync(
      join(process.cwd(), 'app', 'api', 'cron', 'seo-engine-daily', 'route.ts'),
      'utf8',
    )
    expect(cron).toMatch(/phase === 'interlinks'/)
    expect(cron.match(/reconcileStagedInterlinks\(\)/g)?.length).toBe(2)
    expect(cron).toMatch(/interlink-reconcile/)
    expect(cron).toMatch(/skippedMissingJobIdentity/)
    const workflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'seo-engine-daily.yml'),
      'utf8',
    )
    expect(workflow).toMatch(/api\/cron\/seo-engine-daily/)
    expect(workflow).toContain("default: 'all'")
  })
})
