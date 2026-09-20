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
    expect(patch.source_url).toBe(SOURCE)
    expect(patch.verification_state).toBe('present')
    expect(typeof patch.verified_at).toBe('string')
    expect(patch.verification_evidence).toMatchObject({
      source: SOURCE,
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
    ])
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
