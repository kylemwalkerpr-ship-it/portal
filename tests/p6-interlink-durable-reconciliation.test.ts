/**
 * P6 (supervisor review repair) — durable post-deploy finalization.
 *
 * Reviewer finding: finalization was reachable only from a single best-effort
 * serverless invocation launched at ship time (before the production
 * deployment can normally be observed) plus the manual admin Verify button.
 * Nothing durable ever came back for staged rows.
 *
 * The repair wires a bounded server-side reconciliation pass into the EXISTING
 * scheduled lifecycle surface (`/api/cron/seo-engine-daily`, CRON_SECRET-only,
 * driven by the scheduled GitHub workflow). Contract pinned here:
 *   · only planned rows carrying a durable source_url are even read;
 *   · re-verification only runs for the EXACT staged source identity;
 *   · finalization runs ONLY on an ok=true live verdict (fail closed);
 *   · a pending deployment (ok=false) is benign truth, never an error;
 *   · a verifier throw / DB write failure is a real, truthful error;
 *   · the pass is bounded (min age, cooldown, max sources) and idempotent.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  reconcileStagedInterlinks,
  type StagedInterlinkRow,
} from '@/lib/seoFactory/interlinkReconciliation'

const SOURCE_A = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const SOURCE_B = 'https://legal.yousafeconsultancy.com/uk/student-visas/'
const NOW = Date.parse('2026-09-20T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

const VERIFY_OK = { ok: true, liveUrl: SOURCE_A, httpStatus: 200, verifiedAt: '2026-09-20T12:00:00.000Z' } as never
const VERIFY_PENDING = { ...(VERIFY_OK as Record<string, unknown>), ok: false } as never

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
    verifiedAt: null,
    updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
    ...overrides,
  }
}

function harness(rows: StagedInterlinkRow[]) {
  const verify = jest.fn(async () => VERIFY_OK)
  const finalize = jest.fn(async () => ({ ...FINALIZED_ONE }))
  return {
    verify,
    finalize,
    deps: {
      loadStagedRows: jest.fn(async (limit: number) => rows.slice(0, limit)),
      verify,
      finalize,
      now: () => NOW,
    },
  }
}

describe('A) only the exact staged source identity is re-verified', () => {
  it('re-verifies each staged source_url and finalizes only on ok=true', async () => {
    const h = harness([staged()])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(h.verify).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A })
    expect(h.finalize).toHaveBeenCalledTimes(1)
    expect(h.finalize).toHaveBeenCalledWith({ canonicalUrl: SOURCE_A })
    expect(summary.verifiedLive).toBe(1)
    expect(summary.finalized).toBe(1)
    expect(summary.applied).toBe(1)
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
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

  it('reads a bounded window of planned, source_url-bearing rows', async () => {
    const h = harness([staged()])
    await reconcileStagedInterlinks(h.deps, { scanLimit: 50 })
    expect(h.deps.loadStagedRows).toHaveBeenCalledWith(50)
  })
})

describe('B) fail closed on the live verdict', () => {
  it('does not finalize while the production deployment is not yet observable', async () => {
    const h = harness([staged()])
    h.verify.mockResolvedValue(VERIFY_PENDING)

    const summary = await reconcileStagedInterlinks(h.deps)

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

describe('C) bounded, idempotent cadence', () => {
  it('skips a source whose row was written inside the deployment-lag window', async () => {
    const h = harness([staged({ updatedAt: new Date(NOW - 60 * 1000).toISOString() })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedYoung).toBe(1)
    expect(summary.eligibleSources).toBe(0)
  })

  it('skips a source verified inside the cooldown window (no daily re-hammering)', async () => {
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 2 * HOUR).toISOString(),
        updatedAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).not.toHaveBeenCalled()
    expect(summary.skippedCooldown).toBe(1)
  })

  it('re-attempts a source whose last verdict is older than the cooldown', async () => {
    const h = harness([
      staged({
        verifiedAt: new Date(NOW - 30 * HOUR).toISOString(),
        updatedAt: new Date(NOW - 30 * HOUR).toISOString(),
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

  it('bounds the work per run and reports what is still eligible', async () => {
    const h = harness([
      staged({ id: 'a', sourceUrl: SOURCE_A }),
      staged({ id: 'b', sourceUrl: SOURCE_B, updatedAt: new Date(NOW - 3 * HOUR).toISOString() }),
    ])

    const summary = await reconcileStagedInterlinks(h.deps, { maxSources: 1 })

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.eligibleSources).toBe(2)
    expect(summary.remaining).toBe(1)
  })

  it('groups rows by exact source identity (one verification per source)', async () => {
    const h = harness([staged({ id: 'a' }), staged({ id: 'b' })])

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(summary.scannedRows).toBe(2)
    expect(summary.stagedSources).toBe(1)
  })
})

describe('D) loader failure and mutation-surface contract', () => {
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
      new Error('staged interlink read failed: column seo_interlinks.source_url does not exist'),
    )

    const summary = await reconcileStagedInterlinks(h.deps)

    expect(summary.unavailable).toBe(true)
    expect(summary.unavailableReason).toMatch(/does not exist/)
    // Known pre-migration state: inert, explicitly reported, never a red run.
    expect(summary.ok).toBe(true)
    expect(summary.errors).toEqual([])
    expect(h.verify).not.toHaveBeenCalled()
  })

  it('the module owns no write verb and no applied status', () => {
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
    // Only rows that are planned AND already staged are read.
    expect(source).toMatch(/\.eq\('status', 'planned'\)/)
    expect(source).toMatch(/\.not\('source_url', 'is', null\)/)
  })

  it('is wired to the existing scheduled cron surface, not a new public route', () => {
    const cron = readFileSync(
      join(process.cwd(), 'app', 'api', 'cron', 'seo-engine-daily', 'route.ts'),
      'utf8',
    )
    expect(cron).toMatch(/phase === 'interlinks'/)
    expect(cron.match(/reconcileStagedInterlinks\(\)/g)?.length).toBe(2)
    expect(cron).toMatch(/interlink-reconcile/)
    const workflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'seo-engine-daily.yml'),
      'utf8',
    )
    expect(workflow).toMatch(/api\/cron\/seo-engine-daily/)
    expect(workflow).toContain("default: 'all'")
  })
})
