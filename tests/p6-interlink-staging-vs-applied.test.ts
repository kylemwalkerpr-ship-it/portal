/**
 * P6 — staging is not applying.
 *
 * After a successful commit/merge the ship loop may only STAGE an engine row:
 * record `source_url = plan.canonicalUrl` and leave status planned, applied_at
 * null, and every verification field untouched. The planner slug is a locator,
 * never source-URL authority.
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
  createP6FakeDb,
  type P6CapturedFilter,
  type P6FakeRow,
} from './helpers/p6InterlinkFakeDb'

const CANONICAL = 'https://market.yousafeconsultancy.com/articles/f1-checklist/'
const LIVE_TARGET = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const DEAD_TARGET = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'
const SHIP_JOB = '33333333-3333-4333-8333-333333333333'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

/**
 * Predicate ORDER is not a DB/PostgREST semantic: the same exact fence can be
 * issued in any order. Compare the fence as an exact SET — same length and
 * same members — so a dropped, weakened or invented predicate still fails.
 */
function fenceKey(filter: P6CapturedFilter): string {
  return `${filter.op}:${filter.column}:${JSON.stringify(filter.value)}`
}
function expectFenceSet(actual: P6CapturedFilter[], expected: P6CapturedFilter[]): void {
  expect(actual.map(fenceKey).sort()).toEqual(expected.map(fenceKey).sort())
}

function row(overrides: Partial<P6FakeRow> = {}): P6FakeRow {
  return {
    id: 'row-1',
    source_slug: 'seo-us-schools-f1-checklist',
    target_url: LIVE_TARGET,
    status: 'planned',
    applied_at: null,
    source_url: null,
    source_job_id: null,
    verification_state: null,
    verified_at: null,
    verification_evidence: null,
    ...overrides,
  }
}

function installDb(rows: P6FakeRow[]) {
  const db = createP6FakeDb(rows)
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  return db
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('A) staging records source_url only', () => {
  it('stages an exactly-embedded markdown target and leaves the row planned', async () => {
    const db = installDb([row()])
    const body = `Intro text.\n\nSee the [US student visa guide](${LIVE_TARGET}) before applying.`

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body,
    })

    expect(result).toEqual({ staged: 1, candidates: 1, skipped: 0, failed: 0, sourceUrl: CANONICAL })
    expect(db.updates).toHaveLength(1)
    const { patch, filters } = db.updates[0]
    expect(patch).toEqual({ source_url: CANONICAL })
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('applied_at')
    expect(patch).not.toHaveProperty('verification_state')
    expect(patch).not.toHaveProperty('verified_at')
    expect(patch).not.toHaveProperty('verification_evidence')
    expectFenceSet(filters, [
      { op: 'eq', column: 'id', value: 'row-1' },
      { op: 'eq', column: 'status', value: 'planned' },
      // M2: first staging CASes the OBSERVED (null) revision.
      { op: 'is_null', column: 'source_url', value: null },
      { op: 'is_null', column: 'source_job_id', value: null },
      { op: 'is_null', column: 'staged_at', value: null },
    ])
    const stored = db.rows.find((r) => r.id === 'row-1')!
    expect(stored.status).toBe('planned')
    expect(stored.applied_at).toBeNull()
    expect(stored.verification_state).toBeNull()
    expect(stored.source_url).toBe(CANONICAL)
  })

  it('stages an exactly-embedded HTML anchor', async () => {
    const db = installDb([row({ target_url: LIVE_TARGET.replace(/\/$/, '') })])
    const body = `<p>Read the <a href="${LIVE_TARGET}">US student visa guide</a>.</p>`

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body,
    })

    expect(result.staged).toBe(1)
    expect(db.rows[0].source_url).toBe(CANONICAL)
  })
})

describe('B) staging never happens without structural presence', () => {
  it('does not stage a target URL that only appears as plain text', async () => {
    const db = installDb([row()])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `Visit ${LIVE_TARGET} for details.`,
    })

    expect(result.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  it('does not stage a target URL that only appears in JSON/script data', async () => {
    const db = installDb([row()])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `<script>window.__DATA__ = {"next":"${LIVE_TARGET}"}</script>`,
    })

    expect(result.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  it('never stages a non-embedded planner edge', async () => {
    const db = installDb([row({ target_url: DEAD_TARGET })])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `See the [US student visa guide](${LIVE_TARGET}).`,
    })

    expect(result.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
  })
})

describe('E) exact job identity is staged with the source URL', () => {
  it('writes source_job_id from the exact ship jobId alongside source_url, still planned', async () => {
    const db = installDb([row()])
    const body = `See the [US student visa guide](${LIVE_TARGET}).`

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body,
    })

    expect(result.staged).toBe(1)
    expect(db.updates).toHaveLength(1)
    const { patch, filters } = db.updates[0]
    // The durable revision stamp (staged_at) is written in the SAME
    // planned-only update; it is not proof and never touches a verdict column.
    expect(patch).toEqual({
      source_url: CANONICAL,
      source_job_id: SHIP_JOB,
      staged_at: expect.any(String),
    })
    expect(Number.isFinite(Date.parse(String(patch.staged_at)))).toBe(true)
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('applied_at')
    expect(patch).not.toHaveProperty('verification_state')
    expectFenceSet(filters, [
      { op: 'eq', column: 'id', value: 'row-1' },
      { op: 'eq', column: 'status', value: 'planned' },
      // M2: first staging CASes the OBSERVED (null) revision.
      { op: 'is_null', column: 'source_url', value: null },
      { op: 'is_null', column: 'source_job_id', value: null },
      { op: 'is_null', column: 'staged_at', value: null },
    ])
    expect(db.rows[0].status).toBe('planned')
    expect(db.rows[0].source_job_id).toBe(SHIP_JOB)
    expect(db.rows[0].staged_at).toBe(patch.staged_at)
  })

  it('legacy staging without a jobId records only source_url — never a guessed job', async () => {
    const db = installDb([row()])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: null,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(db.updates[0].patch).toEqual({ source_url: CANONICAL })
    expect(db.rows[0].source_job_id).toBeNull()
  })
})

describe('C) source identity and idempotency', () => {
  const OTHER_JOB = '44444444-4444-4444-8444-444444444444'

  it('rebinds a jobless already-staged row to the new exact ship job', async () => {
    const db = installDb([row({ source_url: CANONICAL, source_job_id: null })])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(result.rebounded).toBe(1)
    expect(db.updates).toHaveLength(1)
    // Additive rebind ONLY: no status/applied/verdict column may move, but the
    // rebind IS a new revision and writes a fresh staged_at in the same update.
    expect(db.updates[0].patch).toEqual({
      source_job_id: SHIP_JOB,
      staged_at: expect.any(String),
    })
    expect(db.updates[0].filters).toEqual([
      { op: 'eq', column: 'id', value: 'row-1' },
      { op: 'eq', column: 'status', value: 'planned' },
      // M2: the rebind CASes the observed jobless revision (source_url +
      // source_job_id IS NULL + observed staged_at, here NULL).
      { op: 'is_null', column: 'source_job_id', value: null },
      { op: 'eq', column: 'source_url', value: CANONICAL },
      { op: 'is_null', column: 'staged_at', value: null },
    ])
    expect(db.rows[0].source_job_id).toBe(SHIP_JOB)
    expect(db.rows[0].staged_at).toBe(db.updates[0].patch.staged_at)
    expect(db.rows[0].status).toBe('planned')
    expect(db.rows[0].verification_state).toBeNull()
  })

  it('rebinds an older job identity to the new exact ship job (reship)', async () => {
    const PREVIOUS_STAMP = '2026-09-19T00:00:00.000Z'
    const db = installDb([
      row({ source_url: CANONICAL, source_job_id: OTHER_JOB, staged_at: PREVIOUS_STAMP }),
    ])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.rebounded).toBe(1)
    expect(db.updates[0].patch).toEqual({
      source_job_id: SHIP_JOB,
      staged_at: expect.any(String),
    })
    // A new revision must move the stamp forward (old verdicts/attempts become
    // stale for cooldown purposes).
    expect(db.updates[0].patch.staged_at).not.toBe(PREVIOUS_STAMP)
    expect(db.rows[0].source_job_id).toBe(SHIP_JOB)
    expect(db.rows[0].staged_at).toBe(db.updates[0].patch.staged_at)
  })

  it('is an idempotent no-op when the exact same job is already staged', async () => {
    const STAMP = '2026-09-20T00:00:00.000Z'
    const db = installDb([
      row({ source_url: CANONICAL, source_job_id: SHIP_JOB, staged_at: STAMP }),
    ])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(result.rebounded).toBeUndefined()
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_job_id).toBe(SHIP_JOB)
    // The same-source/same-job no-op must NOT reset the revision stamp.
    expect(db.rows[0].staged_at).toBe(STAMP)
  })

  it('a jobless caller NEVER clears or overwrites an existing source_job_id', async () => {
    const db = installDb([row({ source_url: CANONICAL, source_job_id: OTHER_JOB })])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: null,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(result.rebounded).toBeUndefined()
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_job_id).toBe(OTHER_JOB)
  })

  it('never writes a malformed (non-UUID) job id over a durable identity', async () => {
    const db = installDb([row({ source_url: CANONICAL, source_job_id: OTHER_JOB })])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: 'plan-1737331200000',
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_job_id).toBe(OTHER_JOB)
  })

  it('still refuses to touch a different durable source_url even with an exact job id', async () => {
    const db = installDb([
      row({ source_url: 'https://uk.yousafeconsultancy.com/other-page/', source_job_id: OTHER_JOB }),
    ])

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_url).toBe('https://uk.yousafeconsultancy.com/other-page/')
    expect(db.rows[0].source_job_id).toBe(OTHER_JOB)
  })

  it('refuses to stage without a real canonicalUrl', async () => {
    const db = installDb([row()])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: '',
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(0)
    expect(result.error).toMatch(/canonicalUrl/i)
    expect(db.updates).toHaveLength(0)
  })

  it('is idempotent when the row is already staged for this source', async () => {
    const db = installDb([row({ source_url: CANONICAL })])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(db.updates).toHaveLength(0)
  })

  it('never overwrites a different durable source identity', async () => {
    const db = installDb([row({ source_url: 'https://uk.yousafeconsultancy.com/other-page/' })])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_url).toBe('https://uk.yousafeconsultancy.com/other-page/')
  })

  it('only ever considers planned rows (an applied row can never be restaged)', async () => {
    const db = installDb([row({ status: 'applied', source_url: CANONICAL, applied_at: '2026-09-01T00:00:00.000Z' })])
    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.candidates).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.selects[0].filters).toContainEqual({ op: 'eq', column: 'status', value: 'planned' })
  })
})

describe('D) staging DB-write observability (never a silent zero-op)', () => {
  function scriptedClient(
    rows: P6FakeRow[],
    writeResult: { data: unknown[] | null; error: { message: string } | null },
  ) {
    const writes: Array<Record<string, unknown>> = []
    return {
      writes,
      client: {
        from() {
          let mode: 'select' | 'update' = 'select'
          let patch: Record<string, unknown> = {}
          const builder: Record<string, unknown> = {
            select() {
              return builder
            },
            eq() {
              return builder
            },
            is() {
              // M2 revision-CAS fence on observed NULL columns.
              return builder
            },
            update(next: Record<string, unknown>) {
              mode = 'update'
              patch = next
              return builder
            },
            then(resolve: (value: unknown) => unknown) {
              if (mode === 'update') {
                writes.push(patch)
                return Promise.resolve(writeResult).then(resolve)
              }
              return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve)
            },
          }
          return builder
        },
      },
    }
  }

  it('reports a failed staging write truthfully and does not count it as staged', async () => {
    const scripted = scriptedClient([row()], { data: null, error: { message: 'write denied' } })
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.error).toMatch(/write denied/)
    expect(scripted.writes).toHaveLength(1)
    expect(scripted.writes[0]).toEqual({ source_url: CANONICAL })
  })

  it('never counts a zero-match staging race as staged', async () => {
    const scripted = scriptedClient([row()], { data: [], error: null })
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('withholds staged_at (never invents it) when the additive column is unavailable', async () => {
    // Partial pre-migration state: source_job_id exists (the P6 baseline was
    // applied) but the newer staged_at column is not deployed yet. The write
    // must not fail and must not fabricate a revision stamp — it retries
    // without staged_at and reports the degraded state.
    const writes: Array<Record<string, unknown>> = []
    let writeIndex = 0
    const client = {
      from() {
        let mode: 'select' | 'update' = 'select'
        let patch: Record<string, unknown> = {}
        const builder: Record<string, unknown> = {
          select() {
            return builder
          },
          eq() {
            return builder
          },
          is() {
            // M2 revision-CAS fence on observed NULL columns.
            return builder
          },
          not() {
            return builder
          },
          order() {
            return builder
          },
          limit() {
            return builder
          },
          update(next: Record<string, unknown>) {
            mode = 'update'
            patch = next
            return builder
          },
          then(resolve: (value: unknown) => unknown) {
            if (mode === 'update') {
              writes.push(patch)
              writeIndex += 1
              return Promise.resolve(
                writeIndex === 1
                  ? {
                      data: null,
                      error: { message: "column seo_interlinks.staged_at does not exist" },
                    }
                  : { data: [{ id: 'row-1' }], error: null },
              ).then(resolve)
            }
            return Promise.resolve({
              data: [row({ source_url: null, source_job_id: null })],
              error: null,
            }).then(resolve)
          },
        }
        return builder
      },
    }
    createSupabaseAdminClientMock.mockReturnValue(client as never)

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      jobId: SHIP_JOB,
      primaryKeyword: 'f1 checklist',
      body: `[x](${LIVE_TARGET})`,
    })

    expect(result.staged).toBe(1)
    expect(writes).toHaveLength(2)
    expect(writes[0]).toEqual({
      source_url: CANONICAL,
      source_job_id: SHIP_JOB,
      staged_at: expect.any(String),
    })
    expect(writes[1]).toEqual({ source_url: CANONICAL, source_job_id: SHIP_JOB })
    expect(writes[1]).not.toHaveProperty('staged_at')
    expect(result.warning).toMatch(/staged_at column unavailable/i)
    expect(result.error).toBeUndefined()
  })
})
