/**
 * P9 — a backlink target may become `won` ONLY from a live verification that
 * fetched the claimed third-party page and found a real anchor href to the
 * exact YouSafe target URL.
 *
 * Covers: URL/prospect/estate validation, the positive proof path (evidence row
 * + durable won pointers), every negative lane (plain-text URL, commented-out
 * anchor, script-serialized URL, wrong href, dead page, network failure),
 * evidence-persistence failure (no proof ⇒ no win), idempotency, and the
 * admin-only route.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))

import { NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  BACKLINK_VERIFICATION_METHOD,
  isPrivateOrLocalHost,
  isYouSafeOwnedHost,
  listBacklinkVerifications,
  observeBacklinkAnchorFacts,
  observeBacklinkPageFacts,
  validateBacklinkSourceUrl,
  validateEstateTargetUrl,
  verifyBacklinkClaim,
} from '@/lib/seoFactory/backlinkVerification'
import { POST as verifyPOST, GET as verifyGET } from '@/app/api/seo-engine/backlink/verify/route'
import { createP9FakeDb, type P9FakeRow } from './helpers/p9BacklinkFakeDb'

const SOURCE = 'https://www.ilw.com/articles/immigration-news.shtm'
const TARGET = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const OTHER_ESTATE_PAGE = 'https://legal.yousafeconsultancy.com/us/other-guide/'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)
const requireAdminUserMock = jest.mocked(requireAdminUser)

function targetRow(overrides: P9FakeRow = {}): P9FakeRow {
  return {
    id: 'target-1',
    domain: 'ilw.com',
    status: 'sent',
    won_at: null,
    won_verified_at: null,
    won_verification_id: null,
    won_backlink_url: null,
    last_touched_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function installDb(targets: P9FakeRow[] = [targetRow()], options: { failEvidenceInsert?: string } = {}) {
  const db = createP9FakeDb(
    { seo_backlink_targets: targets, seo_backlink_verifications: [], seo_backlink_outreach: [] },
    options.failEvidenceInsert ? { failInsert: { seo_backlink_verifications: options.failEvidenceInsert } } : {},
  )
  createSupabaseAdminClientMock.mockReturnValue(db.client as never)
  return db
}

interface FetchScript {
  html?: string | null
  status?: number
  finalUrl?: string | null
  robots?: string | null
  throwError?: boolean
}

function installFetch(script: FetchScript = {}) {
  const fetchMock = jest.fn(async (input: unknown) => {
    if (script.throwError) throw new Error('network down')
    const status = script.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      url: script.finalUrl === undefined ? String(input) : script.finalUrl,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'x-robots-tag' ? script.robots ?? null : null),
      },
      text: async () => script.html ?? '',
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

const positiveHtml = (href = TARGET) =>
  `<html><head><link rel="canonical" href="${SOURCE}"><meta name="robots" content="index,follow"></head>` +
  `<body><article><p>Our partner guide <a href="${href}" rel="nofollow noopener">YouSafe student visas</a> explains it.</p></article></body></html>`

function evidenceInserts(db: ReturnType<typeof installDb>) {
  return db.insertsFor('seo_backlink_verifications')
}

function targetUpdates(db: ReturnType<typeof installDb>) {
  return db.updatesFor('seo_backlink_targets')
}

function verifyInput(overrides: Record<string, unknown> = {}) {
  return {
    targetId: 'target-1',
    sourceUrl: SOURCE,
    targetUrl: TARGET,
    actor: 'admin@portal',
    now: '2026-09-21T10:00:00.000Z',
    ...overrides,
  }
}

let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  errorSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('A) claimed-source validation', () => {
  it('accepts an absolute http(s) page on the prospect domain or a subdomain', () => {
    for (const url of ['https://www.ilw.com/x', 'https://blog.ilw.com/x', 'http://ilw.com/x']) {
      const validation = validateBacklinkSourceUrl(url, 'ilw.com')
      expect(validation.ok).toBe(true)
      expect(validation.host).toBe(new URL(url).hostname)
    }
  })

  it('refuses relative, non-http and lookalike-suffix sources', () => {
    expect(validateBacklinkSourceUrl('ilw.com/x', 'ilw.com').reason).toMatch(/absolute/)
    expect(validateBacklinkSourceUrl('ftp://ilw.com/x', 'ilw.com').reason).toMatch(/http\(s\)/)
    expect(validateBacklinkSourceUrl('https://notilw.com/x', 'ilw.com').reason).toMatch(/does not match/)
    expect(validateBacklinkSourceUrl('', 'ilw.com').reason).toMatch(/required/)
    expect(validateBacklinkSourceUrl(SOURCE, '').reason).toMatch(/prospect domain is required/)
  })

  it('refuses a YouSafe-owned source, whatever the prospect domain says', () => {
    const validation = validateBacklinkSourceUrl('https://legal.yousafeconsultancy.com/us/student-visas/', 'yousafeconsultancy.com')
    expect(validation.ok).toBe(false)
    expect(validation.reason).toMatch(/third-party page, not the YouSafe estate/)
    expect(isYouSafeOwnedHost('blog.yousafeconsultancy.com')).toBe(true)
    expect(isYouSafeOwnedHost('market.yousafeconsultancy.com')).toBe(true)
    expect(isYouSafeOwnedHost('notyousafeconsultancy.com')).toBe(false)
  })

  it('refuses localhost and private-IP literals', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.0.9', '169.254.1.1', '::1', 'fc00::1', 'fe80::1']) {
      expect(isPrivateOrLocalHost(host)).toBe(true)
    }
    for (const host of ['ilw.com', 'www.ilw.com', '8.8.8.8', '2606:4700::1111']) {
      expect(isPrivateOrLocalHost(host)).toBe(false)
    }
    expect(validateBacklinkSourceUrl('http://localhost:3000/x', 'localhost').ok).toBe(false)
    expect(validateBacklinkSourceUrl('http://192.168.1.10/x', '192.168.1.10').ok).toBe(false)
    expect(validateBacklinkSourceUrl('http://[::1]/x', '::1').ok).toBe(false)
  })
})

describe('B) linked-destination validation', () => {
  it('accepts only exact HOST_PUBLIC estate hosts over https', () => {
    expect(validateEstateTargetUrl(TARGET).ok).toBe(true)
    expect(validateEstateTargetUrl('https://market.yousafeconsultancy.com/categories/study-permits').ok).toBe(true)
    expect(validateEstateTargetUrl('http://legal.yousafeconsultancy.com/us/x/').reason).toMatch(/https/)
    expect(validateEstateTargetUrl('https://sub.legal.yousafeconsultancy.com/us/x/').reason).toMatch(/not a HOST_PUBLIC/)
    expect(validateEstateTargetUrl('https://evil.example.com/x').reason).toMatch(/not a HOST_PUBLIC/)
    expect(validateEstateTargetUrl('').reason).toMatch(/required/)
  })
})

describe('C) positive live proof ⇒ evidence row + won', () => {
  it('records the full evidence row and writes the durable won pointers', async () => {
    const db = installDb()
    const fetchMock = installFetch({ html: positiveHtml() })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(fetchMock).toHaveBeenCalledWith(SOURCE, expect.objectContaining({ redirect: 'follow' }))
    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('verified')
    expect(result.linkPresent).toBe(true)
    expect(result.transitionedToWon).toBe(true)
    expect(result.targetStatus).toBe('won')
    expect(result.observedHref).toBe(TARGET)

    const inserts = evidenceInserts(db)
    expect(inserts).toHaveLength(1)
    const evidence = inserts[0].rows[0]
    expect(evidence).toMatchObject({
      target_id: 'target-1',
      backlink_url: SOURCE,
      target_url: TARGET,
      source_domain: 'www.ilw.com',
      source_http_status: 200,
      link_present: true,
      observed_href: TARGET,
      page_canonical_url: SOURCE,
      page_indexable: true,
      verdict: 'verified',
      verified_at: '2026-09-21T10:00:00.000Z',
      method: BACKLINK_VERIFICATION_METHOD,
      verifier: 'admin@portal',
    })
    expect(String(evidence.anchor_text)).toContain('YouSafe student visas')
    expect(evidence.rel_attributes).toEqual(['nofollow', 'noopener'])
    expect(String(evidence.anchor_context)).toContain('YouSafe student visas')
    expect(evidence.id).toBe(result.verificationId)

    const updates = targetUpdates(db)
    expect(updates).toHaveLength(1)
    expect(updates[0].patch).toMatchObject({
      status: 'won',
      won_at: '2026-09-21T10:00:00.000Z',
      won_verified_at: '2026-09-21T10:00:00.000Z',
      won_verification_id: result.verificationId,
      won_backlink_url: SOURCE,
    })
    // The transition is a compare-and-set: it can never overwrite an existing win.
    expect(updates[0].filters).toEqual([
      { op: 'eq', column: 'id', value: 'target-1' },
      { op: 'neq', column: 'status', value: 'won' },
    ])
  })

  it('records rel/text/canonical/indexability only when they are observable', async () => {
    const db = installDb()
    installFetch({
      html: `<html><body><a href="${TARGET}">  Study   permits </a></body></html>`,
    })
    await verifyBacklinkClaim(verifyInput())
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.anchor_text).toBe('Study permits')
    expect(evidence.rel_attributes).toEqual([])
    // No canonical and no robots directive on the page: NULL, never invented.
    expect(evidence.page_canonical_url).toBeNull()
    expect(evidence.page_indexable).toBeNull()
  })

  it('marks the page non-indexable from a robots meta or an X-Robots-Tag header', () => {
    expect(observeBacklinkPageFacts('<meta name="robots" content="noindex,nofollow">', SOURCE, null)).toEqual({
      canonicalUrl: null,
      indexable: false,
    })
    expect(observeBacklinkPageFacts('<html></html>', SOURCE, 'noindex, noarchive')).toEqual({
      canonicalUrl: null,
      indexable: false,
    })
    expect(observeBacklinkPageFacts('<html></html>', SOURCE, null)).toEqual({ canonicalUrl: null, indexable: null })
    // Serialized payloads are never read as directives.
    expect(
      observeBacklinkPageFacts('<script>const s = \'<meta name="robots" content="noindex">\'</script>', SOURCE, null),
    ).toEqual({ canonicalUrl: null, indexable: null })
  })

  it('never anchors on hrefs inside prose, comments, scripts or JSON', () => {
    for (const html of [
      `<p>Read ${TARGET} for details.</p>`,
      `<!-- <a href="${TARGET}">x</a> -->`,
      `<script>const a = '<a href="${TARGET}">x</a>'</script>`,
      `{"link":"${TARGET}"}`,
    ]) {
      expect(observeBacklinkAnchorFacts(html, TARGET).rel).toBeNull()
    }
  })
})

describe('D) negative and unavailable lanes never win', () => {
  it('records an absent verdict when the live page has no real anchor', async () => {
    const db = installDb()
    installFetch({ html: `<html><body><p>See ${TARGET} in our prose.</p></body></html>` })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('absent')
    expect(result.linkPresent).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(evidenceInserts(db)[0].rows[0]).toMatchObject({
      link_present: false,
      observed_href: null,
      verdict: 'absent',
      source_http_status: 200,
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records absent for a real anchor to a DIFFERENT YouSafe page (exact href only)', async () => {
    const db = installDb()
    installFetch({ html: positiveHtml(OTHER_ESTATE_PAGE) })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.verdict).toBe('absent')
    expect(result.linkPresent).toBe(false)
    expect(evidenceInserts(db)[0].rows[0].observed_href).toBeNull()
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records unavailable (with the real HTTP status) when the page is dead', async () => {
    const db = installDb()
    installFetch({ status: 404, html: null })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.ok).toBe(true)
    expect(result.verdict).toBe('unavailable')
    expect(result.sourceHttpStatus).toBe(404)
    expect(result.linkPresent).toBe(false)
    expect(evidenceInserts(db)[0].rows[0]).toMatchObject({
      verdict: 'unavailable',
      source_http_status: 404,
      link_present: false,
    })
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('records unavailable (status NULL, never a fabricated 200) on a network failure', async () => {
    const db = installDb()
    installFetch({ throwError: true })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.verdict).toBe('unavailable')
    expect(result.sourceHttpStatus).toBeNull()
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.source_http_status).toBeNull()
    expect(String((evidence.evidence as Record<string, unknown>).fetchError)).toMatch(/network down/)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('refuses a claimed page that redirects OFF the prospect domain', async () => {
    const db = installDb()
    const finalUrl = 'https://evil.example.com/redirected'
    installFetch({ html: positiveHtml(), finalUrl })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.verdict).toBe('unavailable')
    expect(result.linkPresent).toBe(false)
    expect(result.observedHref).toBeNull()
    expect(result.sourceFinalUrl).toBe(finalUrl)
    expect(result.reason).toMatch(/redirected off the prospect domain/)
    const evidence = evidenceInserts(db)[0].rows[0]
    expect(evidence.link_present).toBe(false)
    expect(evidence.observed_href).toBeNull()
    expect(evidence.source_final_url).toBe(finalUrl)
    expect((evidence.evidence as Record<string, unknown>).redirectLeftProspect).toBe(true)
    expect(targetUpdates(db)).toHaveLength(0)
  })

  it('still accepts a same-prospect canonical redirect (www / trailing host form)', async () => {
    const db = installDb()
    installFetch({ html: positiveHtml(), finalUrl: 'https://ilw.com/articles/immigration-news.shtm' })
    const result = await verifyBacklinkClaim(verifyInput())
    expect(result.verdict).toBe('verified')
    expect(result.transitionedToWon).toBe(true)
    expect(targetUpdates(db)).toHaveLength(1)
  })

  it('never writes a lost status on a negative check', async () => {
    const db = installDb()
    installFetch({ html: '<html><body>nothing here</body></html>' })
    await verifyBacklinkClaim(verifyInput())
    await verifyBacklinkClaim(verifyInput({ targetUrl: 'https://market.yousafeconsultancy.com/x' }))
    for (const write of db.writes) {
      expect(JSON.stringify(write.patch ?? write.rows)).not.toContain('lost')
    }
    expect(db.updatesFor('seo_backlink_outreach')).toHaveLength(0)
  })
})

describe('E) no durable evidence ⇒ no win', () => {
  it('does not transition the target when the evidence insert fails', async () => {
    const db = installDb([targetRow()], { failEvidenceInsert: 'permission denied for table seo_backlink_verifications' })
    installFetch({ html: positiveHtml() })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(false)
    expect(result.verdict).toBe('verified')
    expect(result.evidencePersisted).toBe(false)
    expect(result.transitionedToWon).toBe(false)
    expect(result.verificationId).toBeNull()
    expect(result.error).toMatch(/permission denied/)
    expect(targetUpdates(db)).toHaveLength(0)
  })
})

describe('F) rejected claims are never fetched and never recorded', () => {
  it('performs no fetch and appends no evidence for an off-prospect source', async () => {
    const db = installDb()
    const fetchMock = installFetch({ html: positiveHtml() })
    const result = await verifyBacklinkClaim(verifyInput({ sourceUrl: 'https://evil.example.com/post' }))
    expect(result.ok).toBe(false)
    expect(result.verdict).toBeNull()
    expect(result.reason).toMatch(/does not match the prospect domain/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
  })

  it('performs no fetch for a non-estate destination or an unknown target', async () => {
    const db = installDb()
    const fetchMock = installFetch({ html: positiveHtml() })
    const offEstate = await verifyBacklinkClaim(verifyInput({ targetUrl: 'https://evil.example.com/x' }))
    expect(offEstate.reason).toMatch(/not a HOST_PUBLIC/)
    const unknown = await verifyBacklinkClaim(verifyInput({ targetId: 'missing-target' }))
    expect(unknown.reason).toBe('backlink target not found')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(evidenceInserts(db)).toHaveLength(0)
  })
})

describe('G) idempotency and the evidence trail', () => {
  it('appends evidence but never re-writes an already won target', async () => {
    const db = installDb([
      targetRow({
        status: 'won',
        won_at: '2026-09-01T00:00:00.000Z',
        won_verified_at: '2026-09-01T00:00:00.000Z',
        won_verification_id: 'verification-earlier',
        won_backlink_url: SOURCE,
      }),
    ])
    installFetch({ html: positiveHtml() })

    const result = await verifyBacklinkClaim(verifyInput())

    expect(result.ok).toBe(true)
    expect(result.transitionedToWon).toBe(false)
    expect(result.reason).toBe('already won')
    expect(result.targetStatus).toBe('won')
    expect(evidenceInserts(db)).toHaveLength(1)
    // The fenced UPDATE is issued but matches ZERO rows (`.neq('status','won')`),
    // so the existing win and its proof pointers are untouched.
    for (const update of targetUpdates(db)) expect(update.rows).toHaveLength(0)
    expect(db.rows('seo_backlink_targets')[0]).toMatchObject({
      won_verification_id: 'verification-earlier',
      won_at: '2026-09-01T00:00:00.000Z',
      won_verified_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('lists the append-only trail for one target only', async () => {
    const db = installDb()
    installFetch({ html: positiveHtml() })
    await verifyBacklinkClaim(verifyInput())
    const trail = await listBacklinkVerifications('target-1')
    expect(trail).toHaveLength(1)
    expect(trail[0].target_id).toBe('target-1')
    expect(await listBacklinkVerifications('other-target')).toHaveLength(0)
    expect(db.selects.some((select) => select.table === 'seo_backlink_verifications')).toBe(true)
  })
})

describe('H) admin-only route', () => {
  function post(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/seo-engine/backlink/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('refuses unauthenticated and non-admin callers', async () => {
    requireAdminUserMock.mockResolvedValue({ error: 'Unauthorized', status: 401 } as never)
    const unauthorized = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(unauthorized.status).toBe(401)
    requireAdminUserMock.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)
    const forbidden = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(forbidden.status).toBe(403)
  })

  it('rejects a missing target_id / source_url / target_url with 400 and no fetch', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    const fetchMock = installFetch({ html: positiveHtml() })
    installDb()
    expect((await verifyPOST(post({}))).status).toBe(400)
    expect((await verifyPOST(post({ target_id: 'target-1' }))).status).toBe(400)
    expect((await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drives a real verification through the route and reports the durable win', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    installDb()
    installFetch({ html: positiveHtml() })
    const response = await verifyPOST(post({ target_id: 'target-1', source_url: SOURCE, target_url: TARGET }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      ok: true,
      verdict: 'verified',
      method: BACKLINK_VERIFICATION_METHOD,
      link_present: true,
      evidence_persisted: true,
      transitioned_to_won: true,
      target_status: 'won',
    })
    expect(String(body.verification_id)).not.toHaveLength(0)
  })

  it('reports a rejected claim as 400 and an unknown target as 404', async () => {
    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    installDb()
    installFetch({ html: positiveHtml() })
    const rejected = await verifyPOST(
      post({ target_id: 'target-1', source_url: 'https://evil.example.com/post', target_url: TARGET }),
    )
    expect(rejected.status).toBe(400)
    const missing = await verifyPOST(post({ target_id: 'nope', source_url: SOURCE, target_url: TARGET }))
    expect(missing.status).toBe(404)
  })

  it('exposes the append-only trail through GET for admins only', async () => {
    requireAdminUserMock.mockResolvedValue({ error: 'Forbidden', status: 403 } as never)
    const denied = await verifyGET(
      new NextRequest(`http://localhost/api/seo-engine/backlink/verify?target_id=target-1`),
    )
    expect(denied.status).toBe(403)

    requireAdminUserMock.mockResolvedValue({ profileId: 'admin-1' } as never)
    installDb()
    installFetch({ html: positiveHtml() })
    await verifyBacklinkClaim(verifyInput())
    const response = await verifyGET(
      new NextRequest(`http://localhost/api/seo-engine/backlink/verify?target_id=target-1`),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { verifications?: unknown[] }
    expect(body.verifications).toHaveLength(1)
  })
})
