/**
 * P6 final release-gate repair - M1: POST-PERSIST EXACT-ID REBIND.
 *
 * Reviewer medium: the non-stream pipeline ships BEFORE `persistPipelineJob`
 * creates its `content_jobs` row, so `ship.ts` could only stage the planned
 * `seo_interlinks` rows JOBLESS (no durable id existed yet) - and the scheduled
 * reconciler deliberately never auto-finalizes a row without an exact
 * `source_job_id` (H1). A perfectly successful ship therefore sat jobless.
 *
 * Contract pinned here:
 *   - after persist returns the exact durable id, a real non-dry successful
 *     ship (deployed|merged - the statuses where ship.ts itself staged) runs
 *     the SAME planned-only staging pass again with the exact plan canonicalUrl
 *     + exact persisted jobId + primaryKeyword + shipped body;
 *   - dry run / withheld-failed ship / PR that never merged binds nothing;
 *   - a ship that already carried an exact job id skips the redundant pass;
 *   - a malformed/absent durable id or canonicalUrl is a truthful skip, never
 *     a guessed `plan-*` identity;
 *   - the pass never throws and never fails a successful content ship: a
 *     degraded rebind is observability (console + additive outcome);
 *   - the module contains no applied writer (planned rows only).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  bindStagedInterlinksToPersistedJob,
  decidePostPersistInterlinkBind,
  POST_PERSIST_BIND_SHIP_STATUSES,
} from '@/lib/seoFactory/postPersistInterlinkBind'

const CANONICAL = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const JOB = '33333333-3333-4333-8333-333333333333'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

function stageResult(overrides: Record<string, unknown> = {}) {
  return {
    staged: 1,
    candidates: 2,
    skipped: 0,
    failed: 0,
    sourceUrl: CANONICAL,
    ...overrides,
  } as never
}

function harness(result = stageResult()) {
  const stage = jest.fn(async () => result)
  return { stage, deps: { stage } }
}

const SHIP_DEPLOYED = { status: 'deployed' as const }
const SHIP_MERGED = { status: 'merged' as const }

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

describe('A) the guard binds only a real, non-dry, jobless successful ship', () => {
  it('accepts exactly the ship statuses where ship.ts stages planned interlinks', () => {
    expect([...POST_PERSIST_BIND_SHIP_STATUSES]).toEqual(['deployed', 'merged'])
    for (const status of POST_PERSIST_BIND_SHIP_STATUSES) {
      expect(
        decidePostPersistInterlinkBind({
          canonicalUrl: CANONICAL,
          persistedJobId: JOB,
          shipResult: { status },
        }),
      ).toEqual({ bind: true, reason: 'bound' })
    }
  })

  it.each([
    ['dry-run', { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: SHIP_DEPLOYED, dryRun: true }],
    [
      'dry-run verdict',
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: { status: 'deployed', dryRun: true } },
    ],
    ['no ship at all', { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: null }],
    ['withheld ship', { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: { status: 'not_live' } }],
    ['dry_run status', { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: { status: 'dry_run' } }],
    [
      'ship already carried the exact id',
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shippedJobId: JOB, shipResult: SHIP_DEPLOYED },
    ],
    [
      'synthetic plan-* id is not job identity',
      { canonicalUrl: CANONICAL, persistedJobId: 'plan-1737000000000', shipResult: SHIP_DEPLOYED },
    ],
    ['missing durable id', { canonicalUrl: CANONICAL, persistedJobId: null, shipResult: SHIP_DEPLOYED }],
    ['canonical missing', { canonicalUrl: '', persistedJobId: JOB, shipResult: SHIP_DEPLOYED }],
  ])('never binds: %s', (_label, input) => {
    expect(decidePostPersistInterlinkBind(input as never).bind).toBe(false)
  })

  it('names the unmerged-PR skip truthfully (it shipped, but staged nothing)', () => {
    expect(
      decidePostPersistInterlinkBind({
        canonicalUrl: CANONICAL,
        persistedJobId: JOB,
        shipResult: { status: 'pr_created' },
      }),
    ).toEqual({ bind: false, reason: 'ship-surface-staged-nothing' })
    expect(
      decidePostPersistInterlinkBind({ canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: null }),
    ).toEqual({ bind: false, reason: 'ship-not-successful' })
  })
})

describe('B) the second pass re-stages with the EXACT identity persist returned', () => {
  it('binds a jobless shipped row to the exact persisted id (deployed)', async () => {
    const h = harness()

    const outcome = await bindStagedInterlinksToPersistedJob(
      {
        canonicalUrl: CANONICAL,
        persistedJobId: JOB,
        shippedJobId: null,
        shipResult: SHIP_DEPLOYED,
        primaryKeyword: 'us student visa',
        body: 'Draft body with [a link](https://legal.yousafeconsultancy.com/us/f-1-visa/).',
      },
      h.deps,
    )

    expect(h.stage).toHaveBeenCalledTimes(1)
    expect(h.stage).toHaveBeenCalledWith({
      canonicalUrl: CANONICAL,
      jobId: JOB,
      primaryKeyword: 'us student visa',
      body: expect.stringContaining('Draft body'),
    })
    expect(outcome).toMatchObject({ attempted: true, reason: 'bound', jobId: JOB, staged: 1, rebounded: 0 })
    // Observability of a healthy bind is informational, never a warning.
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('binds after a merged ship too, and reports the rebind count', async () => {
    const h = harness(stageResult({ staged: 1, rebounded: 1 }))

    const outcome = await bindStagedInterlinksToPersistedJob(
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: SHIP_MERGED, primaryKeyword: 'k', body: 'b' },
      h.deps,
    )

    expect(h.stage).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB, canonicalUrl: CANONICAL }))
    expect(outcome).toMatchObject({ attempted: true, staged: 1, rebounded: 1 })
  })

  it('dry run, no ship, withheld ship and an already-bound ship never invoke the stager', async () => {
    const h = harness()

    for (const input of [
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: SHIP_DEPLOYED, dryRun: true },
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: null },
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: { status: 'pr_created' } },
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shippedJobId: JOB, shipResult: SHIP_DEPLOYED },
      { canonicalUrl: CANONICAL, persistedJobId: 'not-a-uuid', shipResult: SHIP_DEPLOYED },
      { canonicalUrl: 'not-a-url', persistedJobId: JOB, shipResult: SHIP_DEPLOYED },
    ]) {
      const outcome = await bindStagedInterlinksToPersistedJob(input as never, h.deps)
      expect(outcome.attempted).toBe(false)
      expect(outcome.staged).toBe(0)
    }
    expect(h.stage).not.toHaveBeenCalled()
  })

  it('never fails the ship when the stager throws (observability only)', async () => {
    const stage = jest.fn(async () => {
      throw new Error('planner lookup exploded')
    })

    const outcome = await bindStagedInterlinksToPersistedJob(
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: SHIP_DEPLOYED, primaryKeyword: 'k', body: 'b' },
      { stage },
    )

    expect(outcome).toMatchObject({ attempted: true, reason: 'bound', staged: 0, failed: 1 })
    expect(outcome.error).toMatch(/planner lookup exploded/)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/post-persist interlink rebind failed/i),
      expect.objectContaining({ sourceUrl: CANONICAL, jobId: JOB }),
    )
  })

  it('surfaces a degraded staging result (write failure / partial migration) as a warning', async () => {
    const h = harness(
      stageResult({ staged: 0, failed: 2, warning: 'source_job_id column unavailable (partial P6 migration)' }),
    )

    const outcome = await bindStagedInterlinksToPersistedJob(
      { canonicalUrl: CANONICAL, persistedJobId: JOB, shipResult: SHIP_DEPLOYED, primaryKeyword: 'k', body: 'b' },
      h.deps,
    )

    expect(outcome).toMatchObject({ attempted: true, failed: 2 })
    expect(outcome.warning).toMatch(/partial P6 migration/)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/post-persist interlink rebind degraded/i),
      expect.objectContaining({ jobId: JOB, failed: 2 }),
    )
  })
})

describe('C) planned-only by construction - no applied writer, no invented identity', () => {
  const source = () => read('lib/seoFactory/postPersistInterlinkBind.ts')

  it('contains no applied status, no proof/verdict column and no direct write verb', () => {
    const body = source()
    expect(body).not.toMatch(/status:\s*'applied'/)
    expect(body).not.toMatch(/applied_at/)
    expect(body).not.toMatch(/verification_state/)
    expect(body).not.toMatch(/verification_evidence/)
    expect(body).not.toMatch(/\.update\s*\(/)
    expect(body).not.toMatch(/\.upsert\s*\(/)
    expect(body).not.toMatch(/plan-\$\{/)
  })

  it('uses the shared exact-UUID predicate and the real planned-only stager', () => {
    const body = source()
    expect(body).toMatch(/from '\.\/sourceJobIdentity'/)
    expect(body).toMatch(/stageEngineInterlinksForVerification/)
  })
})

describe('D) both pipeline surfaces call the pass AFTER persist with the exact durable id', () => {
  it('the non-stream pipeline binds the id persistPipelineJob returned', () => {
    const body = read('lib/seoFactory/pipeline.ts')
    const persistAt = body.indexOf('const jobId = await persistPipelineJob({')
    const bindAt = body.indexOf('bindStagedInterlinksToPersistedJob({')
    expect(persistAt).toBeGreaterThanOrEqual(0)
    expect(bindAt).toBeGreaterThan(persistAt)
    const call = body.slice(bindAt, body.indexOf('\n  })', bindAt))
    expect(call).toMatch(/persistedJobId: jobId/)
    expect(call).toMatch(/shippedJobId: input\.existingJobId/)
    expect(call).toMatch(/canonicalUrl: plan\.canonicalUrl/)
    expect(call).toMatch(/body: content/)
    // The cluster's existingJobId is metadata, never ship/job identity.
    expect(call).not.toMatch(/cluster/)
    expect(body).toMatch(/interlinkPostPersistBind,/)
  })

  it('the stream uses its exact early row when it has one and the persisted id otherwise', () => {
    const body = read('lib/seoFactory/pipelineStream.ts')
    const persistAt = body.indexOf('const jobId = await persistPipelineJob({')
    const bindAt = body.indexOf('bindStagedInterlinksToPersistedJob({')
    expect(persistAt).toBeGreaterThanOrEqual(0)
    expect(bindAt).toBeGreaterThan(persistAt)
    const call = body.slice(bindAt, body.indexOf('\n    })', bindAt))
    expect(call).toMatch(/persistedJobId: jobId/)
    expect(call).toMatch(/shippedJobId: earlyJobId/)
    expect(call).not.toMatch(/cluster/)
  })
})
