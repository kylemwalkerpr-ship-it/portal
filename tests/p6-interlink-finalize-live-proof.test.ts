/**
 * P6 — a row becomes `applied` only after the live source is proven and the
 * exact anchor href is present there.
 *
 * Live source HTML + live target HTTP status decide the verdict. Source
 * failure, target failure or plain-text/script/JSON-only URL presence may
 * record an honest non-applied verdict, but can never produce `applied`, and
 * a transient failure can never downgrade an already verified row.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoFactory/linkAudit', () => ({
  verifyUrlsLive: jest.fn(),
  classifyLiveStatus: jest.fn((_url: string, status: number) => ({
    ok: status >= 200 && status < 400,
    blocker: status >= 400,
    code: 'dead_internal_link',
    message: '',
  })),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import { verifyUrlsLive } from '@/lib/seoFactory/linkAudit'
import {
  finalizeStagedInterlinksForLiveSource,
  INTERLINK_LIVE_EXACT_HREF_PROOF,
} from '@/lib/seoFactory/interlinkVerification'
import { createP6FakeDb, type P6FakeRow } from './helpers/p6InterlinkFakeDb'

const SOURCE = 'https://legal.yousafeconsultancy.com/us/student-visas/'
// `normalizeInterlinkProofUrl` canonical form: the finalizer's proof identity
// drops the trailing slash while the durable row identity keeps the exact
// observed `source_url`.
const SOURCE_CANONICAL = SOURCE.replace(/\/+$/, '')
const TARGET = 'https://market.yousafeconsultancy.com/categories/study-permits'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
const verifyUrlsLiveMock = jest.mocked(verifyUrlsLive)

function row(overrides: Partial<P6FakeRow> = {}): P6FakeRow {
  return {
    id: 'row-1',
    source_slug: 'seo-us-schools-f1-checklist',
    target_url: TARGET,
    status: 'planned',
    applied_at: null,
    source_url: SOURCE,
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

function installDbWithHook(rows: P6FakeRow[], afterSelect: () => void) {
  const db = createP6FakeDb(rows, { afterSelect })
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  return db
}

function liveMap(entries: Array<[string, number]>) {
  return new Map(entries.map(([url, status]) => [url, { ok: status >= 200 && status < 400, status, finalUrl: url, at: 0 }]))
}

function installSourceFetch(html: string | null, status = 200, throwError = false) {
  global.fetch = jest.fn(async () => {
    if (throwError) throw new Error('network down')
    return {
      ok: status >= 200 && status < 300,
      status,
      url: SOURCE,
      text: async () => html ?? '',
    }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyUrlsLiveMock.mockResolvedValue(liveMap([[TARGET, 200]]))
  installSourceFetch(`<article><p>Read <a href="${TARGET}">study permits</a> now.</p></article>`)
})

describe('A) live source + exact anchor href => applied with durable proof', () => {
  it('writes the full proof contract atomically', async () => {
    const db = installDb([row()])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(1)
    expect(result.checked).toBe(1)
    expect(db.updates).toHaveLength(1)
    const { patch, filters } = db.updates[0]
    expect(patch.status).toBe('applied')
    expect(typeof patch.applied_at).toBe('string')
    // The durable row identity stays the exact observed source_url...
    expect(patch.source_url).toBe(SOURCE)
    expect(patch.verification_state).toBe('present')
    expect(typeof patch.verified_at).toBe('string')
    // ...while the recorded proof uses the NORMALIZED canonical subject the
    // verdict was established for (same source, canonical comparison form).
    expect(patch.verification_evidence).toMatchObject({
      source: SOURCE_CANONICAL,
      target: TARGET,
      proof: INTERLINK_LIVE_EXACT_HREF_PROOF,
      observedHref: TARGET,
      sourceHttpStatus: 200,
      targetHttpStatus: 200,
    })
    expect(String((patch.verification_evidence as Record<string, unknown>).sourceContext)).toContain(
      'study permits',
    )
    expect(filters).toEqual([
      { op: 'eq', column: 'id', value: 'row-1' },
      { op: 'eq', column: 'status', value: 'planned' },
      // H1/M2: a jobless legacy write CASes the exact observed subject
      // (source_url present, source_job_id IS NULL).
      { op: 'is_null', column: 'source_job_id', value: null },
      { op: 'eq', column: 'source_url', value: SOURCE },
    ])
    expect(result.scope).toBe('jobless-legacy')
  })

  it('tolerates trailing-slash and host-case differences in the live href', async () => {
    const db = installDb([row()])
    installSourceFetch(
      `<a href="${TARGET.replace('market.', 'MARKET.').replace(/\/$/, '')}/">link</a>`,
    )

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(1)
    expect(db.rows[0].status).toBe('applied')
  })
})

describe('H) DB write observability (item 4 — never a silent zero/no-op)', () => {
  /** Minimal client that can force an error / zero affected rows on writes. */
  function scriptedClient(
    rows: P6FakeRow[],
    writeResult: { data: unknown[] | null; error: { message: string } | null },
  ) {
    const writes: Array<{ patch: Record<string, unknown> }> = []
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
            in() {
              return builder
            },
            eq() {
              return builder
            },
            is() {
              // H1 jobless scope fence (source_job_id IS NULL).
              return builder
            },
            update(next: Record<string, unknown>) {
              mode = 'update'
              patch = next
              return builder
            },
            then(resolve: (value: unknown) => unknown) {
              if (mode === 'update') {
                writes.push({ patch })
                return Promise.resolve(writeResult).then(resolve)
              }
              return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(resolve)
            },
          }
          return builder
        },
      },
    }
  }

  it('surfaces a verdict write failure as a real error instead of a silent absent/0', async () => {
    const scripted = scriptedClient([row()], { data: null, error: { message: 'permission denied' } })
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.absent).toBe(0)
    expect(result.dbErrors).toBe(1)
    expect(result.error).toMatch(/permission denied/)
  })

  it('counts actual affected rows: a zero-match applied write is a skipped race, not applied truth', async () => {
    const scripted = scriptedClient([row()], { data: [], error: null })
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.dbErrors).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('does not count a zero-match verdict write as a written verdict', async () => {
    // The target is not live => the verdict path runs; the DB races it away.
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[TARGET, 404]]))
    const scripted = scriptedClient([row()], { data: [], error: null })
    createSupabaseAdminClientMock.mockReturnValue(scripted.client as never)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.targetNotLive).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.dbErrors).toBe(0)
  })
})

describe('I) same-site relative hrefs finalize against the verified source canonical', () => {
  it('applies when the live source links root-relatively to the exact target', async () => {
    const relativeTarget = 'https://legal.yousafeconsultancy.com/us/student-permits'
    const db = installDb([row({ target_url: relativeTarget })])
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[relativeTarget, 200]]))
    installSourceFetch(`<p>Next: <a href="/us/student-permits/">student permits</a></p>`)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(1)
    expect(db.rows[0].status).toBe('applied')
  })

  it('never applies for a cross-host href that resolves off the verified source host', async () => {
    const relativeTarget = 'https://legal.yousafeconsultancy.com/us/student-permits'
    const db = installDb([row({ target_url: relativeTarget })])
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[relativeTarget, 200]]))
    installSourceFetch(`<a href="//evil.example.com/us/student-permits/">off site</a>`)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.absent).toBe(1)
    expect(db.rows[0].status).toBe('planned')
  })
})

describe('B) live source without the exact anchor => absent, still planned', () => {
  it.each([
    ['plain text only', `<p>Visit ${TARGET} for help.</p>`],
    ['JSON payload only', `<script type="application/json">{"next":"${TARGET}"}</script>`],
    ['script assignment only', `<script>window.__NEXT={href:"${TARGET}"}</script>`],
    ['different anchor', `<a href="https://market.yousafeconsultancy.com/categories/immigration">other</a>`],
  ])('records verification_state absent for %s', async (_label, html) => {
    const db = installDb([row()])
    installSourceFetch(html)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.absent).toBe(1)
    const { patch } = db.updates[0]
    expect(patch.verification_state).toBe('absent')
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('applied_at')
    expect(patch.verification_evidence).toMatchObject({ proof: 'live_exact_href', observedHref: null })
    expect(db.rows[0].status).toBe('planned')
  })
})

describe('C) target liveness decides target_not_live vs present', () => {
  it('records target_not_live (still planned) when the target 404s even with an anchor', async () => {
    const db = installDb([row()])
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[TARGET, 404]]))

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.targetNotLive).toBe(1)
    const { patch } = db.updates[0]
    expect(patch.verification_state).toBe('target_not_live')
    expect(patch.verification_evidence).toMatchObject({ proof: 'target_liveness', targetHttpStatus: 404 })
    expect(db.rows[0].status).toBe('planned')
    expect(db.rows[0].applied_at).toBeNull()
  })

  it('records unverifiable (never applied) for network/unreachable targets', async () => {
    const db = installDb([row()])
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[TARGET, 0]]))

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.unverifiable).toBe(1)
    expect(db.updates[0].patch.verification_state).toBe('unverifiable')
    expect(db.rows[0].status).toBe('planned')
  })
})

describe('D) source failure never applies', () => {
  it('records unverifiable when the source fetch throws', async () => {
    const db = installDb([row()])
    installSourceFetch(null, 0, true)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.sourceFetchOk).toBe(false)
    expect(result.unverifiable).toBe(1)
    expect(db.updates[0].patch.verification_state).toBe('unverifiable')
    expect(db.updates[0].patch).not.toHaveProperty('status')
    expect(db.rows[0].status).toBe('planned')
  })

  it('records source_not_live when the live source is 404', async () => {
    const db = installDb([row()])
    installSourceFetch(null, 404)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.sourceNotLive).toBe(1)
    expect(db.updates[0].patch.verification_state).toBe('source_not_live')
    expect(db.rows[0].status).toBe('planned')
  })

  it('does not even attempt target verification when the source is not live', async () => {
    installDb([row()])
    installSourceFetch(null, 500)

    await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(verifyUrlsLiveMock).not.toHaveBeenCalled()
  })
})

describe('E) idempotency and no downgrade', () => {
  it('is idempotent: a second run selects nothing and writes nothing', async () => {
    const db = installDb([row()])

    const first = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })
    const updatesAfterFirst = db.updates.length
    const second = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(first.applied).toBe(1)
    expect(second.checked).toBe(0)
    expect(second.applied).toBe(0)
    expect(db.updates).toHaveLength(updatesAfterFirst)
  })

  it('never selects or downgrades applied rows, even when the source later fails', async () => {
    const db = installDb([
      row({ status: 'applied', applied_at: '2026-09-01T00:00:00.000Z', verification_state: 'present', verified_at: '2026-09-01T00:00:00.000Z' }),
    ])
    installSourceFetch(null, 0, true)

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.checked).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].status).toBe('applied')
    expect(db.selects[0].filters).toContainEqual({ op: 'eq', column: 'status', value: 'planned' })
  })

  it('matches both the raw and normalized source_url variants', async () => {
    const db = installDb([row({ source_url: SOURCE.replace(/\/$/, '') })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.checked).toBe(1)
    const sourceFilter = db.selects[0].filters.find((filter) => filter.column === 'source_url')!
    expect(sourceFilter.op).toBe('in')
    expect(sourceFilter.value).toContain(SOURCE)
    expect(sourceFilter.value).toContain(SOURCE.replace(/\/$/, ''))
  })
})

describe('E2) job-bound finalization (P6 supervisor follow-up)', () => {
  const SHIP_JOB = '44444444-4444-4444-8444-444444444444'
  const OTHER_JOB = '55555555-5555-4555-8555-555555555555'

  it('only considers planned rows staged by the exact ship job and binds the applied proof to it', async () => {
    const db = installDb([
      row({ id: 'mine', source_job_id: SHIP_JOB }),
      // A different job's row for the same canonical must never be touched by
      // this job-bound finalization.
      row({ id: 'other', source_job_id: OTHER_JOB }),
      // A jobless legacy row for the same canonical must never be touched by
      // scheduled job-bound finalization.
      row({ id: 'legacy', source_job_id: null }),
    ])

    const result = await finalizeStagedInterlinksForLiveSource({
      canonicalUrl: SOURCE,
      sourceJobId: SHIP_JOB,
    })

    expect(result.applied).toBe(1)
    expect(result.checked).toBe(1)
    expect(db.selects[0].filters).toContainEqual({
      op: 'eq',
      column: 'source_job_id',
      value: SHIP_JOB,
    })
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].patch.status).toBe('applied')
    expect(db.updates[0].patch.source_job_id).toBe(SHIP_JOB)
    // M2: the applied write is a compare-and-set on the EXACT selected
    // subject, not just id + planned.
    expect(db.updates[0].filters).toEqual([
      { op: 'eq', column: 'id', value: 'mine' },
      { op: 'eq', column: 'status', value: 'planned' },
      { op: 'eq', column: 'source_job_id', value: SHIP_JOB },
      { op: 'eq', column: 'source_url', value: SOURCE },
    ])
    const byId = new Map(db.rows.map((r) => [r.id, r]))
    expect(byId.get('mine')!.status).toBe('applied')
    expect(byId.get('other')!.status).toBe('planned')
    expect(byId.get('legacy')!.status).toBe('planned')
  })

  it('a malformed jobId fails closed instead of silently finalizing source-url-only (L1)', async () => {
    const db = installDb([row({ source_job_id: SHIP_JOB })])

    for (const bad of ['not-a-uuid', 'plan-1737331200000', `${SHIP_JOB}-extra`]) {
      const result = await finalizeStagedInterlinksForLiveSource({
        canonicalUrl: SOURCE,
        sourceJobId: bad,
      })

      expect(result.checked).toBe(0)
      expect(result.applied).toBe(0)
      expect(result.error).toMatch(/sourceJobId must be an exact content_jobs UUID/i)
    }
    // The malformed id never even reached the DB read or an applied write.
    expect(db.selects).toHaveLength(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].status).toBe('planned')
  })

  it('a concurrent rebind to another job makes the old job applied write a skipped CAS (M2)', async () => {
    let raceDb: ReturnType<typeof installDb>
    // Deterministic race: the SELECT returns the job-A row, then (before the
    // fenced UPDATE) the row is rebound to job B by a concurrent reship.
    raceDb = installDbWithHook(
      [row({ id: 'row-1', source_job_id: SHIP_JOB })],
      () => {
        raceDb.rows[0].source_job_id = OTHER_JOB
      },
    )

    const result = await finalizeStagedInterlinksForLiveSource({
      canonicalUrl: SOURCE,
      sourceJobId: SHIP_JOB,
    })

    // The old job's write must affect ZERO rows and be counted skipped —
    // never overwrite the new revision.
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.dbErrors).toBe(0)
    expect(raceDb.rows[0].source_job_id).toBe(OTHER_JOB)
    expect(raceDb.rows[0].status).toBe('planned')
    expect(raceDb.rows[0].verification_state).toBeNull()
  })

  it('a concurrent rebind also makes a non-applied verdict write a skipped CAS (M2)', async () => {
    verifyUrlsLiveMock.mockResolvedValue(liveMap([[TARGET, 404]]))
    let raceDb: ReturnType<typeof installDb>
    raceDb = installDbWithHook(
      [row({ id: 'row-1', source_job_id: SHIP_JOB })],
      () => {
        raceDb.rows[0].source_job_id = OTHER_JOB
      },
    )

    const result = await finalizeStagedInterlinksForLiveSource({
      canonicalUrl: SOURCE,
      sourceJobId: SHIP_JOB,
    })

    expect(result.targetNotLive).toBe(0)
    expect(result.skipped).toBe(1)
    expect(raceDb.rows[0].source_job_id).toBe(OTHER_JOB)
    expect(raceDb.rows[0].verification_state).toBeNull()
    expect(raceDb.rows[0].verified_at).toBeNull()
  })

  it('a concurrent rebind makes an absent verdict write a skipped CAS too (M2)', async () => {
    let raceDb: ReturnType<typeof installDb>
    raceDb = installDbWithHook(
      [row({ id: 'row-1', source_job_id: SHIP_JOB })],
      () => {
        raceDb.rows[0].source_job_id = OTHER_JOB
      },
    )
    // Live target, but the live source no longer contains the exact anchor.
    installSourceFetch('<p>anchor removed</p>')

    const result = await finalizeStagedInterlinksForLiveSource({
      canonicalUrl: SOURCE,
      sourceJobId: SHIP_JOB,
    })

    expect(result.absent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(raceDb.rows[0].source_job_id).toBe(OTHER_JOB)
    expect(raceDb.rows[0].verification_state).toBeNull()
  })

  it('legacy/admin finalization without a job id is jobless-only and CASes the exact subject (H1)', async () => {
    const db = installDb([row({ source_job_id: null })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(1)
    expect(result.scope).toBe('jobless-legacy')
    // The SELECT is restricted to jobless rows: a job-bound row is never read.
    expect(db.selects[0].filters).toContainEqual({
      op: 'is_null',
      column: 'source_job_id',
      value: null,
    })
    // The write CASes the observed jobless subject too.
    expect(db.updates[0].patch).not.toHaveProperty('source_job_id')
    expect(db.updates[0].filters).toContainEqual({
      op: 'is_null',
      column: 'source_job_id',
      value: null,
    })
    expect(db.updates[0].filters).toContainEqual({ op: 'eq', column: 'source_url', value: SOURCE })
  })
})

describe('H1) source-only (no sourceJobId) finalization is jobless-only and never broadens', () => {
  const BOUND_JOB = '88888888-8888-4888-8888-888888888888'

  it('returns zero checked/applied and writes nothing when only a job-bound row exists', async () => {
    const db = installDb([row({ id: 'bound', source_job_id: BOUND_JOB })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.scope).toBe('jobless-legacy')
    expect(result.checked).toBe(0)
    expect(result.applied).toBe(0)
    expect(result.warning).toMatch(/jobless|source_job_id IS NULL/i)
    // The job-bound row was never even SELECTed or written.
    expect(db.selects[0].filters).toContainEqual({
      op: 'is_null',
      column: 'source_job_id',
      value: null,
    })
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].status).toBe('planned')
    expect(db.rows[0].source_job_id).toBe(BOUND_JOB)
    expect(db.rows[0].verification_state).toBeNull()
  })

  it('still finalizes a jobless legacy row (legacy mode remains functional)', async () => {
    const db = installDb([row({ id: 'legacy', source_job_id: null })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(1)
    expect(result.checked).toBe(1)
    expect(db.rows[0].status).toBe('applied')
    expect(db.rows[0].source_job_id).toBeNull()
  })

  it('a concurrent source change after SELECT yields zero/skipped and never the old subject', async () => {
    const movedSource = 'https://legal.yousafeconsultancy.com/uk/concurrent-source/'
    let raceDb: ReturnType<typeof installDb>
    raceDb = installDbWithHook([row({ id: 'row-1', source_job_id: null })], () => {
      // A concurrent writer re-points the row to another durable source_url
      // between the finalizer's SELECT and its fenced UPDATE.
      raceDb.rows[0].source_url = movedSource
    })

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.dbErrors).toBe(0)
    // The old subject was NOT overwritten.
    expect(raceDb.rows[0].source_url).toBe(movedSource)
    expect(raceDb.rows[0].status).toBe('planned')
    expect(raceDb.rows[0].verification_state).toBeNull()
  })

  it('a concurrent job bind after SELECT is a skipped CAS (job-bound row is never stamped by the legacy call)', async () => {
    let raceDb: ReturnType<typeof installDb>
    raceDb = installDbWithHook([row({ id: 'row-1', source_job_id: null })], () => {
      raceDb.rows[0].source_job_id = BOUND_JOB
    })

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(raceDb.rows[0].source_job_id).toBe(BOUND_JOB)
    expect(raceDb.rows[0].status).toBe('planned')
    expect(raceDb.rows[0].verification_state).toBeNull()
  })
})

describe('F) verifier failure fails closed', () => {
  it('records unverifiable and never applies when target verification throws', async () => {
    const db = installDb([row()])
    verifyUrlsLiveMock.mockRejectedValue(new Error('verifier exploded'))

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.applied).toBe(0)
    expect(result.unverifiable).toBe(1)
    expect(db.updates[0].patch.verification_state).toBe('unverifiable')
    expect(db.rows[0].status).toBe('planned')
  })

  it('does one bounded refetch and no work when nothing is staged', async () => {
    const db = installDb([row({ status: 'applied' })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.checked).toBe(0)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(db.updates).toHaveLength(0)
  })

  it('accepts pre-fetched source HTML without a refetch', async () => {
    installDb([row()])

    const result = await finalizeStagedInterlinksForLiveSource({
      canonicalUrl: SOURCE,
      sourceHtml: `<a href="${TARGET}">link</a>`,
    })

    expect(result.applied).toBe(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('G) unresolved source stays unresolved and unapplied', () => {
  it('never touches a row with no durable source_url (planner slug is not source authority)', async () => {
    const db = installDb([row({ source_url: null, source_slug: 'seo-us-schools-f1-checklist' })])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.checked).toBe(0)
    expect(result.applied).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].status).toBe('planned')
    expect(db.rows[0].source_url).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('never touches a row whose durable source_url is a different canonical', async () => {
    const db = installDb([
      row({ target_url: TARGET, source_url: 'https://uk.yousafeconsultancy.com/other-page/' }),
    ])

    const result = await finalizeStagedInterlinksForLiveSource({ canonicalUrl: SOURCE })

    expect(result.checked).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].status).toBe('planned')
  })
})
